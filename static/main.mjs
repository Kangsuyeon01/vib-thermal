//@ts-check
import { DrawCanvasElement } from './drawcanvas.mjs';
import { notnull } from './util.mjs';

// Constants for signal processing
const SAMPLE_RATE = 8000;
const TARGET_COUNT = 5;
let hasPlayed = false; // Track if Play button has been pressed

// trial label
/** @type {HTMLSpanElement} */
const trial_current_label = notnull(document.querySelector("#trial_current_label"));
/** @type {HTMLSpanElement} */
const trial_end_label = notnull(document.querySelector("#trial_end_label"));
trial_end_label.textContent = TARGET_COUNT.toString();  // Set total trial count

// alert label
/** @type {HTMLSpanElement} */
const alert_body_label = notnull(document.querySelector("#alert_body_label"));
/** @type {HTMLSpanElement} */
const alert_slider_label = notnull(document.querySelector("#alert_slider_label"));
/** @type {HTMLSpanElement} */
const alert_referral_label = notnull(document.querySelector("#alert_referral_label"));
/** @type {HTMLSpanElement} */
const alert_signal_label = notnull(document.querySelector("#alert_signal_label"));

// draw signal
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
/** @type {HTMLButtonElement} */
const submit_button = notnull(document.querySelector("#submit"));


// body site info
/** @type {HTMLSpanElement} */
const vibrationInfo = notnull(document.querySelector("#vibrationInfo"));

/** @type {HTMLSpanElement} */
const thermalInfo = notnull(document.querySelector("#thermalInfo"));


// Slider elements
/** @type {HTMLInputElement} */
const roughness_slider = notnull(document.querySelector("#roughness"));
/** @type {HTMLInputElement} */
const warmness_slider = notnull(document.querySelector("#warmness"));
/** @type {HTMLInputElement} */
const valence_slider = notnull(document.querySelector("#valence"));
/** @type {HTMLInputElement} */
const arousal_slider = notnull(document.querySelector("#arousal"));
/** @type {NodeListOf<HTMLInputElement>} */
const referral_radio_buttons = document.querySelectorAll('input[name="referral"]');
/** Mark sliders as "touched" when adjusted */
const sliders = [roughness_slider, warmness_slider, valence_slider, arousal_slider];

// Mark sliders as "touched" when adjusted
sliders.forEach(slider => {
    slider.addEventListener("input", () => {
        slider.dataset.touched = "true";  // Mark as interacted
    });
});

// Define frequency range
const MIN_FREQ = 50;
const MAX_FREQ = 500;

/**
 * Maps a given frequency value to the 50-500Hz range.
 * @param {number} value - The original frequency value.
 * @param {number} minValue - The minimum value in the dataset.
 * @param {number} maxValue - The maximum value in the dataset.
 * @returns {number} - The mapped frequency in the range [50, 500] Hz.
 */
function mapFrequency(value, minValue, maxValue) {
    return MIN_FREQ + (MAX_FREQ - MIN_FREQ) * ((value - minValue) / (maxValue - minValue));
}

/**
 * Generates a waveform signal based on user-defined amplitude and frequency settings.
 * Sends the generated signal to the server for playback.
 */
