/**
 * 시뮬레이터 설정 관리
 * 환경 변수 기반 설정 로더
 */

export interface SimulatorConfig {
  port: number;
  wsUrl: string;
  logsDir: string;
  logConsoleOutput: boolean;
  logEnabled: boolean;
  scenariosDir: string;
  nodeEnv: string;
}

/**
 * 환경 변수에서 설정 로드
 */
export function loadConfig(): SimulatorConfig {
  return {
    port: parseInt(process.env.SIMULATOR_PORT || '8080', 10),
    wsUrl: process.env.SIMULATOR_WS_URL || 'ws://localhost:8080',
    logsDir: process.env.LOGS_DIR || './logs',
    logConsoleOutput: process.env.LOG_CONSOLE_OUTPUT === 'true',
    logEnabled: process.env.LOG_ENABLED !== 'false',
    scenariosDir: process.env.SCENARIOS_DIR || './scenarios/generated',
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

/**
 * 기본 설정 인스턴스 (싱글톤)
 */
let configInstance: SimulatorConfig | null = null;

/**
 * 설정 싱글톤 가져오기
 */
export function getConfig(): SimulatorConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

