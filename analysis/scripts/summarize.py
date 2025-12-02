"""
실험 결과 요약 및 보고서 생성 모듈

최종 요약 결과를 생성하고 보고서를 출력합니다.
"""

import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

from lib.loader import load_all_experiments, ExperimentData
from lib.metrics import calculate_all_metrics, ExperimentMetrics


def generate_summary(experiments: List[ExperimentData]) -> Dict[str, Any]:
    """
    전체 실험 요약 생성
    
    Args:
        experiments: ExperimentData 리스트
        
    Returns:
        요약 딕셔너리
    """
    individual_metrics, aggregated = calculate_all_metrics(experiments)
    
    # 개선 포인트 자동 생성
    improvement_points = generate_improvement_points(aggregated)
    
    return {
        'generated_at': datetime.now().isoformat(),
        'metrics': aggregated,
        'individual_experiments': [
            {
                'id': m.experiment_id,
                'scenario_id': m.scenario_id,
                'duration': m.duration,
                'drone_count': m.total_drones,
                'radar_detections': m.radar_detections,
                'intercept_success_rate': m.intercept_success_rate,
            }
            for m in individual_metrics
        ],
        'improvement_points': improvement_points,
    }


def generate_improvement_points(metrics: Dict[str, Any]) -> List[str]:
    """
    분석 결과 기반 개선 포인트 자동 생성
    
    Args:
        metrics: 집계된 지표 딕셔너리
        
    Returns:
        개선 포인트 문자열 리스트
    """
    points = []
    
    # 요격 성공률 분석
    success_rate = metrics['interception']['success_rate']
    if success_rate < 50:
        points.append(f"⚠️ 요격 성공률({success_rate}%)이 낮음 - 요격 알고리즘 개선 필요")
    elif success_rate < 75:
        points.append(f"📊 요격 성공률({success_rate}%) 개선 여지 있음")
    else:
        points.append(f"✅ 요격 성공률({success_rate}%) 양호")
    
    # 오탐률 분석
    false_alarm_rate = metrics['detection']['false_alarm_rate']
    if false_alarm_rate > 5:
        points.append(f"⚠️ 오탐률({false_alarm_rate}%)이 높음 - 탐지 필터링 개선 필요")
    elif false_alarm_rate > 2:
        points.append(f"📊 오탐률({false_alarm_rate}%) 모니터링 권장")
    else:
        points.append(f"✅ 오탐률({false_alarm_rate}%) 양호")
    
    # 탐지 지연 분석
    detection_delay = metrics['detection']['detection_delay'].get('mean', 0)
    if detection_delay > 3:
        points.append(f"⚠️ 평균 탐지 지연({detection_delay:.2f}초)이 길음 - 센서 감도 조정 필요")
    elif detection_delay > 1.5:
        points.append(f"📊 탐지 지연({detection_delay:.2f}초) 개선 가능")
    else:
        points.append(f"✅ 탐지 지연({detection_delay:.2f}초) 양호")
    
    # 교전 비율 분석
    engaged_ratio = metrics['engagement']['engaged_ratio']
    if engaged_ratio < 30:
        points.append(f"⚠️ 교전 비율({engaged_ratio}%)이 낮음 - 교전 판단 기준 완화 검토")
    
    # 요격 실패 원인 분석
    top_failures = metrics['interception'].get('top_failure_reasons', [])
    if top_failures:
        top_reason, top_count = top_failures[0]
        reason_map = {
            'evaded': '타겟 회피',
            'distance_exceeded': '거리 초과',
            'timeout': '시간 초과',
            'low_speed': '속도 부족',
            'sensor_error': '센서 오류',
            'target_lost': '타겟 손실',
        }
        reason_name = reason_map.get(top_reason, top_reason)
        points.append(f"📈 주요 요격 실패 원인: {reason_name} ({top_count}회)")
    
    # 무력화율 분석
    neutralization_rate = metrics['interception']['neutralization_rate']
    if neutralization_rate < 20:
        points.append(f"⚠️ 무력화율({neutralization_rate}%)이 낮음 - 전체적인 대응 능력 검토 필요")
    
    # 음향 탐지 상태
    if not metrics['detection']['audio_model_active']:
        points.append("ℹ️ 음향 탐지 모델이 비활성화 상태임")
    elif metrics['detection']['total_audio'] == 0:
        points.append("📊 음향 탐지가 활성화되었으나 탐지 기록 없음 - 모델 점검 필요")
    
    return points


