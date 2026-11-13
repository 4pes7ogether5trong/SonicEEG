# Episode-aware visual review contract (synthetic-only; 2026-11-12)

This specification is additive and is **not** evidence of model training or clinical accuracy. Do not promote detector candidates into clinical findings without qualified human confirmation.

## Required episode fields
- Stable recording-local episode and evidence IDs; [start,end) in elapsed seconds; channel derivations and montage acquisition metadata.
- Candidate class: seizure, non-neonatal IIC, BIRDs, rhythmic/periodic, sporadic interictal, artifact, or uncertain; clinical classes require explicit reviewer status.
- Regional field, frequency (Hz), morphology, evolution, fluctuation and ACNS plus modifiers, with source and confidence/uncertainty.
- Same-state background reference and prior-event references; retain abnormal baseline instead of treating it as a new event.
- Per-channel quality/artifact intervals, with post-artifact resumption check and abstention for unresolved intervals.
- Seizure onset and offset point/range/indeterminate with independent reference provenance. Siena PN13-2 Event A reviewer offset 7316 s is held-out, not a training label.
- Neonatal vs non-neonatal vs unknown maturity; do not apply non-neonatal ACNS IIC criteria to neonatal or unknown-maturity EEG.

## Evaluation gates
Patient-held-out matched-montage 20-minute reference windows; preserve reviewed masks, acquisition timebase and age strata. Compare signal-only, current visual assist, and episode-aware review on the **same** adjudicated episodes. Report class agreement, seizure misses, false alarms per reviewed hour, premature closure after artifact, abstention rate, time-on-task and signed offset errors with inclusive ±3 s point-reference agreement among scored matched seizures (denominator explicit). Never substitute reviewer observations for published annotations. Avoid leakage across patient groups.

## Implemented locally, not yet committed
A standalone Node CommonJS prototype `episode-review.cjs` and `episode-review.test.cjs` passed 13/13 synthetic tests on 2026-11-12. The prototype rejects incomplete evidence/context, neonatal IIC rule misuse, invalid intervals, unreviewed candidates, and uncertain channel quality. This specification alone is not integration; the repository's exact-commit CI and waveform validation remain outstanding.

## Next engineering steps
1. Integrate episode contract into recording-local strict evidence export and synthetic report; enforce artifact-gap continuity and actual evidence ownership.
2. Run exact-commit tests and inspect current CI; obtain source ACNS 2021 and v0.8.1 schema before clinical category mapping.
3. Build age-stratified licensed held-out cases and reviewer-adjudicated three-arm evaluation.
