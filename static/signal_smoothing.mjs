//@ts-check
/**
 * Smooths a sample array by averaging values within each second.
 * @param {number[]} samples - Original sample array
 * @param {number} duration_sec - Total duration in seconds
 * @param {number} samples_per_sec - Samples per second (default: samples.length / duration)
 * @returns {number[]} - Smoothed sample array
 */
function smooth_by_seconds(samples, duration_sec, samples_per_sec = samples.length / duration_sec) {
    const new_samples = [...samples];
    const samples_per_sec_int = Math.floor(samples_per_sec);
    const total_sec = Math.floor(samples.length / samples_per_sec_int);

    for (let sec = 0; sec < total_sec; sec++) {
        const start = sec * samples_per_sec_int;
        const end = start + samples_per_sec_int;
        const chunk = samples.slice(start, end);
        const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;

        for (let i = start; i < end; i++) {
            new_samples[i] = avg;
        }
    }
    return new_samples;
}

/**
 * Limits the rate of change between consecutive samples to prevent sharp transitions.
 * @param {number[]} samples - Original sample array
 * @param {number} max_delta_per_sample - Maximum allowed change per sample (e.g., 0.02)
 * @returns {number[]} - Gradient-limited sample array
 */
function limit_gradient(samples, max_delta_per_sample = 0.03) {
    const new_samples = [...samples];
    for (let i = 1; i < new_samples.length; i++) {
        const delta = new_samples[i] - new_samples[i - 1];
        if (Math.abs(delta) > max_delta_per_sample) {
            new_samples[i] = new_samples[i - 1] + Math.sign(delta) * max_delta_per_sample;
        }
    }
    return new_samples;
}