function on_play_signal() {
    const vib_amp = vib_amp_env_dcanvas.samples;
    const vib_freq = vib_freq_env_dcanvas.samples;
    const thr_amp = thr_amp_env_dcanvas.samples;

    const duration = parseFloat(duration_input.value);
    const num_output_samples = Math.floor(duration * SAMPLE_RATE);
    const vib_signal = new Float32Array(num_output_samples);

    // Find min/max values in frequency data for proper normalization
    const minFreqValue = Math.min(...vib_freq);
    const maxFreqValue = Math.max(...vib_freq);

    let time = 0;
    let phase_acc = 0;
    for (let i = 0; i < num_output_samples; i++) {
        const perc = i / num_output_samples;
        const freq_i = Math.floor(perc * vib_freq.length);
        const amp_i = Math.floor(perc * vib_amp.length);
        const current_freq = mapFrequency(vib_freq[freq_i], minFreqValue, maxFreqValue);
        const phase_delta = 2 * Math.PI * current_freq / SAMPLE_RATE;
        
        phase_acc += phase_delta;
        vib_signal[i] = vib_amp[amp_i] * Math.sin(phase_acc);
        time += 1 / SAMPLE_RATE;
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
// Function to get the selected referral value
function getSelectedReferral() {
    const selectedReferral = document.querySelector('input[name="referral"]:checked');
    return selectedReferral ? selectedReferral: null;
}
async function on_submit(event) {
    event.preventDefault();  

    // Validate that all sliders have been used
    let allSlidersUsed = sliders.every(slider => slider.dataset.touched);
    const referralValue = getSelectedReferral();
    const bodySiteValid = vibrationInfo.textContent !== "None" && thermalInfo.textContent !== "None";

    // Display warning messages and prevent submission if invalid
    let isValid = true;
    if (!allSlidersUsed) {
        alert_slider_label.textContent = "⚠ Please adjust all sliders at least once.";
        isValid = false;
    } else {
        alert_slider_label.textContent = "";
    }
    
    if (!referralValue) {
        alert_referral_label.textContent = "⚠ Please select a referral option.";
        isValid = false;
    } else {
        alert_referral_label.textContent = "";
    }
    
    if (!bodySiteValid) {
        alert_body_label.textContent = "⚠ Please select a body site.";
        isValid = false;
    } else {
        alert_body_label.textContent = "";
    }

    if (!isValid) {
        return;
    }


    // Prepare data for submission
    const vib_amp = vib_amp_env_dcanvas.samples;
    const vib_freq = vib_freq_env_dcanvas.samples;
    const thr_amp = thr_amp_env_dcanvas.samples;

    const duration = parseFloat(duration_input.value);
    const num_output_samples = Math.floor(duration * SAMPLE_RATE);
    const vib_signal = new Float32Array(num_output_samples);

    // Find min/max values in frequency data for proper normalization
    const minFreqValue = Math.min(...vib_freq);
    const maxFreqValue = Math.max(...vib_freq);

    let time = 0;
    let phase_acc = 0;
    for (let i = 0; i < num_output_samples; i++) {
        const perc = i / num_output_samples;
        const freq_i = Math.floor(perc * vib_freq.length);
        const amp_i = Math.floor(perc * vib_amp.length);
        const current_freq = mapFrequency(vib_freq[freq_i], minFreqValue, maxFreqValue);
        const phase_delta = 2 * Math.PI * current_freq / SAMPLE_RATE;

        phase_acc += phase_delta;
        vib_signal[i] = vib_amp[amp_i] * Math.sin(phase_acc);
        time += 1 / SAMPLE_RATE;
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
        sample_rate: SAMPLE_RATE,
        body_sites: { vibrationInfo: vibrationInfo.textContent, thermalInfo: thermalInfo.textContent },
        ratings: { 
            roughness: roughness_slider.value, 
            warmness: warmness_slider.value, 
            valence: valence_slider.value, 
            arousal: arousal_slider.value, 
            referral: referralValue.value
        }
    };

    fetch("/save_result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        alert("Submission successful!");
            

    sliders.forEach(slider => {
        slider.value = "50";  // default value
        delete slider.dataset.touched;  
    });


    referral_radio_buttons.forEach(radio => {
        radio.checked = false;
    });

    // update Trial count
    let trialCurrent = parseInt(trial_current_label.textContent || "0", 10) + 1;
    trial_current_label.textContent = trialCurrent.toString();
    trial_end_label.textContent = TARGET_COUNT.toString();
    
    if (trialCurrent >= TARGET_COUNT) {
        alert("All trials completed!");
        trial_current_label.textContent = "0";
        submit_button.disabled = true;
    }
})
.catch(error => {
    alert("Submission failed!");
});
}
submit_button.addEventListener("click", on_submit);
play_button.addEventListener("click", on_play_signal);
