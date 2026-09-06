# Waveform relief prototype

This iteration adds waveform shape to the scalp display and a short stack of
preserved windows. It does not change the four patient audio mappings or add a
diagnostic classifier.

## Try it

Start **Explore synthetic EEG** (or **Synthetic example** in one patient panel).
Select **Waveform relief**, then **Color off**. Compare patient A during 0:14–0:16
with patient C. A contains six programmed spike-wave cycles per two-second window;
C has broad slow activity. Use **Recent stack**, rotate, and zoom to separate the
windows. **Freeze view** stops the image while monitoring sound continues.

Whole history and Side profile retain representative windows. **Practice → Build
full demo history** creates the twelve-minute sampler for each patient. The slider
identifies the compressed interval and its example waveform time. Select a channel
in Field controls to isolate overlapping strips. Baseline maps use the spectral
summary; selecting one from Recent stack opens Side profile.

## Measurement and geometry

- The existing pipeline holds two-second multichannel windows and emits features
  every half second. Each accepted frame now also retains a simultaneous waveform
  snapshot. Only valid observed or graph-derived channels can contribute.
- Waveform samples have the window mean removed. Up to 256 samples per channel are
  retained. Higher-rate inputs retain each display bucket's minimum and maximum at
  their actual times, including the first and last sample. This preserves narrow
  extrema, but other morphology may be lost. The display compression does not feed
  spectral calculations or sonification.
- A bipolar ribbon follows the short spherical arc from its first electrode to its
  second. Referential ribbons occupy a small patch around the named electrode,
  progressing front to back. Position along a ribbon represents waveform time,
  not brain propagation, conduction speed, connectivity or cortical source location.
- Centerline relief is `clamp(sample / ruler * 0.12, -0.16, 0.16)` in head-radius
  units. The ribbon tapers laterally into its undeformed surface. Positive voltage
  rises and negative voltage sinks. The amplitude ruler is a display gain; the
  cap bounds geometry without altering retained measurements. A recessed, dim dome
  supplies orientation, including where no waveform is available.
- Actual mesh normals provide lighting. No temporal interpolation blends different
  waveform windows. Color off changes color only. Frequency color is the channel's
  strongest integrated band in that same window, or the selected band color. It is
  not instantaneous frequency, and band selection does not filter the waveform.
- Derived channels are dimmer and remain identified in channel availability.
  Display filters and missing samples retain their existing interpretation: shape
  is what the screen reconstruction permits, not recovered amplifier data.

## Time and storage

Recent stack selects up to six nonoverlapping windows at or before the selected
time, oldest to newest, with actual timestamp spacing. Gaps or compressed history
can mean these cover more than twelve seconds. No gap is filled with a fabricated
waveform.

Temporal compaction keeps one entire simultaneous multichannel snapshot per bin,
preferring more newly observed sharp candidates, then larger channel RMS. All
channels therefore come from the same time. This is a representative example,
deliberately weighted toward conspicuous shapes; it is neither a mean waveform nor
a measure of their prevalence. Other shapes inside that interval may be omitted.
The existing duration-weighted spectral and baseline summaries remain separate.
Mixed recording segments and settings invalidation remove waveform snapshots.

The relief overview uses at most eight shells; the spectral overview retains its
existing sixteen-bin target. Local archive detail and frozen history can contain
up to sixteen summary shells. The temporal pyramid limits memory growth. Optional
local saving also stores retained samples in IndexedDB; at 19 channels / 128 Hz,
overlapping waveform arrays alone add about 134 MiB per patient-hour. Storage can
fill and saving will report failure. No screenshots or patient identifiers are
added, and no application network upload is introduced. Existing saved sessions
without snapshots remain usable in Spectral field; relief is unavailable there.

An aligned ensemble/average outer shell remains future work: it needs an explicit
shared alignment anchor and a spread measure. This version never averages
unaligned EEG waveforms.

## Verification

Numerical tests cover sample fidelity, signed depth and scale, preservation of
extrema and timestamps, coherent multichannel compaction, invalidation, finite
electrode geometry, chronological selection, A/C shape differences independent of
color, and local storage round trips. Existing signal, capture, baseline and audio
regression tests also run. Production build and static interface/network checks
are required. Browser appearance, physical-device performance and interpretation
on real patient recordings have not been validated for this iteration.
