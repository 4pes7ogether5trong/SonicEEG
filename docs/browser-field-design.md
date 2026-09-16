# Browser field: implementation decisions

## What changed after reflection

The water-orb idea is useful when its light and shape have stable meanings. This implementation uses a continuous scalp-shaped measurement surface and accumulated temporal shells, rather than particle attraction or a free-running fluid simulation. It reuses the useful interaction ideas from ScaleSpaceSynth: orbiting, approaching, entering, lensing and expanding a dense scene. It does not reuse particle “coherence” as an EEG measurement.

Several boundaries are now explicit:

1. **A displayed channel is a voltage difference.** A bipolar row is not an absolute electrode voltage. Signed displacement uses opposing endpoint kernels; its spectral amplitude is illustrated around both endpoints. A connected surface does not establish physiological connectivity or a cortical source.
2. **Expected is not observed.** Standard montages can suggest an unseen row, but cannot establish that the electrode was acquired or recover its signal. Labels, reference identity and timing govern what can be derived.
3. **Pixels are a limited observation.** Calibration provides units for the displayed trace. It does not restore clipped excursions, overlapped traces, samples hidden behind a dialog, unseen channels or filtered-out content.
4. **A lens expands the presentation.** It does not add spatial resolution to a sparse electrode array or reconstruct detail already discarded by screen rendering or history compression.
5. **Brightness needs multiple history statistics.** Mean power reveals sustained activity, peak power preserves short excursions, and threshold prevalence separates how large a feature became from how often it occurred.

