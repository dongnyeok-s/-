/**
 * WebSocket 서버
 * 
 * C2 UI ↔ 시뮬레이터 양방향 통신
 * manual_action 로깅 지원
 * 자동 시나리오 생성 지원
 */

import WebSocket, { WebSocketServer } from 'ws';
import { 
  SimulatorToC2Event, 
  C2ToSimulatorCommand,
  EngageCommand,
  EngagementStateCommand,
  SimulationControlCommand,
  LaunchInterceptorCommand,
} from '../../../shared/schemas';
import { SimulationEngine } from '../simulation';
import { getGenerator, ScenarioGenerator, GeneratedScenario } from '../core/scenario/generator';
import { getConfig } from '../config';

// 추가 명령 타입
interface ManualActionCommand {
  type: 'manual_action';
  action: string;
  target_id?: string;
  details?: Record<string, unknown>;
}

interface GenerateScenarioCommand {
  type: 'generate_scenario';
  seed?: number;
  count?: number;
}

interface GetScenariosCommand {
  type: 'get_scenarios';
}

type ExtendedCommand = 
  | C2ToSimulatorCommand 
  | ManualActionCommand 
  | GenerateScenarioCommand 
  | GetScenariosCommand;

export class SimulatorWebSocketServer {
  private wss: WebSocketServer;
  private simulation: SimulationEngine;
  private clients: Set<WebSocket> = new Set();
  private generator: ScenarioGenerator;

