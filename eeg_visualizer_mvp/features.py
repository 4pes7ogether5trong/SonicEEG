from __future__ import annotations

import math
from typing import Dict, List, Tuple

import numpy as np

from .age_reference import AgeReference
from .model import ChannelFeature, SignalBlock, VisualizationFrame
from .montage import locate_channel


BANDS: Dict[str, Tuple[float, float]] = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 30.0),
    "gamma": (30.0, 45.0),
}

ENCODING = {
    "angular_sector": "fixed channel identity/region",
    "radial_distance": "dominant frequency in Hz on a log scale",
    "tangential_displacement": "signed instantaneous voltage relative to the channel's robust scale",
    "glyph_area_luminance": "spectral concentration at the dominant rhythm",
    "glyph_color": "dominant canonical frequency band",
    "satellite_angle": "dominant-rhythm phase",
    "outline_texture": "rhythmicity (spectral peak concentration)",
    "opacity": "signal integrity/confidence",
    "recent_trail": "short-term evolution",
    "density_layer": "recurrence accumulated over the current session",
    "reference_contour": "age-conditioned comparison scaffold; never measurement remapping",
}


def _finite_interpolate(signal: np.ndarray) -> Tuple[np.ndarray, float]:
    finite = np.isfinite(signal)
    fraction = float(np.mean(finite))
    if finite.all():
        return signal.astype(np.float64, copy=True), fraction
    if not finite.any():
        return np.zeros_like(signal, dtype=np.float64), 0.0
    indices = np.arange(signal.size)
    return np.interp(indices, indices[finite], signal[finite]).astype(np.float64), fraction


def _preview(signal: np.ndarray, points: int = 160) -> List[float]:
    if signal.size <= points:
        sampled = signal
    else:
        x_src = np.arange(signal.size)
        x_dst = np.linspace(0, signal.size - 1, points)
        sampled = np.interp(x_dst, x_src, signal)
    scale = float(np.percentile(np.abs(sampled), 95)) if sampled.size else 0.0
    if scale < 1e-12:
        return [0.0 for _ in range(points)]
    return np.clip(sampled / scale, -2.0, 2.0).round(5).tolist()


