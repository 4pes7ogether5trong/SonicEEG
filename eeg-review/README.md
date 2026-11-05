# EEG Review 0.2

An EEG review app for iPad and desktop browsers, with standard and custom montages. Live evaluation build: https://eeg-review.electro-intelligence-tools.workers.dev/

This independent `eeg-review/` application does not alter SonicEEG's existing visualizer or deployment. Vendor and open formats are equal compatibility targets; the table below distinguishes available readers from pending native integrations.

## Use on iPad

Open the app in Safari, tap **Open recording**, and select files from Files. Select companion files together. Landscape offers more tracing width. Safari's Share → Add to Home Screen provides a shortcut; offline installation is not implemented.

Tap **File compatibility** for each format's route and the local converter download. The converter requires a computer with Python 3.12; its file picker produces a `.eegreview` recording for local iPad review. See [converter/QUICKSTART.md](converter/QUICKSTART.md).

The demo is synthetic. The app has no upload endpoint, analytics, or patient-data backend. Selected recordings remain local; binary readers load selected windows. The public app shell does not share selected files. Browser storage holds custom montage definitions only. Bookmarks are session-only and export locally. Converted files may retain identifying information in labels or annotations and are not anonymized.

## File compatibility

| Family | Available route | Evidence and limits |
|---|---|---|
| EDF / EDF+C | Direct iPad import | int16 calibration, per-channel rates, TAL timing; continuous only |
| BioSemi BDF / BDF+C | Direct iPad import | signed int24 voltage calibration; status bits not decoded; continuous only |
| BrainVision | Direct `.vhdr` + data + `.vmrk` | Continuous multiplexed int16/float32; headers/markers expected UTF-8 |
| Nicolet binary export | Direct `.head` + `.data`, or converter | int16 calibration cross-checked with MNE on fixture; distinct from native NicoletOne |
| Nihon Kohden | Local converter, `.EEG` with companions | Public NK sample compared against independent EDF export; MNE-supported variants and one continuous block only |
| EEGLAB | Local converter, `.set` / `.fdt` | Embedded and external-data synthetic fixtures; continuous sets only |
| MNE FIF | Local converter, `.fif` / `.fif.gz` | Double-precision sample and annotation round-trip fixture; retain split companions |
| XDF | Local converter | One numeric EEG stream, channel labels/units, uniform timing; no clock sync or dejittering; ordinary jittered XDF can be rejected |
| NWB | Local converter | One HDF5 ElectricalSeries; calibration, offset, electrode-region order checked with fixtures |
| Persyst export | Experimental local converter, `.lay` / `.dat` | Calibration/annotation fixture passes; sequential channel map, int16/int32, no multiple SampleTimes; real export comparison pending |
| Natus Xltek / NeuroWorks | Native reader pending | Use continuous EDF or compatible Persyst export |
| Cadwell Arc / Easy III | Native reader unavailable | Requires vendor integration; use continuous EDF export |
| NicoletOne `.e` / `.one` | Native reader pending | Use supported export; not equivalent to Nicolet binary `.head` / `.data` |
| CSV / TSV | Direct import, up to 20 MB | Header row, optional `time_s`, explicit sample rate/units; validates regular timing |

Generic CNT, discontinuous EDF+D/BDF+D, BrainVision vectorized/big-endian/averaged/segmented data, epoched EEGLAB, and undocumented native variants are not implemented. A filename extension alone does not establish compatibility. Unsupported inputs return an explicit route or limitation.

## Review features

- Longitudinal bipolar (18 traces), transverse bipolar (14), available-scalp average reference, averaged A1/A2, Cz, as-recorded, and custom layouts (up to 64 rows).
- T3/T4/T5/T6 aliases, manual 10–20 mapping, exact average-reference membership, and distinct ear/mastoid identities.
- 5/10/15/30-second pages, waveform cursor, polarity, amplitude scales, page arrows/swipe, timeline, go-to time, optional display filters, bookmarks, and notes export.
- Up to 32 displayed traces per group. Selected binary reads are bounded to 64 MB and 4 million decoded values. Embedded EEGLAB/XDF conversion may load the full source on the computer.

Unknown acquisition references require confirmation before subtraction. Known unequal references or rates are blocked. No inferred electrodes, resampling, or recovery of referential signals from incompatible bipolar sources. Duplicate electrode mappings stay unavailable until resolved. Prepared files always carry unverified reference metadata.

