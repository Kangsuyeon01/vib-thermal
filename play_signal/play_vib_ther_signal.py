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
from play_signal.generate_signal import generate_signal  # 진동 생성 함수 import

def run_stim_from_json(data):
    SAMPLE_RATE = 10000
    THERMAL_RATE = 100
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
                ser = serial.Serial(port, baudrate, timeout=0.01)
                print(f"[Serial] Connected on attempt {attempt + 1}")
                return ser
            except serial.SerialException:
                print(f"[Serial] Retry {attempt + 1}/{max_retries}... waiting {retry_delay}s")
                time.sleep(retry_delay)
        print("[ERROR] Could not reconnect to Arduino.")
        return None

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

    ser = reconnect_serial()
    if ser is None:
        print("[WARNING] Arduino not connected. Skipping serial streaming.")
        return

    try:
        vib_amp = np.array(data['vib_amp'])  # e.g. [0.8, 0.5, 0.2]
        vib_freq = np.array(data['vib_freq'])  # e.g. [0.3, 0.7, 0.6]
        logscale = data.get('logscale', False)

        vib_signal, duration = generate_signal(vib_amp, vib_freq, TOTAL_DURATION_SEC, logscale=logscale)
        vib_signal_result = vib_signal.copy()

        thermal_signal = np.array(data.get('thermal_signal', [0.0] * len(vib_signal)))
        target_len = int(duration * THERMAL_RATE)
        thermal_resampled = resample(thermal_signal, target_len)
        thermal_resampled = np.append(thermal_resampled, 0.0)

        delta_list = [float(f"{val:.2f}") for val in thermal_resampled]

        def send_delta_thermal():
            interval = 1.0 / THERMAL_RATE
            for i, delta in enumerate(delta_list):
                msg = f"{delta:.2f}\n"
                ser.write(msg.encode())
                print(f"[Thermal {i:04}] Sent ΔT: {delta:.2f}")
                time.sleep(interval)

        log_dir = os.path.join(save_dir, "logs")
        os.makedirs(log_dir, exist_ok=True)
        csv_path = os.path.join(log_dir, f"arduino_log_{timestamp}.csv")

        with open(csv_path, 'w', newline='') as csv_file:
            csv_writer = csv.writer(csv_file)
            csv_writer.writerow(['Time(ms)', 'Temp', 'Setpoint', 'Delta'])

            out_chan = Init_DAQ()

            def read_arduino_logs():
                while True:
                    try:
                        if ser.in_waiting:
                            line = ser.readline().decode('utf-8', errors='ignore').strip()
                            if line.endswith(',0,0;') and ',' in line:
                                fields = line.replace(';', '').split(',')
                                if len(fields) >= 4:
                                    csv_writer.writerow(fields[:4])
                    except Exception:
                        continue

            log_thread = threading.Thread(target=read_arduino_logs)
            daq_thread = threading.Thread(target=Run_DAQ, args=(out_chan, vib_signal_result))
            thermal_thread = threading.Thread(target=send_delta_thermal)

            log_thread.start()
            thermal_thread.start()
            daq_thread.start()

            daq_thread.join()
            thermal_thread.join()

            print("[Arduino] Waiting briefly for Arduino to finish...")
            time.sleep(TOTAL_DURATION_SEC + 1)
            print("[Arduino] Done. Returning to baseline.")

    except Exception as e:
        print("[ERROR]", e)
