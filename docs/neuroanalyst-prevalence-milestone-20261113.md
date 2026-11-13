# Neuroanalyst prevalence accounting milestone — 2026-11-13

Non-production branch: `neuroanalyst/report-export-gate-20261112`.

## Delivered
- `neuroanalyst/prevalence-occupancy.cjs`: union overlapping same-population runs; intersect with usable reviewed epochs; calculate numerator/denominator and percent occupancy; preserve estimate versus complete measurement versus unquantified example; suppress automatic neonatal category.
- `neuroanalyst/prevalence-occupancy.test.cjs`: synthetic boundary, gap, overlap, mask equivalence, and neonatal checks.
- Local predecessor implementation passed 16/16 Node.js tests on 2026-11-13. **The exact committed test file has not been executed or CI-verified.** No waveform/model or clinical validation performed.

## Safety limitations
- Callers must supply clinically reviewed pattern populations; this module does not establish epileptiformity or pattern identity.
- `measurement=complete` is a caller assertion, not a proof that every usable epoch was examined. Require manifest-level review attestation before report integration.
- ACNS categories require qualified interpretation of applicable patient context; do not automatically apply non-neonatal critical-care definitions to neonatal EEG.
- Current code uses floating-point elapsed seconds; validate EDF discontinuities, sample-index clock, acquisition comparability, and reviewed epoch provenance before scored use.
- `comparableMasks` checks only interval geometry; montage, filters, channels, sampling, recording ID and reference must be checked separately.

## Prioritized next work
1. Execute committed test suite and exact-head CI, reconcile all existing safety gates and remove redundant paths.
2. Gate `complete` on immutable reviewed-mask manifest and explicit population identity; test artifact gaps and adjacent patterns.
3. Integrate into technician-verifiable report with localization, state, representative trace and uncertainty; reconcile desktop v0.8.1 schema.
4. Build patient-held-out age-stratified evaluation with licensing/provenance and qualified reviewer adjudication; report calibration, sensitivity, false positives, missed seizures and burden.
5. Keep Siena PN13-2 reviewer observations development-only; evaluate offsets with inclusive ±3 s and signed deltas on independent held-out cases.

Not clinically validated or review-ready.
