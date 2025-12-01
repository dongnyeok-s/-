/**
 * 소부대 대드론 C2 시뮬레이터 - 타입 정의
 * 
 * 이 파일은 시뮬레이터에서 사용하는 모든 데이터 모델을 정의합니다.
 */

// ============================================
// 기본 열거형 타입
// ============================================

/** 드론 식별 상태 */
export type DroneState = "UNKNOWN" | "FRIENDLY" | "HOSTILE" | "CIVILIAN";

/** 교전 상태 */
export type EngagementState = "IGNORE" | "TRACK" | "ENGAGE_PREP" | "ENGAGE";

/** 위협 레벨 */
export type ThreatLevel = "INFO" | "CAUTION" | "DANGER" | "CRITICAL";

/** 탑재체 유형 (무장 가능성 판단용) */
export type PayloadType = "UNKNOWN" | "NONE" | "CAMERA" | "BOMB" | "ROCKET" | "CHEMICAL";

/** 센서 소스 */
export type SensorSource = "EO" | "IR" | "AUDIO" | "RADAR" | "MULTI";

/** 행동 패턴 */
export type BehaviorPattern = 
  | "LINEAR" | "CIRCLING" | "HOVERING" | "APPROACHING" | "RETREATING" | "ERRATIC"
  | "NORMAL" | "RECON" | "ATTACK_RUN" | "EVADE";

// ============================================
// 위치 및 속도 인터페이스
// ============================================

/** 
 * 2D/3D 위치 정보
 * - x, y: 지도 상의 좌표 (미터 단위, 아군 기지 = 0,0)
 * - altitude: 고도 (미터)
 */
export interface Position {
  x: number;
  y: number;
  altitude: number;
}

/**
 * 속도 정보
 * - vx, vy: 수평 속도 (m/s)
 * - climbRate: 상승/하강 속도 (m/s, 양수=상승)
 */
export interface Velocity {
  vx: number;
  vy: number;
  climbRate: number;
}

// ============================================
// 위협 평가 관련 인터페이스
// ============================================

/**
 * 위협도 점수
 */
export interface ThreatScore {
  /** 위협 레벨 */
  level: ThreatLevel;
  
  /** 종합 위협 점수 (0~100) */
  totalScore: number;
  
  /** 거리 점수 (0~1): 가까울수록 높음 */
  distanceScore: number;
  
  /** 속도/접근 점수 (0~1): 아군 방향 접근 속도가 빠를수록 높음 */
  velocityScore: number;
  
  /** 행동 패턴 점수 (0~1): 위협적인 행동일수록 높음 */
  behaviorScore: number;
  
  /** 탑재체 점수 (0~1): 무장 가능성이 높을수록 높음 */
  payloadScore: number;
  
  /** 크기 점수 (0~1) */
  sizeScore: number;
}

/**
 * 위협 평가 가중치 설정
 */
export interface ThreatWeights {
  distance: number;   // 기본값: 0.3
  velocity: number;   // 기본값: 0.25
  altitude: number;   // 기본값: 0.15
  payload: number;    // 기본값: 0.15
  behavior: number;   // 기본값: 0.15
}

// ============================================
// 드론 트랙 인터페이스
// ============================================

/**
 * 드론 트랙 (표적) 데이터
 * 탐지된 드론의 모든 정보를 담는 핵심 인터페이스
 */
export interface DroneTrack {
  /** 고유 식별자 */
  id: string;
  
  /** 현재 위치 */
  position: Position;
  
  /** 현재 속도 */
  velocity: Velocity;
  
  /** 드론 식별 상태 (미상/우군/적/민간) */
  droneState: DroneState;
  
  /** 교전 상태 (무시/추적/요격준비/요격) */
  engagementState: EngagementState;
  
  /** 탐지 센서 소스 */
  sensorSource: SensorSource;
  
  /** 탐지 신뢰도 (0~1) */
  confidence: number;
  
  /** 위협 평가 결과 */
  threat: ThreatScore;
  
  /** 위치 히스토리 (최근 N개) */
  history: Position[];
  
  /** 최초 탐지 시간 (시뮬레이션 시간, 초) */
  createdAt: number;
  
  /** 마지막 업데이트 시간 (시뮬레이션 시간, 초) */
  lastUpdatedAt: number;
  
  /** 현재 행동 패턴 (옵션) */
  behaviorPattern?: BehaviorPattern;
  
  /** 추정 탑재체 유형 (옵션) */
  payloadType?: PayloadType;
}

// ============================================
// 시뮬레이션 관련 인터페이스
// ============================================

/**
 * 시뮬레이션 로그 항목
 */
export interface LogEntry {
  /** 시뮬레이션 시간 (초) */
  time: number;
  
  /** 로그 유형 */
  type: "DETECTION" | "THREAT" | "SYSTEM" | "ENGAGEMENT" | "AUDIO";
  
  /** 로그 메시지 */
  message: string;
  
