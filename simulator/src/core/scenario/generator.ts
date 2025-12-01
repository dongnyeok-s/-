/**
 * 자동 시나리오 생성기
 * 
 * 다양한 랜덤 변수 기반의 드론/센서/확률/행동 패턴을 자동 생성하여
 * 대량의 실험 데이터를 생산 가능한 구조입니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_RADAR_CONFIG, DEFAULT_HOSTILE_DRONE_CONFIG } from '../../../../shared/schemas';

// ============================================
// 시드 기반 난수 생성기 (재현성 확보)
// ============================================

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * 0~1 사이 난수 생성 (Mulberry32 알고리즘)
   */
  next(): number {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /**
   * 범위 내 정수 난수
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * 범위 내 실수 난수
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * 배열에서 랜덤 선택
   */
  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * 확률 기반 boolean
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

// ============================================
// 시나리오 설정 타입
// ============================================

export interface GeneratedDrone {
  id: string;
  position: { x: number; y: number; altitude: number };
  velocity: { vx: number; vy: number; climbRate: number };
  behavior: 'NORMAL' | 'RECON' | 'ATTACK_RUN' | 'EVADE';
  is_hostile: boolean;
  config: {
    max_speed: number;
    cruise_speed: number;
    acceleration: number;
    turn_rate: number;
    evasion_trigger_distance: number;
    evasion_maneuver_strength: number;
  };
  target_position?: { x: number; y: number; altitude: number };
}

export interface GeneratedScenario {
  id: string;
  name: string;
  seed: number;
  created_at: string;
  
  // 드론 설정
  drones: GeneratedDrone[];
  interceptor_count: number;
  
  // 레이더 설정
  radar_config: {
    scan_rate: number;
    max_range: number;
    radial_noise_sigma: number;
    azimuth_noise_sigma: number;
    false_alarm_rate: number;
    miss_probability: number;
  };
  
  // 행동 분포
  behavior_distribution: {
    direct_attack: number;
    recon_loiter: number;
    evasive: number;
    random_walk: number;
  };
  
  // 메타데이터
  metadata: {
    hostile_ratio: number;
    avg_initial_distance: number;
    difficulty_estimate: number;  // 1-10
  };
}

export interface GeneratorConfig {
  minDrones: number;
  maxDrones: number;
  minInterceptors: number;
  maxInterceptors: number;
  mapRadius: number;           // 드론 생성 범위
  minAltitude: number;
  maxAltitude: number;
  minSpeed: number;
  maxSpeed: number;
  hostileRatioMin: number;
  hostileRatioMax: number;
}

const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  minDrones: 1,
  maxDrones: 15,
  minInterceptors: 1,
  maxInterceptors: 5,
  mapRadius: 800,
  minAltitude: 30,
  maxAltitude: 200,
  minSpeed: 5,
  maxSpeed: 30,
  hostileRatioMin: 0.3,
  hostileRatioMax: 1.0,
};

// ============================================
// 시나리오 생성기
// ============================================

export class ScenarioGenerator {
  private config: GeneratorConfig;
  private outputDir: string;

