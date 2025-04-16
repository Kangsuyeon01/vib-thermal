//@ts-check

/** @type {[number, number, number]} */
export const RISE_COEFFS = await fetch("/static/src/rise_coeffs.json").then(res => res.json());
/** @type {[number, number, number]} */
export const RETURN_COEFFS = await fetch("/static/src/return_coeffs.json").then(res => res.json());


/**
 * Evaluate a 2nd-degree polynomial f(Δ) = a + bΔ + cΔ²
 * @param {number[]} coeffs - Coefficients [a, b, c]
 * @param {number} delta - Δ value (can be negative, treated as magnitude)
 * @returns {number}
 */
function evaluatePolynomial(coeffs, delta) {
    return coeffs[0] + coeffs[1] * delta + coeffs[2] * delta * delta;
}

/**
 * Generate thermal waveform using delta + calculated rise/return time
 * @param {number} delta - Δ value (target temperature change)
 * @param {number[]} riseCoeffs - Polynomial coefficients for rise time
 * @param {number[]} returnCoeffs - Polynomial coefficients for return time
 * @param {number} duration - total duration in seconds
 * @param {number} sampleRate - samples per second (default: 10Hz)
 * @returns {number[]} - thermal waveform array
 */
export function generateThermalWaveform(delta, riseCoeffs, returnCoeffs, duration, sampleRate = 10) {
    if (delta === 0) return new Array(duration * sampleRate).fill(0);

    const riseTime = evaluatePolynomial(riseCoeffs, Math.abs(delta));
    const returnTime = evaluatePolynomial(returnCoeffs, Math.abs(delta));

    const totalSamples = Math.floor(duration * sampleRate);
    const riseSamples = Math.floor(riseTime * sampleRate);
    const returnSamples = Math.floor(returnTime * sampleRate);
    const holdSamples = Math.max(0, totalSamples - riseSamples - returnSamples);

    const signal = [];

    // Rise phase
    for (let i = 0; i < riseSamples; i++) {
        signal.push((i / riseSamples) * delta);
    }

    // Hold phase
    for (let i = 0; i < holdSamples; i++) {
        signal.push(delta);
    }

    // Return phase
    for (let i = 0; i < returnSamples; i++) {
        signal.push(delta * (1 - i / returnSamples));
    }

    // Padding if needed
    while (signal.length < totalSamples) {
        signal.push(0);
    }

    return signal;
}

/**
 * Apply slope constraint based on ΔT-specific rise/return time
 * @param {number[]} samples - Thermal waveform array
 * @param {number} delta - Target delta temperature
 * @param {number[]} rise_coeffs - Polynomial coefficients for rise time
 * @param {number[]} return_coeffs - Polynomial coefficients for return time
 * @param {number} sampleRate - samples per second (default: 10Hz)
 * @returns {number[]} - waveform with slope-limited transitions
 */
export function limit_gradient_by_delta(samples, delta, rise_coeffs, return_coeffs, duration, sampleRate = 10) {
    const new_samples = [...samples];

    const rise_time = evaluatePolynomial(rise_coeffs, Math.abs(delta));
    const return_time = evaluatePolynomial(return_coeffs, Math.abs(delta));

    // Relax factor: control how strict the slope limitation is
    const RELAX_FACTOR = 1.5; 

    const slope_rise = (Math.abs(delta) / rise_time) * (duration / rise_time) * RELAX_FACTOR;
    const slope_return = (Math.abs(delta) / return_time) * (duration / return_time) * RELAX_FACTOR;

    const max_rise_step = slope_rise / sampleRate;
    const max_return_step = slope_return / sampleRate;

    for (let i = 1; i < new_samples.length; i++) {
        const delta_y = new_samples[i] - new_samples[i - 1];
        const is_rising = Math.sign(delta_y) === Math.sign(delta);

        const max_step = is_rising ? max_rise_step : max_return_step;

        if (Math.abs(delta_y) > max_step) {
            new_samples[i] = new_samples[i - 1] + Math.sign(delta_y) * max_step;
        }
    }

    return new_samples;
}
