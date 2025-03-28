from flask import Flask, render_template, request, jsonify
import mimetypes
import json, os
import numpy as np
import scipy.io.wavfile
from datetime import datetime
mimetypes.add_type('application/javascript', '.mjs')

app = Flask(__name__)

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

@app.route("/play_signals", methods=["POST"])
def play_signals():
    # Receive JSON data from frontend
    data = request.get_json()
    vib_signal = np.array(data["vib_signal"], dtype=np.float32)
    sample_rate = data["sample_rate"]
    # timestamp file name
    filename = f"vib_signal_{datetime.now().strftime('%Y%m%d%H%M%S%f')}.wav"
    # filename = f"vib_signal_tmp.wav"
    filepath = os.path.join("static","save_data",filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    # Save the vibration signal as a WAV file
    scipy.io.wavfile.write(filepath, sample_rate, vib_signal)

    # Return the file path to the client for playback
    return jsonify({
        "status": "success",
        "wav_url": f"/{filepath}"
    })


# save signal, body site and user rating
@app.route("/save_result", methods=["POST"])
def save_result():
    data = request.get_json()

    # 🔹 1. Validate received data
    required_keys = ["vib_signal","vib_amp","vib_freq", "thermal_signal", "sample_rate", "body_sites", "ratings"]
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
    with open("static/src/collected_data.json", "w") as f:
        json.dump(data, f)

    return jsonify({"status": "success", "message": "Data saved successfully"})


if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=True)