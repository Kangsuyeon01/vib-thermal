from flask import Flask, render_template, request, jsonify
import mimetypes
import json
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
    data = request.get_json()
    assert "vib_signal" in data
    assert "thermal_signal" in data
    assert "sample_rate" in data
    print(f"Received data: {{ vib_signal: len({len(data['vib_signal'])}), thermal_signal: len({len(data['thermal_signal'])}), sample_rate: {data['sample_rate']} }}")

    # TODO: Implement playback

    return jsonify({"status": "success", "received": data})


# save signal, body site and user rating
@app.route("/save_result", methods=["POST"])
def save_result():
    data = request.get_json()

    # 🔹 1. Validate received data
    required_keys = ["vib_signal", "thermal_signal", "sample_rate", "body_sites", "ratings"]
    if not all(key in data for key in required_keys):
        return jsonify({"status": "error", "message": "Missing required data"}), 400

    # 🔹 2. Log received data
    print("Received Data:")
    print(f"- Vib Signal: {len(data['vib_signal'])} samples")
    print(f"- Thermal Signal: {len(data['thermal_signal'])} samples")
    print(f"- Sample Rate: {data['sample_rate']} Hz")
    print(f"- Body Sites: {data['body_sites']} selected points")
    print(f"- Ratings: {data['ratings']}")

    # 🔹 3. Save data to JSON file
    with open("static/src/collected_data.json", "w") as f:
        json.dump(data, f)

    return jsonify({"status": "success", "message": "Data saved successfully"})


if __name__ == "__main__":
    app.run(debug=True)
