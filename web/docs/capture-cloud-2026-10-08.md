# Capture continuity and whole-history motion — 8 October 2026

Reference: Site source `bd609be8e839441eaa3777c5b739092480d2f7e9` (September 16 release). The GitHub Pages application's corresponding source files match this reference. Changes preserve its layout and local-only signal processing.

## Analysis corrections

- A verified retained sweep with zero missing duration no longer resets the feature buffer. An actual missing interval, including the cropped label interval, still breaks continuity.
- Evaluate at a source-sample cadence: first complete two-second window, then every approximately half second (rounded to whole samples). Input batches may be uneven or large. Every due window is evaluated; a missing sample late in a batch no longer obscures an earlier complete window from that batch.
- Timestamp gaps and channel-layout changes cannot combine unrelated input. Overlapping input is not credited again.
- Each channel reports missing fraction, longest contiguous run in its analysis window, and excessive reconstructed pixels. Incomplete-analysis feedback now identifies the reason. These are observations of extraction quality, not channel-identity confidence scores.
- The sharing request explicitly displays its pending state, prevents duplicate requests and respects cancellation. Previously it could remain labeled "Stopped" while the browser request was pending.

The two-second complete-window rule, less-than-5% raster-repair budget, crossing exclusions and voltage calibration are retained. No EEG samples are fabricated to improve availability.

## Whole-history presentation

Fluid history surfaces retain identities by their measured snapshot and recording context. Incoming/replaced surfaces crossfade over 360 ms; retained GPU surfaces ease to their new temporal radius. This avoids abruptly assigning a different historical waveform to a reused mesh index. Retired surfaces are reused in a bounded pool.

The software renderer crossfades two cached scene images between measurements. Intermediate redraws composite pixels rather than recomputing every surface. Geometry directions and sampled waveform fields are cached; missing-region checks still use the current frame. A visible-only 40 ms timer fallback supports software/remote compositors that deliver animation callbacks slowly. Normal animation callbacks cancel the fallback. Freeze, reduced-motion preference, changed settings, changed availability and source discontinuities bypass blending. Camera interaction cancels a pending transition.

These are presentation transitions between measured snapshots, not extra EEG, interpolated signal, improved source localization or inter-channel coherence. Historical surfaces remain representative retained windows; compressed history is not a continuous raw EEG recording.

## Repeated CHB-MIT experiment

Recovered the previously saved `chb01_03.edf` excerpt and checked its SHA-256 and source-manifest SHA-256 against the original evidence bundle. The EDF was not downloaded or independently decoded again. Re-ran all three fixed conditions for 110 seconds / 221 raster frames each, through both reference and candidate workers. Scored using the unchanged benchmark scripts. Machine-readable results are in `capture-cloud-2026-10-08.json`.

| Condition | Analysis outputs, before → after | Largest gap between output arrivals, before → after | Observed columns during annotated seizure |
|---|---:|---:|---:|
| Isolated F7–T7, 2 µV/pixel | 187 → 217 | 2.0 s → 0.5 s | 100% (unchanged) |
| 18 channels, 2 µV/pixel | 187 → 199 | 2.0 s → 2.0 s | 11.87% (unchanged) |
| 18 channels, 6 µV/pixel | 187 → 217 | 2.0 s → 0.5 s | 60.31% (unchanged) |

Every recovered voltage, observed/repaired/missing mask and output column time is identical before/after in all three conditions. Isolated full-excerpt RMSE remains 5.0045 µV. This update improves timely analysis publication, not reconstruction accuracy or dense-crossing recovery.

The scored fraction of analysis-qualified channel-time is 100% before/after for the control; 0.833% → 0.859% for the dense 2 µV/pixel condition; and 32.298% → 31.944% for dense 6 µV/pixel over the full excerpt. During the annotated seizure the crowded 2 µV/pixel display still has zero qualified analysis time. Dense 6 µV/pixel changes from 11.319% to 11.042%. Window timing changes which windows contain missing samples; no improvement in dense-display qualified coverage is claimed. Before/after 100% retrospective control coverage does not reveal the old live publication stalls, hence the separate arrival-gap measurement.

## Browser checks and limits

Actual **Capture EEG window** was attempted in the cloud browser on the published HTTPS GitHub Pages site. It did not expose an operable native sharing picker or produce a usable stream. The HTTP preview explicitly reports its unavailable capture API. There is no accessible native desktop application surface in this session. OS window sharing, workstation behavior and physical audio remain unverified; canvas-stream testing is not a substitute for that claim.

The reproducible `browser/tests/live-analysis.html` fixture sends two known sweeping traces through a real canvas video stream, BrowserCapture crop, production signal worker and whole-history renderer. It deliberately removes 0.75 seconds of data and checks that analysis recovers. The cloud browser uses the software renderer because WebGL context creation is disabled. GPU lifecycle/transition logic is unit-tested without executing GPU shaders. Final browser counters are recorded separately below.

Automated checks include chunk-size invariance, zero/positive-duration gaps, layout changes, missing samples, source provenance, waveform timing, cloud identity retention, allocation bounds, freeze, reduced motion and abrupt missing-state transitions. Existing tests were updated for the new source-time cadence; a fractional-rate fixture's overlapping timestamps were corrected rather than loosening input checks.

Final browser run: 52 analysis frames, 42 with both known channels valid, 10 missing/partial frames, recovery after the intentional gap, 834 main-canvas compositing draw calls and no application errors. This count demonstrates intermediate image compositing; it is not an FPS or perceptual-smoothness score. Maximum full scene computation was 169.3 ms in this cloud software renderer. The test frequencies 10.1 and 7.3 Hz produced 10 and 7.5 Hz FFT peaks, consistent with its finite window resolution. The observed per-channel availability was 83.35% and 88.90%; this short browser test does not establish complete capture coverage or hardware performance.

Final validation: **168 automated tests passed**, syntax/UI/network checks passed, and the production build succeeded. The production interface was also exercised with Synthetic example → Whole history. The browser's hardware WebGL and OS picker limitations remain as above.