def print_summary_report(summary: Dict[str, Any]):
    """콘솔에 요약 보고서 출력"""
    metrics = summary['metrics']
    
    print("\n" + "=" * 70)
    print("📋 대드론 C2 시뮬레이션 실험 분석 보고서")
    print("=" * 70)
    print(f"생성 시간: {summary['generated_at']}")
    
    print("\n" + "-" * 70)
    print("1️⃣  실험 개요")
    print("-" * 70)
    print(f"   총 실험 횟수: {metrics['experiment_count']}회")
    print(f"   총 드론 수: {metrics['drones']['total']}기")
    print(f"     - 적대적: {metrics['drones']['hostile']}기")
    print(f"     - 중립/아군: {metrics['drones']['neutral']}기")
    print(f"   평균 드론/실험: {metrics['drones']['avg_per_experiment']}기")
    
    print("\n" + "-" * 70)
    print("2️⃣  탐지 성능")
    print("-" * 70)
    audio_status = "활성화" if metrics['detection']['audio_model_active'] else "비활성화"
    print(f"   레이더 탐지: {metrics['detection']['total_radar']}회")
    print(f"   음향 탐지: {metrics['detection']['total_audio']}회 ({audio_status})")
    print(f"   오탐률: {metrics['detection']['false_alarm_rate']}%")
    
    fa_breakdown = metrics['detection']['false_alarm_breakdown']
    print(f"     - 객체 없음: {fa_breakdown['no_object']}회")
    print(f"     - 오분류: {fa_breakdown['misclassification']}회")
    print(f"     - 추적 오류: {fa_breakdown['tracking_error']}회")
    
    det_delay = metrics['detection']['detection_delay']
    print(f"\n   탐지 지연 통계:")
    print(f"     - 평균: {det_delay.get('mean', 0):.3f}초")
    print(f"     - 중앙값: {det_delay.get('median', 0):.3f}초")
    print(f"     - 표준편차: {det_delay.get('std', 0):.3f}초")
    print(f"     - 범위: {det_delay.get('min_val', 0):.3f} ~ {det_delay.get('max_val', 0):.3f}초")
    
    print("\n" + "-" * 70)
    print("3️⃣  교전 효율")
    print("-" * 70)
    print(f"   교전 명령: {metrics['engagement']['total_commands']}회")
    print(f"   교전 비율: {metrics['engagement']['engaged_ratio']}%")
    
    eng_delay = metrics['engagement']['engagement_delay']
    print(f"\n   교전 지연 통계:")
    print(f"     - 평균: {eng_delay.get('mean', 0):.3f}초")
    print(f"     - 중앙값: {eng_delay.get('median', 0):.3f}초")
    print(f"     - 표준편차: {eng_delay.get('std', 0):.3f}초")
    
    print("\n" + "-" * 70)
    print("4️⃣  요격 성능")
    print("-" * 70)
    print(f"   요격 시도: {metrics['interception']['total_attempts']}회")
    print(f"   요격 성공: {metrics['interception']['successes']}회")
    print(f"   요격 실패: {metrics['interception']['failures']}회")
    print(f"   성공률: {metrics['interception']['success_rate']}%")
    print(f"   무력화율: {metrics['interception']['neutralization_rate']}%")
    
    top_failures = metrics['interception'].get('top_failure_reasons', [])
    if top_failures:
        print(f"\n   요격 실패 원인 Top 3:")
        reason_map = {
            'evaded': '타겟 회피',
            'distance_exceeded': '거리 초과',
            'timeout': '시간 초과',
            'low_speed': '속도 부족',
            'sensor_error': '센서 오류',
            'target_lost': '타겟 손실',
            'other': '기타',
        }
        for i, (reason, count) in enumerate(top_failures[:3], 1):
            reason_name = reason_map.get(reason, reason)
            print(f"     {i}. {reason_name}: {count}회")
    
    print("\n" + "-" * 70)
    print("5️⃣  드론 상태")
    print("-" * 70)
    print(f"   탐지됨: {metrics['drones']['detected']}기")
    print(f"   교전됨: {metrics['drones']['engaged']}기")
    print(f"   무력화: {metrics['drones']['neutralized']}기")
    
    print("\n" + "-" * 70)
    print("6️⃣  이벤트 총계")
    print("-" * 70)
    event_totals = metrics.get('event_totals', {})
    for event_type, count in sorted(event_totals.items(), key=lambda x: x[1], reverse=True)[:8]:
        print(f"   {event_type}: {count:,}회")
    
    print("\n" + "-" * 70)
    print("7️⃣  개선 포인트")
    print("-" * 70)
    for point in summary['improvement_points']:
        print(f"   {point}")
    
    print("\n" + "=" * 70)


def save_summary_json(summary: Dict[str, Any], output_path: str = 'analysis_summary.json'):
    """요약 결과를 JSON 파일로 저장"""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"💾 요약 저장: {output_path}")


def run_full_analysis(log_dir: str = '../simulator/logs', output_dir: str = '.') -> Dict[str, Any]:
    """
    전체 분석 실행
    
    Args:
        log_dir: 로그 디렉토리
        output_dir: 출력 디렉토리
        
    Returns:
        요약 딕셔너리
    """
    print("\n🔬 대드론 C2 시뮬레이션 실험 데이터 분석 시작\n")
    
    # 데이터 로드
    experiments = load_all_experiments(log_dir)
    if not experiments:
        print("⚠️ 분석할 데이터가 없습니다.")
        return {}
    
    # 요약 생성
    summary = generate_summary(experiments)
    
    # 콘솔 출력
    print_summary_report(summary)
    
    # 파일 저장
    os.makedirs(output_dir, exist_ok=True)
    save_summary_json(summary, os.path.join(output_dir, 'analysis_summary.json'))
    
    # 그래프 생성
    try:
        from plots import create_full_report_figure
        create_full_report_figure(summary['metrics'], os.path.join(output_dir, 'experiment_analysis.png'))
    except ImportError as e:
        print(f"⚠️ 그래프 생성 실패: {e}")
    
    return summary


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='대드론 C2 실험 데이터 분석')
    parser.add_argument('--log-dir', '-l', default='../simulator/logs', help='로그 디렉토리')
    parser.add_argument('--output-dir', '-o', default='.', help='출력 디렉토리')
    args = parser.parse_args()
    
    run_full_analysis(args.log_dir, args.output_dir)

