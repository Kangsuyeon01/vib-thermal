import numpy as np
import json
SAMPLE_RATE = 10000
MIN_FREQ = 50
MAX_FREQ = 500
TOTAL_DURATION_SEC =5

Coeffs = []
## Calibrated 

with open('Coeff.txt') as file:
  for line in file:
    Coeffs.append(10000/float(line.strip()))
m = np.mean(Coeffs)
Coeffs = Coeffs/m

# def map_frequency(value, min_value, max_value):
#     return MIN_FREQ + (MAX_FREQ - MIN_FREQ) * ((value - min_value) / (max_value - min_value))

def map_frequency(value, min_value, max_value):
    log_min = np.log10(MIN_FREQ)  # log10(50)
    log_max = np.log10(MAX_FREQ)  # log10(500)
    log_freq = log_min + (log_max - log_min) * ((value - min_value) / (max_value - min_value))
    return 10 ** log_freq


def linterp_index(arr, perc):
    index = perc * (len(arr) - 1)
    lower = int(np.floor(index))
    upper = int(np.ceil(index))
    weight = index - lower
    value = arr[lower] * (1 - weight) + arr[upper] * weight
    return value

def generate_signal(vib_amp, vib_freq, duration=None):
    if duration is None:
        duration = TOTAL_DURATION_SEC

    active_perc = duration / TOTAL_DURATION_SEC
    num_output_samples = int(duration * SAMPLE_RATE)
    vib_signal = np.zeros(num_output_samples, dtype=np.float32)

    phase_acc = 0
    for i in range(num_output_samples):
        perc = i / num_output_samples
        lperc = perc * active_perc

        s_freq = linterp_index(vib_freq, lperc)
        s_amp = linterp_index(vib_amp, lperc)

        current_freq = map_frequency(s_freq, 0, 1)
        phase_delta = 2 * np.pi * current_freq / SAMPLE_RATE

        phase_acc += phase_delta
        vib_signal[i] = s_amp * np.sin(phase_acc) * Coeffs[int(current_freq) - 50] ## 추가함함

    return vib_signal, duration

if __name__ == "__main__":

    with open('collected_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    vib_amp = data['vib_amp']        # draw canvas의 진폭 (0~1)
    vib_freq = data['vib_freq']      # draw canvas의 주파수 (0~1)

    vib_signal_result,  duration = generate_signal(vib_amp, vib_freq, duration=10.0)
