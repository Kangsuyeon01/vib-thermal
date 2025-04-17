from flask import Flask, render_template, request, jsonify, redirect, Response, session
import mimetypes
import json, os
import numpy as np
import scipy.io.wavfile
from datetime import datetime
import time
import shutil
import threading
import queue
from user_info import save_user_info
from play_signal.play_vib_ther_signal import run_stim_from_json  # 내부에 timestamp 처리 있음
import csv

mimetypes.add_type('application/javascript', '.mjs')

app = Flask(__name__)
app.secret_key = "1234"
last_unix_time = 0
event_queue = queue.Queue()

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
        session["trial"] = trial_number
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
    data = request.get_json()
    user_id = session.get("user_id")
    last_unix_time = int(time.time())
    data["timestamp"] = last_unix_time
    data["user_id"] = user_id

    def run_and_notify():
        event_queue.put("start")
        run_stim_from_json(data, event_queue)
        event_queue.put("end")

    threading.Thread(target=run_and_notify).start()
    return jsonify({"status": "started"})

@app.route("/sse_signal_status")
def sse_signal_status():
    def event_stream():
        while True:
            event = event_queue.get()
            yield f"data: {json.dumps({'status': event})}\n\n"
    return Response(event_stream(), mimetype='text/event-stream')

@app.route("/stop_signal", methods=["POST"])
def stop_signal():
    from play_signal.play_vib_ther_signal import stop_all_threads
    stop_all_threads()
    return jsonify({"status": "stopped"})

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

    dataset_path = "static/save_data/dataset.csv"
    trial = 1
    if os.path.exists(dataset_path):
        with open(dataset_path, "r", newline='') as f:
            reader = csv.DictReader(f)
            trial = sum(1 for row in reader if row["user_id"] == user_id) + 1

    user_dir = f"static/save_data/{user_id}/{trial}"
    os.makedirs(user_dir, exist_ok=True)

    # === Save JSON data ===
    json_path = f"{user_dir}/{trial}_collected_data.json"
    with open(json_path, "w") as f:
        json.dump(data, f)

    # === Move Arduino log ===
    arduino_src = f"static/save_data/{user_id}/logs/arduino_log_{last_unix_time}.csv"
    arduino_dst = f"{user_dir}/{trial}_arduino_log.csv"
    if os.path.exists(arduino_src):
        shutil.move(arduino_src, arduino_dst)
    else:
        print(f"[WARNING] Arduino log not found: {arduino_src}")

    # === Move Accel log ===
    accel_src = f"static/save_data/{user_id}/logs/accel_log_{last_unix_time}.csv"
    accel_dst = f"{user_dir}/{trial}_accel_log.csv"
    if os.path.exists(accel_src):
        shutil.move(accel_src, accel_dst)
    else:
        print(f"[WARNING] Accel log not found: {accel_src}")

    # === Delete old collected_data_<timestamp>.json from logs
    logs_dir = f"static/save_data/{user_id}/logs"
    if os.path.exists(logs_dir):
        for fname in os.listdir(logs_dir):
            if fname.startswith("collected_data_") and fname.endswith(".json"):
                try:
                    os.remove(os.path.join(logs_dir, fname))
                    print(f"[CLEANUP] Removed old log JSON: {fname}")
                except Exception as e:
                    print(f"[CLEANUP ERROR] Could not remove {fname}: {e}")

    # === Write to dataset.csv ===
    with open(dataset_path, "a", newline='') as f:
        fieldnames = ["user_id", "trial", "json_path", "arduino_path", "accel_path"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if f.tell() == 0:
            writer.writeheader()
        writer.writerow({
            "user_id": user_id,
            "trial": trial,
            "json_path": json_path,
            "arduino_path": arduino_dst,
            "accel_path": accel_dst
        })

    return jsonify({"status": "success", "message": "Data saved successfully"})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True)
