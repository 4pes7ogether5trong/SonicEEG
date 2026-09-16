from __future__ import annotations

import time
from typing import Iterator, Sequence, Tuple

import numpy as np

from ..age_reference import AgeReference
from ..model import SignalBlock
from ..montage import STANDARD_1020_CHANNELS, locate_channel


def make_synthetic_recording(
    *,
    age_years: float = 30.0,
    sample_rate_hz: float = 256.0,
    duration_seconds: float = 120.0,
    seed: int = 1001,
    channel_names: Sequence[str] = STANDARD_1020_CHANNELS,
) -> Tuple[np.ndarray, Tuple[str, ...]]:
    """Create deterministic, continuous Simulation 001 data in microvolts."""

    names = tuple(channel_names)
    sample_count = int(round(sample_rate_hz * duration_seconds))
    t = np.arange(sample_count, dtype=np.float64) / sample_rate_hz
    pdr = float(AgeReference(age_years).as_dict()["posterior_rhythm_reference_hz"])
    rng = np.random.default_rng(seed)
    data = np.zeros((len(names), sample_count), dtype=np.float64)

    common_alpha = np.sin(2.0 * np.pi * pdr * t)
    common_theta = np.sin(2.0 * np.pi * 6.0 * t + 0.6)
    common_beta = np.sin(2.0 * np.pi * 18.0 * t + 1.1)
    slow_drift = np.sin(2.0 * np.pi * 1.2 * t + 0.2)

    for index, name in enumerate(names):
        location = locate_channel(name, index, len(names))
        if location.region == "occipital":
            alpha_amp = 34.0
        elif location.region in {"parietal", "posterior-temporal"}:
            alpha_amp = 24.0
        elif location.region in {"central", "temporal"}:
            alpha_amp = 13.0
        else:
            alpha_amp = 8.0

        beta_amp = 9.0 if location.region in {"frontopolar", "frontal"} else 4.0
        hemisphere_phase = -0.08 if location.hemisphere == "left" else 0.08
        local_alpha = np.sin(2.0 * np.pi * pdr * t + hemisphere_phase + index * 0.012)
        colored_noise = rng.normal(0.0, 1.0, sample_count)
        colored_noise = np.convolve(colored_noise, np.ones(5) / 5.0, mode="same")

        data[index] = (
            alpha_amp * (0.70 * common_alpha + 0.30 * local_alpha)
            + 5.0 * common_theta
            + beta_amp * common_beta
            + 3.0 * slow_drift
            + 4.0 * colored_noise
        )

    return data, names


class SyntheticSource:
    def __init__(
        self,
        *,
        age_years: float = 30.0,
        sample_rate_hz: float = 256.0,
        window_seconds: float = 4.0,
        hop_seconds: float = 0.25,
        seed: int = 1001,
        realtime: bool = True,
        loop: bool = True,
    ) -> None:
        self.age_years = age_years
        self.sample_rate_hz = sample_rate_hz
        self.window_seconds = window_seconds
        self.hop_seconds = hop_seconds
        self.realtime = realtime
        self.loop = loop
        self.data, self.channel_names = make_synthetic_recording(
            age_years=age_years,
            sample_rate_hz=sample_rate_hz,
            seed=seed,
        )

    def __iter__(self) -> Iterator[SignalBlock]:
        window_samples = int(round(self.window_seconds * self.sample_rate_hz))
        hop_samples = max(1, int(round(self.hop_seconds * self.sample_rate_hz)))
        start = 0
        while True:
            if start + window_samples > self.data.shape[1]:
                if not self.loop:
                    return
                start = 0
            block = self.data[:, start:start + window_samples]
            yield SignalBlock(
                data=block,
                sample_rate_hz=self.sample_rate_hz,
                channel_names=self.channel_names,
                source_kind="synthetic",
                timestamp_s=start / self.sample_rate_hz,
                unit="uV",
                voltage_calibrated=True,
                source_quality=1.0,
                metadata={"display_label": "Simulation 001 · adult 10–20"},
            )
            start += hop_samples
            if self.realtime:
                time.sleep(self.hop_seconds)
