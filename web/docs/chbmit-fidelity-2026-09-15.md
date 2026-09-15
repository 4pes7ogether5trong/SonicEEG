# CHB-MIT capture precision and visibility pass — 15 September 2026

This pass improves voltage precision on recoverable traces and makes missing capture visible. It does not resolve crowded same-color trace identity. The isolated F7-T7 benchmark improves from 5.70 to 5.00 µV RMSE across the full 110-second excerpt, with exactly the same observed-sample coverage. The crowded 18-channel, 2 µV/pixel case remains substantially incomplete.

## Changes

- Measure the contrast-weighted center of the selected raster stroke. Keep the path's original geometry separately for seeds, crossing rejection, clipping decisions and sweep retention. Existing gaps and identity checks are not relaxed.
- Show a recent four-second capture strip with separate ink, repaired and missing fractions. Every confirmed lead contributes its full expected interval, including wholly unavailable leads and stale data.
- Distinguish trace fragments from channels ready for analysis. Provide actionable source-display guidance when analysis remains incomplete, without calling visibility a fidelity score.
- Show repaired and missing fractions in each channel's coverage row.
- Give the live trace inspector its own common auto-fit or fixed voltage scale. Auto-fit includes the largest finite recovered deflection across leads; it does not use a percentile that could conceal peaks. Inspector scale changes neither calibration nor measurements.
- Add a reproducible benchmark under `benchmarks/chbmit/`, with source checksum verification, independent EDF decoding checks, atomic complete-log writes and explicit missingness accounting.

## Matched benchmark results

The same 110-second interval, renderer, crop dimensions, timebase, sensitivity, channel names, annotations and source samples were used before and after the change. RMSE is calculated on observed samples only and must be read with coverage.

| Display | Observed coverage, full excerpt | RMSE before → after, µV | Seizure coverage | Seizure RMSE before → after, µV |
| --- | ---: | ---: | ---: | ---: |
| Isolated F7-T7, 2 µV/pixel | 100.0% → 100.0% | 5.701 → 5.004 | 100.0% → 100.0% | 8.097 → 7.046 |
| 18 channels, 2 µV/pixel | 31.45% → 31.45% | 28.554 → 28.549 | 11.87% → 11.87% | 55.095 → 55.091 |
| 18 channels, 6 µV/pixel | 79.88% → 79.88% | 15.472 → 15.175 | 60.31% → 60.31% | 27.600 → 27.313 |

Every output timestamp, observed/repaired/missing mask, and feature-valid interval is identical to the baseline, compared sample by sample. No newly accepted data account for the lower voltage error. The isolated full-excerpt correlation increases from 0.99536 to 0.99643. The crowded 2 µV/pixel case has essentially unchanged pooled error, and its median per-channel seizure correlation decreases slightly from 0.37365 to 0.36924; this is not evidence of improved identity tracking. At that setting, no seizure channel-time is credited as feature-valid. At 6 µV/pixel, that fraction remains 11.32%.

Machine-readable before/after values, per-channel results, source hashes and timeline audits are in `chbmit-fidelity-2026-09-15.json`.

## Checks and rejected approach

- All **156 tests passed**, including the existing signal, capture, OCR, audio, continuity, storage and offline-startup tests. Four new tests cover calibrated subpixel amplitude/polarity, preserved blank gaps, recent missingness accounting, duplicate fragments, stale data and inspector auto-fit.
- Module syntax, UI reference checks and the application network-API audit passed. These do not constitute a browser interaction or workstation test.
- All three final replays have 221 status frames, 629 saved worker messages, no worker errors, no duplicate output columns and no timestamp drift. All final logs are checked after writing; partial log files are not scored.
- The EDF matches its published SHA-256, and independent digital/physical decoding agrees with pyedflib to floating-point precision.
- An initial variant used the new stroke center for tracking seeds and clipping too. It changed which crowded samples were accepted, with mixed results. That variant was discarded. The selected implementation isolates amplitude measurement from path-selection geometry.

## What remains

This is one recording, one annotated seizure and a controlled lossless renderer. It cannot establish population performance or live clinical capture quality. Real workstation capture, OCR/crop mistakes, codecs, timing jitter, audible output and listener usefulness remain untested here. Observed ink can still belong to the wrong waveform at ambiguous overlaps. No diagnostic threshold, seizure detector or new clinical claim was added.

The source is CHB-MIT `chb01_03.edf`, scored at [2960, 3070) s, with supplied seizure annotation [2996, 3036) s. “Before” and “after” refer only to that annotation; they do not mean normal or artifact-free EEG. The 256-Hz source is rendered across 180 columns per second, so error includes rasterization and reconstruction rather than a full-rate EDF round trip.

Source: Guttag, J. (2010), [CHB-MIT Scalp EEG Database v1.0.0](https://physionet.org/content/chbmit/1.0.0/), PhysioNet, [doi:10.13026/C2K01R](https://doi.org/10.13026/C2K01R). [Supplied annotation](https://physionet.org/content/chbmit/1.0.0/chb01/chb01-summary.txt). See the benchmark README for data attribution and reproduction steps.
