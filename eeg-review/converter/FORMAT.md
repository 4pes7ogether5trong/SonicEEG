# EEG Review interchange file, version 1

Extension: `.eegreview`. This narrow, transparent interchange format carries continuous calibrated voltage data from the local companion converter to the browser reader. It is not intended to replace the source recording or a standard archive format.

| Offset | Length | Encoding |
|---|---:|---|
| 0 | 8 | Literal ASCII `EEGRVW1` followed by LF |
| 8 | 4 | Unsigned little-endian JSON byte length |
| 12 | 4 | Reserved, must be zero |
| 16 | Header length | UTF-8 JSON, at most 8 MiB |
| 16 + header length | samples × channels × 8 | Sample-major little-endian IEEE-754 float64 microvolts |

Required header fields: `schema: "eeg-review/1"`, `sample_type: "float64-le"`, `layout: "sample-major"`, `unit: "uV"`, positive finite `sample_rate`, integer `sample_count`, `channels`, `events`, `warnings`.

There are 1–512 channels; each has a nonempty `label` (at most 256 characters), `reference: "unknown"`, and optional `prefilter`. Channel order is payload order. References are intentionally unverified, even when a source label suggests a reference; the viewer still recognizes already bipolar labels and blocks unsuitable derivations.

`events` contains at most 100,000 objects with finite `time` and nonnegative `duration` in seconds relative to the first sample and `text`. Source metadata includes `source_format`, `source_reader`, `source_start_seconds`, `max_grid_error_seconds`, `processing`, and `payload_sha256` (64 hexadecimal characters). Timestamped sources are represented by a uniform grid only after a strict tolerance check (0.1% of a sample interval or floating-point precision); the measured grid error is recorded. No jitter correction or interpolation is applied.

The converter refuses non-finite samples and validates the full payload as it writes. It writes to a temporary file, finalizes the payload hash, then creates a new output atomically without replacing an existing file. Output lengths must match exactly; no trailing bytes or partial frames. The viewer verifies structural metadata and the finite values it reads within a time window. Full payload verification is available in the companion utility.

The payload hash covers sample bytes, **not the JSON metadata**. It detects payload transfer damage; it does not authenticate a recording or protect metadata from alteration. Keep the original files and source-system metadata as the authoritative record.
