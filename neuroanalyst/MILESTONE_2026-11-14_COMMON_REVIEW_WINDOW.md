# Neuroanalyst cumulative milestone — 2026-11-14
Status: engineering-only; not clinically validated or review-ready.

## Integrated this run
- Replaced evaluation-admission.cjs to calculate the intersection of two normalized reviewed masks and separate ordinary admissibility from 20-minute standard-window eligibility.
- A short review is no longer falsely rejected solely for being under 20 minutes. Two individually long reviews do not qualify as a standard comparison unless at least 1200 seconds are common and usable.
- Prevalence comparisons still require identical normalized reviewed-epoch masks. Acquisition mismatches and zero common review remain blocking.
- Added 12 regression cases in evaluation-admission-common-window.test.cjs. These exact committed tests have NOT been executed because GitHub checkout fails DNS in the execution environment. An earlier local v2 implementation passed 12 synthetic tests, but is not evidence of these exact committed files passing.
- No real EDF waveforms, model training, physician time studies, or patient-held-out accuracy results this run.

## Priority backlog
1. Execute exact committed tests and existing repository tests in a working checkout/CI; reconcile any failures before merging.
2. Independent EDF decoder cross-check using legally reusable, deidentified real EDF, with checksum, source, license, montage, filters and timebase provenance.
3. Compare three detector modes on patient-held-out cases; preserve all seizure misses, matched ±3s offsets and signed errors, abstentions and technician review burden. Preserve PN13-2 reviewer offset 02:01:56 and separate 02:01:31 change landmark.
4. Integrate ACNS 2021 pattern-population summaries with reviewed-mask occupancy, union of overlapping same-pattern runs, explicit uncertainty, representative trace and technician sign-off. No neonatal adult-category shortcut.
5. Develop expert-reviewed age-conditional reference examples across all nine groups, then real stratified validation with denominators and intervals; age tagging alone is not training.
6. Episode-aware change landmarks, overlapping field-specific patterns, baseline recovery and IIC/seizure/BIRDs/mimic differentiation, with provenance and clinical adjudication.
7. Physician review-time baseline versus assisted review; require verified savings before claims.

No production deployment or patient-identifiable data authorized.
