import serial
import time
import json
import numpy as np
import csv
import threading
import nidaqmx
from nidaqmx.constants import AcquisitionType, TerminalConfiguration
import os
from datetime import datetime
from play_signal.generate_signal import generate_signal_with_thermal

def run_stim_from_json(data):
    SAMPLE_RATE = 10000
    THERMAL_RATE = 10
    TOTAL_DURATION_SEC = data.get("duration", 10)
    timestamp = str(data.get("timestamp", int(time.time())))
    user_id = data.get("user_id", "default")
    init_setpoint = data.get("init_setpoint", 32.5)

    save_dir = os.path.join("static", "save_data", user_id)
    os.makedirs(save_dir, exist_ok=True)
    json_path = os.path.join(save_dir, f"collected_data_{timestamp}.json")
    with open(json_path, 'w') as f:
        json.dump(data, f)

    def reconnect_serial(port="COM4", baudrate=115200, max_retries=5, retry_delay=1):
        for attempt in range(max_retries):
            try:
                ser = serial.Serial(port, baudrate, timeout=1)
                print(f"[Serial] Connected on attempt {attempt + 1}")
                return ser
            except serial.SerialException:
                print(f"[Serial] Retry {attempt + 1}/{max_retries}... waiting {retry_delay}s")
                time.sleep(retry_delay)
        print("[ERROR] Could not reconnect to Arduino.")
        return None

    def Run_DAQ(out_chan, vib_signal):
        with nidaqmx.Task() as task:
            task.ao_channels.add_ao_voltage_chan(out_chan)
            task.timing.cfg_samp_clk_timing(SAMPLE_RATE,
                                            sample_mode=AcquisitionType.FINITE,
                                            samps_per_chan=SAMPLE_RATE * TOTAL_DURATION_SEC)
            task.write(vib_signal, auto_start=True)
            task.wait_until_done()

    def record_accelerometer_data(filepath):
        with nidaqmx.Task() as readtask:
            readtask.ai_channels.add_ai_voltage_chan(
                "Dev1/ai0:2",
                terminal_config=TerminalConfiguration.RSE,
                min_val=-10,
                max_val=10
            )
            readtask.timing.cfg_samp_clk_timing(
                SAMPLE_RATE,
                sample_mode=AcquisitionType.FINITE,
                samps_per_chan=SAMPLE_RATE * TOTAL_DURATION_SEC
            )
            data = readtask.read(number_of_samples_per_channel=SAMPLE_RATE * TOTAL_DURATION_SEC)

        data_np = np.array(data).T
        with open(filepath, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(["X", "Y", "Z"])
            writer.writerows(data_np)

    # Prepare signal
    vib_amp = np.array(data['vib_amp'])
    vib_freq = np.array(data['vib_freq'])
    thr_amp_raw = data.get('thr_amp', [0.0] * len(vib_amp))
    thermal_amp = np.array(thr_amp_raw)

    vib_signal, thermal_resampled = generate_signal_with_thermal(
        vib_amp, vib_freq, thermal_amp,
        TOTAL_DURATION_SEC=TOTAL_DURATION_SEC,
        duration=data.get("duration", 5),
        logscale=True,
        thermal_rate=THERMAL_RATE
    )

    delta_list = [float(f"{val:.2f}") for val in np.append(thermal_resampled, 0.0)]

    # Setup logging paths
    log_dir = os.path.join(save_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    arduino_log_path = os.path.join(log_dir, f"arduino_log_{timestamp}.csv")
    accel_log_path = os.path.join(log_dir, f"accel_log_{timestamp}.csv")

    ser = reconnect_serial()
    if ser is None:
        print("[WARNING] Arduino not connected. Skipping serial streaming.")
        return

    try:
        # flush buffer
        time.sleep(2)
        ser.reset_input_buffer()

        # Start Arduino log receiver
        def log_receiver(ser, duration_s, filepath):
            start_time = time.time()
            with open(filepath, mode='w', newline='') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(['Millis', 'Input_Temperature', 'Setpoint', 'Delta', 'PWM', 'Received'])
                while time.time() - start_time < duration_s + 1:
                    try:
                        line = ser.readline().decode('utf-8').strip()
                        if line.count(',') == 5 and "Received:" in line:
                            parts = line.split(',')
                            writer.writerow(parts)
                    except:
                        continue

        # ΔT thermal 전송 함수 (10Hz)
        def send_delta_thermal():
            ser.write(b"start\n")
            time.sleep(0.001)
            for i, delta in enumerate(delta_list):
                msg = f"{delta:.2f}\n"
                ser.write(msg.encode())
                print(f"[Thermal {i:04}] Sent ΔT: {delta:.2f}")
                time.sleep(1.0 / THERMAL_RATE)

        # 스레드 준비
        log_thread = threading.Thread(target=log_receiver, args=(ser, TOTAL_DURATION_SEC, arduino_log_path))
        thermal_thread = threading.Thread(target=send_delta_thermal)
        daq_thread = threading.Thread(target=Run_DAQ, args=("Dev1/ao0", vib_signal))
        accel_thread = threading.Thread(target=record_accelerometer_data, args=(accel_log_path,))

        # 동시 실행
        log_thread.start()
        thermal_thread.start()
        time.sleep(1)
        daq_thread.start()
        accel_thread.start()

        # 완료 대기
        thermal_thread.join()
        daq_thread.join()
        accel_thread.join()
        log_thread.join()

        print(f"[Log] Saved to: {arduino_log_path}")

    except Exception as e:
        print("[ERROR]", e)
    finally:
        if ser and ser.is_open:
            ser.close()
            print("[Serial] Closed")
