/**
 * 시뮬레이션 엔진
 * 
 * tick 단위로 모든 모델 업데이트
 * 모든 이벤트를 JSONL로 자동 로깅
 */

import { 
  SimulatorToC2Event, 
  DroneStateUpdateEvent,
  InterceptorUpdateEvent,
  InterceptResultEvent,
  SimulationStatusEvent,
  DEFAULT_RADAR_CONFIG,
  DEFAULT_INTERCEPTOR_CONFIG,
  DEFAULT_HOSTILE_DRONE_CONFIG,
  HostileDroneBehavior,
  RadarDetectionEvent,
  GuidanceMode,
} from '../../shared/schemas';

import { SimulationWorld, HostileDrone, InterceptorDrone, Position3D } from './types';
import { RadarSensor } from './sensors/radar';
import { createHostileDrone, updateHostileDrone, setDroneBehavior } from './models/hostileDrone';
import { 
  createInterceptor, 
  updateInterceptor, 
  launchInterceptor, 
  resetInterceptor, 
  ExtendedInterceptorDrone,
  setGuidanceMode,
  getInterceptorPNDebugInfo,
} from './models/interceptor';
import { getLogger, ExperimentLogger } from './core/logging/logger';
import { GeneratedScenario, getGenerator } from './core/scenario/generator';
import * as LogEvents from './core/logging/eventSchemas';

export class SimulationEngine {
  private world: SimulationWorld;
  private radarSensor: RadarSensor;
  private eventQueue: SimulatorToC2Event[] = [];
  private onEvent: (event: SimulatorToC2Event) => void;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private logger: ExperimentLogger;
  private currentScenarioId: number | string = 1;
  private evadingDrones: Set<string> = new Set();  // 회피 중인 드론 추적
  private defaultGuidanceMode: GuidanceMode = 'PN';  // 기본 유도 모드

  constructor(onEvent: (event: SimulatorToC2Event) => void) {
    this.onEvent = onEvent;
    this.logger = getLogger({ logsDir: './logs', enabled: true, consoleOutput: false });
    
    const basePosition: Position3D = { x: 0, y: 0, altitude: 50 };
    
    this.world = {
      time: 0,
      isRunning: false,
      speedMultiplier: 1,
      tickInterval: 100, // 100ms = 0.1초
      hostileDrones: new Map(),
      interceptors: new Map(),
      radarConfig: DEFAULT_RADAR_CONFIG,
      basePosition,
    };

    this.radarSensor = new RadarSensor(basePosition, this.world.radarConfig);
  }

  /**
   * 시뮬레이션 시작
   */
  start(): void {
    if (this.world.isRunning) return;
    
    this.world.isRunning = true;
    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.world.tickInterval / this.world.speedMultiplier);
    
    // 로깅: simulation_control
    this.logger.log({
      timestamp: this.world.time,
      event: 'simulation_control',
      action: 'start',
    });
    
