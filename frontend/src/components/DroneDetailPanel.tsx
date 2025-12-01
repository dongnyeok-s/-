/**
 * 드론 상세 정보 패널
 * 
 * 선택된 드론의 상세 정보 및 교전 옵션 표시
 */

import { motion } from 'framer-motion';
import { 
  Shield, Target, Eye, Crosshair, 
  MapPin, Compass, Mountain, Gauge,
  AlertTriangle, Radio
} from 'lucide-react';
import { DroneTrack, EngagementState, DroneState, ThreatLevel } from '../types';

interface DroneDetailPanelProps {
  drone: DroneTrack | null;
  onEngagementChange: (droneId: string, state: EngagementState) => void;
  onStateChange: (droneId: string, state: DroneState) => void;
}

// 교전 버튼 설정
const ENGAGEMENT_BUTTONS: Array<{
  state: EngagementState;
  label: string;
  icon: React.ReactNode;
  color: string;
}> = [
  { state: 'IGNORE', label: '무시', icon: <Shield className="w-4 h-4" />, color: 'slate' },
  { state: 'TRACK', label: '추적', icon: <Eye className="w-4 h-4" />, color: 'yellow' },
  { state: 'ENGAGE_PREP', label: '교전준비', icon: <Target className="w-4 h-4" />, color: 'orange' },
  { state: 'ENGAGE', label: '교전', icon: <Crosshair className="w-4 h-4" />, color: 'red' },
];

// 식별 상태 버튼
const STATE_BUTTONS: Array<{
  state: DroneState;
  label: string;
  color: string;
}> = [
  { state: 'UNKNOWN', label: '미상', color: 'slate' },
  { state: 'HOSTILE', label: '적', color: 'red' },
  { state: 'FRIENDLY', label: '아군', color: 'green' },
  { state: 'CIVILIAN', label: '민간', color: 'blue' },
];

// 위협 요소 설명
const THREAT_FACTOR_LABELS: Record<string, string> = {
  distanceScore: '거리',
  velocityScore: '속도',
  behaviorScore: '행동',
  payloadScore: '탑재체',
  sizeScore: '크기',
};

// 위협 레벨 색상
const THREAT_LEVEL_COLORS: Record<ThreatLevel, string> = {
  CRITICAL: 'text-red-400 bg-red-500/20',
  DANGER: 'text-orange-400 bg-orange-500/20',
  CAUTION: 'text-yellow-400 bg-yellow-500/20',
  INFO: 'text-blue-400 bg-blue-500/20',
};

