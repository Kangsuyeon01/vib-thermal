//@ts-check
import { DrawCanvasElement } from './drawcanvas.mjs';
import { notnull } from './util.mjs';

const SAMPLE_RATE = 8000;

/** @type {DrawCanvasElement} */
const vib_amp_env_dcanvas = notnull(document.querySelector("#drawvibaenv"));
/** @type {DrawCanvasElement} */
const vib_freq_env_dcanvas = notnull(document.querySelector("#drawvibfenv"));
/** @type {DrawCanvasElement} */
const thr_amp_env_dcanvas = notnull(document.querySelector("#drawthraenv"));
/** @type {HTMLInputElement} */
const duration_input = notnull(document.querySelector("#signalduration"));
/** @type {HTMLButtonElement} */
const play_button = notnull(document.querySelector("#playsignal"));

function on_play_signal() {
    const vib_amp = vib_amp_env_dcanvas.samples;
    const vib_freq = vib_freq_env_dcanvas.samples;
    const thr_amp = thr_amp_env_dcanvas.samples;

    const duration = parseFloat(duration_input.value);
    const num_output_samples = Math.floor(duration * SAMPLE_RATE);
    const vib_signal = new Float32Array(num_output_samples);

    let phase_acc = 0;
    for (let i = 0; i < num_output_samples; i++) {
        const perc = i / num_output_samples;
        const freq_i = Math.floor(perc * vib_freq.length);
        const amp_i = Math.floor(perc * vib_amp.length);

        const phase_delta = 2 * Math.PI * vib_freq[freq_i] / SAMPLE_RATE;
        phase_acc += phase_delta;

        const sample = vib_amp[amp_i] * Math.sin(phase_acc);
        vib_signal[i] = sample;
    }

    const thermal_signal = new Float32Array(num_output_samples);
    for (let i = 0; i < num_output_samples; i++) {
        const perc = i / num_output_samples;
        const amp_i = Math.floor(perc * thr_amp.length);
        thermal_signal[i] = thr_amp[amp_i];
    }

    const data = {
        vib_signal: Array.from(vib_signal),
        thermal_signal: Array.from(thermal_signal),
        sample_rate: SAMPLE_RATE
    }; // ~522kB

    fetch("/play_signals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => console.log("Sent data:", data))
        .catch(error => console.error("Error sending data:", error));

}

play_button.addEventListener("click", on_play_signal);