from flask import Flask, render_template, request, jsonify, redirect, Response, session
import mimetypes
import json, os
import numpy as np
import scipy.io.wavfile
from datetime import datetime
import time
import shutil
from user_info import save_user_info

# 시리얼 포트 설정 및 연결 (필요 시 사용)
# from play_signal.play_vib_ther_signal import run_stim_from_json, reconnect_serial
# ser = reconnect_serial(port="COM4")

mimetypes.add_type('application/javascript', '.mjs')

app = Flask(__name__)
app.secret_key = "1234"
last_unix_time = 0

@app.route("/", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        name = request.form["name"]
        experiment_id = request.form["experiment_id"]
        gender = request.form["gender"]

        success, trial_number = save_user_info(name, experiment_id, gender)
        if not success:
            return "Experiment ID exists with a different name. Please check your input."

        session["user_id"] = experiment_id
        session["trial"] = trial_number  # trial도 세션에 저장
        return redirect("/main")
    return render_template("login.html")

@app.route("/main")
def main():
    if "user_id" not in session:
        return redirect("/")

    trial = session.get("trial", 1)
    return render_template("index.html", load_content=render_template("body_point_load.html"), trial=trial)

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

@app.route("/play_signals", methods=["POST"])
def play_signals():
    global last_unix_time
    if "user_id" not in session:
        return jsonify({"status": "error", "message": "Not logged in"}), 403

    data = request.get_json()
    vib_signal = np.array(data["vib_signal"], dtype=np.float32)
    sample_rate = data["sample_rate"]
    last_unix_time = int(time.time())  # Update timestamp

    filename = f"vib_signal_{datetime.now().strftime('%Y%m%d%H%M%S%f')}.wav"
    filepath = os.path.join("static", "save_data", session["user_id"], filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    scipy.io.wavfile.write(filepath, sample_rate, vib_signal)

    return jsonify({
        "status": "success",
        "wav_url": f"/{filepath}"
    })

@app.route("/stop_signal", methods=["POST"])
def stop_signal():
    global ser
    try:
        if ser and ser.is_open:
            ser.write(b"STOP\n")
            ser.flush()
            print("[Flask] STOP command sent to Arduino.")
            return jsonify({"status": "stopped"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    return jsonify({"status": "error", "message": "Serial not connected"})
# @app.route("/play_signals", methods=["POST"])
# def play_signals():
#     global last_unix_time
#     data = request.get_json()
#     print("[Flask] Received signal for play")
#     timestamp = str(int(time.time()))
#     last_unix_time = timestamp

#     def generate_response():
#         yield 'data: {"status": "started"}\n\n'
#         run_stim_from_json(data, dir_path, timestamp, ser)  
#         yield 'data: {"status": "completed"}\n\n'

#     return Response(generate_response(), mimetype='text/event-stream')

@app.route("/save_result", methods=["POST"])
def save_result():
    global last_unix_time
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"status": "error", "message": "User not logged in"}), 403

    data = request.get_json()
    required_keys = ["vib_signal", "vib_amp", "vib_freq", "thermal_signal", "sample_rate", "duration", "body_sites", "ratings"]
    if not all(key in data for key in required_keys):
        return jsonify({"status": "error", "message": "Missing required data"}), 400

    # 🔹 1. trial 번호 계산: dataset.csv에서 해당 user_id가 몇 번 저장됐는지 확인
    dataset_path = "static/save_data/dataset.csv"
    trial = 1
    if os.path.exists(dataset_path):
        with open(dataset_path, "r", newline='') as f:
            reader = csv.DictReader(f)
            trial = sum(1 for row in reader if row["user_id"] == user_id) + 1

    # 🔹 2. 경로 설정
    user_dir = f"static/save_data/{user_id}"
    os.makedirs(user_dir, exist_ok=True)
    json_path = f"{user_dir}/{trial}_collected_data.json"
    csv_src_path = f"{user_dir}/logs/arduino_log_{last_unix_time}.csv"
    csv_dst_path = f"{user_dir}/{trial}_arduino_log.csv"

    # 🔹 3. JSON 저장
    with open(json_path, "w") as f:
        json.dump(data, f)

    # 🔹 4. CSV 로그 이동
    if os.path.exists(csv_src_path):
        shutil.move(csv_src_path, csv_dst_path)
    else:
        print(f"[WARNING] Arduino log not found at {csv_src_path}")

    # 🔹 5. dataset.csv에 기록
    with open(dataset_path, "a", newline='') as f:
        writer = csv.DictWriter(f, fieldnames=["user_id", "trial", "json_path", "csv_path"])
        if f.tell() == 0:
            writer.writeheader()
        writer.writerow({
            "user_id": user_id,
            "trial": trial,
            "json_path": json_path,
            "csv_path": csv_dst_path
        })

    return jsonify({"status": "success", "message": "Data saved successfully"})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True)
