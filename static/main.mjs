//@ts-check
import { DrawCanvasElement } from './drawcanvas.mjs';
import { notnull } from './util.mjs';

const SAMPLE_RATE = 8000;
const TARGET_COUNT = 5;
let hasPlayed = false; // Track if Play button has been pressed
// trial label
/** @type {HTMLSpanElement} */
const trial_current_label = notnull(document.querySelector("#trial_current_label"));
/** @type {HTMLSpanElement} */
const trial_end_label = notnull(document.querySelector("#trial_end_label"));
trial_end_label.textContent = TARGET_COUNT.toString(); 

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
// /** @type {HTMLButtonElement} */
// const confirm_button = notnull(document.querySelector("#confirmsignal"));
// /** @type {HTMLButtonElement} */
// const modify_button = notnull(document.querySelector("#modifysignal"));
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
sliders.forEach(slider => {
    slider.addEventListener("input", () => {
        slider.dataset.touched = "true";  // Mark as interacted
    });
});


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
// Function to get the selected referral value
function getSelectedReferral() {
    const selectedReferral = document.querySelector('input[name="referral"]:checked');
    return selectedReferral ? selectedReferral: null;
}
async function on_submit(event) {
    event.preventDefault();  

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

    // Prepare and send data
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
        vib_signal[i] = vib_amp[amp_i] * Math.sin(phase_acc);
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


/** Function to enable or disable DrawCanvas */
function toggleDrawCanvas(enabled) {
    if (enabled) {
        vib_amp_env_dcanvas.removeAttribute("disabled");
        vib_freq_env_dcanvas.removeAttribute("disabled");
        thr_amp_env_dcanvas.removeAttribute("disabled");
    } else {
        vib_amp_env_dcanvas.setAttribute("disabled", "true");
        vib_freq_env_dcanvas.setAttribute("disabled", "true");
        thr_amp_env_dcanvas.setAttribute("disabled", "true");
    }
}

/** Function to update button states */
// function updateButtonStates({ confirm = false, modify = false, playRequired = false }) {
//     confirm_button.disabled = !confirm;
//     modify_button.style.display = modify ? "inline-block" : "none"; // Show/hide Modify button
//     if (playRequired) hasPlayed = false; // Reset play requirement
// }

// Play button functionality

// // Confirm button functionality
// confirm_button.addEventListener("click", () => {
//     if (!hasPlayed) {
//         alert_signal_label.textContent = "⚠ Please press the Play button at least once before confirming.";
//         return;
//     }
//     alert_signal_label.textContent = ""; // Clear warning message

//     // Disable Confirm button, show Modify button, and lock DrawCanvas
//     updateButtonStates({ confirm: false, modify: true });
//     toggleDrawCanvas(false);
// });

// // Modify button functionality
// modify_button.addEventListener("click", () => {
//     // Re-enable DrawCanvas editing
//     toggleDrawCanvas(true);

//     // Reset Play requirement and hide Modify button
//     // TODO: Disable editing of the draw UI
//     updateButtonStates({ confirm: true, playRequired: true });
// });


submit_button.addEventListener("click", on_submit);
play_button.addEventListener("click", on_play_signal);