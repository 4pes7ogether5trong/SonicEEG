#!/usr/bin/env python3
"""Local EEG Review bridge. No networking, filtering, resampling or rereferencing.

Output: EEGRVW1\n + uint32 LE JSON length + uint32 zero + UTF-8 JSON +
sample-major little-endian float64 microvolts. See FORMAT.md.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass, field
import hashlib
import importlib.metadata
import json
import logging
import math
import os
from pathlib import Path
import struct
import tempfile
import warnings

import numpy as np

MAGIC = b"EEGRVW1\n"
FORMATS = ("auto", "fif", "eeglab", "nihon", "nicolet", "persyst", "xdf", "nwb")
VOLTAGE_TYPES = {"eeg", "ecog", "seeg", "dbs", "eog", "ecg", "emg", "bio"}


@dataclass
class Recording:
    format: str
    names: list[str]
    fs: float
    samples: int
    read_uv: object
    events: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    source_start: float = 0.0
    filters: str = "Not specified"
    reader: str = ""
    timing_error_seconds: float = 0.0


def factor_uv(unit):
    key = str(unit).strip().lower().replace("µ", "u").replace("μ", "u")
    factors = {"uv": 1.0, "microvolt": 1.0, "microvolts": 1.0,
               "mv": 1000.0, "v": 1e6, "volt": 1e6, "volts": 1e6, "nv": .001}
    if key not in factors:
        raise ValueError(f"Voltage units are missing or unsupported: {unit!r}. Supply --unit only if verified.")
    return factors[key]


def regular_timestamps(timestamps, fs):
    """Validate a uniform grid to 0.1% of one interval; never remove jitter."""
    t = np.asarray(timestamps, dtype=np.float64)
    if t.ndim != 1 or len(t) < 2 or not np.isfinite(t).all() or (np.diff(t) <= 0).any():
        raise ValueError("Invalid, duplicate, or non-monotonic timestamps.")
    if not math.isfinite(fs) or fs <= 0:
        raise ValueError("A positive, finite sample rate is required.")
    error = float(np.max(np.abs(t - (t[0] + np.arange(len(t)) / fs))))
    tolerance = max(1e-8, .001 / fs, float(np.spacing(abs(t[0]))) * 4)
    if error > tolerance:
        raise ValueError(f"Irregular timestamps or gaps: {error:.6g} s grid error. No samples were resampled or joined.")
    return float(t[0]), error


def choose_format(path, requested):
    if requested != "auto":
        return requested
    name = path.name.lower()
    for ext, fmt in ((".fif.gz", "fif"), (".fif", "fif"), (".set", "eeglab"),
                     (".data", "nicolet"), (".lay", "persyst"), (".xdf", "xdf"), (".nwb", "nwb")):
        if name.endswith(ext):
            return fmt
    if path.suffix.lower() in {".arc", ".ez3", ".eas"}:
        raise ValueError("Cadwell native readers are not available here. Use the acquisition software's continuous EDF export.")
    if path.is_dir() or path.suffix.lower() in {".erd", ".stc", ".e", ".one"}:
        raise ValueError("Xltek/NeuroWorks and NicoletOne native containers are not supported. Export continuous EDF or Persyst LAY/DAT.")
    raise ValueError("Ambiguous or unsupported file type. For Nihon Kohden .EEG choose --format nihon; do not select BrainVision .eeg here.")


def mne_recording(path, fmt, encoding="utf-8"):
    # Reader-specific options are explicit; annotation encodings are not guessed.
    import mne
    readers = {"fif": mne.io.read_raw_fif, "eeglab": mne.io.read_raw_eeglab,
               "nihon": mne.io.read_raw_nihon, "nicolet": mne.io.read_raw_nicolet,
               "persyst": mne.io.read_raw_persyst}
    opts = {"preload": False, "verbose": "ERROR"}
    if fmt == "nicolet":
        if not path.with_suffix(".head").is_file():
            raise ValueError("The matching Nicolet .head file must be next to the .data file.")
        opts["ch_type"] = "eeg"
    if fmt == "persyst":
        # Comments are comma-separated, not INI entries. Do not use ConfigParser.
        if path.stat().st_size > 8 * 1024**2:
            raise ValueError("Persyst header exceeds 8 MB.")
        sections, section = {}, ""
        for line in path.read_text().splitlines():
            line = line.strip()
            if line.startswith("[") and line.endswith("]"):
                section = line[1:-1].lower()
            elif line and section in {"sampletimes", "fileinfo", "channelmap"}:
                if "=" not in line:
                    raise ValueError("Malformed Persyst metadata.")
                key, value = (p.strip() for p in line.split("=", 1))
                sections.setdefault(section, []).append((key, value))
        times = sections.get("sampletimes", [])
        if len(times) > 1:
            raise ValueError("Multiple Persyst SampleTimes entries: export one continuous segment; gaps cannot be verified.")
        info_items = sections.get("fileinfo", [])
        info = {k.lower(): v for k, v in info_items}
        if len(info) != len(info_items):
            raise ValueError("Duplicate Persyst FileInfo fields.")
        count = int(info["waveformcount"])
        positions = [int(v) for k, v in sections.get("channelmap", [])]
        if positions not in [list(range(count)), list(range(1, count + 1))]:
            raise ValueError("Non-sequential Persyst ChannelMap is not supported; refusing uncertain channel order.")
        width = {0: 2, 7: 4}.get(int(info["datatype"]))
        data_path = path.parent / Path(info["file"]).name
        if not width or count < 1 or data_path.stat().st_size % (count * width):
            raise ValueError("Unsupported or truncated Persyst binary data.")
    if fmt == "nihon":
        opts["encoding"] = encoding
        if path.suffix.upper() != ".EEG":
            raise ValueError("Choose the Nihon Kohden .EEG file and keep its companions beside it.")
        if not any(p.stem.lower() == path.stem.lower() and p.suffix.lower() == ".21e" for p in path.parent.iterdir()):
            raise ValueError("Nihon Kohden .21E channel metadata is required; refusing inferred channel labels.")
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        raw = readers[fmt](path, **opts)
    channel_types = raw.get_channel_types()
    from mne._fiff.constants import FIFF
    picks = [i for i, t in enumerate(channel_types) if t in VOLTAGE_TYPES and raw.info["chs"][i]["unit"] == FIFF.FIFF_UNIT_V]
    if not picks:
        raw.close()
        raise ValueError("No channels with known voltage type. Non-voltage channels are not treated as EEG.")
    messages = [str(w.message) for w in caught]
    omitted = [raw.ch_names[i] for i in range(len(channel_types)) if i not in picks]
    if omitted:
        messages.append("Excluded non-voltage/untyped channels: " + ", ".join(omitted))
    events = []
    for a in raw.annotations:
        description = str(a["description"])
        if any(x in description.lower() for x in ("boundary", "acq_skip", "bad_acq", "edge")):
            raw.close()
            raise ValueError("Recording contains acquisition gaps or segment boundaries. Export one continuous segment.")
        time = float(a["onset"]) - float(raw.first_time)
        events.append({"time": time, "duration": float(a["duration"]), "text": description})
    if fmt == "persyst":
        messages.append("Persyst support is experimental. Source-file comparison and export timing must be verified against the originating viewer.")
    if raw.info["bads"]:
        messages.append("Source-marked bad channels retained: " + ", ".join(raw.info["bads"]))
    if raw.info["projs"]:
        messages.append("Source contains projection metadata; no additional projections were applied by this converter.")
    labels = [raw.ch_names[i] for i in picks]
    names = {"fif": "MNE FIF", "eeglab": "EEGLAB", "nihon": "Nihon Kohden", "nicolet": "Nicolet binary export", "persyst": "Persyst"}
    recording = Recording(names[fmt], labels, float(raw.info["sfreq"]), int(raw.n_times),
                          lambda a, z: raw.get_data(picks=picks, start=a, stop=z).T * 1e6,
                          events=events, warnings=messages, source_start=float(raw.first_time),
                          filters=f"Header high-pass {raw.info['highpass']} Hz; low-pass {raw.info['lowpass']} Hz",
                          reader=f"MNE {mne.__version__}")
    return recording, raw.close


def first(value, default=None):
    if isinstance(value, list):
        return value[0] if value else default
    return default if value is None else value


def xdf_recording(path, stream_id=None, unit=None):
    import pyxdf
    choices = pyxdf.resolve_streams(str(path))
    if stream_id is None:
        eeg = [s for s in choices if str(s.get("type", "")).upper() == "EEG"]
        if len(eeg) != 1:
            raise ValueError("Select --stream-id explicitly. Streams: " + json.dumps(choices, default=str))
        stream_id = eeg[0]["stream_id"]
    errors = []
    class Capture(logging.Handler):
        def emit(self, record):
            if record.levelno >= logging.WARNING:
                errors.append(record.getMessage())
    handler = Capture()
    logger = logging.getLogger("pyxdf")
    logger.addHandler(handler)
    try:
        streams, _ = pyxdf.load_xdf(str(path), select_streams=int(stream_id),
                                   synchronize_clocks=False, dejitter_timestamps=False,
                                   handle_clock_resets=False, verbose="ERROR")
    finally:
        logger.removeHandler(handler)
    if errors:
        raise ValueError("XDF reader reported possible corruption: " + "; ".join(errors))
    if len(streams) != 1:
        raise ValueError("The selected XDF stream is missing or ambiguous.")
    stream = streams[0]
    info = stream["info"]
    fs = float(first(info.get("nominal_srate"), 0))
    values = np.asarray(stream["time_series"])
    if values.ndim != 2 or values.dtype.kind not in "fiu":
        raise ValueError("The selected XDF stream is not a numeric signal.")
    origin, error = regular_timestamps(stream["time_stamps"], fs)
    desc = first(info.get("desc"), {})
    channels = first(desc.get("channels"), {}).get("channel", [])
    if len(channels) != values.shape[1]:
        raise ValueError("XDF channel names/units are missing or do not match the data.")
    labels = [str(first(c.get("label"), "")) for c in channels]
    if any(not s for s in labels):
        raise ValueError("XDF channel labels are required.")
    factors = np.asarray([factor_uv(unit or first(c.get("unit"), "")) for c in channels])
    return Recording("XDF", labels, fs, len(values), lambda a, z: values[a:z].astype(np.float64) * factors,
                     warnings=["One XDF stream only. Other streams and cross-stream markers are not imported; clock synchronization and dejittering are off."],
                     source_start=origin, reader=f"pyxdf {importlib.metadata.version('pyxdf')}", timing_error_seconds=error)


def nwb_recording(path, series_name=None):
    import pynwb
    from pynwb.ecephys import ElectricalSeries
    io = pynwb.NWBHDF5IO(str(path), "r", load_namespaces=True)
    try:
        nwb = io.read()
        candidates = {obj.data.name.rsplit("/", 1)[0]: obj for obj in nwb.objects.values()
                      if isinstance(obj, ElectricalSeries)}
        if series_name:
            choices = [v for k, v in candidates.items() if k == series_name or v.name == series_name]
        else:
            choices = list(candidates.values())
        if len(choices) != 1:
            raise ValueError("Select --series with an exact ElectricalSeries path. Choices: " + ", ".join(candidates))
        es = choices[0]
        if es.data.ndim != 2 or es.data.shape[0] < 2:
            raise ValueError("NWB ElectricalSeries must have samples × channels dimensions.")
        n, c = es.data.shape
        if es.timestamps is not None:
            ts = np.asarray(es.timestamps[:])
            if len(ts) != n or not np.isfinite(ts).all() or np.any(np.diff(ts) <= 0):
                raise ValueError("Invalid NWB timestamps.")
            fs = (n - 1) / float(ts[-1] - ts[0])
            origin, error = regular_timestamps(ts, fs)
        else:
            fs, origin, error = float(es.rate), float(es.starting_time or 0), 0.0
        table = es.electrodes.table
        rows = np.asarray(es.electrodes.data[:], dtype=int)
        if len(rows) != c:
            raise ValueError("NWB electrode-region length does not match signal channels.")
        label_column = next((k for k in ("label", "channel_name", "name") if k in table.colnames), None)
        labels = [str(table[label_column][int(i)]) if label_column else "electrode_" + str(table.id[int(i)]) for i in rows]
        warning = [] if label_column else ["NWB has no electrode-label column. Electrode IDs are preserved; map positions in Recording details."]
        conversion, offset = float(es.conversion), float(es.offset)
        factor = factor_uv(es.unit)
        cc = np.ones(c) if es.channel_conversion is None else np.asarray(es.channel_conversion[:], dtype=float)
        if cc.shape != (c,) or not np.isfinite(cc).all() or not math.isfinite(conversion) or not math.isfinite(offset):
            raise ValueError("Invalid NWB voltage calibration.")
        def read(a, z):
            return (np.asarray(es.data[a:z], dtype=np.float64) * conversion * cc + offset) * factor
        warning.append("Only the selected ElectricalSeries is imported. Other NWB series, trials, and interval annotations are not included.")
        r = Recording("NWB", labels, fs, int(n), read, warnings=warning, source_start=origin,
                      filters=str(es.filtering or "Not specified"), reader=f"PyNWB {pynwb.__version__}", timing_error_seconds=error)
        return r, io.close
    except BaseException:
        io.close()
        raise


@contextmanager
def open_recording(path, fmt="auto", stream_id=None, series=None, unit=None, encoding="utf-8"):
    path = Path(path)
    chosen = choose_format(path, fmt)
    close = lambda: None
    if chosen in {"fif", "eeglab", "nihon", "nicolet", "persyst"}:
        rec, close = mne_recording(path, chosen, encoding)
    elif chosen == "xdf":
        rec = xdf_recording(path, stream_id, unit)
    elif chosen == "nwb":
        rec, close = nwb_recording(path, series)
    else:
        raise ValueError("Unsupported recording type.")
    try:
        yield rec
    finally:
        close()


def write_review(rec, output, *, channels=None):
    output = Path(output)
    if output.suffix.lower() != ".eegreview":
        raise ValueError("Output must end with .eegreview.")
    if output.exists():
        raise FileExistsError("Output already exists; choose a new filename.")
    if not (math.isfinite(rec.fs) and 0 < rec.fs <= 100000 and 2 <= rec.samples < 2**53):
        raise ValueError("Invalid sampling frequency or sample count.")
    selected = list(range(len(rec.names)))
    if channels:
        if len(set(channels)) != len(channels) or any(rec.names.count(n) != 1 for n in channels):
            raise ValueError("Requested channel names must each occur exactly once.")
        selected = [rec.names.index(n) for n in channels]
    if not 1 <= len(selected) <= 512:
        raise ValueError("Choose between 1 and 512 voltage channels.")
    if any(not isinstance(rec.names[i], str) or not rec.names[i] or len(rec.names[i]) > 256 for i in selected):
        raise ValueError("Invalid channel label.")
    if len(rec.events) > 100000:
        raise ValueError("More than 100,000 events; split the recording before conversion.")
    events = []
    for event in rec.events:
        t, d, text = float(event["time"]), float(event.get("duration", 0)), str(event["text"])
        if not math.isfinite(t) or not math.isfinite(d) or d < 0:
            raise ValueError("Invalid event timestamp.")
        events.append({"time": t, "duration": d, "text": text[:4096]})
    header = {"schema": "eeg-review/1", "sample_type": "float64-le", "layout": "sample-major",
              "unit": "uV", "sample_rate": rec.fs, "sample_count": rec.samples,
              "source_format": rec.format, "source_reader": rec.reader,
              "source_start_seconds": rec.source_start, "max_grid_error_seconds": rec.timing_error_seconds,
              "channels": [{"label": rec.names[i], "reference": "unknown", "prefilter": rec.filters} for i in selected],
              "events": events, "warnings": rec.warnings,
              "processing": "Calibrated voltage conversion only. No added filters, resampling, or rereferencing.",
              "payload_sha256": "0" * 64}
    encode = lambda: json.dumps(header, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    encoded = encode()
    if len(encoded) > 8 * 1024**2:
        raise ValueError("Recording metadata exceeds 8 MB.")
    fd, temp_name = tempfile.mkstemp(prefix=".eegreview-", dir=output.parent)
    digest = hashlib.sha256()
    try:
        with os.fdopen(fd, "w+b") as stream:
            stream.write(MAGIC + struct.pack("<II", len(encoded), 0) + encoded)
            block = max(1, min(65536, 1000000 // max(1, len(rec.names))))
            for start in range(0, rec.samples, block):
                end = min(start + block, rec.samples)
                values = np.asarray(rec.read_uv(start, end), dtype=np.float64)
                if values.shape != (end - start, len(rec.names)):
                    raise ValueError("Reader returned an inconsistent sample/channel shape.")
                values = values[:, selected]
                if not np.isfinite(values).all():
                    raise ValueError("Missing/non-finite samples detected. Conversion stopped without filling gaps.")
                payload = np.ascontiguousarray(values, dtype="<f8").tobytes()
                stream.write(payload)
                digest.update(payload)
            header["payload_sha256"] = digest.hexdigest()
            final_header = encode()
            if len(final_header) != len(encoded):
                raise RuntimeError("Header size changed during checksum finalization.")
            stream.seek(16)
            stream.write(final_header)
            stream.flush()
            os.fsync(stream.fileno())
        # Same-directory hard link is atomic and refuses to replace another file.
        os.link(temp_name, output)
    finally:
        Path(temp_name).unlink(missing_ok=True)
    return header


def verify_review(path):
    with open(path, "rb") as f:
        if f.read(8) != MAGIC:
            raise ValueError("Not an EEG Review file.")
        size, reserved = struct.unpack("<II", f.read(8))
        if reserved or not 0 < size <= 8 * 1024**2:
            raise ValueError("Invalid EEG Review header size.")
        header = json.loads(f.read(size))
        digest, length = hashlib.sha256(), 0
        while chunk := f.read(1024 * 1024):
            digest.update(chunk)
            length += len(chunk)
    expected = header["sample_count"] * len(header["channels"]) * 8
    if length != expected or digest.hexdigest() != header["payload_sha256"]:
        raise ValueError("File is truncated or its payload checksum does not match.")
    return header


def convert(source, output, fmt="auto", stream_id=None, series=None, unit=None, channels=None, encoding="utf-8"):
    with open_recording(source, fmt, stream_id, series, unit, encoding) as rec:
        return write_review(rec, output, channels=channels)


def gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    root = tk.Tk()
    root.title("EEG Review · local converter")
    root.geometry("680x510")
    frame = ttk.Frame(root, padding=22)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Prepare a recording for your iPad", font=("Arial", 16)).pack(anchor="w")
    ttk.Label(frame, text="Files stay on this computer. Keep companion files together.").pack(anchor="w", pady=8)
    fields = {}
    for label, key, default in [("Recording file", "source", ""), ("Format", "fmt", "auto"),
                                ("XDF stream ID (if needed)", "stream", ""), ("NWB series path (if needed)", "series", ""), ("NK annotation encoding", "encoding", "utf-8")]:
        row = ttk.Frame(frame); row.pack(fill="x", pady=7)
        ttk.Label(row, text=label, width=26).pack(side="left")
        var = tk.StringVar(value=default); fields[key] = var
        if key == "fmt":
            ttk.Combobox(row, textvariable=var, values=FORMATS, state="readonly").pack(side="left", fill="x", expand=True)
        else:
            ttk.Entry(row, textvariable=var).pack(side="left", fill="x", expand=True)
        if key == "source":
            ttk.Button(row, text="Browse", command=lambda: fields["source"].set(filedialog.askopenfilename())).pack(side="right")
    status = tk.StringVar(value="Cadwell and Xltek native files still need a supported export.")
    ttk.Label(frame, textvariable=status, wraplength=610).pack(anchor="w", pady=16)
    def run():
        source = fields["source"].get()
        if not source: return
        destination = filedialog.asksaveasfilename(defaultextension=".eegreview", initialfile=Path(source).stem + ".eegreview")
        if not destination: return
        button.config(state="disabled"); status.set("Converting locally… this window may pause for large files."); root.update()
        try:
            h = convert(source, destination, fields["fmt"].get(), int(fields["stream"].get()) if fields["stream"].get() else None,
                        fields["series"].get() or None, encoding=fields["encoding"].get())
            status.set("Ready: " + destination)
            messagebox.showinfo("Recording ready", f"{len(h['channels'])} channels prepared. Transfer the .eegreview file to your iPad and open it in EEG Review.")
        except Exception as e:
            status.set("Conversion did not complete."); messagebox.showerror("Cannot convert this recording", str(e))
        finally:
            button.config(state="normal")
    button = ttk.Button(frame, text="Convert to .eegreview", command=run); button.pack(anchor="w", pady=5)
    root.mainloop()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path)
    parser.add_argument("output", nargs="?", type=Path)
    parser.add_argument("--format", choices=FORMATS, default="auto")
    parser.add_argument("--stream-id", type=int)
    parser.add_argument("--series")
    parser.add_argument("--encoding", default="utf-8", help="Nihon annotation encoding, e.g. gbk; confirm with the source system")
    parser.add_argument("--unit", help="Verified XDF voltage unit override; never guessed")
    parser.add_argument("--channels", help="Comma-separated exact channel names; optional")
    parser.add_argument("--verify", type=Path, help="Verify an existing output's full payload checksum")
    parser.add_argument("--gui", action="store_true")
    args = parser.parse_args()
    try:
        if args.gui:
            gui(); return
        if args.verify:
            h = verify_review(args.verify)
        else:
            if args.source is None or args.output is None:
                parser.error("source and output are required, or use --gui")
            h = convert(args.source, args.output, args.format, args.stream_id, args.series, args.unit,
                        args.channels.split(",") if args.channels else None, args.encoding)
        print(f"Verified structure: {h['source_format']}, {len(h['channels'])} channels, {h['sample_rate']:g} Hz, {h['sample_count']} samples/channel.")
        for message in h["warnings"]:
            print("Note:", message)
    except Exception as e:
        parser.exit(1, f"Conversion stopped: {e}\n")


if __name__ == "__main__":
    main()