    this.emitStatusEvent();
  }

  /**
   * 시뮬레이션 일시정지
   */
  pause(): void {
    if (!this.world.isRunning) return;
    
    this.world.isRunning = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    
    // 로깅: simulation_control
    this.logger.log({
      timestamp: this.world.time,
      event: 'simulation_control',
      action: 'pause',
    });
    
    this.emitStatusEvent();
  }

  /**
   * 시뮬레이션 리셋
   */
  reset(): void {
    this.pause();
    
    // 시나리오 종료 로깅
    this.logger.endScenario(this.world.time);
    
    this.world.time = 0;
    this.world.hostileDrones.clear();
    this.world.interceptors.clear();
    this.eventQueue = [];
    this.evadingDrones.clear();
    
    this.emitStatusEvent();
  }

  /**
   * 속도 배율 설정
   */
  setSpeedMultiplier(multiplier: number): void {
    this.world.speedMultiplier = multiplier;
    
    // 로깅: simulation_control
    this.logger.log({
      timestamp: this.world.time,
      event: 'simulation_control',
      action: 'speed_change',
      speed_multiplier: multiplier,
    });
    
    if (this.world.isRunning && this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = setInterval(() => {
        this.tick();
      }, this.world.tickInterval / this.world.speedMultiplier);
    }
  }

  /**
   * 시나리오 로드
   */
  loadScenario(scenarioId: number | string): void {
    this.reset();
    this.currentScenarioId = scenarioId;
    
    // 기본 시나리오 또는 생성된 시나리오 로드
    if (typeof scenarioId === 'number') {
      switch (scenarioId) {
        case 1:
          this.loadScenario1();
          break;
        case 2:
          this.loadScenario2();
          break;
        case 3:
          this.loadScenario3();
          break;
        default:
          this.loadScenario1();
      }
    } else {
      // 생성된 시나리오 로드
      const generator = getGenerator();
      const scenario = generator.loadScenario(scenarioId);
      if (scenario) {
        this.loadGeneratedScenario(scenario);
      } else {
        this.loadScenario1();
      }
    }

    // 시나리오 시작 로깅
    const scenarioName = typeof scenarioId === 'number' 
      ? `기본 시나리오 ${scenarioId}`
      : `생성 시나리오 ${scenarioId}`;
    
    this.logger.startScenario(
      scenarioId,
      scenarioName,
      {
        drone_count: this.world.hostileDrones.size,
        interceptor_count: this.world.interceptors.size,
        radar_config: this.world.radarConfig,
      }
    );

    // 드론 생성 이벤트 로깅
    this.world.hostileDrones.forEach(drone => {
      this.logger.log({
        timestamp: 0,
        event: 'drone_spawned',
        drone_id: drone.id,
        position: drone.position,
        velocity: drone.velocity,
        behavior: drone.behavior,
        is_hostile: true,
      });
    });

    this.emitStatusEvent();
  }

  /**
   * 생성된 시나리오 로드
   */
  private loadGeneratedScenario(scenario: GeneratedScenario): void {
    // 레이더 설정 적용
    this.world.radarConfig = scenario.radar_config;
    this.radarSensor = new RadarSensor(this.world.basePosition, scenario.radar_config);

    // 드론 생성
    scenario.drones.forEach(droneData => {
      const drone = createHostileDrone(
        droneData.position,
        droneData.velocity,
        droneData.behavior,
        droneData.config,
        droneData.target_position
      );
      // ID 덮어쓰기
      const droneWithId = { ...drone, id: droneData.id };
      this.world.hostileDrones.set(droneData.id, droneWithId);
    });

    // 요격기 생성 (기본 유도 모드 적용)
    for (let i = 0; i < scenario.interceptor_count; i++) {
      const interceptor = createInterceptor(
        this.world.basePosition, 
        DEFAULT_INTERCEPTOR_CONFIG,
        this.defaultGuidanceMode
      );
      this.world.interceptors.set(interceptor.id, interceptor);
    }
  }

  /**
   * 시나리오 1: 기본 혼합
   */
  private loadScenario1(): void {
    const hostile1 = createHostileDrone(
      { x: 600, y: 500, altitude: 80 },
      { vx: -12, vy: -10, climbRate: -0.5 },
      'NORMAL',
      DEFAULT_HOSTILE_DRONE_CONFIG
    );
    
    const hostile2 = createHostileDrone(
      { x: -400, y: 200, altitude: 120 },
      { vx: 5, vy: 8, climbRate: 0 },
      'NORMAL',
      DEFAULT_HOSTILE_DRONE_CONFIG
    );
    
    const hostile3 = createHostileDrone(
      { x: 100, y: -450, altitude: 150 },
      { vx: 0, vy: 5, climbRate: 0 },
      'RECON',
      DEFAULT_HOSTILE_DRONE_CONFIG,
      { x: 0, y: 0, altitude: 150 }
    );

    this.world.hostileDrones.set(hostile1.id, hostile1);
    this.world.hostileDrones.set(hostile2.id, hostile2);
    this.world.hostileDrones.set(hostile3.id, hostile3);

    const int1 = createInterceptor(this.world.basePosition, DEFAULT_INTERCEPTOR_CONFIG, this.defaultGuidanceMode);
    const int2 = createInterceptor(this.world.basePosition, DEFAULT_INTERCEPTOR_CONFIG, this.defaultGuidanceMode);
    
    this.world.interceptors.set(int1.id, int1);
    this.world.interceptors.set(int2.id, int2);
  }

  /**
   * 시나리오 2: 다중 위협
   */
  private loadScenario2(): void {
    const directions = [
      { x: 700, y: 100, vx: -15, vy: -2 },
      { x: 100, y: 700, vx: -2, vy: -15 },
      { x: -600, y: 100, vx: 12, vy: -2 },
      { x: 100, y: -600, vx: -2, vy: 12 },
    ];

    directions.forEach((dir, i) => {
      const hostile = createHostileDrone(
        { x: dir.x, y: dir.y, altitude: 60 + i * 20 },
        { vx: dir.vx, vy: dir.vy, climbRate: 0 },
        'ATTACK_RUN',
        DEFAULT_HOSTILE_DRONE_CONFIG
      );
      this.world.hostileDrones.set(hostile.id, hostile);
    });

    for (let i = 0; i < 3; i++) {
      const interceptor = createInterceptor(this.world.basePosition, DEFAULT_INTERCEPTOR_CONFIG, this.defaultGuidanceMode);
      this.world.interceptors.set(interceptor.id, interceptor);
    }
  }

  /**
   * 시나리오 3: 은밀 접근
   */
  private loadScenario3(): void {
    const hostile1 = createHostileDrone(
      { x: 400, y: 300, altitude: 40 },
      { vx: -2, vy: -1.5, climbRate: 0 },
      'NORMAL',
      { ...DEFAULT_HOSTILE_DRONE_CONFIG, cruise_speed: 5 }
    );
    
    const hostile2 = createHostileDrone(
      { x: -350, y: 400, altitude: 35 },
      { vx: 1.5, vy: -2, climbRate: 0.1 },
      'NORMAL',
      { ...DEFAULT_HOSTILE_DRONE_CONFIG, cruise_speed: 4 }
    );

    const hostile3 = createHostileDrone(
      { x: 800, y: -200, altitude: 200 },
      { vx: -25, vy: 5, climbRate: -1 },
      'NORMAL',
      { ...DEFAULT_HOSTILE_DRONE_CONFIG, cruise_speed: 25 }
    );

    this.world.hostileDrones.set(hostile1.id, hostile1);
    this.world.hostileDrones.set(hostile2.id, hostile2);
    this.world.hostileDrones.set(hostile3.id, hostile3);

    for (let i = 0; i < 2; i++) {
      const interceptor = createInterceptor(this.world.basePosition, DEFAULT_INTERCEPTOR_CONFIG, this.defaultGuidanceMode);
      this.world.interceptors.set(interceptor.id, interceptor);
    }
  }

  /**
   * 한 틱 실행
   */
  private tick(): void {
    const deltaTime = this.world.tickInterval / 1000;
    this.world.time += deltaTime;

    // 1. 적 드론 업데이트
    this.world.hostileDrones.forEach((drone, id) => {
      const prevEvading = drone.isEvading;
      
      const updated = updateHostileDrone(
        drone,
        deltaTime,
        this.world.basePosition,
        this.world.interceptors
      );
      this.world.hostileDrones.set(id, updated);

      // 회피 시작/종료 로깅
      if (!prevEvading && updated.isEvading) {
        this.evadingDrones.add(id);
        this.logger.log({
          timestamp: this.world.time,
          event: 'evade_start',
          drone_id: id,
          trigger: 'interceptor_approach',
        });
      } else if (prevEvading && !updated.isEvading) {
        this.evadingDrones.delete(id);
        this.logger.log({
          timestamp: this.world.time,
          event: 'evade_end',
          drone_id: id,
          duration: 0, // 실제로는 추적 필요
          result: 'escaped',
        });
      }

      // 드론 상태 이벤트 발생 (주기적으로)
      if (Math.floor(this.world.time * 2) % 2 === 0) {
        this.emitDroneStateEvent(updated);
      }
    });

    // 2. 요격 드론 업데이트
    this.world.interceptors.forEach((interceptor, id) => {
      const target = interceptor.targetId 
        ? this.world.hostileDrones.get(interceptor.targetId) || null
        : null;

      const { interceptor: updated, interceptResult } = updateInterceptor(
        interceptor as ExtendedInterceptorDrone,
        deltaTime,
        target,
        this.world.basePosition,
        this.world.time
      );

      this.world.interceptors.set(id, updated as InterceptorDrone);

      if (interceptResult) {
        this.handleInterceptResult(updated, target!, interceptResult);
      }

      this.emitInterceptorEvent(updated);
    });

    // 3. 레이더 스캔
    const radarEvents = this.radarSensor.scan(this.world.time, this.world.hostileDrones);
    radarEvents.forEach(event => {
      this.onEvent(event);
      
      // 레이더 탐지 로깅
      this.logger.log({
        timestamp: this.world.time,
        event: 'radar_detection',
        drone_id: event.drone_id,
        range: event.range,
        bearing: event.bearing,
        altitude: event.altitude,
        radial_velocity: event.radial_velocity,
        confidence: event.confidence,
        is_false_alarm: event.is_false_alarm || false,
        is_first_detection: false, // 로거에서 자동 설정
      });
    });

    // 4. 주기적 상태 이벤트 (5초마다)
    if (Math.floor(this.world.time) % 5 === 0 && this.world.time % 1 < deltaTime) {
      this.emitStatusEvent();
    }
  }

  /**
   * 요격 결과 처리
   */
  private handleInterceptResult(
    interceptor: ExtendedInterceptorDrone,
    target: HostileDrone,
    result: string
  ): void {
    if (result === 'SUCCESS') {
      const updated = { ...target, isNeutralized: true };
      this.world.hostileDrones.set(target.id, updated);
    }

    const event: InterceptResultEvent = {
      type: 'intercept_result',
      timestamp: this.world.time,
      interceptor_id: interceptor.id,
      target_id: target.id,
      result: result as any,
      details: result === 'SUCCESS' ? '요격 성공' : 
               result === 'EVADED' ? '타겟 회피' :
               result === 'MISS' ? '요격 실패' : '요격 중단',
    };
    this.onEvent(event);

    // 요격 결과 로깅
    const reasonMap: Record<string, LogEvents.InterceptFailureReason | undefined> = {
      '요격 성공': undefined,
      '타겟 회피': 'evaded',
      '요격 실패': 'target_lost',
      '요격 중단': 'timeout',
    };
    
    // PN 통계 정보
    const pnStats = interceptor.pnState ? {
      avg_closing_speed: interceptor.pnState.lastClosingSpeed,
      max_lambda_dot: interceptor.pnState.lastLambdaDot,
      nav_constant: interceptor.pnState.pnConfig.navConstant,
    } : undefined;
    
    this.logger.log({
      timestamp: this.world.time,
      event: 'intercept_result',
      interceptor_id: interceptor.id,
      target_id: target.id,
      method: interceptor.method || 'RAM',
      guidance_mode: interceptor.guidanceMode,
      result: result.toLowerCase() as 'success' | 'miss' | 'evaded' | 'aborted',
      reason: reasonMap[event.details || ''] as LogEvents.InterceptFailureReason,
      engagement_duration: interceptor.launchTime 
        ? this.world.time - interceptor.launchTime 
        : 0,
      pn_stats: pnStats,
    });
  }

  /**
   * 드론 상태 이벤트 발생
   */
  private emitDroneStateEvent(drone: HostileDrone): void {
    const event: DroneStateUpdateEvent = {
      type: 'drone_state_update',
      timestamp: this.world.time,
      drone_id: drone.id,
      position: drone.position,
      velocity: drone.velocity,
      behavior: drone.behavior,
      is_evading: drone.isEvading,
    };
    this.onEvent(event);

    // 트랙 업데이트 로깅 (간헐적)
    if (Math.random() < 0.1) {
      const distance = Math.sqrt(drone.position.x ** 2 + drone.position.y ** 2);
      this.logger.log({
        timestamp: this.world.time,
        event: 'track_update',
        drone_id: drone.id,
        position: drone.position,
        velocity: drone.velocity,
        behavior: drone.behavior,
        is_evading: drone.isEvading,
        distance_to_base: distance,
      });
    }
  }

  /**
   * 요격 드론 상태 이벤트 발생
   */
  private emitInterceptorEvent(interceptor: ExtendedInterceptorDrone): void {
    const target = interceptor.targetId 
      ? this.world.hostileDrones.get(interceptor.targetId)
      : null;

    // PN 디버그 정보 추출
    const pnDebug = interceptor.pnState ? {
      closing_speed: interceptor.pnState.lastClosingSpeed,
      lambda_dot: interceptor.pnState.lastLambdaDot,
      commanded_accel: interceptor.pnState.lastCommandedAccel,
    } : undefined;

    const event: InterceptorUpdateEvent = {
      type: 'interceptor_update',
      timestamp: this.world.time,
      interceptor_id: interceptor.id,
      target_id: interceptor.targetId,
      state: interceptor.state as any, // 상태 타입 호환성
      position: interceptor.position,
      distance_to_target: target 
        ? Math.sqrt(
            (interceptor.position.x - target.position.x) ** 2 +
            (interceptor.position.y - target.position.y) ** 2
          )
        : undefined,
      method: interceptor.method,
      guidance_mode: interceptor.guidanceMode,
      eo_confirmed: interceptor.eoConfirmed,
      pn_debug: pnDebug,
    };
    this.onEvent(event);
  }

  /**
   * 시뮬레이션 상태 이벤트 발생
   */
  private emitStatusEvent(): void {
    const event: SimulationStatusEvent = {
      type: 'simulation_status',
      timestamp: this.world.time,
      sim_time: this.world.time,
      is_running: this.world.isRunning,
      drone_count: this.world.hostileDrones.size,
      interceptor_count: this.world.interceptors.size,
    };
    this.onEvent(event);
  }

  // ============================================
  // 외부 명령 처리
  // ============================================

  /**
   * 요격 명령 처리
   */
  handleEngageCommand(
    droneId: string, 
    interceptorId?: string, 
    issuedBy: 'user' | 'auto' = 'user',
    method: LogEvents.InterceptMethod = 'RAM',
    guidanceMode?: GuidanceMode  // 유도 모드 지정 가능
  ): boolean {
    const target = this.world.hostileDrones.get(droneId);
    if (!target || target.isNeutralized) return false;

    let interceptor: ExtendedInterceptorDrone | undefined;
    
    if (interceptorId) {
      interceptor = this.world.interceptors.get(interceptorId) as ExtendedInterceptorDrone;
    } else {
      this.world.interceptors.forEach((int) => {
        const state = (int as ExtendedInterceptorDrone).state;
        if ((state === 'IDLE' || state === 'STANDBY') && !interceptor) {
          interceptor = int as ExtendedInterceptorDrone;
        }
      });
    }

    if (!interceptor) return false;
    const state = interceptor.state;
    if (state !== 'IDLE' && state !== 'STANDBY') return false;

    // 유도 모드 설정 (지정된 경우 사용, 아니면 기본값)
    const effectiveGuidanceMode = guidanceMode || this.defaultGuidanceMode;
    
    const launched = launchInterceptor(interceptor, droneId, this.world.time, method, effectiveGuidanceMode);
    this.world.interceptors.set(launched.id, launched as InterceptorDrone);

    // 교전 명령 로깅
    this.logger.log({
      timestamp: this.world.time,
      event: 'engage_command',
      drone_id: droneId,
      method: method,
      guidance_mode: effectiveGuidanceMode,
      interceptor_id: launched.id,
      issued_by: issuedBy,
    });

    // 요격기 발진 로깅
    this.logger.log({
      timestamp: this.world.time,
      event: 'interceptor_spawned',
      interceptor_id: launched.id,
      position: launched.position,
      target_id: droneId,
    });
    
    return true;
  }

  /**
   * 드론 행동 변경
   */
  setDroneBehaviorMode(droneId: string, behavior: HostileDroneBehavior): boolean {
    const drone = this.world.hostileDrones.get(droneId);
    if (!drone) return false;

    const updated = setDroneBehavior(drone, behavior);
    this.world.hostileDrones.set(droneId, updated);
    return true;
  }

  /**
   * manual_action 로깅 (UI에서 호출)
   */
  logManualAction(action: string, targetId?: string, details?: Record<string, unknown>): void {
    this.logger.log({
      timestamp: this.world.time,
      event: 'manual_action',
      action,
      target_id: targetId,
      details,
    });
  }

  /**
   * 현재 상태 반환
   */
  getState(): {
    time: number;
    isRunning: boolean;
    drones: HostileDrone[];
    interceptors: InterceptorDrone[];
    radarConfig: typeof DEFAULT_RADAR_CONFIG;
  } {
    return {
      time: this.world.time,
      isRunning: this.world.isRunning,
      drones: Array.from(this.world.hostileDrones.values()),
      interceptors: Array.from(this.world.interceptors.values()),
      radarConfig: this.world.radarConfig,
    };
  }

  /**
   * 레이더 설정 반환
   */
  getRadarConfig(): typeof DEFAULT_RADAR_CONFIG {
    return this.world.radarConfig;
  }

  /**
   * 로거 반환
   */
  getLogger(): ExperimentLogger {
    return this.logger;
  }

  // ============================================
  // 유도 모드 관련 API
  // ============================================

  /**
   * 기본 유도 모드 설정
   */
  setDefaultGuidanceMode(mode: GuidanceMode): void {
    this.defaultGuidanceMode = mode;
    console.log(`[SimulationEngine] 기본 유도 모드 변경: ${mode}`);
    
    // 로깅
    this.logger.log({
      timestamp: this.world.time,
      event: 'manual_action',
      action: 'set_guidance_mode',
      details: { guidance_mode: mode },
    });
  }

  /**
   * 현재 기본 유도 모드 반환
   */
  getDefaultGuidanceMode(): GuidanceMode {
    return this.defaultGuidanceMode;
  }

  /**
   * 특정 요격기의 유도 모드 변경
   */
  setInterceptorGuidanceMode(interceptorId: string, mode: GuidanceMode): boolean {
    const interceptor = this.world.interceptors.get(interceptorId) as ExtendedInterceptorDrone;
    if (!interceptor) return false;
    
    const updated = setGuidanceMode(interceptor, mode);
    this.world.interceptors.set(interceptorId, updated as InterceptorDrone);
    
    console.log(`[SimulationEngine] 요격기 ${interceptorId} 유도 모드 변경: ${mode}`);
    return true;
  }

  /**
   * 모든 요격기 유도 모드 정보 반환
   */
  getInterceptorGuidanceInfo(): Array<{
    id: string;
    guidanceMode: GuidanceMode;
    pnDebug?: Record<string, unknown>;
  }> {
    const result: Array<{
      id: string;
      guidanceMode: GuidanceMode;
      pnDebug?: Record<string, unknown>;
    }> = [];
    
    this.world.interceptors.forEach((interceptor, id) => {
      const ext = interceptor as ExtendedInterceptorDrone;
      result.push({
        id,
        guidanceMode: ext.guidanceMode || 'PN',
        pnDebug: getInterceptorPNDebugInfo(ext) || undefined,
      });
    });
    
    return result;
  }
}
