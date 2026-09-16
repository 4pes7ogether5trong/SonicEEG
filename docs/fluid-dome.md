# Continuous fluid dome and persistent droplets

## User sequence

Fluid dome is the default surface. Start **Explore synthetic EEG**. Patient A's
programmed three-per-second spike-wave episodes occupy 12–24 seconds, recurring
every two minutes. Involved regions acquire sharp and periodic droplets; sustained
evidence raises their brightness. When evidence stops, brightness approaches a
faint floor and the ghost remains in the session history. Use Color off, then
Field controls → Droplets to inspect each descriptor independently.

The previous Waveform relief and Spectral field remain available. Baseline maps
continue to use their calibrated spectral summaries. Four patient sound settings,
capture, local processing and independent playback remain unchanged.

## Surface mapping

The dome is now one connected mesh. A spatial kernel around each displayed
electrode reads the actual retained, mean-centered waveform. For angular distance
`d < 1.05` radians its influence is `(1-(d/1.05)^2)^3`; it reaches zero smoothly at
the boundary. Distance maps to up to 1.45 seconds of waveform lookback. Bipolar
derivations contribute opposite signed lobes at their two endpoints. Contributions
are summed and divided by `max(1, summed influence)`. This is an explicit visual
encoding of derivation voltages, not an inversion into electrode potentials or
cortical sources. Ring travel does not measure brain propagation.

Height is bounded to ±0.24 head-radius units, at a gain of 0.2/ruler per microvolt.
The strongest spatially weighted channel RMS contribution determines band color.
The channel's strongest band or the user's selected band supplies that color.
Lighting follows the deformed mesh normals, with a sharp highlight and edge light;
there is no bloom or blur pass. Color off preserves the same waveform texture.

WebGL uses a 256 × 32 float texture and a connected 96 × 192 live mesh. On a new
half-second frame, the presentation clock advances through the final half-second
of that retained waveform, then holds at its end. It never extrapolates beyond
the data. Freeze holds that clock. History uses coarser connected meshes and the
same representative two-second windows described in waveform-relief.md. Fast
activity and narrow transients can exceed the mesh's spatial resolution; color
and preserved samples retain information the geometry cannot resolve. Neither
the dome nor compressed history is a replacement for the source EEG morphology.

Up to 32 valid channels contribute, with observed channels first and graph-derived
channels weighted at 0.4. This covers the current 19-sensor demo and common displayed
montages, not arbitrary high-density EEG. Unknown regions stay dim. The software
fallback uses the same signed kernel with a coarser mesh, updates at feature-frame
rate and renders simpler droplet silhouettes. It does not reproduce every WebGL
reflection or intermediate animation frame.

## Descriptor droplets

Each patient has an independent FluidEpisodes tracker. No synthetic scenario labels
are read by it. Only observed, valid channels contribute descriptor evidence:

- Sharp shape: new candidates from the existing transientFeatures detector.
- Periodic repetition: the existing PatternTracker establishes at least three
  recurring candidates, with regularity ≥0.75. A new candidate must support an
  update. This is not a clinical periodic-discharge classification.
- Rhythmic activity: autocorrelation at the channel's spectral-peak lag ≥0.78,
  at least three cycles within the two-second window, peak 1.5–20 Hz, and RMS ≥3 µV.
  Compressed waveforms are ineligible for this autocorrelation descriptor. Normal
  rhythms and artifacts may meet the criterion. Slower rhythms require longer
  evidence than this initial detector supports; they still texture the surface.

Evidence is grouped into approximate left, midline and right anterior, central
and posterior scalp regions. Position follows a weighted centroid of contributing
derivations, not a reconstructed source. Categories can overlap for the same
activity. They are separable using the type selector; their small display offsets
and taller, ridged or round silhouettes distinguish them without changing the
underlying region assignment. Droplets are not independent seizures or counts of
different clinical events.

Brightness is `0.22 + 0.78*(1-exp(-observed persistence/8))`. A 1.3-second evidence
gap closes a run. After closure, brightness fades with a five-second time constant
toward 0.13; opacity fades toward 0.18. Duration is advanced by new observations,
never by painting, camera movement or repeatedly reading a frame. Missing data or
recording-context changes close the observed run; closure does not establish when
a physiological event ended. A paused or stopped capture cannot establish further
persistence. Descriptor onset and cessation have windowing and detection latency.

Ghosts are recorded with region, contributing channels, descriptor, observed start
and end. A tap selects the corresponding recording time and displays those details.
Coarse summaries bound record growth by grouping older contributions by region and
type; their extent and latest example remain inspectable. These clusters are not
exact event-count or clinical-burden statistics. Side/history droplet positions use
their own observed time intervals, independently of the representative waveform
shell timestamp. Local saving keeps per-frame observations when enabled; older
saved sessions do not automatically acquire new descriptor records.

## Verification and remaining limits

Added numerical regressions cover A's onset/brightening/ghost sequence, independent
frame clocks, gaps and context breaks, historical provenance, type/channel selection,
autocorrelation eligibility, bipolar sign symmetry, smooth kernel boundaries,
amplitude scaling, bounded mesh/texture allocation, monochrome fidelity and freeze.
The complete existing signal, capture, storage and sonification suite also runs.
Production build and the static interface/network audit are required. This iteration
has not had browser appearance, GPU shader execution, physical-device performance,
or patient-recording interpretation validation. Descriptor thresholds are engineering
choices, not validated clinical thresholds.