The ACNS guideline index identifies separate guidance on electrode nomenclature, montage proposals, recording requirements and digital media. The templates here cover common arrangements; they are not a complete implementation or certification of those guidelines. Legacy T3/T4/T5/T6 labels are mapped to T7/T8/P7/P8, while reference identities remain distinct. [ACNS guidelines](https://www.acns.org/practice/guidelines), [electrode nomenclature paper](https://pubmed.ncbi.nlm.nih.gov/27482794/).

## Visual grammar

| Visual property | Implemented meaning | Interpretation boundary |
| --- | --- | --- |
| Position on the head | Schematic electrode or derivation support | Sensor space; not an anatomical source solution |
| Signed radial displacement | Newest reconstructed sample relative to the two-second mean, with opposing kernels for a bipolar pair | Updates with quantitative frames; does not replay every EEG cycle |
| Light intensity | Log-compressed square root of absolute band power | A fixed adjustable µV ruler; not per-channel normalization |
| Frequency color | Delta 0.5–4, theta 4–8, alpha 8–13, beta 13–30, and 30–45 Hz | Strongest-band surface plus five distinct amplitude bars per channel; band selection isolates its spatial pattern |
| Historical radius | Age of the interval, recent near the head and older outward | Nonlinear time lens; numeric times remain available |
| Side-profile position | The same age coordinate along one spatial axis | Rotating this axis does not change measurements |
| Peak statistic | Maximum band power retained across constituent analysis windows | Can highlight a brief excursion; does not imply persistence |
| Prevalence statistic | Time represented by valid windows meeting the selected band RMS criterion / valid represented time | A descriptive threshold, not an event classifier |
| Empty markers / missing surface | Unavailable, unseen or incompatible measurements | Not evidence of electrical silence |
| Hatching | Band intersected by a known filter cutoff or the display's effective Nyquist limit | Filtering is disclosed, not inverted |

The software fallback keeps rotatable projected surfaces, channel selection through the dropdown and time navigation, including all five channel band bars. It has no fly-through, perspective-FOV control or filter hatching; the context panel still lists affected bands. Concentric history transparency can change perceived brightness with camera position; numeric measurements and isolated band views remain stable. See [field detail](field-detail.md) for the current time ruler, sharp-candidate markers and four-patient layout.

Live geometry settles toward each new measured state over roughly 150 ms. There is no oscillation or propagation added between updates. Reduced-motion preference disables this interpolation. A display refresh is a presentation update, not a reconstructed physiological event.

## Screen reconstruction and calibration

The application requests a native browser display-capture stream, without audio capture. The operator selects separate normalized rectangles for waveforms, labels and settings. Only those rectangles enter extraction or OCR. Initial setup temporarily previews the selected window locally; it can contain identifiers until regions are selected. The preview is cleared when setup closes or capture stops.

For a waveform region of width `W` captured pixels and confirmed duration `T` seconds:

\[
f_{display}=W/T,\qquad V(x)=s\,(y(x)-y_0)\,k
\]

Here `k` is µV per captured vertical pixel and `s` follows the confirmed negative-up/down convention. A visible calibration bar gives `k = bar µV / bar pixel height`. Screen millimeters and captured pixels are not interchangeable.

The path extractor uses brightness/color evidence, discounts horizontal grid lines, and finds a continuity-penalized path within each separated row. Its linear-time distance transform permits sharp vertical transitions instead of imposing an arbitrary maximum slope. Low pixel support and boundary clipping invalidate the row. A pixel mask carries missing samples into the spectral calculation; missing samples are not silently bridged.

The row baseline is taken from OCR label height plus an editable offset, or uniform row spacing for manual labels. This is a confirmed geometric assumption. Unusual label placement, unequal manual row spacing, very low contrast, black backgrounds, annotations, ECG rows, duplicate rows and overlapping large excursions require layout-specific work. The current extractor is primarily designed for dark or colored traces on a light background.

Scrolling is reconstructed by matching successive trace images and appending only new columns. Repeated images do not accumulate data. Ambiguous matching, large capture delays and missing sweep cursors create explicit gaps. Swept-page wraps are conservatively marked as gaps. This version does not recover a full window of earlier data at capture start and does not use vendor timestamps. Its time axis is reconstructed elapsed capture time. Changing speed or sweeping style requires review.

Label/settings OCR runs locally. Narrow glyph repairs such as `F7-17` → proposed `F7-T7` and `P7-01` → proposed `P7-O1` are flagged for confirmation, not applied to authoritative channel text. A small clean synthetic label fixture exercises this path; it does not establish OCR reliability on vendor fonts.

## Montage graph

Let each observed row be an oriented edge:

\[
d_{AB}(t)=V_A(t)-V_B(t).
\]

A missing difference is recoverable only when a valid aligned path exists:

\[
d_{AC}(t)=d_{AB}(t)+d_{BC}(t).
\]

The implementation rejects disconnected paths, inconsistent sample lengths, differing frame starts, rates or recording segments. `REF`, `AVG`, ear references and other reference labels are not interchangeable. Expected channels are proposed only for a uniquely best supported template with at least four rows and at least 90% agreement. A partial template match is still a hypothesis about omitted derivations, not proof of hidden acquisition.

All rows in a confirmed capture currently share the entered display settings. Per-row filtering, gain, timing or reference changes are unsupported; do not use such a layout with this configuration. A montage/filter/layout review begins a new segment. A compressed bin spanning segments is marked incompatible rather than rendering their average as continuous physiology.

## Quantitative calculations

Two-second windows advance after at least 0.5 seconds of new reconstructed samples. The mean is removed, a Hann window is applied, and an FFT is zero-padded to a power of two. The one-sided periodogram is:

\[
PSD[k]=\frac{c_k|FFT(w(x-\bar x))[k]|^2}{f_{display}\sum_n w[n]^2},
\]

with `c = 2` except at DC and Nyquist, where it is 1. Band power sums `PSD[k] × Δf`, producing displayed µV²; band RMS is its square root. Zero padding changes the sampled frequency grid, not the intrinsic resolution of a two-second observation. Bins are assigned to half-open frequency bands, with 45 Hz included in the final band. Nyquist and cutoff flags disclose incomplete/affected bands; no filter-response correction is attempted without a known transfer function. [SciPy periodogram definition and units](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.periodogram.html).

For a scalp vertex and band, the field uses normalized angular Gaussian weights. A bipolar edge contributes unsigned power near both endpoints and opposing signed weights. Its amplitude transfer is:

\[
L_b=\operatorname{clip}_{0,1}\left(2\log\left(1+\frac{\sqrt{\bar P_b}}{A_{ruler}}\right)\right).
\]

The signed displacement is clipped to ±0.16 head radii. Saturated light or displacement does not cap the stored numerical measurement. Power interpolation between derivations is illustrative; it is not a cross-spectrum or an inverse solution.

The earlier proposed harmonic term `-γ |f - 2r_previous|` is not used: subtracting that distance would favor proximity to the doubled frequency, rather than penalize a harmonic switch. A future ridge tracker needs a defined transition model and independent validation. This build does not claim ridge tracking, seizure detection, coherence, pain, emotion, sleep-stage or suppression classification.

## History and prevalence

Each feature frame owns a non-overlapping represented interval even though the analysis windows overlap. Compression combines valid-time-weighted band power, RMS second moments, minimum/maximum samples, maximum band powers, amplitude histograms, valid seconds and explicit gaps. Histograms use band RMS edges of 5, 10, 20, 40, 80, 160 and 320 µV. They permit changing the prevalence criterion after compression without pretending that a bin's average was present throughout it.

\[
Occupancy_b(\theta)=\frac{\sum_i \Delta t_i\,1[valid_i]\,1[\sqrt{P_{b,i}}\ge\theta]}{\sum_i \Delta t_i\,1[valid_i]}.
\]

This is occupancy of a window-based amplitude condition, not exact sample-level event duration. Gaps and invalid windows do not enter its denominator. A rare excursion can therefore be bright in peak mode and occupy a small fraction in prevalence mode.

Memory levels compact pairs after 160 frames per level; there is no fixed 20-second expiry. The overview reduces the retained bins to at most 16 surfaces. It retains the entire captured time extent but not every old instantaneous state. In memory-only mode, discarded fine detail cannot be recovered. Opt-in IndexedDB keeps the original quantitative frames; selecting time retrieves a ±10-second neighborhood for more detailed viewing. The field remains an aggregate when a requested interval is already compressed.

Local saved-frame storage grows with recording duration and channel count. Quota failures stop saving with a visible message while memory history continues. Multi-day capture requires an endurance/storage evaluation; this revision does not claim unlimited retention, automatic eviction, resumable capture across page reloads, or guaranteed background acquisition. Mixed-setting bins may become unavailable in a coarse view; inspect saved frames to separate the contexts.

## Sound

Patient slots A–D use octaves 3–6 respectively. Delta, theta, alpha, beta and 30–45 Hz use C, D, E, G and A within each patient's octave: `f(slot, band) = 130.8127826502993 × 2^(slot + semitones[band]/12)`, with semitones `[0, 2, 4, 7, 9]`. These are spectral display tones, not accelerated raw EEG; within-band frequency evolution is not encoded as pitch in this MVP. The ambient revision gives each patient a distinct harmonic profile, used consistently for background, accents and Identify:

| Patient | Voice | Relative harmonic coefficients before energy normalization |
| --- | --- | --- |
| A | Velvet | 1, 0.65, 0.18, 0.06 |
| B | Hollow | 1, 0, 0.65, 0, 0.20 |
| C | Reed | 1, 0.60, 0.42, 0.28, 0.14 |
| D | Glass | 1, 0.10, 0.04, 0.25 |

Partials are normalized by their Euclidean norm, not by each patient's EEG amplitude. A gently filtered, data-driven background supplies the atmospheric texture; no fake beat, random hiss, independent tremolo or music loop is added. Octave/pentatonic harmony and different timbres do not establish perceptual separability or equal perceived loudness. Mono phone output loses stereo location, and small speakers can attenuate low carriers. Physical listening evaluation remains necessary.

Each band has left and right voices. Side follows the first electrode of the displayed derivation, with midline contributions on both sides. The default takes the maximum observed band power on each side so a focal contribution is not averaged away; the optional mean averages observed power before taking its square root. Derived and expected channels are excluded from sound to avoid double-counting. This is montage-dependent sensor-space illustration, not source localization. Filter-affected bands remain displayed and audible as measured; settings are disclosed, not inverted.

Base per-voice gain is now `0.10 × min(2, band RMS / 40 µV)` before emphasis, patient gain (0–1.5), focus attenuation (0.25 for other patients) and master gain (0–0.8, default 0.28). This fixes the earlier low scaling of 0.018, but does not claim a measured phone loudness improvement. Start with low device volume after updating. There is no per-patient EEG peak normalization. A master dynamics compressor and bounded wave-shaping transfer (`0.95 tanh(x/0.95)` sampled over −1 to 1) constrain the digital mix; neither calibrates acoustic SPL or guarantees comfortable volume. Compression of a strong voice can affect the whole mix. Patient gain changes intentionally alter relative audible amplitude and remain visible. The exercise preserves both master volume and all four patient gains.

### Shape, repetition and bounded emphasis

`patterns.js` adds engineering descriptors, not an ACNS-defined spike, periodic-discharge, seizure or abnormality classifier. On each valid observed two-second waveform window, a candidate must exceed `max(16 µV, 2.8 × 1.4826 × MAD)` around the median. Its measured half-height width must be 12–90 ms, and its approximately ±16 ms curvature must exceed 0.75 times peak magnitude. A 120 ms within-channel exclusion interval prevents immediate duplicates. An opposite-polarity tail from 40 to 220 ms gives a bounded afterwave descriptor. These heuristic constants are explicit starting points, not validated diagnostic thresholds. The descriptor requires at least 100 displayed samples/s, and rejects windows with missing samples. Pixel sampling is not the original acquisition rate. Filters, reference, artifacts and trace reconstruction can change the apparent shape; no lost content is reconstructed.

Overlapping windows are deduplicated by channel/time, and near-synchronous observed channels are clustered within 70 ms (90 ms cross-window exclusion). A cluster creates one immediate accent, panned using observed first-electrode sides, rather than a separate beat per channel. Only new events in the latest 700 ms can schedule an accent. Detection and playback are delayed by window availability, half-second acquisition updates and audio scheduling; this is not sample-synchronous raw sonification. Afterwave strength gently extends the accent. Derived/expected channels never create additional cues.

The tracker retains 12 seconds of candidate times. Three recent events can establish repetition; an expired train or a gap over 3 seconds starts a new sequence. Median inter-event spacing supplies a descriptive repetition rate and a separate regularity value. Sharp-pattern duration spans the first through latest observed candidate in the ongoing train, retaining its onset when short history compacts. It does not start at the third candidate or advance merely while waiting for another cycle. Spectral-deviation duration is tracked separately from its first qualifying represented interval; the maximum of the two drives emphasis. Neither is an ACNS evolution or seizure-duration measurement.

Ten seconds is an engineering attention landmark. Desired emphasis is `0.35 × min(duration/10, 1) + 0.45 × (1 − exp(−max(duration−10,0)/6)) + 0.2 × recurrence`, capped to [0,1]. This gives modest early emphasis and a stronger increase beyond ten seconds without a discontinuity. Recurrence memory rises with a 10-second constant and decays with an 18-second constant; emphasis has a 6-second release. A single transient still gets an immediate accent. Expired trains cannot be joined into continuous duration; recent recurrence remains a separate contribution. Irregular candidates, normal state changes and artifacts can also contribute, so the sound is an experimental attention aid, not a diagnostic event label.

The display watcher compares OCR with confirmed settings, never silently replacing its reference with a new or unreadable result. Known fields becoming unreadable and newly recognized differences request review. A filter-only change can be confirmed through **Filters changed**, preserving the crop, row mapping and calibration after the operator verifies that timebase, sensitivity, montage, polarity and geometry are unchanged. Resume starts a new segment, clears the old comparison baseline/persistence and retains a marked gap. Layout/scale mismatches require full setup. Only the affected patient's capture/audio pauses. The last five seconds are conservatively marked uncertain; OCR checks remain periodic and cannot guarantee exact transition timing. Manual confirmation is still necessary for unreadable settings. Late worker/OCR replies from a suspended configuration are ignored.

Only settings readable at confirmation enter the automatic watch reference. A manually entered field that OCR has never read does not repeatedly stop capture; the interface explicitly lists automatic coverage and requests manual confirmation for the remainder. A previously readable field becoming unreadable still requests review. Quick filter confirmation does not silently promote manually supplied values into machine-readable coverage.

With emphasis enabled, bed gain is multiplied by `1 + 1.5 × emphasis`; its low-pass cutoff opens from `650 × 2^slot` Hz by up to a factor of three. A separate held E voice grows to gain 0.06 to make sustained attenuation audible as a change too. That voice explicitly encodes emphasis, not alpha power. Measured sharp accents bypass the bed low-pass and use gain `0.16 × min(1.5, amplitude/80 µV) × (1 + emphasis)` before patient/master levels. Turning emphasis off removes both accents and the held emphasis tone, retaining the band-power bed. Audible-band selection affects that bed only; emphasis still uses all observed bands and sharp candidates.

An operator can pin the latest valid two-second band-RMS frame as a fixed reference after confirming an appropriate clean interval in the source application. For each observed channel/band, the deviation is `clip((abs(log2((RMS + 2)/(reference RMS + 2))) − 0.65)/1.5, 0, 1)`, with the maximum driving the tracker and an engineering threshold of 0.35 for sustained change. This treats attenuation and increase symmetrically and never rolls toward the new pattern. It is not a normative baseline, robust multi-epoch reference or abnormality score. Real capture has no automatic baseline selection. Source/context changes clear the reference; gaps reset persistence while retaining only a same-context reference. The synthetic demo pins its explicitly known quiet interval at six seconds.

Sharp descriptors are attached to fine quantitative frames; current history compaction does not summarize sharp-event burden. The existing visual prevalence remains its amplitude-threshold statistic. The cards expose live emphasis, persistence, candidate repetition and sensor-side extent separately from programmed synthetic labels. No automatic diagnostic labels are rendered.

One mixer owns the AudioContext, 40 band oscillators and four held emphasis oscillators. Transient oscillators stop and disconnect after their envelopes. Four patient controllers own independent capture/OCR workers, history, calibration, operation guards and save-session IDs. Only newly accepted acquisition frames call the mixer. Duplicate/older intervals, screen gaps and source replacement cannot extend audio freshness. A 2.5-second expiry is scheduled on the audio clock, followed by a short release and zero at 2.8 seconds, so a stalled UI cannot sustain an old tone indefinitely. Gaps cancel pending data accents and reset persistence. A fixed, descending two-note technical cue occurs once per outage/review transition, not for normal Stop. It is not an EEG event and cannot sound while the browser AudioContext is suspended. Recovery cancels any pending technical notes. The state distinguishes live, waiting, invalid signal, stale, stopped, review-needed and muted.

Selecting a different visual patient, viewing history, selecting visual channels/bands or freezing the image never changes live sound. Audible-band filtering is a separate mixer control. Focus lowers other patients by 12 dB; mute is explicit. Disabling 3D stops rendering while acquisition/audio continue. Historical sonification is deferred, so an old record cannot accidentally be heard as live EEG. Identify is an explicit brief E reference voice, not a measurement or alarm. It bypasses patient gain/mute and respects master volume. The exercise's A→B→C→D sound check requires explicit confirmation of comfortable audibility before trial start.

Separate getDisplayMedia selections support at most four windows. This is a product scope limit, not a statement of universal staffing law. Keep the browser active for this first version: capture/timer throttling, device locking and AudioContext suspension can interrupt monitoring. Stale audio fades; persistent background monitoring and four simultaneous vendor captures still need device-level evaluation.

## Privacy and hosting boundary

There is no application API, patient upload, cloud OCR, analytics SDK or external asset CDN. OCR's worker, core and model paths are explicitly same-origin. Arbitrary OCR text is reduced immediately to whitelisted electrode/settings fields; it is not persisted. Optional IndexedDB storage contains quantitative physiology, time and recording context and should still be treated as sensitive local data. It is not anonymized merely because names are absent.

The page's Content Security Policy restricts connections to its own origin, with no reporting endpoint. The static `_headers` example additionally applies policy to worker resources on hosts that support that format. Verify equivalent response headers and actual network traffic on the chosen host. A trusted host, delivered code, browser and device remain part of the boundary; a meta policy is not a general privacy certification. Browser capture remains explicitly permissioned and policy-controlled. [W3C screen-capture specification](https://www.w3.org/TR/screen-capture/).

The code retains no screen images after processing, apart from the transient setup preview and current local capture/OCR buffers. No original waveform archive is created. Existing Python capture/raw-file experiments are separate and are not loaded by the new browser entry point.