Amplitude is µV per vertical channel division with an explicit scale bar; CSS pixels are not assumed to equal physical millimeters. Negative voltages plot upward by default. Filters are second-order causal Butterworth high/low-pass and a Q=30 notch, with preceding samples for settling (8/high-pass seconds, at least 5; 5 seconds for low-pass/notch alone). They shift phase; recording-start transients are possible. Stored samples remain unchanged and acquisition filtering cannot be undone.

EDF+ events are read from the loaded records, not from a complete recording-wide annotation index. Non-voltage signals remain in direct-reader details but are not plotted. The converter omits non-voltage/untyped channels and reports this; it retains source bad-channel flags as warnings. XDF markers from separate streams and NWB intervals/trials/events are not imported.

## Validation, 2026-11-05

- **45 JavaScript checks pass:** 20 original parser/signal checks, 13 new-reader checks, 12 application smoke checks.
- **20 Python checks pass:** FIF, EEGLAB embedded/external, XDF, NWB, Nicolet, Persyst fixtures; corruption/gap/missing-companion/non-finite safeguards; checksum and no-overwrite behavior; cross-language comparison of browser Nicolet and prepared readers against MNE.
- **50 Chromium checks pass at each of 834 × 1194 and 1194 × 834 iframe viewports:** the same 33 reader tests plus 17 application workflow checks, including real browser File objects for CSV/Nicolet/prepared imports, reference confirmation, montages, dialogs, events and overflow. Responsive layout was visually inspected. These are browser layout checks, not touch hardware or Safari tests.
- **Public Nihon Kohden comparison:** DA00100E (CC0, MNE testing data) produces 31 selected voltage channels, 1,000 samples at 500 Hz and 6 annotations. All 29 channels shared with its independent EDFbrowser export matched with maximum absolute difference **0.0 µV**. This two-second sample does not establish compatibility with other NK generations or long recordings. The fixture is not shipped in the app or repository.
- Worker asset responses, exact converter archive bytes, GET/HEAD behavior and POST rejection are checked locally.

Physical iPad/Safari acceptance, long-recording performance, broader real-vendor comparisons and clinical validation remain incomplete. This is an evaluation build, not a validated diagnostic workstation.

## Reproduce

```sh
node run-tests.cjs
python3.12 -m venv converter/.venv
converter/.venv/bin/python -m pip install -r converter/requirements.txt
converter/.venv/bin/python -m unittest discover -s converter -p test_converter.py -v
node build-worker.mjs
```

The Python suite skips the optional public NK comparison unless `NK_FIXTURES` points to the folder containing `DA00100E.EEG`, `.21E`, `.PNT`, `.LOG`, and `.EDF` from the MNE testing-data repository. It skips the cross-language check if Node is absent. No source recordings are bundled.

`build-worker.mjs` uses Python's standard ZIP library and emits `converter.zip` plus `worker.mjs`. Only the static app assets and the utility's source/docs are served. `browser-checks.js` runs in a QA copy of index.html with `tests.cjs` and `formats-tests.cjs` loaded as classic scripts before it; QA pages and fixtures are never deployed.

## Primary specifications and reader sources

- EDF / EDF+: https://www.edfplus.info/specs/edf.html and https://www.edfplus.info/specs/edfplus.html
- BioSemi BDF: https://www.biosemi.com/faq/file_format.htm
- BrainVision: https://www.brainproducts.com/support-resources/brainvision-core-data-format-1-0/
- MNE reader API: https://mne.tools/stable/api/reading_raw_data.html
- MNE Nihon sample: https://github.com/mne-tools/mne-testing-data/tree/master/NihonKohden (DA00100E license in that directory)
- XDF reader: https://github.com/xdf-modules/pyxdf
- NWB ElectricalSeries: https://pynwb.readthedocs.io/en/stable/pynwb.ecephys.html
- Persyst compatibility / OEM reader requirements: https://www.persyst.com/technology/universal-review-2/
- Montage reference: https://www.acns.org/UserFiles/file/EEGGuideline3Montage.pdf

No vendor affiliation, certification or endorsement is claimed. Converter dependencies are installed separately under their own licenses.