  constructor(port?: number) {
    const config = getConfig();
    const serverPort = port ?? config.port;
    
    // 시뮬레이션 엔진 초기화
    this.simulation = new SimulationEngine((event) => {
      this.broadcast(event);
    });

    // 시나리오 생성기 초기화
    this.generator = getGenerator({}, config.scenariosDir);

    // WebSocket 서버 생성
    this.wss = new WebSocketServer({ port: serverPort });

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });

    console.log(`[Simulator] WebSocket 서버 시작: ws://localhost:${serverPort}`);
    
    // 기본 시나리오 로드
    this.simulation.loadScenario(1);
    console.log('[Simulator] 기본 시나리오 로드 완료');
  }

  /**
   * 새 연결 처리
   */
  private handleConnection(ws: WebSocket): void {
    console.log('[Simulator] 클라이언트 연결');
    this.clients.add(ws);

    // 현재 상태 전송
    const state = this.simulation.getState();
    const scenarios = this.getScenarioList();
    
    ws.send(JSON.stringify({
      type: 'initial_state',
      ...state,
      scenarios,
    }));

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ExtendedCommand;
        this.handleCommand(message, ws);
      } catch (error) {
        console.error('[Simulator] 메시지 파싱 오류:', error);
      }
    });

    ws.on('close', () => {
      console.log('[Simulator] 클라이언트 연결 해제');
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('[Simulator] WebSocket 오류:', error);
      this.clients.delete(ws);
    });
  }

  /**
   * 시나리오 목록 반환
   */
  private getScenarioList(): Array<{ id: string | number; name: string; type: 'builtin' | 'generated' }> {
    const builtinScenarios = [
      { id: 1, name: '기본 혼합', type: 'builtin' as const },
      { id: 2, name: '다중 위협', type: 'builtin' as const },
      { id: 3, name: '은밀 접근', type: 'builtin' as const },
    ];

    const generatedScenarios = this.generator.listSavedScenarios().map(s => ({
      id: s.id,
      name: s.name,
      type: 'generated' as const,
    }));

    return [...builtinScenarios, ...generatedScenarios];
  }

  /**
   * C2로부터 받은 명령 처리
   */
  private handleCommand(command: ExtendedCommand, ws: WebSocket): void {
    console.log('[Simulator] 명령 수신:', command.type);

    switch (command.type) {
      case 'simulation_control':
        this.handleSimulationControl(command as SimulationControlCommand);
        break;
      
      case 'engage_command':
        this.handleEngageCommand(command as EngageCommand);
        break;
      
      case 'engagement_state_command':
        this.handleEngagementStateCommand(command as EngagementStateCommand);
        break;
      
      case 'launch_interceptor':
        this.handleLaunchInterceptor(command as LaunchInterceptorCommand);
        break;

      case 'manual_action':
        this.handleManualAction(command as ManualActionCommand);
        break;

      case 'generate_scenario':
        this.handleGenerateScenario(command as GenerateScenarioCommand, ws);
        break;

      case 'get_scenarios':
        this.handleGetScenarios(ws);
        break;

      default:
        console.warn('[Simulator] 알 수 없는 명령:', (command as any).type);
    }
  }

  /**
   * 시뮬레이션 제어 명령
   */
  private handleSimulationControl(command: SimulationControlCommand): void {
    switch (command.action) {
      case 'start':
        this.simulation.start();
        console.log('[Simulator] 시뮬레이션 시작');
        break;
      
      case 'pause':
        this.simulation.pause();
        console.log('[Simulator] 시뮬레이션 일시정지');
        break;
      
      case 'reset':
        this.simulation.reset();
        if (command.scenario_id !== undefined) {
          this.simulation.loadScenario(command.scenario_id);
        }
        console.log('[Simulator] 시뮬레이션 리셋');
        break;
      
      case 'set_speed':
        if (command.speed_multiplier) {
          this.simulation.setSpeedMultiplier(command.speed_multiplier);
          console.log(`[Simulator] 속도 변경: x${command.speed_multiplier}`);
        }
        break;
    }
  }

  /**
   * 교전 명령
   */
  private handleEngageCommand(command: EngageCommand): void {
    const success = this.simulation.handleEngageCommand(
      command.drone_id,
      command.interceptor_id,
      'user'
    );
    
    if (success) {
      console.log(`[Simulator] 요격 명령 실행: ${command.drone_id}`);
    } else {
      console.log(`[Simulator] 요격 명령 실패: ${command.drone_id}`);
    }
  }

  /**
   * 교전 상태 변경 (IGNORE/TRACK/ENGAGE_PREP/ENGAGE)
   */
  private handleEngagementStateCommand(command: EngagementStateCommand): void {
    // manual_action 로깅
    this.simulation.logManualAction(
      `engagement_state_${command.state.toLowerCase()}`,
      command.drone_id,
      { new_state: command.state }
    );

    if (command.state === 'ENGAGE') {
      this.simulation.handleEngageCommand(command.drone_id, undefined, 'user');
    }
    console.log(`[Simulator] 교전 상태 변경: ${command.drone_id} → ${command.state}`);
  }

  /**
   * 요격 드론 발진 명령
   */
  private handleLaunchInterceptor(command: LaunchInterceptorCommand): void {
    const success = this.simulation.handleEngageCommand(
      command.target_id,
      command.interceptor_id,
      'user'
    );
    
    if (success) {
      console.log(`[Simulator] 요격기 발진: ${command.interceptor_id} → ${command.target_id}`);
    }
  }

  /**
   * manual_action 로깅 처리
   */
  private handleManualAction(command: ManualActionCommand): void {
    this.simulation.logManualAction(command.action, command.target_id, command.details);
    console.log(`[Simulator] Manual action: ${command.action}`, command.target_id || '');
  }

  /**
   * 시나리오 생성 처리
   */
  private handleGenerateScenario(command: GenerateScenarioCommand, ws: WebSocket): void {
    let scenarios: GeneratedScenario[];
    
    if (command.count && command.count > 1) {
      scenarios = this.generator.generateBatch(command.count, command.seed);
    } else {
      const scenario = this.generator.generate(command.seed);
      this.generator.save(scenario);
      scenarios = [scenario];
    }

    // 생성된 시나리오 정보 전송
    ws.send(JSON.stringify({
      type: 'scenarios_generated',
      scenarios: scenarios.map(s => ({
        id: s.id,
        name: s.name,
        seed: s.seed,
        drone_count: s.drones.length,
        difficulty: s.metadata.difficulty_estimate,
      })),
    }));

    // 전체 시나리오 목록 업데이트 브로드캐스트
    this.broadcastScenarioList();

    console.log(`[Simulator] ${scenarios.length}개 시나리오 생성 완료`);
  }

  /**
   * 시나리오 목록 조회
   */
  private handleGetScenarios(ws: WebSocket): void {
    ws.send(JSON.stringify({
      type: 'scenario_list',
      scenarios: this.getScenarioList(),
    }));
  }

  /**
   * 시나리오 목록 브로드캐스트
   */
  private broadcastScenarioList(): void {
    const message = JSON.stringify({
      type: 'scenario_list',
      scenarios: this.getScenarioList(),
    });
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * 모든 클라이언트에 이벤트 브로드캐스트
   */
  private broadcast(event: SimulatorToC2Event): void {
    const message = JSON.stringify(event);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * 서버 종료
   */
  close(): void {
    this.simulation.pause();
    this.wss.close();
    console.log('[Simulator] 서버 종료');
  }
}
