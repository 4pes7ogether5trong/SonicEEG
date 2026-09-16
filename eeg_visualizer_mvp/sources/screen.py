from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterator, Mapping, Optional, Sequence, Tuple

import numpy as np
from PIL import Image

from ..model import SignalBlock


DEFAULT_ROIS: Dict[str, Tuple[float, float, float, float]] = {
    "SCREEN_TL": (0.0, 0.0, 0.5, 0.5),
    "SCREEN_TR": (0.5, 0.0, 1.0, 0.5),
    "SCREEN_BL": (0.0, 0.5, 0.5, 1.0),
    "SCREEN_BR": (0.5, 0.5, 1.0, 1.0),
}


@dataclass
class _LegacyConfig:
    quad_margins: Mapping[str, Tuple[float, float, float, float]]
    edge_threshold: int = 40
    trace_lowpass_smooth: int = 5
    fallback_image_path: Path = Path("__no_screen_fallback__")
    demo_width: int = 1280
    demo_height: int = 720
    allow_blank_fallback: bool = False


def load_roi_config(path: Optional[Path | str]) -> Dict[str, Tuple[float, float, float, float]]:
    if path is None:
        return dict(DEFAULT_ROIS)
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    rois = payload.get("rois", payload)
    if not isinstance(rois, dict) or not rois:
        raise ValueError("ROI config must be a non-empty object mapping channel names to [left, top, right, bottom]")
    result: Dict[str, Tuple[float, float, float, float]] = {}
    for name, rect in rois.items():
        if not isinstance(rect, Sequence) or len(rect) != 4:
            raise ValueError(f"ROI for {name} must have four fractional coordinates")
        coords = tuple(float(value) for value in rect)
        left, top, right, bottom = coords
        if not (0.0 <= left < right <= 1.0 and 0.0 <= top < bottom <= 1.0):
            raise ValueError(f"ROI for {name} is outside normalized screen bounds")
        result[str(name)] = coords
    return result


class ScreenSource:
    """Adapt the legacy SonicEEG screen extractor to the common signal contract."""

    def __init__(
        self,
        *,
        seconds_visible: float,
        roi_config: Optional[Path | str] = None,
        uv_per_pixel: Optional[float] = None,
        interval_seconds: float = 0.5,
        edge_threshold: int = 40,
        trace_lowpass_smooth: int = 5,
        capture_fn: Optional[Callable[[], Image.Image]] = None,
        realtime: bool = True,
    ) -> None:
        if seconds_visible <= 0:
            raise ValueError("seconds_visible must be positive")
        if uv_per_pixel is not None and uv_per_pixel <= 0:
            raise ValueError("uv_per_pixel must be positive when supplied")
        self.seconds_visible = float(seconds_visible)
        self.uv_per_pixel = uv_per_pixel
        self.interval_seconds = interval_seconds
        self.realtime = realtime
        self.rois = load_roi_config(roi_config)
        self.config = _LegacyConfig(
            quad_margins=self.rois,
            edge_threshold=edge_threshold,
            trace_lowpass_smooth=trace_lowpass_smooth,
        )
        self.capture_fn = capture_fn

    def _capture(self) -> Image.Image:
        if self.capture_fn is not None:
            return self.capture_fn().convert("RGB")
        from sonic_eeg_prototype.screenscraper.capture import capture_fullscreen

        return capture_fullscreen(self.config)

    def _extract(self, image: Image.Image) -> Tuple[np.ndarray, Tuple[str, ...]]:
        from sonic_eeg_prototype.screenscraper.quadrant_splitter import split_quadrants
        from sonic_eeg_prototype.trace_extraction.waveform_detector import extract_waveform_trace

        crops = split_quadrants(image, self.config)
        traces = []
        names = []
        for name, crop in crops.items():
            trace_y = np.asarray(extract_waveform_trace(crop, self.config), dtype=np.float64)
            centered = -(trace_y - np.median(trace_y))
            traces.append(centered)
            names.append(name)

        sample_count = min(trace.size for trace in traces)
        aligned = []
        for trace in traces:
            if trace.size != sample_count:
                trace = np.interp(
                    np.linspace(0.0, 1.0, sample_count),
                    np.linspace(0.0, 1.0, trace.size),
                    trace,
                )
            aligned.append(trace)
        data = np.vstack(aligned)
        if self.uv_per_pixel is not None:
            data *= float(self.uv_per_pixel)
        else:
            scales = np.percentile(np.abs(data), 95, axis=1, keepdims=True)
            data = data / np.maximum(scales, 1e-9)
        return data, tuple(names)

    def __iter__(self) -> Iterator[SignalBlock]:
        start_clock = time.monotonic()
        while True:
            image = self._capture()
            data, names = self._extract(image)
            sample_rate_hz = data.shape[1] / self.seconds_visible
            yield SignalBlock(
                data=data,
                sample_rate_hz=sample_rate_hz,
                channel_names=names,
                source_kind="screen-scrape",
                timestamp_s=time.monotonic() - start_clock,
                unit="uV" if self.uv_per_pixel is not None else "relative",
                voltage_calibrated=self.uv_per_pixel is not None,
                source_quality=0.45 if self.uv_per_pixel is None else 0.65,
                metadata={"display_label": "Screen scrape · configured ROIs"},
            )
            if self.realtime:
                time.sleep(max(0.0, self.interval_seconds))