  constructor(config: Partial<GeneratorConfig> = {}, outputDir: string = './scenarios/generated') {
    this.config = { ...DEFAULT_GENERATOR_CONFIG, ...config };
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * 시나리오 생성
   */
  generate(seed?: number): GeneratedScenario {
    const actualSeed = seed ?? Date.now();
    const rng = new SeededRandom(actualSeed);
    
    const id = `gen_${actualSeed}`;
    const droneCount = rng.nextInt(this.config.minDrones, this.config.maxDrones);
    const interceptorCount = rng.nextInt(this.config.minInterceptors, this.config.maxInterceptors);
    const hostileRatio = rng.nextFloat(this.config.hostileRatioMin, this.config.hostileRatioMax);

    // 행동 분포 생성
    const behaviorDistribution = this.generateBehaviorDistribution(rng);
    
    // 레이더 설정 생성
    const radarConfig = this.generateRadarConfig(rng);
    
    // 드론 생성
    const drones = this.generateDrones(rng, droneCount, hostileRatio, behaviorDistribution);
    
    // 난이도 추정
    const difficulty = this.estimateDifficulty(drones, radarConfig);
    
    // 평균 초기 거리 계산
    const avgDistance = drones.reduce((sum, d) => 
      sum + Math.sqrt(d.position.x ** 2 + d.position.y ** 2), 0
    ) / drones.length;

    const scenario: GeneratedScenario = {
      id,
      name: `자동생성 시나리오 (${droneCount}기)`,
      seed: actualSeed,
      created_at: new Date().toISOString(),
      drones,
      interceptor_count: interceptorCount,
      radar_config: radarConfig,
      behavior_distribution: behaviorDistribution,
      metadata: {
        hostile_ratio: hostileRatio,
        avg_initial_distance: Math.round(avgDistance),
        difficulty_estimate: difficulty,
      },
    };

    return scenario;
  }

  /**
   * 행동 분포 생성
   */
  private generateBehaviorDistribution(rng: SeededRandom): GeneratedScenario['behavior_distribution'] {
    // 랜덤 가중치 생성
    const weights = {
      direct_attack: rng.nextFloat(0.1, 0.5),
      recon_loiter: rng.nextFloat(0.1, 0.3),
      evasive: rng.nextFloat(0.1, 0.3),
      random_walk: rng.nextFloat(0.05, 0.2),
    };

    // 정규화
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    return {
      direct_attack: weights.direct_attack / total,
      recon_loiter: weights.recon_loiter / total,
      evasive: weights.evasive / total,
      random_walk: weights.random_walk / total,
    };
  }

  /**
   * 레이더 설정 생성
   */
  private generateRadarConfig(rng: SeededRandom): GeneratedScenario['radar_config'] {
    return {
      scan_rate: rng.nextFloat(0.5, 2),
      max_range: rng.nextInt(800, 1200),
      radial_noise_sigma: rng.nextFloat(5, 20),
      azimuth_noise_sigma: rng.nextFloat(1, 5),
      false_alarm_rate: rng.nextFloat(0.005, 0.03),
      miss_probability: rng.nextFloat(0.03, 0.15),
    };
  }

  /**
   * 드론 배열 생성
   */
  private generateDrones(
    rng: SeededRandom,
    count: number,
    hostileRatio: number,
    behaviorDist: GeneratedScenario['behavior_distribution']
  ): GeneratedDrone[] {
    const drones: GeneratedDrone[] = [];
    const behaviors: GeneratedDrone['behavior'][] = ['NORMAL', 'RECON', 'ATTACK_RUN', 'EVADE'];
    
    for (let i = 0; i < count; i++) {
      const isHostile = rng.chance(hostileRatio);
      const behavior = this.selectBehavior(rng, behaviorDist, isHostile);
      
      // 위치 생성 (기지로부터 300~800m 거리)
      const angle = rng.nextFloat(0, Math.PI * 2);
      const distance = rng.nextFloat(300, this.config.mapRadius);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const altitude = rng.nextFloat(this.config.minAltitude, this.config.maxAltitude);

      // 속도 생성 (기지 방향 또는 랜덤)
      const speed = rng.nextFloat(this.config.minSpeed, this.config.maxSpeed);
      let vx: number, vy: number;
      
      if (behavior === 'NORMAL' || behavior === 'ATTACK_RUN') {
        // 기지 방향으로
        const toBaseX = -x / distance;
        const toBaseY = -y / distance;
        vx = toBaseX * speed;
        vy = toBaseY * speed;
      } else if (behavior === 'RECON') {
        // 접선 방향 (선회)
        vx = -y / distance * speed * 0.5;
        vy = x / distance * speed * 0.5;
      } else {
        // 랜덤 방향
        const velAngle = rng.nextFloat(0, Math.PI * 2);
        vx = Math.cos(velAngle) * speed;
        vy = Math.sin(velAngle) * speed;
      }

      const drone: GeneratedDrone = {
        id: `DRONE-${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) || ''}`,
        position: { x, y, altitude },
        velocity: { vx, vy, climbRate: rng.nextFloat(-2, 2) },
        behavior,
        is_hostile: isHostile,
        config: {
          max_speed: rng.nextFloat(20, 35),
          cruise_speed: speed,
          acceleration: rng.nextFloat(3, 10),
          turn_rate: rng.nextFloat(45, 120),
          evasion_trigger_distance: rng.nextFloat(80, 150),
          evasion_maneuver_strength: rng.nextFloat(0.5, 1.0),
        },
      };

      // RECON인 경우 목표 위치 설정
      if (behavior === 'RECON') {
        drone.target_position = {
          x: rng.nextFloat(-200, 200),
          y: rng.nextFloat(-200, 200),
          altitude: rng.nextFloat(100, 180),
        };
      }

      drones.push(drone);
    }

    return drones;
  }

  /**
   * 행동 패턴 선택
   */
  private selectBehavior(
    rng: SeededRandom,
    dist: GeneratedScenario['behavior_distribution'],
    isHostile: boolean
  ): GeneratedDrone['behavior'] {
    if (!isHostile) {
      // 비적대적 드론은 RECON이나 기본 행동
      return rng.chance(0.7) ? 'RECON' : 'NORMAL';
    }

    const r = rng.next();
    let cumulative = 0;
    
    cumulative += dist.direct_attack;
    if (r < cumulative) return 'ATTACK_RUN';
    
    cumulative += dist.recon_loiter;
    if (r < cumulative) return 'RECON';
    
    cumulative += dist.evasive;
    if (r < cumulative) return 'EVADE';
    
    return 'NORMAL';
  }

  /**
   * 난이도 추정 (1-10)
   */
  private estimateDifficulty(
    drones: GeneratedDrone[],
    radarConfig: GeneratedScenario['radar_config']
  ): number {
    let score = 0;
    
    // 드론 수 (1-3점)
    score += Math.min(3, drones.length / 5);
    
    // 적대적 드론 비율 (1-2점)
    const hostileRatio = drones.filter(d => d.is_hostile).length / drones.length;
    score += hostileRatio * 2;
    
    // 공격형 비율 (1-2점)
    const attackRatio = drones.filter(d => d.behavior === 'ATTACK_RUN').length / drones.length;
    score += attackRatio * 2;
    
    // 레이더 노이즈 (1점)
    score += (radarConfig.radial_noise_sigma / 20);
    
    // 미탐 확률 (1점)
    score += radarConfig.miss_probability * 10;
    
    // 오탐 확률 (1점)
    score += radarConfig.false_alarm_rate * 30;

    return Math.round(Math.min(10, Math.max(1, score)));
  }

  /**
   * 시나리오를 파일로 저장
   */
  save(scenario: GeneratedScenario): string {
    const filename = `${scenario.id}.json`;
    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(scenario, null, 2));
    console.log(`[ScenarioGenerator] 시나리오 저장: ${filepath}`);
    return filepath;
  }

