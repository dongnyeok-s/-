"""
음향 모델 WebSocket 클라이언트

C2 시뮬레이터에 음향 탐지 이벤트 전송
"""

import asyncio
import json
import random
import time
from typing import Optional
import websockets

from model import (
    DroneAudioCRNN,
    AudioSensorSimulator,
    AudioDetectionResult,
    DroneActivityState,
)


class AudioModelClient:
    """
    음향 모델 WebSocket 클라이언트
    
    시뮬레이터 서버에 연결하여 음향 탐지 이벤트 전송
    """
    
    def __init__(
        self,
        server_url: str = "ws://localhost:8080",
        detection_interval: float = 2.0,  # 탐지 주기 (초)
    ):
        self.server_url = server_url
        self.detection_interval = detection_interval
        self.model = DroneAudioCRNN()
        self.simulator = AudioSensorSimulator(self.model)
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.is_running = False
        
        # 시뮬레이션용 더미 드론 데이터
        # 실제로는 시뮬레이터로부터 드론 위치 수신
        self.simulated_drones = [
            {
                "id": "AUDIO-SIM-001",
                "position": [300, 250, 80],
                "velocity": [-8, -6, 0],
            },
            {
                "id": "AUDIO-SIM-002",
                "position": [-200, 400, 120],
                "velocity": [3, -5, -1],
            },
        ]
    
    async def connect(self) -> bool:
        """서버에 연결"""
        try:
            self.websocket = await websockets.connect(self.server_url)
            print(f"[AudioClient] 서버 연결 성공: {self.server_url}")
            return True
        except Exception as e:
            print(f"[AudioClient] 연결 실패: {e}")
            return False
    
    async def disconnect(self):
        """연결 해제"""
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
            print("[AudioClient] 연결 해제")
    
    async def send_detection_event(self, result: AudioDetectionResult):
        """탐지 이벤트 전송"""
        if not self.websocket:
            return
        
        event = {
            "type": "audio_detection",
            "timestamp": time.time(),
            "drone_id": result.drone_id,
            "state": result.state.value,
            "confidence": round(result.confidence, 2),
            "estimated_distance": round(result.estimated_distance, 1) if result.estimated_distance else None,
            "estimated_bearing": round(result.estimated_bearing, 1) if result.estimated_bearing else None,
        }
        
        try:
            await self.websocket.send(json.dumps(event))
            print(f"[AudioClient] 이벤트 전송: {result.drone_id} - {result.state.value}")
        except Exception as e:
            print(f"[AudioClient] 전송 실패: {e}")
    
    async def detection_loop(self):
        """탐지 루프 실행"""
        self.is_running = True
        
        while self.is_running:
            # 각 시뮬레이션 드론에 대해 탐지 시도
            for drone in self.simulated_drones:
                # 위치 업데이트 (시뮬레이션)
                drone["position"][0] += drone["velocity"][0] * self.detection_interval
                drone["position"][1] += drone["velocity"][1] * self.detection_interval
                drone["position"][2] += drone["velocity"][2] * self.detection_interval
                
                # 탐지 시도
                result = self.simulator.simulate_detection(
                    drone_id=drone["id"],
                    drone_position=tuple(drone["position"]),
                    drone_velocity=tuple(drone["velocity"]),
                )
                
                if result:
                    await self.send_detection_event(result)
            
            await asyncio.sleep(self.detection_interval)
    
    async def listen_for_commands(self):
        """서버로부터 명령 수신"""
        if not self.websocket:
            return
        
        try:
            async for message in self.websocket:
                data = json.loads(message)
                print(f"[AudioClient] 서버 메시지: {data.get('type', 'unknown')}")
                
                # 드론 상태 업데이트 수신 시 시뮬레이션 데이터 갱신
                if data.get("type") == "drone_state_update":
                    self._update_simulated_drone(data)
                    
        except websockets.exceptions.ConnectionClosed:
            print("[AudioClient] 연결 끊김")
            self.is_running = False
    
    def _update_simulated_drone(self, data: dict):
        """시뮬레이션 드론 데이터 업데이트"""
        drone_id = data.get("drone_id")
        for drone in self.simulated_drones:
            if drone["id"] == drone_id:
                if "position" in data:
                    pos = data["position"]
                    drone["position"] = [pos.get("x", 0), pos.get("y", 0), pos.get("altitude", 0)]
                if "velocity" in data:
                    vel = data["velocity"]
                    drone["velocity"] = [vel.get("vx", 0), vel.get("vy", 0), vel.get("climbRate", 0)]
    
    async def run(self):
        """클라이언트 실행"""
        if not await self.connect():
            return
        
        try:
            # 탐지 루프와 명령 수신을 동시 실행
            await asyncio.gather(
                self.detection_loop(),
                self.listen_for_commands(),
            )
        except KeyboardInterrupt:
            print("\n[AudioClient] 종료 중...")
        finally:
            self.is_running = False
            await self.disconnect()


async def main():
    """메인 함수"""
    print("=== 음향 모델 WebSocket 클라이언트 ===\n")
    
    client = AudioModelClient(
        server_url="ws://localhost:8080",
        detection_interval=2.0,
    )
    
    await client.run()


if __name__ == "__main__":
    asyncio.run(main())

