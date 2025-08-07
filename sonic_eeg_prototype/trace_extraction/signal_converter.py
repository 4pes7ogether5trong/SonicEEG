from typing import Tuple

import numpy as np

from utils.config import AppConfig


def trace_to_signal(trace: np.ndarray, config: AppConfig) -> np.ndarray:
    h_range = max(1.0, float(trace.max() - trace.min()))
    y_norm = (trace - trace.min()) / h_range  # 0..1
    signal = 1.0 - (y_norm * 2.0 - 1.0 + 1.0)  # center around 0, invert so up is positive
    # The above simplifies to: signal in [-1, 1]

    # Resample to audio sample count for frame duration
    target_len = int(config.sample_rate * config.frame_seconds)
    x_src = np.linspace(0.0, 1.0, num=signal.shape[0], endpoint=False)
    x_dst = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
    signal_resampled = np.interp(x_dst, x_src, signal).astype(np.float32)

    # Light highpass to remove DC drift
    signal_resampled -= signal_resampled.mean()
    if signal_resampled.std() > 1e-6:
        signal_resampled /= (np.abs(signal_resampled).max() + 1e-6)

    return signal_resampled