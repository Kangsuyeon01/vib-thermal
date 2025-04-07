from flask import Flask, render_template, request, jsonify, Response
import mimetypes
import json, os
import numpy as np
import scipy.io.wavfile
from datetime import datetime
import time
import shutil


# 시리얼 포트 설정 및 연결
from play_signal.play_vib_ther_signal import run_stim_from_json, reconnect_serial  # reconnect_serial 추가
ser = reconnect_serial(port="COM4")  # 포트 이름 확인 필요

if ser is None:
    raise RuntimeError("❌ Arduino 연결 실패. 포트를 확인하세요.")

mimetypes.add_type('application/javascript', '.mjs')

app = Flask(__name__)
user_num = 1
trial = 1
last_unix_time = 0
os.makedirs(f"static/save_data/{user_num}",exist_ok=True)
dir_path = f"static/save_data/{user_num}"
@app.route("/")
def home():
    return render_template("index.html", load_content=render_template("body_point_load.html"))

@app.route("/body_point_maker")
def body_site_point_maker():
    return render_template("body_point_maker.html")

@app.route("/body_point_load", methods=["GET", "POST"])
def body_site_point_loader():
    if request.method == "POST":
        data = request.get_json()
        print("Received data:", data)
        return jsonify({"status": "success", "received": data})
    return render_template("body_point_load.html")

# @app.route("/play_signals", methods=["POST"])
# def play_signals():
#     # Receive JSON data from frontend
#     data = request.get_json()
#     vib_signal = np.array(data["vib_signal"], dtype=np.float32)
#     sample_rate = data["sample_rate"]
#     # timestamp file name
#     filename = f"vib_signal_{datetime.now().strftime('%Y%m%d%H%M%S%f')}.wav"
#     # filename = f"vib_signal_tmp.wav"
#     filepath = os.path.join("static","save_data",filename)
#     os.makedirs(os.path.dirname(filepath), exist_ok=True)

#     # Save the vibration signal as a WAV file
#     scipy.io.wavfile.write(filepath, sample_rate, vib_signal)

#     # Return the file path to the client for playback
#     return jsonify({
#         "status": "success",
#         "wav_url": f"/{filepath}"
#     })



@app.route("/play_signals", methods=["POST"])
def play_signals():
    global last_unix_time
    data = request.get_json()
    print("[Flask] Received signal for play")
    timestamp = str(int(time.time()))
    last_unix_time = timestamp

    def generate_response():
        yield 'data: {"status": "started"}\n\n'
        run_stim_from_json(data, dir_path, timestamp, ser)  # ✅ ser 추가됨
        yield 'data: {"status": "completed"}\n\n'

    return Response(generate_response(), mimetype='text/event-stream')

@app.route("/stop_signal", methods=["POST"])
def stop_signal():
    global ser
    if ser and ser.is_open:
        ser.write(b"STOP\n")
        ser.flush()
        print("[Flask] STOP command sent to Arduino.")
        return jsonify({"status": "stopped"})
    else:
        return jsonify({"status": "error", "message": "Serial not connected"})


# save signal, body site and user rating
@app.route("/save_result", methods=["POST"])
def save_result():
    global trial
    data = request.get_json()

    # 🔹 1. Validate received data
    required_keys = ["vib_signal","vib_amp","vib_freq", "thermal_signal", "sample_rate", "duration","body_sites", "ratings"]
    if not all(key in data for key in required_keys):
        return jsonify({"status": "error", "message": "Missing required data"}), 400

    # 🔹 2. Log received data
    print("Received Data:")
    print(f"- Vib Signal: {len(data['vib_signal'])} samples")
    print(f"- Vib amp: {len(data['vib_amp'])} samples")
    print(f"- Vib freq: {len(data['vib_freq'])} samples")
    print(f"- Thermal Signal: {len(data['thermal_signal'])} samples")
    print(f"- Sample Rate: {data['sample_rate']} Hz")
    print(f"- Body Sites: {data['body_sites']} selected points")
    print(f"- Ratings: {data['ratings']}")

    # 🔹 3. Save data to JSON file
    with open(f"static/save_data/{user_num}/{trial}_collected_data.json", "w") as f:
        json.dump(data, f)
        # csv last_unix_time 에 있는거 저장하기
    csv_path = os.path.join(f"static/save_data/{user_num}/logs", f"arduino_log_{last_unix_time}.csv")
    dst_path = os.path.join(f"static/save_data/{user_num}/", f"{trial}_arduino_log.csv")
    shutil.move(csv_path, dst_path)
    trial += 1
    return jsonify({"status": "success", "message": "Data saved successfully"})


if __name__ == "__main__":
    app.run(host='0.0.0.0',port=8080, debug=True)