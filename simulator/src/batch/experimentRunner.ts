/**
 * 실험 데이터 대량 생성 배치 러너
 * 
 * 자동 시나리오 생성 → 시뮬레이션 실행 → JSONL 로그 수집
 */

import { SimulationEngine } from '../simulation';
import { ScenarioGenerator, getGenerator, GeneratedScenario } from '../core/scenario/generator';
import { ExperimentLogger, getLogger, resetLogger } from '../core/logging/logger';
import { SimulatorToC2Event } from '../../../shared/schemas';
import * as fs from 'fs';
import * as path from 'path';

export interface ExperimentConfig {
  /** 실험 횟수 */
  numExperiments: number;
  /** 각 실험 지속 시간 (초) */
  experimentDuration: number;
  /** 시뮬레이션 틱 간격 (ms) */
  tickIntervalMs: number;
  /** 시작 시드 (재현성) */
  baseSeed?: number;
  /** 실험 이름 접두사 */
  namePrefix: string;
  /** 자동 교전 활성화 */
  autoEngage: boolean;
  /** 위협 거리 임계값 (자동 교전 시, m) */
  engageDistanceThreshold: number;
}

export interface ExperimentResult {
  experimentId: string;
  scenarioId: string;
  seed: number;
  duration: number;
  logFile: string | null;
  summary: {
    totalDrones: number;
    totalInterceptors: number;
    radarDetections: number;
    engageCommands: number;
    interceptAttempts: number;
    interceptSuccesses: number;
    interceptFailures: number;
  };
}

export class ExperimentRunner {
  private config: ExperimentConfig;
  private results: ExperimentResult[] = [];

  constructor(config: Partial<ExperimentConfig> = {}) {
    this.config = {
      numExperiments: config.numExperiments ?? 10,
      experimentDuration: config.experimentDuration ?? 60,
      tickIntervalMs: config.tickIntervalMs ?? 100,
      baseSeed: config.baseSeed,
      namePrefix: config.namePrefix ?? 'exp',
      autoEngage: config.autoEngage ?? true,
      engageDistanceThreshold: config.engageDistanceThreshold ?? 300,
    };
  }

  /**
   * 모든 실험 실행
   */
  async runAll(): Promise<ExperimentResult[]> {
    console.log('='.repeat(60));
    console.log('🚀 실험 배치 시작');
    console.log(`   실험 횟수: ${this.config.numExperiments}`);
    console.log(`   실험당 시간: ${this.config.experimentDuration}초`);
    console.log(`   자동 교전: ${this.config.autoEngage ? 'ON' : 'OFF'}`);
    console.log('='.repeat(60));

    for (let i = 0; i < this.config.numExperiments; i++) {
      const seed = this.config.baseSeed 
        ? this.config.baseSeed + i 
        : Math.floor(Math.random() * 100000);
      
      console.log(`\n[${i + 1}/${this.config.numExperiments}] 실험 시작 (seed: ${seed})`);
      
      const result = await this.runSingleExperiment(i, seed);
      this.results.push(result);
      
      console.log(`   ✅ 완료: ${result.summary.interceptSuccesses}/${result.summary.interceptAttempts} 요격 성공`);
    }

    // 최종 요약 저장
    this.saveSummary();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 모든 실험 완료!');
    console.log(`   총 실험: ${this.results.length}`);
    console.log(`   로그 위치: simulator/logs/`);
    console.log('='.repeat(60));

    return this.results;
  }