  /**
   * 여러 시나리오 일괄 생성
   */
  generateBatch(count: number, baseSeed?: number): GeneratedScenario[] {
    const scenarios: GeneratedScenario[] = [];
    const seed = baseSeed ?? Date.now();
    
    for (let i = 0; i < count; i++) {
      const scenario = this.generate(seed + i);
      scenarios.push(scenario);
      this.save(scenario);
    }
    
    console.log(`[ScenarioGenerator] ${count}개 시나리오 생성 완료`);
    return scenarios;
  }

  /**
   * 저장된 시나리오 목록 반환
   */
  listSavedScenarios(): GeneratedScenario[] {
    if (!fs.existsSync(this.outputDir)) {
      return [];
    }

    const files = fs.readdirSync(this.outputDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));

    return files.map(f => {
      const content = fs.readFileSync(path.join(this.outputDir, f), 'utf-8');
      return JSON.parse(content) as GeneratedScenario;
    });
  }

  /**
   * 특정 시나리오 로드
   */
  loadScenario(id: string): GeneratedScenario | null {
    const filepath = path.join(this.outputDir, `${id}.json`);
    if (!fs.existsSync(filepath)) {
      return null;
    }
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  }
}

// 싱글톤 인스턴스
let generatorInstance: ScenarioGenerator | null = null;

export function getGenerator(config?: Partial<GeneratorConfig>, outputDir?: string): ScenarioGenerator {
  if (!generatorInstance) {
    generatorInstance = new ScenarioGenerator(config, outputDir);
  }
  return generatorInstance;
}

