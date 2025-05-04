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
from functools import wraps
from user_info import save_user_info, update_total_elapsed_time, get_total_elapsed_time, format_seconds
from play_signal.play_vib_ther_signal import run_stim_from_json  # Contains internal timestamp logic
import csv

mimetypes.add_type('application/javascript', '.mjs')

app = Flask(__name__)
app.secret_key = "1234"
last_unix_time = 0
event_queue = queue.Queue()

# === Login required decorator ===
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            return redirect("/")
        return f(*args, **kwargs)
    return decorated_function

@app.route("/", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        name = request.form["name"]
        experiment_id = request.form["experiment_id"]
        gender = request.form["gender"]
        gender_num = 0 if gender == 'female' else 1 if gender == 'male' else -1

        success, trial_number, previous_gender = save_user_info(name, experiment_id, gender)

        if not success:
            return render_template(
                "login.html",
                warning_msg="Experiment ID exists with a different name. Please check your input."
            )

        if previous_gender and previous_gender != gender:
            return render_template(
                "login.html",
                warning_msg=f"Previously registered gender is '{previous_gender}'. Please check again."
            )

        session["user_id"] = experiment_id
        session["name"] = name
        session["trial"] = trial_number
        session["gender"] = gender_num
        session["start_time"] = time.time()  # Record session start time
        session["trial_start"] = time.time()  # Record trial start time

        return redirect("/main")

    return render_template("login.html")

@app.route("/main")
@login_required
def main():
    trial = session.get("trial", 1)
    user_id = session.get("user_id", "")
    name = session.get("name", "")
    gender = session.get("gender", "")
    start_time = session.get("start_time", time.time())

    # Calculate times
    session_elapsed_sec = int(time.time() - start_time)
    total_elapsed_sec = get_total_elapsed_time(user_id)

    return render_template(
        "index.html",
        load_content=render_template("body_point_load.html"),
        trial=trial,
        name=name,
        user_id=user_id,
        gender="female" if gender == 0 else "male",
        session_elapsed_str=format_seconds(session_elapsed_sec),
        total_elapsed_str=format_seconds(total_elapsed_sec)
    )

@app.route("/body_point_maker")
@login_required
def body_site_point_maker():
    return render_template("body_point_maker.html")

@app.route("/body_point_load", methods=["GET", "POST"])
@login_required
def body_site_point_loader():
    if request.method == "POST":
        data = request.get_json()
        print("Received data:", data)
        return jsonify({"status": "success", "received": data})
    return render_template("body_point_load.html")

@app.route("/play_signals", methods=["POST"])
@login_required
def play_signals():
    global last_unix_time
    data = request.get_json()
    user_id = session.get("user_id")
    last_unix_time = int(time.time())
    data["timestamp"] = last_unix_time
    data["user_id"] = user_id

    def run_and_notify():
        run_stim_from_json(data, event_queue)
        event_queue.put("end")

    threading.Thread(target=run_and_notify).start()
    return jsonify({"status": "started"})

@app.route("/sse_signal_status")
@login_required
def sse_signal_status():
    def event_stream():
        while True:
            try:
                event = event_queue.get(timeout=0.5)
                yield f"data: {json.dumps({'status': event})}\n\n"
            except queue.Empty:
                yield ": keep-alive\n\n"
    return Response(event_stream(), mimetype='text/event-stream')

@app.route("/stop_signal", methods=["POST"])
@login_required
def stop_signal():
    from play_signal.play_vib_ther_signal import stop_all_threads
    stop_all_threads()
    return jsonify({"status": "stopped"})

@app.route("/save_result", methods=["POST"])
@login_required
def save_result():
    global last_unix_time
    user_id = session.get("user_id")
    gender = session.get("gender")
    trial_start = session.get("trial_start")

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

    # === Move Accelerometer log ===
    accel_src = f"static/save_data/{user_id}/logs/accel_log_{last_unix_time}.csv"
    accel_dst = f"{user_dir}/{trial}_accel_log.csv"
    trial_elapsed = round(time.time() - trial_start, 2) if trial_start else 0
    if os.path.exists(accel_src):
        shutil.move(accel_src, accel_dst)
    else:
        print(f"[WARNING] Accel log not found: {accel_src}")

    # === Clean up old temporary JSON logs ===
    logs_dir = f"static/save_data/{user_id}/logs"
    if os.path.exists(logs_dir):
        for fname in os.listdir(logs_dir):
            if fname.startswith("collected_data_") and fname.endswith(".json"):
                try:
                    os.remove(os.path.join(logs_dir, fname))
                    print(f"[CLEANUP] Removed old log JSON: {fname}")
                except Exception as e:
                    print(f"[CLEANUP ERROR] Could not remove {fname}: {e}")

    # === Append to dataset.csv ===
    with open(dataset_path, "a", newline='') as f:
        fieldnames = ["user_id", "gender", "trial", "json_path", "arduino_path", "accel_path", "trial_elapsed_sec"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if f.tell() == 0:
            writer.writeheader()
        writer.writerow({
            "user_id": user_id,
            "gender": gender,
            "trial": trial,
            "json_path": json_path,
            "arduino_path": arduino_dst,
            "accel_path": accel_dst,
            "trial_elapsed_sec": trial_elapsed
        })

    update_total_elapsed_time(user_id, trial_elapsed)
    session["trial"] = trial + 1
    session["trial_start"] = time.time()

    return jsonify({"status": "success", "message": "Data saved successfully"})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True)