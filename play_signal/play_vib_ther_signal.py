import serial
import time
import json
import numpy as np
import csv
import threading
import nidaqmx
from nidaqmx.constants import AcquisitionType
import os
from datetime import datetime
from scipy.signal import resample

# 앱 시작 시 실행되는 시리얼 연결 함수
def reconnect_serial(port="COM4", baudrate=115200, max_retries=5, retry_delay=1):
    for attempt in range(max_retries):
        ser = serial.Serial(port, baudrate, timeout=0.01)
        print(f"[Serial] Connected on attempt {attempt + 1}")
    #         return ser
    #     except serial.SerialException:
    #         print(f"[Serial] Retry {attempt + 1}/{max_retries}... waiting {retry_delay}s")
    #         time.sleep(retry_delay)
    # print("[ERROR] Could not reconnect to Arduino.")
    return None

# 버튼 누를 때 실행되는 함수
def run_stim_from_json(data, dir_path, unix_time, ser):
    SAMPLE_RATE = 10000
    TOTAL_DURATION_SEC = data.get("duration", 10)
    THERMAL_RATE = 100  # 100Hz (0.01s 간격)

    def Init_DAQ():
        system = nidaqmx.system.System.local()
        for device in system.devices:
            print("[DAQ] Device Found:", device)
        device = system.devices['Dev1']
        out_chan = device.ao_physical_chans['ao0']
        return out_chan.name

    def Run_DAQ(out_chan, vib_signal):
        with nidaqmx.Task() as task:
            task.ao_channels.add_ao_voltage_chan(out_chan)
            task.timing.cfg_samp_clk_timing(SAMPLE_RATE,
                                            sample_mode=AcquisitionType.FINITE,
                                            samps_per_chan=SAMPLE_RATE * TOTAL_DURATION_SEC)
            task.write(vib_signal, auto_start=True)
            task.wait_until_done()
            task.stop()

    if ser is None:
        print("[WARNING] Arduino not connected. Skipping serial streaming.")
        return

    # 유닉스 타임 기반 파일 저장
    os.makedirs(os.path.join(dir_path, "jsons"), exist_ok=True)
    json_path = os.path.join(dir_path, "jsons", f"collected_data_{unix_time}.json")
    with open(json_path, 'w') as f:
        json.dump(data, f)

    try:
        vib_signal = np.array(data['vib_signal'])
        thermal_signal = np.array(data.get('thermal_signal', [0.0] * len(vib_signal)))
        vib_signal_result = vib_signal.copy()

        # Thermal signal resample to 100Hz
        target_len = int(TOTAL_DURATION_SEC * THERMAL_RATE)
        thermal_resampled = resample(thermal_signal, target_len)

        # 로그 디렉토리 및 CSV 로그 파일 생성
        log_dir = os.path.join(dir_path, "logs")
        os.makedirs(log_dir, exist_ok=True)
        csv_path = os.path.join(log_dir, f"arduino_log_{unix_time}.csv")
        with open(csv_path, 'w', newline='') as csv_file:
            csv_writer = csv.writer(csv_file)
            csv_writer.writerow(['Time(ms)', 'Kp', 'Ki', 'Kd', 'CurrentTemp', 'TargetTemp', 'PWM', 'DeltaTemp', 'Step', 'BreakTime'])

            out_chan = Init_DAQ()
            daq_thread = threading.Thread(target=Run_DAQ, args=(out_chan, vib_signal_result))
            daq_thread.start()

            thermal_start_time = time.perf_counter()
            for idx, delta_temp in enumerate(thermal_resampled):
                command = f"{delta_temp:.3f}\n"
                ser.write(command.encode())

                # Try to read logs from Arduino
                try:
                    while ser.in_waiting:
                        line = ser.readline().decode('utf-8', errors='ignore').strip()
                        if line.endswith(';') and ',' in line:
                            fields = line.replace(';', '').split(',')
                            if len(fields) == 10:
                                csv_writer.writerow(fields)
                except Exception:
                    continue

                # 100Hz sync
                next_time = thermal_start_time + (idx + 1) * 0.01
                while time.perf_counter() < next_time:
                    time.sleep(0.001)

            daq_thread.join()

            print("[Arduino] Resetting temperature to baseline (21°C)...")

    finally:
        if ser is not None and ser.is_open:
            ser.write(b"0.000\n")
            ser.flush()
            # ser.close()  # 연결은 계속 유지하고 싶으면 닫지 마세요
        print("✅ All signals sent, DAQ complete, and logs saved.")

# ---------------------------
# 예시: 앱 흐름
# ---------------------------
if __name__ == "__main__":
    # 앱 시작 시 시리얼 연결
    ser = reconnect_serial()
    if ser is None:
        raise RuntimeError("시리얼 연결 실패")

    # 버튼 누르면 아래 코드 실행
    sample_data = {
        "duration": 10,
        "vib_signal": [0.5] * 100000,
        "thermal_signal": [5.0] * 10000
    }
    output_dir = "./output"
    timestamp = int(time.time())
    run_stim_from_json(sample_data, output_dir, timestamp, ser)
