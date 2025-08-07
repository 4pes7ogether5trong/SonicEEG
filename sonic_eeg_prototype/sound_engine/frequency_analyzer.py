from typing import Dict

import numpy as np

from utils.config import AppConfig


def compute_band_powers(signal: np.ndarray, config: AppConfig) -> Dict[str, float]:
    n = signal.shape[0]
    window = np.hanning(n)
    sigw = signal * window
    spec = np.fft.rfft(sigw)
    freqs = np.fft.rfftfreq(n, d=1.0 / config.sample_rate)
    psd = (np.abs(spec) ** 2) / np.sum(window ** 2)

    powers: Dict[str, float] = {}
    total = 1e-9
    for name, (f_lo, f_hi) in config.bands.items():
        idx = np.where((freqs >= f_lo) & (freqs < f_hi))[0]
        band_power = float(psd[idx].sum()) if idx.size > 0 else 0.0
        powers[name] = band_power
        total += band_power

    # Normalize to 0..1
    for k in list(powers.keys()):
        powers[k] = float(powers[k] / total)

    return powers