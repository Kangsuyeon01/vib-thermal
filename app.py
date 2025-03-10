from flask import Flask, render_template, request, jsonify
import mimetypes
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
    

if __name__ == "__main__":
    app.run(debug=True)