export default function DroneDetailPanel({ drone, onEngagementChange, onStateChange }: DroneDetailPanelProps) {
  if (!drone) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm p-4">
        드론을 선택하면 상세 정보가 표시됩니다
      </div>
    );
  }

  const distance = Math.sqrt(drone.position.x ** 2 + drone.position.y ** 2);
  const bearing = ((Math.atan2(drone.position.x, drone.position.y) * 180) / Math.PI + 360) % 360;
  const speed = Math.sqrt(drone.velocity.vx ** 2 + drone.velocity.vy ** 2);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-4 space-y-4"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-mono text-lg font-semibold text-slate-100">{drone.id}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded ${THREAT_LEVEL_COLORS[drone.threat.level]}`}>
                {drone.threat.level}
              </span>
              <span className="text-xs text-slate-400">
                위협도 {drone.threat.totalScore.toFixed(0)}/100
              </span>
            </div>
          </div>
          <div className={`p-2 rounded-lg ${THREAT_LEVEL_COLORS[drone.threat.level]}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* 위치 정보 */}
        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">위치 정보</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-xs text-slate-500">거리</p>
                <p className="text-sm font-medium text-slate-200">{distance.toFixed(0)}m</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-xs text-slate-500">방위</p>
                <p className="text-sm font-medium text-slate-200">{bearing.toFixed(0)}°</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mountain className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-xs text-slate-500">고도</p>
                <p className="text-sm font-medium text-slate-200">{drone.position.altitude.toFixed(0)}m</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-purple-400" />
              <div>
                <p className="text-xs text-slate-500">속도</p>
                <p className="text-sm font-medium text-slate-200">{speed.toFixed(1)}m/s</p>
              </div>
            </div>
          </div>
        </div>

        {/* 위협 요소 분석 */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">위협 요소</h4>
          <div className="space-y-2">
            {Object.entries(THREAT_FACTOR_LABELS).map(([key, label]) => {
              const score = (drone.threat as any)[key] as number;
              if (score === undefined) return null;
              
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-slate-300">{(score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${
                        score > 0.7 ? 'bg-red-500' :
                        score > 0.4 ? 'bg-yellow-500' :
                        'bg-emerald-500'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${score * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 센서 정보 */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">센서 정보</h4>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-slate-300">{drone.sensorSource}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500">신뢰도: </span>
              <span className="text-sm text-slate-300">{(drone.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          {drone.behaviorPattern && (
            <div className="mt-2">
              <span className="text-xs text-slate-500">행동 패턴: </span>
              <span className={`text-sm ${
                drone.behaviorPattern === 'EVADE' ? 'text-amber-400' :
                drone.behaviorPattern === 'ATTACK_RUN' ? 'text-red-400' :
                'text-slate-300'
              }`}>
                {drone.behaviorPattern}
              </span>
            </div>
          )}
        </div>

        {/* 식별 상태 */}
        <div>
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">식별 상태</h4>
          <div className="flex gap-2">
            {STATE_BUTTONS.map(({ state, label, color }) => (
              <motion.button
                key={state}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onStateChange(drone.id, state)}
                className={`flex-1 py-2 px-3 rounded text-xs font-medium transition-all
                           ${drone.droneState === state 
                             ? `bg-${color}-500/30 text-${color}-400 border border-${color}-500/50`
                             : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'
                           }`}
                style={drone.droneState === state ? {
                  backgroundColor: color === 'red' ? 'rgba(239, 68, 68, 0.3)' :
                                  color === 'green' ? 'rgba(34, 197, 94, 0.3)' :
                                  color === 'blue' ? 'rgba(59, 130, 246, 0.3)' :
                                  'rgba(100, 116, 139, 0.3)',
                  color: color === 'red' ? '#f87171' :
                        color === 'green' ? '#4ade80' :
                        color === 'blue' ? '#60a5fa' :
                        '#94a3b8',
                } : {}}
              >
                {label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 교전 옵션 */}
        <div>
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">교전 옵션</h4>
          <div className="grid grid-cols-2 gap-2">
            {ENGAGEMENT_BUTTONS.map(({ state, label, icon, color }) => (
              <motion.button
                key={state}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onEngagementChange(drone.id, state)}
                disabled={drone.droneState === 'FRIENDLY' && state !== 'IGNORE'}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded text-sm font-medium transition-all
                           ${drone.engagementState === state 
                             ? `bg-${color}-500/30 text-${color}-400 border border-${color}-500/50`
                             : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600'
                           }
                           disabled:opacity-40 disabled:cursor-not-allowed`}
                style={drone.engagementState === state ? {
                  backgroundColor: color === 'red' ? 'rgba(239, 68, 68, 0.3)' :
                                  color === 'orange' ? 'rgba(249, 115, 22, 0.3)' :
                                  color === 'yellow' ? 'rgba(234, 179, 8, 0.3)' :
                                  'rgba(100, 116, 139, 0.3)',
                  color: color === 'red' ? '#f87171' :
                        color === 'orange' ? '#fb923c' :
                        color === 'yellow' ? '#facc15' :
                        '#94a3b8',
                } : {}}
              >
                {icon}
                {label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 권고 사항 */}
        {drone.threat.level === 'CRITICAL' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 border border-red-500/30 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-1">
              <AlertTriangle className="w-4 h-4" />
              긴급 대응 권고
            </div>
            <p className="text-xs text-red-300/80">
              고위험 표적입니다. 즉각적인 교전 조치를 권고합니다.
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
