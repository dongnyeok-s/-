/**
 * 실험 로깅용 이벤트 스키마 정의
 * 
 * 모든 이벤트는 이 스키마를 따라야 합니다.
 * JSONL 형식으로 1줄 1이벤트 저장됩니다.
 */

// ============================================
// 기본 이벤트 인터페이스
// ============================================

export interface BaseEvent {
  timestamp: number;  // 시뮬레이션 시간 (초)
  event: string;      // 이벤트 타입
}

// ============================================
// 시나리오 이벤트
// ============================================

export interface ScenarioStartEvent extends BaseEvent {
  event: 'scenario_start';
  scenario_id: number | string;
  scenario_name: string;
  seed?: number;
  config: {
    drone_count: number;
    interceptor_count: number;
    radar_config: {
      scan_rate: number;
      max_range: number;
      radial_noise_sigma: number;
      azimuth_noise_sigma: number;
      false_alarm_rate: number;
      miss_probability: number;
    };
    behavior_distribution?: Record<string, number>;
  };
}

export interface ScenarioEndEvent extends BaseEvent {
  event: 'scenario_end';
  scenario_id: number | string;
  duration: number;
  summary: {
    total_drones: number;
    drones_neutralized: number;
    drones_escaped: number;
    intercept_attempts: number;
    intercept_successes: number;
    intercept_failures: number;
    false_alarms: number;
  };
}

// ============================================
// 드론 이벤트
// ============================================

export interface DroneSpawnedEvent extends BaseEvent {
  event: 'drone_spawned';
  drone_id: string;
  position: { x: number; y: number; altitude: number };
  velocity: { vx: number; vy: number; climbRate: number };
  behavior: string;
  is_hostile: boolean;
}

export interface TrackUpdateEvent extends BaseEvent {
  event: 'track_update';
  drone_id: string;
  position: { x: number; y: number; altitude: number };
  velocity: { vx: number; vy: number; climbRate: number };
  behavior: string;
  is_evading: boolean;
  distance_to_base: number;
}

// ============================================
// 탐지 이벤트
// ============================================

export interface AudioDetectionEvent extends BaseEvent {
  event: 'audio_detection';
  drone_id: string;
  state: string;
  confidence: number;
  estimated_distance?: number;
  estimated_bearing?: number;
  is_first_detection: boolean;
}

export interface RadarDetectionEvent extends BaseEvent {
  event: 'radar_detection';
  drone_id: string;
  range: number;
  bearing: number;
  altitude: number;
  radial_velocity?: number;
  confidence: number;
  is_false_alarm: boolean;
  is_first_detection: boolean;
}

// ============================================
// 위협 평가 이벤트
// ============================================

export interface ThreatScoreUpdateEvent extends BaseEvent {
  event: 'threat_score_update';
  drone_id: string;
  threat_level: string;
  total_score: number;
  factors: {
    distance_score: number;
    velocity_score: number;
    behavior_score: number;
    payload_score: number;
    size_score: number;
  };
  previous_level?: string;
}

// ============================================
// 교전 이벤트
// ============================================

export interface EngageCommandEvent extends BaseEvent {
  event: 'engage_command';
  drone_id: string;
  method: string;
  interceptor_id?: string;
  issued_by: 'user' | 'auto';
}

export interface InterceptorSpawnedEvent extends BaseEvent {
  event: 'interceptor_spawned';
  interceptor_id: string;
  position: { x: number; y: number; altitude: number };
  target_id: string;
}

export interface InterceptAttemptEvent extends BaseEvent {
  event: 'intercept_attempt';
  interceptor_id: string;
  target_id: string;
  distance_at_attempt: number;
  relative_speed: number;
  target_evading: boolean;
  success_probability: number;
}

export interface InterceptResultEvent extends BaseEvent {
  event: 'intercept_result';
  interceptor_id: string;
  target_id: string;
  result: 'success' | 'miss' | 'evaded' | 'aborted';
  reason?: string;
  engagement_duration: number;
}

// ============================================
// 회피 이벤트
// ============================================

export interface EvadeStartEvent extends BaseEvent {
  event: 'evade_start';
  drone_id: string;
  trigger: 'interceptor_approach' | 'manual' | 'auto';
  interceptor_distance?: number;
}

export interface EvadeEndEvent extends BaseEvent {
  event: 'evade_end';
  drone_id: string;
  duration: number;
  result: 'escaped' | 'caught' | 'timeout';
}

// ============================================
// UI/사용자 조작 이벤트
// ============================================

export interface ManualActionEvent extends BaseEvent {
  event: 'manual_action';
  action: string;
  target_id?: string;
  details?: Record<string, unknown>;
}

export interface SelectedDroneEvent extends BaseEvent {
  event: 'selected_drone';
  drone_id: string | null;
  previous_id?: string | null;
}

export interface ClickedEngageEvent extends BaseEvent {
  event: 'clicked_engage';
  drone_id: string;
  engagement_state: string;
}

export interface ClickedIgnoreEvent extends BaseEvent {
  event: 'clicked_ignore';
  drone_id: string;
}

export interface SimulationControlEvent extends BaseEvent {
  event: 'simulation_control';
  action: 'start' | 'pause' | 'reset' | 'speed_change';
  speed_multiplier?: number;
  scenario_id?: number | string;
}

// ============================================
// 통합 이벤트 타입
// ============================================

export type LogEvent =
  | ScenarioStartEvent
  | ScenarioEndEvent
  | DroneSpawnedEvent
  | TrackUpdateEvent
  | AudioDetectionEvent
  | RadarDetectionEvent
  | ThreatScoreUpdateEvent
  | EngageCommandEvent
  | InterceptorSpawnedEvent
  | InterceptAttemptEvent
  | InterceptResultEvent
  | EvadeStartEvent
  | EvadeEndEvent
  | ManualActionEvent
  | SelectedDroneEvent
  | ClickedEngageEvent
  | ClickedIgnoreEvent
  | SimulationControlEvent;

// ============================================
// 이벤트 생성 헬퍼 함수
// ============================================

export function createEvent<T extends LogEvent>(
  event: Omit<T, 'timestamp'>,
  timestamp: number
): T {
  return { ...event, timestamp } as T;
}

// 이벤트 타입 목록
export const EVENT_TYPES = [
  'scenario_start',
  'scenario_end',
  'drone_spawned',
  'track_update',
  'audio_detection',
  'radar_detection',
  'threat_score_update',
  'engage_command',
  'interceptor_spawned',
  'intercept_attempt',
  'intercept_result',
  'evade_start',
  'evade_end',
  'manual_action',
  'selected_drone',
  'clicked_engage',
  'clicked_ignore',
  'simulation_control',
] as const;

