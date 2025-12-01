/**
 * 요격 드론 행동 모델
 * 
 * 상태:
 * - STANDBY: 대기
 * - LAUNCHING: 발진 중
 * - PURSUING: 추격 중
 * - ENGAGING: 교전 중
 * - RETURNING: 귀환 중
 * - NEUTRALIZED: 무력화
 */

import { 
  InterceptorState, 
  InterceptorConfig, 
  InterceptResult,
  DEFAULT_INTERCEPTOR_CONFIG 
} from '../../../shared/schemas';
import { InterceptorDrone, HostileDrone, Position3D, Velocity3D } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * 두 위치 간 거리 계산
 */
function distance3D(p1: Position3D, p2: Position3D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.altitude - p1.altitude;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 방향 벡터 정규화
 */
function normalize3D(dx: number, dy: number, dz: number): { nx: number; ny: number; nz: number } {
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.001) return { nx: 0, ny: 0, nz: 0 };
  return { nx: dx / len, ny: dy / len, nz: dz / len };
}

/**
 * 요격 드론 생성
 */
export function createInterceptor(
  basePosition: Position3D,
  config: InterceptorConfig = DEFAULT_INTERCEPTOR_CONFIG
): InterceptorDrone {
  return {
    id: `INT-${uuidv4().substring(0, 4).toUpperCase()}`,
    position: { ...basePosition, altitude: basePosition.altitude + 10 },
    velocity: { vx: 0, vy: 0, climbRate: 0 },
    state: 'STANDBY',
    config,
    targetId: null,
    launchTime: null,
  };
}

/**
 * 요격 드론 발진
 */
export function launchInterceptor(
  interceptor: InterceptorDrone,
  targetId: string,
  currentTime: number
): InterceptorDrone {
  if (interceptor.state !== 'STANDBY') {
    return interceptor;
  }

  return {
    ...interceptor,
    state: 'LAUNCHING',
    targetId,
    launchTime: currentTime,
  };
}

/**
 * 요격 드론 행동 업데이트 (한 틱)
 */
export function updateInterceptor(
  interceptor: InterceptorDrone,
  deltaTime: number,
  target: HostileDrone | null,
  basePosition: Position3D,
  currentTime: number
): { interceptor: InterceptorDrone; interceptResult: InterceptResult | null } {
  if (interceptor.state === 'NEUTRALIZED' || interceptor.state === 'STANDBY') {
    return { interceptor, interceptResult: null };
  }

  let updated = { ...interceptor };
  let interceptResult: InterceptResult | null = null;

  switch (updated.state) {
    case 'LAUNCHING':
      // 발진 후 2초 뒤 추격 모드
      if (currentTime - (updated.launchTime || 0) > 2) {
        updated.state = 'PURSUING';
      }
      // 상승
      updated.velocity = { vx: 0, vy: 0, climbRate: updated.config.climb_rate };
      break;

    case 'PURSUING':
      if (!target || target.isNeutralized) {
        // 타겟 없음 → 귀환
        updated.state = 'RETURNING';
        updated.targetId = null;
        break;
      }

      // 타겟 추격
      updated = pursueTarget(updated, target, deltaTime);

      // 교전 거리 진입 체크
      const distToTarget = distance3D(updated.position, target.position);
      if (distToTarget < updated.config.engagement_range * 2) {
        updated.state = 'ENGAGING';
      }
      break;

    case 'ENGAGING':
      if (!target || target.isNeutralized) {
        updated.state = 'RETURNING';
        updated.targetId = null;
        interceptResult = 'ABORTED';
        break;
      }

      // 계속 추격
      updated = pursueTarget(updated, target, deltaTime);

      // 교전 판정
      const engageDist = distance3D(updated.position, target.position);
      if (engageDist < updated.config.engagement_range) {
        // 요격 성공 확률 계산
        const successProb = calculateInterceptProbability(updated, target);
        if (Math.random() < successProb) {
          interceptResult = 'SUCCESS';
        } else {
          // 회피됨 또는 실패
          interceptResult = target.isEvading ? 'EVADED' : 'MISS';
        }
        updated.state = 'RETURNING';
        updated.targetId = null;
      }
      break;

    case 'RETURNING':
      // 기지로 귀환
      updated = returnToBase(updated, basePosition, deltaTime);

      const distToBase = distance3D(updated.position, basePosition);
      if (distToBase < 20) {
        updated.state = 'STANDBY';
        updated.velocity = { vx: 0, vy: 0, climbRate: 0 };
        updated.position = { ...basePosition, altitude: basePosition.altitude + 10 };
      }
      break;
  }

  // 위치 업데이트
  updated.position = {
    x: updated.position.x + updated.velocity.vx * deltaTime,
    y: updated.position.y + updated.velocity.vy * deltaTime,
    altitude: Math.max(10, updated.position.altitude + updated.velocity.climbRate * deltaTime),
  };

  return { interceptor: updated, interceptResult };
}

