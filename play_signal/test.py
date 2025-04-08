import serial
import time

# --- 실험 설정 ---
sampling_rate = 100        # Hz (200Hz = 0.005초 간격)
duration = 5                 # 초
init_setpoint = 32.5         # 기본 온도
delta_value = 6.0            # 올릴 온도 차이

# --- delta 값 생성 ---
n_samples = int(sampling_rate * duration)  # 예: 200Hz * 5초 = 1000개
delta_temp = [delta_value] * n_samples + [0]  # 마지막에 원복용 delta = 0
interval = 1.0 / sampling_rate               # sleep 간격 (초)

# --- Serial 연결 ---
ser = serial.Serial("COM4", 115200, timeout=1)
time.sleep(2)  # 포트 초기화 대기

print("📤 Start sending delta values...")

# --- delta 전송 ---
for i, delta in enumerate(delta_temp):
    msg = f"{delta:.2f}\n"
    ser.write(msg.encode())
    print(f"[{i:04}] Sent ΔT: {delta:.2f}")
    time.sleep(interval)

print("✅ Done sending all deltas.")
ser.close()
