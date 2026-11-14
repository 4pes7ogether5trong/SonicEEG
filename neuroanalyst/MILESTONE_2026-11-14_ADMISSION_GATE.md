# Neuroanalyst engineering milestone — 2026-11-14

Branch: neuroanalyst/episode-boundaries-20261112 (non-production).

## Delivered
- Added evaluation-admission-v2.cjs and 12 regression tests, replacing the earlier milestone-only state with executable committed source.
- Normalizes reviewed masks, calculates usable reviewed seconds and pairwise intersection, and separates comparison admissibility from eligibility for the 1,200-second standard reference window.
- Rejects unequal reviewed masks for prevalence, acquisition mismatches and malformed intervals.
- Does not infer that an eligible window has clinically valid annotations or accurate model predictions.

## Verification and limitations
- Prior local version passed 12/12 Node 22.16.0 synthetic cases on 2026-11-14.
- Newly committed files have NOT been run verbatim or passed CI. Execute: node --test neuroanalyst/evaluation-admission-v2.test.cjs
- No patient EEG was processed, no clinical detection performance was measured, and no physician-time saving was demonstrated.
- Review mask equality presumes a common recording-relative timebase; enforce recording identity/timebase externally before comparing cases.
- Exact floating-point comparisons and filter provenance require validation against real acquisition exports.

## Prioritized backlog
1. Execute committed tests verbatim in checked-out branch; fix regressions before merging.
2. Compare EDF sample extraction against independent decoder on legally authorized files; verify per-channel calibration, montage derivations and timebase.
3. Obtain documented reuse permissions, deidentification checks, patient-level split manifests, recording hashes and reviewer-provenance for real EEG datasets.
4. Run blinded three-mode seizure and pattern evaluation on held-out patients, retaining ±3 s inclusive offset scoring and separately documenting misses, abstentions and reviewer effort.
5. Implement sparse episode-linked evidence and technician verification for report populations; compute ACNS occupancy only over usable reviewed masks, with neonatal-specific safeguards.
6. Build evidence-cited age-conditional reference cases across all nine strata; do not equate age labeling with model training.

## Held-out review observation
Siena PN13-2 Event A: John's change landmark 02:01:31 elapsed and offset 02:01:56 elapsed are independent reviewer observations, not published annotations or training labels.