  /**
   * 단일 실험 실행
   */
  private async runSingleExperiment(index: number, seed: number): Promise<ExperimentResult> {
    const experimentId = `${this.config.namePrefix}_${index + 1}_${Date.now()}`;
    
    // 로거 리셋
    resetLogger();
    
    // 시나리오 생성
    const generator = new ScenarioGenerator({}, './scenarios/generated');
    const scenario = generator.generate(seed);
    generator.save(scenario);

    // 카운터 초기화
    const counters = {
      radarDetections: 0,
      engageCommands: 0,
      interceptAttempts: 0,
      interceptSuccesses: 0,
      interceptFailures: 0,
    };

    // 시뮬레이션 초기화 (이벤트 콜백 포함)
    const simulation = new SimulationEngine((event: SimulatorToC2Event) => {
      // 이벤트별 카운터 업데이트
      switch (event.type) {
        case 'radar_detection':
          counters.radarDetections++;
          // 자동 교전 로직
          if (this.config.autoEngage && event.range <= this.config.engageDistanceThreshold) {
            simulation.handleEngageCommand(event.drone_id, undefined, 'auto');
            counters.engageCommands++;
          }
          break;
        case 'intercept_result':
          counters.interceptAttempts++;
          if (event.result === 'SUCCESS') {
            counters.interceptSuccesses++;
          } else {
            counters.interceptFailures++;
          }
          break;
      }
    });

    // 시나리오 로드
    simulation.loadScenario(scenario.id);

    // 빠른 배치 모드: 내부 타이머 대신 직접 tick 호출
    // simulation.start()는 사용하지 않고, tick을 직접 호출하여 즉시 실행

    const totalTicks = Math.floor(this.config.experimentDuration * 1000 / this.config.tickIntervalMs);
    
    // 진행률 표시 초기화
    process.stdout.write(`   진행: 0%`);
    
    for (let tick = 0; tick < totalTicks; tick++) {
      // 직접 tick 호출 (내부 private이므로 public 메서드 추가 필요)
      // 여기서는 시뮬레이터가 돌아가는 동안 기다리는 방식으로 수정
      
      // 진행률 표시 (10% 단위)
      const progressInterval = Math.max(1, Math.floor(totalTicks / 10));
      if (tick % progressInterval === 0) {
        const progress = Math.floor((tick / totalTicks) * 100);
        process.stdout.write(`\r   진행: ${progress}%`);
      }
      
      // 짧은 대기 (CPU 부하 방지, 1ms)
      await this.sleep(1);
    }

    process.stdout.write(`\r   진행: 100%\n`);

    // 실제 시뮬레이션은 실시간으로 돌아야 하므로, 대안으로 고속 모드 사용
    // 속도 배율 10배로 설정하여 30초 실험을 3초에 완료
    simulation.setSpeedMultiplier(10);
    simulation.start();
    
    // 실제 대기 (실험시간 / 배율)
    const realWaitTime = Math.ceil(this.config.experimentDuration / 10 * 1000);
    await this.sleep(realWaitTime);
    
    // 시뮬레이션 종료
    simulation.pause();
    
    const state = simulation.getState();
    const logger = simulation.getLogger();
    const logFile = logger.getCurrentLogFile();

    return {
      experimentId,
      scenarioId: scenario.id,
      seed,
      duration: this.config.experimentDuration,
      logFile,
      summary: {
        totalDrones: scenario.drones.length,
        totalInterceptors: scenario.interceptor_count,
        ...counters,
      },
    };
  }

  /**
   * 전체 실험 요약 저장
   */
  private saveSummary(): void {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const summaryPath = path.join(logsDir, `summary_${Date.now()}.json`);
    
    const aggregated = {
      totalExperiments: this.results.length,
      config: this.config,
      timestamp: new Date().toISOString(),
      results: this.results,
      aggregatedStats: this.calculateAggregatedStats(),
    };

    fs.writeFileSync(summaryPath, JSON.stringify(aggregated, null, 2));
    console.log(`\n📊 요약 저장: ${summaryPath}`);
  }

  /**
   * 집계 통계 계산
   */
  private calculateAggregatedStats() {
    const totals = this.results.reduce(
      (acc, r) => ({
        totalDrones: acc.totalDrones + r.summary.totalDrones,
        radarDetections: acc.radarDetections + r.summary.radarDetections,
        engageCommands: acc.engageCommands + r.summary.engageCommands,
        interceptAttempts: acc.interceptAttempts + r.summary.interceptAttempts,
        interceptSuccesses: acc.interceptSuccesses + r.summary.interceptSuccesses,
        interceptFailures: acc.interceptFailures + r.summary.interceptFailures,
      }),
      {
        totalDrones: 0,
        radarDetections: 0,
        engageCommands: 0,
        interceptAttempts: 0,
        interceptSuccesses: 0,
        interceptFailures: 0,
      }
    );

    return {
      ...totals,
      avgDronesPerExperiment: totals.totalDrones / this.results.length,
      avgRadarDetectionsPerExperiment: totals.radarDetections / this.results.length,
      overallInterceptSuccessRate: 
        totals.interceptAttempts > 0 
          ? (totals.interceptSuccesses / totals.interceptAttempts * 100).toFixed(2) + '%'
          : 'N/A',
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * CLI 실행
 */
async function main() {
  const args = process.argv.slice(2);
  
  // 사용법 표시
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔬 대드론 C2 시뮬레이션 실험 데이터 생성기

사용법:
  npx ts-node src/batch/experimentRunner.ts [실험횟수] [실험시간(초)] [시작시드]

예시:
  npx ts-node src/batch/experimentRunner.ts 10 60        # 10회 실험, 각 60초
  npx ts-node src/batch/experimentRunner.ts 50 120 12345 # 50회 실험, 각 120초, 시드 12345

출력:
  - logs/*.jsonl    : 각 실험의 상세 이벤트 로그
  - logs/summary_*.json : 전체 실험 요약
`);
    return;
  }
  
  const config: Partial<ExperimentConfig> = {
    numExperiments: parseInt(args[0]) || 10,
    experimentDuration: parseInt(args[1]) || 60,
    baseSeed: args[2] ? parseInt(args[2]) : undefined,
    namePrefix: 'batch',
    autoEngage: true,
    engageDistanceThreshold: 300,
  };

  console.log('\n🔬 대드론 C2 시뮬레이션 실험 데이터 생성기\n');
  
  const runner = new ExperimentRunner(config);
  await runner.runAll();
}

// 직접 실행 시
main().catch(console.error);

