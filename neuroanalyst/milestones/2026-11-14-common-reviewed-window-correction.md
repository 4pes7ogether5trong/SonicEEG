# Evaluation admission v2: short-window and common-mask correction (2026-11-14)

Status: non-production engineering milestone. Local executable prototype: evaluation-admission-v2.cjs and evaluation-admission-v2.test.cjs (12/12 synthetic Node tests passed); prototype not yet integrated into repository. No real EEG, detector evaluation, or clinical validation.

## Confirmed defect in evaluation-admission.cjs
The current compare() marks any reviewed comparison shorter than 1200 seconds inadmissible. This conflates **20-minute standard-window eligibility** with **valid shorter reviewed comparisons**. Also, two >=1200-second reviewed masks can overlap by less than 1200 seconds, which must not be labeled a comparable 20-minute common window.

## Tested implementation contract
- Normalize/union reviewed masks; reject invalid intervals; never extrapolate missing reviewed EEG.
- Return separate admissible and standardWindowEligible booleans. Shorter comparable windows remain admissible with an explicit warning, never presented as 20-minute standard evaluations.
- Return intersection commonReviewedMask and commonReviewedSeconds for non-prevalence comparisons; reject zero common reviewed time. The standard window requires at least 1200 seconds of *common* usable reviewed epochs.
- For prevalence comparisons, require identical normalized epoch masks, even when reviewed durations match; preserve actual usable-reviewed seconds as denominator.
- Reject acquisition incompatibility in sampling, filters, reference, electrodes, or derivations. Retain provenance requirements upstream.
- Tests cover interval union, gaps, intersection, 100-second short windows, inclusive 1200-second threshold, same-duration shifted masks, disjoint masks, mismatched acquisition, 600-second overlap despite 1200 seconds each, invalid intervals, invalid derivations.

## Prioritized next actions
1. Integrate tested prototype on non-production branch, execute committed tests and CI; preserve existing public API or migrate call sites explicitly.
2. Independent EDF decoder cross-check against verified, authorized clinical waveforms, with hashing, licensing and deidentification admission.
3. Patient-held-out blinded evaluation of signal-only, visual-assist, episode-aware modes by age/montage/state; ±3s inclusive offset scoring, misses, false positives, abstentions and physician review burden.
4. Human verification of population-specific prevalence, localization, representative trace and technician-verifiable structured report; neonatal protocol separate from non-neonatal ACNS rules.

No production changes, patient data, or clinical claims.