class FeatureEngine:
    def __init__(self, preview_points: int = 160):
        self.preview_points = preview_points
        self._frame_id = 0

    def analyze(self, block: SignalBlock, patient_age_years: float) -> VisualizationFrame:
        channel_features: List[ChannelFeature] = []
        integrity_candidates: List[Dict[str, object]] = []
        warnings: List[str] = []

        nyquist = block.sample_rate_hz / 2.0
        if nyquist <= 8.0:
            warnings.append("Sampling rate is too low to resolve the full visual frequency grammar.")
        if not block.voltage_calibrated:
            warnings.append("Voltage is uncalibrated; displacement is relative, not microvolts.")

        for index, (name, raw_signal) in enumerate(zip(block.channel_names, block.data)):
            signal, finite_fraction = _finite_interpolate(np.asarray(raw_signal, dtype=np.float64))
            signal -= float(np.mean(signal))
            n = signal.size
            duration = n / block.sample_rate_hz
            window = np.hanning(n)
            window_energy = float(np.sum(window * window)) or 1.0
            spectrum = np.fft.rfft(signal * window)
            freqs = np.fft.rfftfreq(n, d=1.0 / block.sample_rate_hz)
            psd = (np.abs(spectrum) ** 2) / window_energy

            analysis_mask = (freqs >= 0.5) & (freqs <= min(45.0, nyquist))
            analysis_power = float(np.sum(psd[analysis_mask]))
            if analysis_power <= 1e-18 or not np.any(analysis_mask):
                dominant_frequency = 0.5
                centroid = 0.5
                dominant_index = int(np.argmin(np.abs(freqs - min(0.5, nyquist))))
            else:
                indices = np.flatnonzero(analysis_mask)
                dominant_index = int(indices[np.argmax(psd[analysis_mask])])
                dominant_frequency = float(freqs[dominant_index])
                centroid = float(np.sum(freqs[analysis_mask] * psd[analysis_mask]) / analysis_power)

            raw_band_powers: Dict[str, float] = {}
            for band_name, (low, high) in BANDS.items():
                mask = (freqs >= low) & (freqs < min(high, nyquist + 1e-12))
                raw_band_powers[band_name] = float(np.sum(psd[mask])) if np.any(mask) else 0.0
            band_total = sum(raw_band_powers.values()) or 1.0
            band_powers = {key: value / band_total for key, value in raw_band_powers.items()}
            dominant_band = max(band_powers, key=band_powers.get)

            bin_width = block.sample_rate_hz / n
            peak_mask = np.abs(freqs - dominant_frequency) <= max(0.75, bin_width * 1.5)
            peak_power = float(np.sum(psd[peak_mask]))
            rhythmicity = float(np.clip(peak_power / (analysis_power + 1e-18), 0.0, 1.0))
            phase_at_window_end = np.angle(spectrum[dominant_index]) + 2.0 * math.pi * dominant_frequency * duration
            phase = float((phase_at_window_end + math.pi) % (2.0 * math.pi) - math.pi)

            robust_scale = float(np.percentile(np.abs(signal), 95))
            signed_voltage = float(np.clip(signal[-1] / (robust_scale + 1e-12), -1.0, 1.0))
            rms = float(np.sqrt(np.mean(signal * signal)))
            peak_to_peak = float(np.ptp(signal))

            flags: List[str] = []
            quality = finite_fraction * block.source_quality
            if finite_fraction < 0.98:
                flags.append("missing_samples")
                quality *= finite_fraction
            if robust_scale < 1e-9:
                flags.append("flatline_candidate")
                quality *= 0.1
            if block.voltage_calibrated and peak_to_peak > 1000.0:
                flags.append("extreme_amplitude_candidate")
                quality *= 0.55
            high_fraction = band_powers.get("gamma", 0.0)
            if high_fraction > 0.55:
                flags.append("high_frequency_contamination_candidate")
                quality *= 0.7
            quality = float(np.clip(quality, 0.0, 1.0))

            if flags:
                integrity_candidates.append({"channel": name, "flags": flags, "confidence": round(1.0 - quality, 4)})

            location = locate_channel(name, index, len(block.channel_names))
            channel_features.append(ChannelFeature(
                name=name,
                region=location.region,
                hemisphere=location.hemisphere,
                angle_rad=round(location.angle_rad, 7),
                dominant_frequency_hz=round(dominant_frequency, 5),
                spectral_centroid_hz=round(centroid, 5),
                band_powers={key: round(value, 7) for key, value in band_powers.items()},
                dominant_band=dominant_band,
                phase_rad=round(phase, 7),
                rhythmicity=round(rhythmicity, 7),
                signed_voltage=round(signed_voltage, 7),
                rms_amplitude=round(rms, 7),
                peak_to_peak=round(peak_to_peak, 7),
                voltage_unit=block.unit,
                voltage_calibrated=block.voltage_calibrated,
                quality=round(quality, 7),
                quality_flags=flags,
                trace_preview=_preview(signal, self.preview_points),
            ))

        self._frame_id += 1
        source_label = str(block.metadata.get("display_label", block.source_kind))
        return VisualizationFrame(
            frame_id=self._frame_id,
            source_kind=block.source_kind,
            source_label=source_label,
            timestamp_s=float(block.timestamp_s),
            generated_at=VisualizationFrame.utc_now(),
            sample_rate_hz=float(block.sample_rate_hz),
            window_seconds=float(block.data.shape[1] / block.sample_rate_hz),
            patient_age_years=float(patient_age_years),
            age_reference=AgeReference(patient_age_years).as_dict(),
            channels=channel_features,
            candidates={
                "signal_integrity": integrity_candidates,
                "physiology": [],
                "normal_variants": [],
                "abnormality": [],
            },
            encoding=dict(ENCODING),
            warnings=warnings,
        )
