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
| Frequency color | Delta 0.5–4, theta 4–8, alpha 8–13, beta 13–30, and 30–45 Hz | Separate translucent layers; select one band to avoid color overlap |
| Historical radius | Age of the interval, recent near the head and older outward | Nonlinear time lens; numeric times remain available |
| Side-profile position | The same age coordinate along one spatial axis | Rotating this axis does not change measurements |
| Peak statistic | Maximum band power retained across constituent analysis windows | Can highlight a brief excursion; does not imply persistence |
| Prevalence statistic | Time represented by valid windows meeting the selected band RMS criterion / valid represented time | A descriptive threshold, not an event classifier |
| Empty markers / missing surface | Unavailable, unseen or incompatible measurements | Not evidence of electrical silence |
| Hatching | Band intersected by a known filter cutoff or the display's effective Nyquist limit | Filtering is disclosed, not inverted |

The software fallback keeps rotatable projected surfaces, channel selection and time navigation, but shows one dominant band per interval when “All layers” is selected. It has no fly-through, perspective-FOV control or filter hatching; the context panel still lists affected bands. WebGL is needed for the complete layered view. Transparency and overlap can change perceived brightness with camera position; the numeric measurements and per-band view remain stable.

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

Five pitches (98, 147, 220, 330, 494 Hz) encode the five spectral bands. These are display tones, not accelerated raw EEG. Tone amplitude follows square root band power, with a capped master gain and a limiter. Left/right placement follows electrode coordinates rather than camera rotation. Channel and band selection use the same frame as the visual metrics; frozen views mute. Each update expires after 1.2 seconds to prevent stale measurements sustaining a tone after a stalled capture.

## Privacy and hosting boundary

There is no application API, patient upload, cloud OCR, analytics SDK or external asset CDN. OCR's worker, core and model paths are explicitly same-origin. Arbitrary OCR text is reduced immediately to whitelisted electrode/settings fields; it is not persisted. Optional IndexedDB storage contains quantitative physiology, time and recording context and should still be treated as sensitive local data. It is not anonymized merely because names are absent.

The page's Content Security Policy restricts connections to its own origin, with no reporting endpoint. The static `_headers` example additionally applies policy to worker resources on hosts that support that format. Verify equivalent response headers and actual network traffic on the chosen host. A trusted host, delivered code, browser and device remain part of the boundary; a meta policy is not a general privacy certification. Browser capture remains explicitly permissioned and policy-controlled. [W3C screen-capture specification](https://www.w3.org/TR/screen-capture/).

The code retains no screen images after processing, apart from the transient setup preview and current local capture/OCR buffers. No original waveform archive is created. Existing Python capture/raw-file experiments are separate and are not loaded by the new browser entry point.
