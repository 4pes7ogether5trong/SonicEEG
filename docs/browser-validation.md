# Validation and comparison protocol

## Checks completed for this revision

`npm test` exercises 47 tests with Node's test runner, generated image fixtures, local Tesseract OCR, fake IndexedDB and an AudioContext scheduling double. These are code-level checks, not browser interaction or physical listening tests. The timing/settings refinement adds three regressions to the 44-test ambient revision: observed train onset and the continuous ten-second emphasis curve, confirmed-setting comparisons through OCR dropout, and filter-only value validation.

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
| Patient identity | Twenty carrier frequencies retain the same band intervals across four nonoverlapping octave ranges |
| Audio amplitude | Doubling voltage doubles gain below the cap; focal maximum retains a strong isolated contribution; missing/derived rows do not invent or duplicate audio |
| Audio lifecycle | Duplicate/old intervals cannot refresh stale state; controls preserve the acquisition expiry deadline; gaps and stopping one patient leave others active |
| Synthetic four-stream exercise | Only the programmed patients show the selected band increase, including two simultaneous targets; exact/partial/early responses are scored distinctly |
| Synthetic sharp morphology | The 84-second example yields 26, 24, 60 and 27 candidate clusters in A–D; measured repetition rates approximate the programmed 1.25/s left, 1/s bilateral, 3/s bilateral and 1.5/s right sequences |
| Shape availability and deduplication | Missing/undersampled displays are unavailable; 128/256 Hz fixtures agree on 1/s repetition; overlapping windows and bilateral rows create one accent per complex |
| Persistence and reference | Isolated cues are immediate, sustained activity grows, recurrence stays bounded, quiet intervals release; fixed references retain sensitivity to increased and attenuated amplitude |
| Context and gaps | Gaps clear persistence; a changed setting/segment invalidates the pinned reference even if a gap cleared temporal context |
| Audio scheduling from morphology | The synthetic waveform→features→actual mixer path schedules 26 A accents without receiving script labels; stronger persistence increases accent gain; gaps cancel pending data notes without stopping B |
| Output and exercise setup | Four distinct harmonic profiles, higher calibrated pre-limiter gain and bounded transfer; patient/master levels survive exercise preparation, zero-gain and suspended output cannot pass readiness |
| Revised listening clips | All eight actual trial seeds produce candidate activity only in the programmed targets, no pre-onset emphasis, and no emphasis in active nontargets |

`npm run check` checks module syntax, literal DOM references, duplicate element IDs, expected CSP, and unexpected application-owned network APIs/endpoints. It is a static audit, not an observed network-traffic test.

`npm run build` creates the static distribution with local OCR resources. The earlier Python MVP's 11 unit tests passed in the preceding revision; that code is unchanged and was not rerun for this audio-only revision. The generated OCR fixture is a white 210 × 440 image containing eight synthetic channel names in DejaVu Sans; it contains no patient data.

## Acceptance work still required

No vendor-display, browser-interaction, WebGL/software visual inspection, physical-audio, sustained multi-day, clinical sensitivity or specificity validation was performed for this ambient revision. The user reported hearing the previous build over a phone, with insufficient volume and unclear patient identity; those observations motivated this change but do not validate the new output. The 3D interpolation, shape descriptors and sound mappings are engineering proposals. A scheduling double does not render or listen to actual browser audio. Build success does not establish perceptual usefulness, artifact rejection or diagnostic accuracy.

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

Verify actual rotation, cutaway, all-band and isolated-band rendering, keyboard/fly controls, freeze/follow, saved-history retrieval and the software fallback. Check that camera changes preserve numeric values and that overlap does not mislead readers about prevalence. Listen on physical stereo devices: view freeze, time selection, visual band/channel selection and 3D-off must leave live sound running. Gaps, stale data, permission revocation and source replacement must silence only the affected patient. Master mute must leave acquisition running. Opening a saved session stops its own slot, not the other patients.

### Four-patient listening exercise

The audio-only exercise contains eight fixed 30-second trials: two with one patient, two with two patients and four with four patients, including two simultaneous-target trials. A sequential A→B→C→D reference check and explicit comfortable-audibility confirmation precede trial start. Opening the exercise unmutes the slots, clears focus and selects all bands plus emphasis, but preserves patient gains and master level. Patient gains can be calibrated before a clip; during listening they are locked. Master volume always remains adjustable; changing it during a clip marks that attempt unscored and retains the new setting for a retry.

Each clip has a nominal morphology onset at 8 seconds; an isolated sharp complex occupies the 8–8.8-second segment, while repeating complexes continue until 24 seconds. The rest is quiet background and release. Synthesized sharp components are 170 µV before montage-dependent spatial differences, with an opposite-polarity afterwave. Location is generated as differences of a schematic electrode field. It does not reproduce real clinical recordings, propagation, electrode artifacts or validated LPD/GPD/spike-wave morphology. Realistic filtering and artifact comparisons are acceptance work, not evidence supplied by this fixture.

Actual audible changes reflect window availability, half-second updates, accent scheduling and the output device. Exported response times are measured from nominal source onset, not calibrated auditory onset. Fixed order and replay make this suitable for learning and initial feasibility only, not an unbiased comparative study. Programmed labels, live pattern metrics, level bars and the 3D view are hidden during listening. Capture controls are locked and no attached real capture may be replaced by the exercise. An unheard clip, output interruption, Stop, tab hiding or in-clip master change does not count as a missed patient selection; it remains the same trial for retry. Exports (`soniceeg-ambient-v2`) include output settings, synthetic seeds, targets, timing and unscored-attempt reasons, with no patient identifiers.

### Guided ambient demonstration

The one-button 84-second demonstration explicitly starts audio and four synthetic sources. At six seconds it pins the known quiet reference. A has one isolated left transient at eight seconds and 1.25/s left complexes from 16–36 seconds. B has 1/s bilateral complexes from 27–51 seconds. C has 3/s bilateral spike-and-slow-wave-like complexes from 43–63 seconds. D has short right-sided bursts at 13, 24, 35 and 59 seconds, followed by sustained 1.5/s right complexes from 66–76 seconds. All return to background for the final eight seconds; sound stops with the sources at the end. The cards expose programmed labels separately from measured descriptors. Labels never enter the signal-to-audio mapping.

For Tuesday's hands-on check: begin with low device volume because output scaling increased, play the guided demo, then complete the reference check and eight listening trials. Check whether A's single transient remains noticeable, whether repeated activity gains prominence without becoming harsh, and whether D's brief recurrences differ from continuous activity. Repeat on the phone/mono speaker and on a stereo device at comfortable levels; note ambiguous voices, inaudible accents, perceived mix ducking and fatigue rather than compensating only with maximum volume. Then select and freeze another patient's visual history while listening. Next use a known deidentified source in one vendor window and verify calibration, montage and capture continuity; expand to two then four windows only after that source is reconstructed faithfully. Include attenuation, muscle/line artifact, electrode pops and filtering changes in follow-up fixtures. Pleasant harmony alone is not evidence that independent patients can be tracked.

Use the browser network inspector on the deployed host: startup should request static application/OCR assets; capture should cause no image, label, feature or patient-bearing upload. Repeat through OCR startup, errors, saved-session use and source changes. Inspect worker response policies as well as the page meta policy. Test quota failure and session deletion on actual IndexedDB implementations.

Run a sustained capture with a known timebase before claiming hours/day support. Measure capture coverage, memory, IndexedDB growth, tab throttling and recovery behavior. Quantitative history spans the captured record, but fine detail is limited by local storage and source visibility.