  /** 관련 드론 ID (있는 경우) */
  droneId?: string;
  
  /** 세부 데이터 */
  data?: Record<string, unknown>;
}

/**
 * 시뮬레이션 상태
 */
export interface SimulationState {
  /** 현재 시뮬레이션 시간 (초) */
  currentTime: number;
  
  /** 시뮬레이션 실행 중 여부 */
  isRunning: boolean;
  
  /** 시뮬레이션 속도 배율 (1 = 실시간) */
  speedMultiplier: number;
  
  /** 틱 간격 (초) */
  tickInterval: number;
  
  /** 모든 드론 트랙 */
  drones: DroneTrack[];
  
  /** 이벤트 로그 */
  logs: LogEntry[];
  
  /** 선택된 드론 ID */
  selectedDroneId: string | null;
}

/**
 * 시뮬레이션 설정
 */
export interface SimulationConfig {
  /** 맵 크기 (미터) */
  mapSize: number;
  
  /** 안전 거리 (미터) */
  safeDistance: number;
  
  /** 위험 거리 (미터) */
  dangerDistance: number;
  
  /** 위협 평가 가중치 */
  threatWeights: ThreatWeights;
  
  /** 위치 히스토리 최대 개수 */
  maxHistoryLength: number;
}

// ============================================
// 기본 설정값
// ============================================

/** 기본 위협 평가 가중치 */
export const DEFAULT_THREAT_WEIGHTS: ThreatWeights = {
  distance: 0.3,
  velocity: 0.25,
  altitude: 0.15,
  payload: 0.15,
  behavior: 0.15,
};

/** 기본 시뮬레이션 설정 */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  mapSize: 1000,           // 1km x 1km 맵
  safeDistance: 500,       // 500m 이상 = 안전
  dangerDistance: 100,     // 100m 이하 = 위험
  threatWeights: DEFAULT_THREAT_WEIGHTS,
  maxHistoryLength: 50,    // 최근 50개 위치 저장
};

/** 탑재체 유형별 위협 점수 */
export const PAYLOAD_THREAT_SCORES: Record<PayloadType, number> = {
  UNKNOWN: 0.5,
  NONE: 0.1,
  CAMERA: 0.4,
  BOMB: 0.9,
  ROCKET: 1.0,
  CHEMICAL: 0.95,
};

// ============================================
// 시뮬레이터 통신 타입 (WebSocket)
// ============================================

/** 드론 활동 상태 (음향 기반) */
export type DroneActivityState = 
  | 'NOISE' | 'IDLE' | 'TAKEOFF' | 'HOVER' | 'APPROACH' | 'DEPART';

/** 요격 드론 상태 */
export type InterceptorState = 
  | 'STANDBY' | 'LAUNCHING' | 'PURSUING' | 'ENGAGING' | 'RETURNING' | 'NEUTRALIZED';

/** 요격 결과 */
export type InterceptResult = 'SUCCESS' | 'MISS' | 'EVADED' | 'ABORTED';

/** 음향 탐지 이벤트 */
export interface AudioDetectionEvent {
  type: 'audio_detection';
  timestamp: number;
  drone_id: string;
  state: DroneActivityState;
  confidence: number;
  estimated_distance?: number;
  estimated_bearing?: number;
}

/** 레이더 탐지 이벤트 */
export interface RadarDetectionEvent {
  type: 'radar_detection';
  timestamp: number;
  drone_id: string;
  range: number;
  bearing: number;
  altitude: number;
  radial_velocity?: number;
  confidence: number;
  is_false_alarm?: boolean;
}

/** 드론 상태 업데이트 이벤트 */
export interface DroneStateUpdateEvent {
  type: 'drone_state_update';
  timestamp: number;
  drone_id: string;
  position: { x: number; y: number; altitude: number };
  velocity: { vx: number; vy: number; climbRate: number };
  behavior: string;
  is_evading: boolean;
}

/** 요격 드론 업데이트 이벤트 */
export interface InterceptorUpdateEvent {
  type: 'interceptor_update';
  timestamp: number;
  interceptor_id: string;
  target_id: string | null;
  state: InterceptorState;
  position: { x: number; y: number; altitude: number };
  distance_to_target?: number;
}

/** 요격 결과 이벤트 */
export interface InterceptResultEvent {
  type: 'intercept_result';
  timestamp: number;
  interceptor_id: string;
  target_id: string;
  result: InterceptResult;
  details?: string;
}

/** 시뮬레이터 → C2 이벤트 통합 */
export type SimulatorEvent = 
  | AudioDetectionEvent
  | RadarDetectionEvent
  | DroneStateUpdateEvent
  | InterceptorUpdateEvent
  | InterceptResultEvent
  | { type: 'simulation_status'; [key: string]: unknown }
  | { type: 'initial_state'; [key: string]: unknown };

/** 요격기 정보 */
export interface Interceptor {
  id: string;
  position: Position;
  state: InterceptorState;
  targetId: string | null;
  distanceToTarget?: number;
}
