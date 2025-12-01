/**
 * 시뮬레이터 내부 타입 정의
 */

import {
  HostileDroneBehavior,
  InterceptorState,
  RadarConfig,
  InterceptorConfig,
  HostileDroneConfig,
} from '../../shared/schemas';

/** 3D 위치 */
export interface Position3D {
  x: number;
  y: number;
  altitude: number;
}

/** 3D 속도 */
export interface Velocity3D {
  vx: number;
  vy: number;
  climbRate: number;
}

/** 적 드론 시뮬레이션 객체 */
export interface HostileDrone {
  id: string;
  position: Position3D;
  velocity: Velocity3D;
  behavior: HostileDroneBehavior;
  config: HostileDroneConfig;
  isEvading: boolean;
  targetPosition?: Position3D;  // 목표 지점 (RECON, ATTACK_RUN 모드용)
  spawnTime: number;
  lastRadarDetection: number;
  isNeutralized: boolean;
}

/** 요격 드론 시뮬레이션 객체 */
export interface InterceptorDrone {
  id: string;
  position: Position3D;
  velocity: Velocity3D;
  state: InterceptorState;
  config: InterceptorConfig;
  targetId: string | null;
  launchTime: number | null;
}

/** 시뮬레이션 전체 상태 */
export interface SimulationWorld {
  time: number;
  isRunning: boolean;
  speedMultiplier: number;
  tickInterval: number;       // 밀리초
  hostileDrones: Map<string, HostileDrone>;
  interceptors: Map<string, InterceptorDrone>;
  radarConfig: RadarConfig;
  basePosition: Position3D;   // 아군 기지 위치
}

/** 시뮬레이션 이벤트 큐 아이템 */
export interface EventQueueItem {
  time: number;
  event: unknown;
}

