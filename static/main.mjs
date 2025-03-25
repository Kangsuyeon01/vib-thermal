//@ts-check
import { DrawCanvasElement, TOTAL_DURATION_SEC } from './drawcanvas.mjs';
import { generate_signal, SAMPLE_RATE } from './generate-signal.mjs';
import { NpWaveFormCanvas } from './np-waveform-canvas.mjs';
import { notnull, wait_ms } from './util.mjs';

const TARGET_COUNT = 5;
let hasChanged = false; // Track if Play button has been modifyed
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
const reset_button = notnull(document.querySelector("#resetsignal"));
/** @type {HTMLButtonElement} */
const play_button = notnull(document.querySelector("#playsignal"));
/** @type {HTMLButtonElement} */
const submit_button = notnull(document.querySelector("#submit"));
/** @type {HTMLSpanElement} */
const submitstatus_span = notnull(document.querySelector("#submitstatus"));
/** @type {NpWaveFormCanvas} */
const vibrationwaveform_np = notnull(document.querySelector("#vibrationwaveform"));

// duration slider handler
duration_input.addEventListener("input", () => {
    const duration = parseFloat(duration_input.value);
    drawcanvases.forEach(canvas => {
        canvas.set_active_duration(duration);
    });

    // if signals are modifyed, user have to press play button at least one
    hasChanged = true;
    alert_signal_label.textContent = "⚠ Signal changed. Please press PLAY again to apply changes.";
    alert_signal_label.style.color = "red";
});

drawcanvases.forEach(canvas => canvas.addEventListener("input", () => {
    update_vibration_np();
    // if signals are modifyed, user have to press play button at least one
    hasChanged = true;
    alert_signal_label.textContent = "⚠ Signal changed. Please press PLAY again to apply changes.";
    alert_signal_label.style.color = "red";
}));

function update_vibration_np() {
    const vib_signal = generate_signal(true).vib_signal;
    const active_duration = parseFloat(duration_input.value);
    const perc_active = active_duration / TOTAL_DURATION_SEC; // todo: update vis based on this?
    vibrationwaveform_np.draw_waveform(vib_signal);
}
// drawcanvases.forEach(canvas => canvas.addEventListener("input", () => update_vibration_np()));
update_vibration_np();

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
    hasChanged = false;  // signal has been played, so reset change flag
    hasPlayed = true;
    const { vib_signal, thermal_signal, duration } = generate_signal();
    const MAX_DURATION = TOTAL_DURATION_SEC;

    const data = {
        vib_signal: Array.from(vib_signal),
        thermal_signal: Array.from(thermal_signal),
        sample_rate: SAMPLE_RATE
    }; // ~522kB

    const input_els = [...drawcanvases, play_button, duration_input];
    input_els.forEach(el => el.disabled = true);

    // animation start
    const canvas = vibrationwaveform_np;
    const canvas_width = canvas.width;
    const start_time = performance.now();
    const total_duration_ms = duration * 1000;

    function animate_playhead(current_time) {
        const elapsed = current_time - start_time;
        const progress = Math.min(elapsed / total_duration_ms, 1); // 0~1
        const x = progress * (canvas_width * (duration / MAX_DURATION)); 

        canvas.draw_playhead(x);

        if (progress < 1) {
            requestAnimationFrame(animate_playhead);
        }
    }

    requestAnimationFrame(animate_playhead);


    for (const el of  input_els) el.disabled = true;
    wait_ms(duration * 1000).then(() => { for (const el of input_els) el.disabled = false; }); // id rather wait for the duration of fetch, but flask doesn't support async by default?

    fetch("/play_signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        console.log("Server response:", data);
        if (data.wav_url) {
            const audio = new Audio(data.wav_url);
            audio.play().catch(err => console.error("Audio play failed:", err));
        }
    })
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
function on_reset_signal() {
    const duration = parseFloat(duration_input.value);

    drawcanvases.forEach(canvas => {
        canvas.set_active_duration(duration);
        canvas.reset_samples_to(0.5);
    });

    update_vibration_np();

    hasChanged = true;
    alert_signal_label.textContent = "Signal reset.";
    alert_signal_label.style.color = "red";
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
    if (!hasPlayed) {
        alert_signal_label.textContent = "⚠ Please press the PLAY button at least once before submitting.";
        animate_alert_label(alert_signal_label);
        isValid = false;
    } else {
        if (hasChanged) {
            alert_signal_label.textContent = "⚠ Signal was changed. Please press PLAY again before submitting.";
            animate_alert_label(alert_signal_label);
            isValid = false;
        } else {
            alert_signal_label.textContent = "";
        }
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

    if (!isValid) {
        hasPlayed = false;
        return;
    }

    submitstatus_span.textContent = "";

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
play_button.addEventListener("click", on_play_signal);
reset_button.addEventListener("click",on_reset_signal);
submit_button.addEventListener("click", on_submit);
