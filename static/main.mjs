//@ts-check
import { DrawCanvasElement } from './drawcanvas.mjs';
import { generate_signal, SAMPLE_RATE } from './generate-signal.mjs';
import { NpWaveFormCanvas } from './np-waveform-canvas.mjs';
import { notnull, wait_ms } from './util.mjs';

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
const drawcanvases = [vib_amp_env_dcanvas, vib_freq_env_dcanvas, thr_amp_env_dcanvas];
/** @type {HTMLInputElement} */
const duration_input = notnull(document.querySelector("#signalduration"));
/** @type {HTMLButtonElement} */
const play_button = notnull(document.querySelector("#playsignal"));
/** @type {HTMLButtonElement} */
const submit_button = notnull(document.querySelector("#submit"));
/** @type {HTMLSpanElement} */
const submitstatus_span = notnull(document.querySelector("#submitstatus"));
/** @type {NpWaveFormCanvas} */
const vibrationwaveform_np = notnull(document.querySelector("#vibrationwaveform"));

duration_input.addEventListener("input", () => {
    const duration = parseFloat(duration_input.value);
    drawcanvases.forEach(canvas => {
        canvas.set_active_duration(duration);
    });
});
drawcanvases.forEach(canvas => {
    canvas.addEventListener("input", () => {
        vibrationwaveform_np.draw_waveform(generate_signal().vib_signal);
    });
});
vibrationwaveform_np.draw_waveform(generate_signal().vib_signal);

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
    slider.addEventListener("pointerdown", () => {
        slider.dataset.touched = "true";  // Mark as interacted
    });
});

/**
 * Generates a waveform signal based on user-defined amplitude and frequency settings.
 * Sends the generated signal to the server for playback.
 */
function on_play_signal() {
    const { vib_signal, thermal_signal, duration } = generate_signal();
    
    const data = {
        vib_signal: Array.from(vib_signal),
        thermal_signal: Array.from(thermal_signal),
        sample_rate: SAMPLE_RATE
    }; // ~522kB

    const input_els = [...drawcanvases, play_button, duration_input];

    for (const el of  input_els) el.disabled = true;
    wait_ms(duration * 1000).then(() => { for (const el of input_els) el.disabled = false; }); // id rather wait for the duration of fetch, but flask doesn't support async by default?

    fetch("/play_signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => console.log("Sent data:", data))
    .catch(error => console.error("Error sending data:", error));    
}
/**
 * 
 * @returns {HTMLInputElement | null} - The selected referral radio button, or null if none selected.
 */
function getSelectedReferral() {
    /** @type {HTMLInputElement | null} */
    const selectedReferral = document.querySelector('input[name="referral"]:checked');
    return selectedReferral;
}
async function on_submit(event) {
    event.preventDefault();  

    // Validate that all sliders have been used
    const allSlidersUsed = sliders.every(slider => slider.dataset.touched);
    const referralValue = getSelectedReferral();
    const bodySiteValid = vibrationInfo.textContent !== "None" && thermalInfo.textContent !== "None";


    // Display warning messages and prevent submission if invalid
    let isValid = true;
    
    function animate_alert_label(label) {
        label.animate([ { opacity: 0 }, { opacity: 1 } ], {
            duration: 500,
            iterations: 1
        });
    }

    if (!allSlidersUsed) {
        alert_slider_label.textContent = "⚠ Please adjust all sliders at least once.";
        animate_alert_label(alert_slider_label);
        isValid = false;
    } else {
        alert_slider_label.textContent = "";
    }
    
    if (!referralValue) {
        alert_referral_label.textContent = "⚠ Please select a referral option.";
        animate_alert_label(alert_referral_label);
        isValid = false;
    } else {
        alert_referral_label.textContent = "";
    }
    
    if (!bodySiteValid) {
        alert_body_label.textContent = "⚠ Please select a body site.";
        animate_alert_label(alert_body_label);
        isValid = false;
    } else {
        alert_body_label.textContent = "";
    }

    if (isValid) {
        submitstatus_span.textContent = "";
    } else {
        // submitstatus_span.textContent = "⚠ See above alerts.";
        // animate_alert_label(submitstatus_span);
        return;
    }


    const { vib_signal, thermal_signal } = generate_signal();

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
            referral: referralValue?.value
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
