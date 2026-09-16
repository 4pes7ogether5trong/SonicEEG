from __future__ import annotations

import csv
import time
from pathlib import Path
from typing import Iterator, Optional, Sequence, Tuple

import numpy as np

from ..model import SignalBlock


class DataPrivacyError(ValueError):
    pass


_TIME_COLUMNS = {"time", "timestamp", "seconds", "second", "sec", "t"}


def _normalize_unit(unit: str) -> Tuple[str, float, bool]:
    normalized = unit.strip().lower().replace("µ", "u").replace("μ", "u")
    scales = {
        "uv": ("uV", 1.0, True),
        "microvolt": ("uV", 1.0, True),
        "microvolts": ("uV", 1.0, True),
        "mv": ("uV", 1_000.0, True),
        "v": ("uV", 1_000_000.0, True),
        "relative": ("relative", 1.0, False),
        "unknown": ("relative", 1.0, False),
    }
    if normalized not in scales:
        raise ValueError(f"unsupported voltage unit: {unit}")
    return scales[normalized]


def _read_delimited(path: Path, delimiter: str, sample_rate_hz: Optional[float]) -> Tuple[np.ndarray, float, Tuple[str, ...]]:
    with path.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        try:
            header = [cell.strip() for cell in next(reader)]
        except StopIteration as exc:
            raise ValueError("raw data file is empty") from exc
    if not header or any(not name for name in header):
        raise ValueError("CSV/TSV input needs a non-empty header row")

    table = np.genfromtxt(path, delimiter=delimiter, names=True, dtype=np.float64, encoding="utf-8-sig")
    if table.size == 0:
        raise ValueError("raw data file contains no samples")
    if table.ndim == 0:
        table = np.array([table], dtype=table.dtype)

    dtype_names = list(table.dtype.names or ())
    original_by_safe = dict(zip(dtype_names, header))
    time_key = next((key for key in dtype_names if original_by_safe.get(key, key).strip().lower() in _TIME_COLUMNS), None)
    signal_keys = [key for key in dtype_names if key != time_key]
    if not signal_keys:
        raise ValueError("raw data file has no signal columns")

    if sample_rate_hz is None:
        if time_key is None:
            raise ValueError("--sample-rate is required when the file has no time column")
        time_values = np.asarray(table[time_key], dtype=np.float64)
        deltas = np.diff(time_values[np.isfinite(time_values)])
        positive = deltas[deltas > 0]
        if positive.size == 0:
            raise ValueError("could not infer a sampling rate from the time column")
        sample_rate_hz = float(1.0 / np.median(positive))

    data = np.vstack([np.asarray(table[key], dtype=np.float64) for key in signal_keys])
    names = tuple(original_by_safe.get(key, key) for key in signal_keys)
    return data, float(sample_rate_hz), names


def _read_numpy(path: Path, sample_rate_hz: Optional[float], channel_names: Optional[Sequence[str]]) -> Tuple[np.ndarray, float, Tuple[str, ...]]:
    loaded = np.load(path, allow_pickle=False)
    if isinstance(loaded, np.lib.npyio.NpzFile):
        try:
            data = np.asarray(loaded["data"], dtype=np.float64)
            if sample_rate_hz is None and "sample_rate" in loaded.files:
                sample_rate_hz = float(np.asarray(loaded["sample_rate"]).reshape(-1)[0])
            if channel_names is None and "channel_names" in loaded.files:
                channel_names = tuple(str(x) for x in np.asarray(loaded["channel_names"]).tolist())
        finally:
            loaded.close()
    else:
        data = np.asarray(loaded, dtype=np.float64)

    if data.ndim != 2:
        raise ValueError("NumPy EEG input must have shape (channels, samples)")
    if sample_rate_hz is None:
        raise ValueError("--sample-rate is required unless NPZ contains sample_rate")
    names = tuple(channel_names or (f"CH{index + 1:02d}" for index in range(data.shape[0])))
    if len(names) != data.shape[0]:
        raise ValueError("channel name count does not match NumPy data")
    return data, float(sample_rate_hz), names