/**
 * 타겟 추격 로직
 */
function pursueTarget(
  interceptor: InterceptorDrone,
  target: HostileDrone,
  deltaTime: number
): InterceptorDrone {
  // 예측 요격 지점 계산 (선도각)
  const predictedPosition = predictTargetPosition(target, 2); // 2초 후 예측

  const dx = predictedPosition.x - interceptor.position.x;
  const dy = predictedPosition.y - interceptor.position.y;
  const dz = predictedPosition.altitude - interceptor.position.altitude;
  const { nx, ny, nz } = normalize3D(dx, dy, dz);

  // 현재 속도
  const currentSpeed = Math.sqrt(
    interceptor.velocity.vx ** 2 + 
    interceptor.velocity.vy ** 2 + 
    interceptor.velocity.climbRate ** 2
  );

  // 가속
  const newSpeed = Math.min(
    interceptor.config.max_speed,
    currentSpeed + interceptor.config.acceleration * deltaTime
  );

  // 선회율 제한 적용 (간단히)
  const maxTurnRadians = (interceptor.config.turn_rate * Math.PI / 180) * deltaTime;
  
  return {
    ...interceptor,
    velocity: {
      vx: nx * newSpeed,
      vy: ny * newSpeed,
      climbRate: Math.max(
        -interceptor.config.climb_rate,
        Math.min(interceptor.config.climb_rate, nz * newSpeed)
      ),
    },
  };
}

/**
 * 타겟 위치 예측
 */
function predictTargetPosition(target: HostileDrone, seconds: number): Position3D {
  return {
    x: target.position.x + target.velocity.vx * seconds,
    y: target.position.y + target.velocity.vy * seconds,
    altitude: target.position.altitude + target.velocity.climbRate * seconds,
  };
}

/**
 * 기지 귀환 로직
 */
function returnToBase(
  interceptor: InterceptorDrone,
  basePosition: Position3D,
  deltaTime: number
): InterceptorDrone {
  const dx = basePosition.x - interceptor.position.x;
  const dy = basePosition.y - interceptor.position.y;
  const dz = basePosition.altitude - interceptor.position.altitude;
  const { nx, ny, nz } = normalize3D(dx, dy, dz);

  const returnSpeed = interceptor.config.max_speed * 0.7;

  return {
    ...interceptor,
    velocity: {
      vx: nx * returnSpeed,
      vy: ny * returnSpeed,
      climbRate: Math.max(-5, Math.min(5, nz * returnSpeed)),
    },
  };
}

/**
 * 요격 성공 확률 계산
 * P = f(상대 속도, 접근각, 회피 상태, 센서오차)
 */
function calculateInterceptProbability(
  interceptor: InterceptorDrone,
  target: HostileDrone
): number {
  let probability = interceptor.config.base_success_rate;

  // 상대 속도 영향 (빠를수록 어려움)
  const relativeSpeed = Math.sqrt(
    (interceptor.velocity.vx - target.velocity.vx) ** 2 +
    (interceptor.velocity.vy - target.velocity.vy) ** 2
  );
  if (relativeSpeed > 30) {
    probability *= 0.8;
  } else if (relativeSpeed > 20) {
    probability *= 0.9;
  }

  // 회피 상태 영향
  if (target.isEvading) {
    probability *= (1 - target.config.evasion_maneuver_strength);
  }

  // 고도 차이 영향
  const altDiff = Math.abs(interceptor.position.altitude - target.position.altitude);
  if (altDiff > 30) {
    probability *= 0.85;
  }

  // 최소/최대 제한
  return Math.max(0.1, Math.min(0.95, probability));
}

/**
 * 요격 드론 대기 상태로 리셋
 */
export function resetInterceptor(
  interceptor: InterceptorDrone,
  basePosition: Position3D
): InterceptorDrone {
  return {
    ...interceptor,
    position: { ...basePosition, altitude: basePosition.altitude + 10 },
    velocity: { vx: 0, vy: 0, climbRate: 0 },
    state: 'STANDBY',
    targetId: null,
    launchTime: null,
  };
}

