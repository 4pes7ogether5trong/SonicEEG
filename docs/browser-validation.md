# Validation and comparison protocol

## Checks completed for this revision

`npm test` exercises 27 tests with Node's test runner, generated image fixtures, local Tesseract OCR and fake IndexedDB. These are code-level checks, not browser interaction tests.

| Property | Evidence |
| --- | --- |
| Voltage and power calibration | A 20 µV, 10 Hz sinusoid recovers the expected RMS and integrated power; doubling amplitude doubles RMS and quadruples power |
| Non-power-of-two windows | A 150 Hz sample rate / 300-sample window retains calibrated total power after zero padding |
| Missing and clipped samples | A missing pixel invalidates affected spectral windows; blank and boundary-clipped crops are rejected |
| Pixel extraction | Generated grayscale-grid/trace pixels recover the programmed 10 Hz rhythm with amplitude error below 2 µV |
| Polarity | Confirmed negative-up/down settings invert the reconstructed sign |
| Montage and hidden derivations | Aliases, partial longitudinal templates, common references, exact aligned graph sums and disconnected/misaligned path rejection |
| OCR | Eight generated labels are recovered in row order with explicit correction flags for ambiguous glyphs |
| Time stitching | Only new scrolling columns append; duplicates, capture gaps and sweep wraps do not invent continuous data |
| History | 5,000 represented intervals retain total duration and a single rare peak under compression |
| Prevalence | A one-interval excursion in 100 remains 1% at the selected criterion, while peak mode retains its maximum |
| Context | Incompatible recording segments do not render a combined average as valid EEG |
| Time lens and missing channels | Lens mapping is monotonic with fixed endpoints; unavailable channels contribute no surface coverage |
| Local storage | Separate sessions, interval retrieval, sequential restoration, uncertainty marking and selective deletion |

`npm run check` checks module syntax, literal DOM references, duplicate element IDs, expected CSP, and unexpected application-owned network APIs/endpoints. It is a static audit, not an observed network-traffic test.

`npm run build` creates the static distribution with local OCR resources. The earlier Python MVP's 11 unit tests also pass. The generated OCR fixture is a white 210 × 440 image containing eight synthetic channel names in DejaVu Sans; it contains no patient data.

## Acceptance work still required

No vendor-display, browser-interaction, WebGL/software visual inspection, physical-audio, sustained multi-day, clinical sensitivity or specificity validation has been completed for this browser revision. The 3D interpolation and sound mappings are engineering proposals. Build success does not establish their perceptual usefulness.

Use synthetic or appropriately deidentified recordings and capture fixtures first. Do not upload patient recordings or screenshots to GitHub, a hosted issue tracker, OCR service or model API.

### Reconstruction matrix

Evaluate Natus, Cadwell, Nihon Kohden and each additional target application separately. Record the vendor version, display scaling, resolution, time span, gain, filter settings, theme, montage and progression mode. Exercise:

1. Full and partial longitudinal/transverse montages; common-reference, ear-reference and Cz montages; legacy and current temporal labels.
2. Hidden rows, custom order, annotations, nonuniform row spacing, reference changes, per-channel gain/filter settings, clipped and crossing traces.
3. Window resize, display zoom, sensitivity/timebase/filter changes, freeze/resume, missing sweep cursor, page wrap, minimized or obscured source, app switching, capture revocation and throttling.
4. Known sine/multitone, short transients, chirps, asymmetry, attenuation, repeated bursts, muscle/line-noise-like signals and true capture gaps.

Measure row-label precision/recall, false template assertions, µV reconstruction error, spectral error, valid-time coverage, duplication/loss, change-detection delay, OCR/capture latency and processing load. Score silent mapping or scale errors separately from an explicit request for setup review. The current guided extractor should not be called vendor-compatible based on one successful screenshot.

### Visual and sound comparison

Use four conditions: the source EEG display alone; source plus field; source plus sound; source plus field and sound. The new field interface itself remains free of scrolling traces. Source EEG is available for the trained reader's final interpretation.

Start with three matched target tasks across the four conditions (12 trials per participant): localize a programmed spectral change, identify when recurrent activity became sustained, and find a brief excursion within long background. Use independent synthetic seeds matched for amplitude, location, duration and difficulty; randomize condition order and hide target descriptions while each trial runs. Do not consistently assign easier patterns to one interface.

Record chosen channel/derivation, selected onset interval, amplitude criterion, confidence, review time and whether raw-source inspection changed the conclusion. Primary exploratory outcomes are localization/time error and review time at comparable accuracy. Do not convert synthetic feasibility results into clinical diagnostic claims. A trained-reader review of realistic deidentified cases follows only after capture fidelity is established.

### Device and privacy checks

Verify actual rotation, cutaway, all-band and isolated-band rendering, keyboard/fly controls, freeze/follow, saved-history retrieval and the software fallback. Check that camera changes preserve numeric values and that overlap does not mislead readers about prevalence. Listen on physical stereo devices and confirm silence on pause, gaps, permission revocation and source replacement.

Use the browser network inspector on the deployed host: startup should request static application/OCR assets; capture should cause no image, label, feature or patient-bearing upload. Repeat through OCR startup, errors, saved-session use and source changes. Inspect worker response policies as well as the page meta policy. Test quota failure and session deletion on actual IndexedDB implementations.

Run a sustained capture with a known timebase before claiming hours/day support. Measure capture coverage, memory, IndexedDB growth, tab throttling and recovery behavior. Quantitative history spans the captured record, but fine detail is limited by local storage and source visibility.