def _read_edf(path: Path) -> Tuple[np.ndarray, float, Tuple[str, ...]]:
    try:
        import mne  # type: ignore
    except ImportError as exc:
        raise RuntimeError("EDF/BDF support requires the optional 'mne' package") from exc

    reader = mne.io.read_raw_bdf if path.suffix.lower() == ".bdf" else mne.io.read_raw_edf
    raw = reader(path, preload=True, verbose="ERROR")
    subject_info = raw.info.get("subject_info") or {}
    populated_fields = sorted(key for key, value in subject_info.items() if value not in (None, "", 0))
    if populated_fields:
        raise DataPrivacyError(
            "EDF/BDF header contains subject fields; deidentify it before loading. "
            f"Populated field names: {', '.join(populated_fields)}"
        )
    picks = mne.pick_types(raw.info, eeg=True, meg=False, stim=False, eog=False, ecg=False, misc=False)
    if len(picks) == 0:
        raise ValueError("EDF/BDF contains no channels marked as EEG")
    # MNE returns SI volts. Copy only the signal and channel labels; discard headers.
    data_uv = raw.get_data(picks=picks) * 1_000_000.0
    names = tuple(raw.ch_names[index] for index in picks)
    return data_uv, float(raw.info["sfreq"]), names


def load_raw_file(
    path: Path | str,
    *,
    sample_rate_hz: Optional[float] = None,
    unit: str = "uV",
    channel_names: Optional[Sequence[str]] = None,
) -> Tuple[np.ndarray, float, Tuple[str, ...], str, bool]:
    source_path = Path(path).expanduser().resolve()
    if not source_path.is_file():
        raise FileNotFoundError(source_path)
    suffix = source_path.suffix.lower()

    if suffix == ".csv":
        data, rate, names = _read_delimited(source_path, ",", sample_rate_hz)
    elif suffix == ".tsv":
        data, rate, names = _read_delimited(source_path, "\t", sample_rate_hz)
    elif suffix in {".npy", ".npz"}:
        data, rate, names = _read_numpy(source_path, sample_rate_hz, channel_names)
    elif suffix in {".edf", ".bdf"}:
        data, rate, names = _read_edf(source_path)
        return data, rate, names, "uV", True
    else:
        raise ValueError("supported raw formats: CSV, TSV, NPY, NPZ, EDF, BDF")

    output_unit, scale, calibrated = _normalize_unit(unit)
    return data * scale, rate, names, output_unit, calibrated


class RawFileSource:
    def __init__(
        self,
        path: Path | str,
        *,
        sample_rate_hz: Optional[float] = None,
        unit: str = "uV",
        channel_names: Optional[Sequence[str]] = None,
        window_seconds: float = 4.0,
        hop_seconds: float = 0.25,
        realtime: bool = True,
        loop: bool = False,
    ) -> None:
        self.path = Path(path)
        self.data, self.sample_rate_hz, self.channel_names, self.unit, self.calibrated = load_raw_file(
            self.path,
            sample_rate_hz=sample_rate_hz,
            unit=unit,
            channel_names=channel_names,
        )
        self.window_seconds = window_seconds
        self.hop_seconds = hop_seconds
        self.realtime = realtime
        self.loop = loop

    def __iter__(self) -> Iterator[SignalBlock]:
        window_samples = int(round(self.window_seconds * self.sample_rate_hz))
        hop_samples = max(1, int(round(self.hop_seconds * self.sample_rate_hz)))
        if self.data.shape[1] < window_samples:
            raise ValueError(
                f"recording has {self.data.shape[1]} samples; {window_samples} are needed for one window"
            )
        start = 0
        while True:
            if start + window_samples > self.data.shape[1]:
                if not self.loop:
                    return
                start = 0
            yield SignalBlock(
                data=self.data[:, start:start + window_samples],
                sample_rate_hz=self.sample_rate_hz,
                channel_names=self.channel_names,
                source_kind="raw-file",
                timestamp_s=start / self.sample_rate_hz,
                unit=self.unit,
                voltage_calibrated=self.calibrated,
                source_quality=1.0,
                metadata={"display_label": f"Deidentified raw {self.path.suffix.upper().lstrip('.')}"},
            )
            start += hop_samples
            if self.realtime:
                time.sleep(self.hop_seconds)
