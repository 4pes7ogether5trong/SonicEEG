from typing import Dict, Tuple

import numpy as np

from utils.config import AppConfig


def _sine_wave(freq: float, duration: float, sr: int) -> np.ndarray:
    t = np.linspace(0.0, duration, int(sr * duration), endpoint=False)
    return np.sin(2 * np.pi * freq * t)


def _envelope(n: int) -> np.ndarray:
    attack = int(0.02 * n)
    release = int(0.05 * n)
    sustain = n - attack - release
    env = np.concatenate([
        np.linspace(0.0, 1.0, max(1, attack), endpoint=False),
        np.ones(max(1, sustain)),
        np.linspace(1.0, 0.0, max(1, release), endpoint=True),
    ])
    # Trim if rounding made it off by one
    return env[:n]


def _synthesize_band(freq_base: float, harmonics: list, amplitude: float, duration: float, sr: int) -> np.ndarray:
    if amplitude <= 0.0:
        return np.zeros(int(sr * duration), dtype=np.float32)
    waves = []
    for i, mul in enumerate(harmonics):
        amp = amplitude / (i + 1)
        waves.append(_sine_wave(freq_base * float(mul), duration, sr) * amp)
    mix = np.sum(waves, axis=0) if waves else np.zeros(int(sr * duration))
    env = _envelope(mix.shape[0])
    mix = mix * env
    # Soft clip
    mix = np.tanh(mix)
    return mix.astype(np.float32)


def synthesize_audio_mix(per_quad_results: Dict[str, Dict], config: AppConfig) -> np.ndarray:
    sr = config.sample_rate
    duration = config.frame_seconds
    n = int(sr * duration)

    stereo = np.zeros((n, 2), dtype=np.float32)

    for quad_name, result in per_quad_results.items():
        band_powers: Dict[str, float] = result["band_powers"]
        quad_mix = np.zeros(n, dtype=np.float32)

        for band, power in band_powers.items():
            base_freq = config.band_base_freq[band]
            harmonics = config.band_harmonics[band]
            # Amplitude scaling; emphasize band differences
            amp = float(power)
            band_wave = _synthesize_band(base_freq, harmonics, amp, duration, sr)
            quad_mix += band_wave

        # Normalize quad signal
        if np.max(np.abs(quad_mix)) > 1e-6:
            quad_mix = quad_mix / np.max(np.abs(quad_mix))

        # Apply panning
        pan_l, pan_r = config.panning.get(quad_name, (0.5, 0.5))
        stereo[:, 0] += quad_mix * pan_l
        stereo[:, 1] += quad_mix * pan_r

    # Final normalization
    peak = np.max(np.abs(stereo))
    if peak > 1e-6:
        stereo = stereo / peak * 0.9

    return stereo