//@ts-check
import { DrawCanvasElement, TOTAL_DURATION_SEC } from "./drawcanvas.mjs";
import { notnull } from "./util.mjs";

export const SAMPLE_RATE = 8000;
export const MIN_FREQ = 50;
export const MAX_FREQ = 500;

/** @type {DrawCanvasElement} */
const vib_amp_env_dcanvas = notnull(document.querySelector("#drawvibaenv"));
/** @type {DrawCanvasElement} */
const vib_freq_env_dcanvas = notnull(document.querySelector("#drawvibfenv"));
/** @type {DrawCanvasElement} */
const thr_amp_env_dcanvas = notnull(document.querySelector("#drawthraenv"));
/** @type {HTMLInputElement} */
const duration_input = notnull(document.querySelector("#signalduration"));

/**
 * Maps a given frequency value to the 50-500Hz range.
 * @param {number} value - The original frequency value.
 * @param {number} minValue - The minimum value in the dataset.
 * @param {number} maxValue - The maximum value in the dataset.
 * @returns {number} - The mapped frequency in the range [50, 500] Hz.
 */
function map_frequency(value, minValue, maxValue) {
    return MIN_FREQ + (MAX_FREQ - MIN_FREQ) * ((value - minValue) / (maxValue - minValue));
}

function linterp_index(arr, perc) {
    const index = perc * (arr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    const value = arr[lower] * (1 - weight) + arr[upper] * weight;
    return value;
}


export function generate_signal() {
    const vib_amp = vib_amp_env_dcanvas.samples;
    const vib_freq = vib_freq_env_dcanvas.samples;
    const thr_amp = thr_amp_env_dcanvas.samples;

    const total_sample_duration = TOTAL_DURATION_SEC;
    const active_duration = parseFloat(duration_input.value);
    const active_perc = active_duration / total_sample_duration;
    const num_output_samples = Math.floor(active_duration * SAMPLE_RATE);
    const vib_signal = new Float32Array(num_output_samples);

    let phase_acc = 0;
    for (let i = 0; i < num_output_samples; i++) {
        const perc = i / num_output_samples;
        const lperc = perc * active_perc;
        
        const s_freq = linterp_index(vib_freq, lperc);
        const s_amp = linterp_index(vib_amp, lperc);

        const current_freq = map_frequency(s_freq, 0, 1);
        const phase_delta = 2 * Math.PI * current_freq / SAMPLE_RATE;
        
        phase_acc += phase_delta;
        vib_signal[i] = s_amp * Math.sin(phase_acc);
    }
    
    const thermal_signal = new Float32Array(num_output_samples);
    for (let i = 0; i < num_output_samples; i++) {
        const perc = i / num_output_samples;
        const lperc = perc * active_perc;
        
        const s_amp = linterp_index(thr_amp, lperc);

        thermal_signal[i] = s_amp;
    }

    return { vib_signal, thermal_signal, duration: active_duration };
}
