# EEG Review 0.1

A browser-local EEG viewer for tablet review. This independent `eeg-review/` app does not alter SonicEEG's existing visualizer or deployment.

## Use
Open the deployed page in Safari, choose Open recording, and select local files. Landscape is recommended. Safari's Share → Add to Home Screen provides a shortcut; offline installation is not implemented.

The demo is entirely synthetic. Loaded recordings remain in browser memory. There are no file uploads, analytics, or backend patient-data stores. The app shell is public; selected files are not shared. Browser storage holds only custom montage definitions. Bookmarks are session-only and can be exported locally.

## Implemented
- EDF and continuous EDF+C; signed 16-bit, physical/digital calibration, per-channel sampling frequencies, fractional record lengths and start-time offsets, loaded-record annotations.
- BioSemi BDF and continuous BDF+C; signed 24-bit voltage samples. Status/trigger bit decoding is not implemented.
- BrainVision continuous multiplexed binary INT_16 or IEEE_FLOAT_32, with .vhdr, .eeg/.dat, and optional .vmrk. Header sample interval and channel resolution are honored. Multiple New Segment markers are rejected. Missing markers produce a continuity warning.
- Plain CSV/TSV, first-row channel headers, optional first time_s column, explicit sample rate and voltage units. Regular timing validated; 20 MB limit.
- Longitudinal bipolar (18 traces), transverse bipolar (14), available-scalp average reference, averaged A1/A2, Cz, as-recorded, and custom layouts (up to 64 rows).
- Legacy T3/T4/T5/T6 aliases, manual 10–20 electrode mapping, exact average-reference membership.
- 5/10/15/30-second pages, waveform cursor, polarity, amplitude scales, page arrows and swipe gesture, timeline, go-to time, optional display filters, bookmarks and notes export.
- At most 32 displayed traces per group, selected-window reads bounded to 64 MB and 4 million decoded samples. No entire binary recording is loaded into memory.

## Deliberate constraints
Native Natus, Nihon Kohden, Cadwell, EEGLAB .set, MNE .fif, XDF, NWB, CNT, discontinuous EDF+D/BDF+D, BrainVision vectorized/big-endian/averaged/segmented data are not implemented. EDF or supported BrainVision exports are required.
Unknown acquisition references require explicit confirmation before subtraction. Known unequal references or unequal sample rates are blocked. No resampling, inferred electrodes, or recovered signals from incompatible bipolar data. Duplicate electrode mappings are unavailable until resolved.
EDF+ annotation events are drawn from loaded data records; this is not a complete recording-wide annotation index.
Amplitude uses µV per vertical channel division and an explicit scale bar; it does not assume CSS pixels equal physical millimeters. Negative voltage plots upward by default.
Filters: second-order causal Butterworth high/low-pass and Q=30 notch; 8/highpass seconds (at least 5 seconds) of preceding data, or 5 seconds for low-pass/notch only. They are phase shifting; recording-start transients are possible and disclosed. Stored samples are unchanged. Acquisition filters cannot be undone.
BrainVision ANSI encoding is not supported explicitly; UTF-8 headers/markers are expected. Non-voltage auxiliary signals remain in details and are not plotted.

## Validation
20 automated tests pass for binary parsing, calibration, annotation timing, montage/reference handling, CSV integrity and filters, including 16/24-bit extrema, malformed/truncated data, discontinuous timing, float32, marker indexing, and display-filter attenuation.
12 application smoke checks pass using a minimal DOM/canvas harness. The same 20 core tests and 10 end-to-end browser checks also pass in remote Chromium at 1194 × 834 with touch enabled, including a real local File import, montage controls, native dialogs, custom layout persistence, and no horizontal document overflow. The rendered demo was visually inspected. This is not Safari or physical iPad acceptance.
No real acquisition-file comparison, physical iPad/Safari acceptance, clinical validation, or complete large-recording benchmark has been performed. This is an evaluation build, not a validated diagnostic workstation.

The normal workspace was unavailable at creation; code was executed in the tool runtime and preserved through GitHub APIs. Source is dependency-free and served directly.

### Reproduce core tests
```sh
node run-tests.cjs
```
No external dependencies. `core.js` exports `window.EEGCore` in browsers; the runner evaluates the exact same code in a Node VM.

## Primary specifications
- https://www.edfplus.info/specs/edf.html
- https://www.edfplus.info/specs/edfplus.html
- https://www.biosemi.com/faq/file_format.htm
- https://www.brainproducts.com/support-resources/brainvision-core-data-format-1-0/
- https://www.acns.org/UserFiles/file/EEGGuideline3Montage.pdf

Montage choices follow common clinical conventions; no certification or endorsement is claimed.
