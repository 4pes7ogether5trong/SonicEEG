from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence

import numpy as np


SCHEMA_VERSION = "soniceeg.visual-frame/1"


@dataclass(frozen=True)
class SignalBlock:
    """A calibrated (or explicitly uncalibrated) multichannel signal window."""

    data: np.ndarray
    sample_rate_hz: float
    channel_names: Sequence[str]
    source_kind: str
    timestamp_s: float
    unit: str = "uV"
    voltage_calibrated: bool = True
    source_quality: float = 1.0
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        data = np.asarray(self.data, dtype=np.float64)
        if data.ndim != 2:
            raise ValueError("SignalBlock.data must have shape (channels, samples)")
        if data.shape[0] != len(self.channel_names):
            raise ValueError("channel_names must match the first data dimension")
        if data.shape[1] < 8:
            raise ValueError("a signal block needs at least 8 samples")
        if not np.isfinite(self.sample_rate_hz) or self.sample_rate_hz <= 0:
            raise ValueError("sample_rate_hz must be positive")
        if len(set(self.channel_names)) != len(self.channel_names):
            raise ValueError("channel names must be unique")
        object.__setattr__(self, "data", data)
        object.__setattr__(self, "channel_names", tuple(str(x) for x in self.channel_names))
        object.__setattr__(self, "source_quality", float(np.clip(self.source_quality, 0.0, 1.0)))


@dataclass(frozen=True)
class ChannelFeature:
    name: str
    region: str
    hemisphere: str
    angle_rad: float
    dominant_frequency_hz: float
    spectral_centroid_hz: float
    band_powers: Dict[str, float]
    dominant_band: str
    phase_rad: float
    rhythmicity: float
    signed_voltage: float
    rms_amplitude: float
    peak_to_peak: float
    voltage_unit: str
    voltage_calibrated: bool
    quality: float
    quality_flags: List[str]
    trace_preview: List[float]


@dataclass(frozen=True)
class VisualizationFrame:
    frame_id: int
    source_kind: str
    source_label: str
    timestamp_s: float
    generated_at: str
    sample_rate_hz: float
    window_seconds: float
    patient_age_years: float
    age_reference: Dict[str, Any]
    channels: List[ChannelFeature]
    candidates: Dict[str, List[Dict[str, Any]]]
    encoding: Dict[str, str]
    warnings: List[str]
    schema: str = SCHEMA_VERSION

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @staticmethod
    def utc_now() -> str:
        return datetime.now(timezone.utc).isoformat()
