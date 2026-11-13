# Neuroanalyst age-strata milestone — 2026-11-13

Non-production branch only. Added `age-strata.cjs` and `age-strata.test.cjs`. Local standalone regression: 21/21 tests passed under Node (exact committed file/CI not executed). No model weights changed; no EEG physiology learned; no patient records accessed.

Rules: neonatal explicit flag takes precedence; unknown neonatal status for an infant abstains rather than assigning non-neonatal. Older bins use completed calendar years. Under one year retains elapsed days. Neonatal returns GA/PMA metadata and uncertainty if PMA absent. Missing dates return unknown; malformed dates rejected. February 29 birthdays in non-leap years currently follow JavaScript date normalization to March 1; document/clinically approve policy before use for boundary adjudication. Input dates should be derived from deidentified metadata in a privacy-preserving local pipeline, not exported DOB.

## Next prioritized work
1. Obtain authorized, legally reusable EDF waveform bytes and run blinded signal-only, visual-assist and episode-aware pipelines on different held-out patients; current work has no actual waveform-based performance results.
2. Execute exact committed Node tests and existing boundary/prevalence suites in CI; audit integration into reporting.
3. Build reviewed-epoch-mask/derivation equivalence checks, technician-verifiable evidence references and sparse population summaries.
4. Add clinically sourced age-specific reference features, uncertainty and reviewer labels across nine strata, plus montage/state-stratified evaluation. Never infer EEG normality from age bin alone.
5. Verify dataset licenses, provenance, privacy and expert clinical signoff before any performance or physician-time-saving claim.

PN13-2 reviewer offset 02:01:56 and morphology landmark 02:01:31 remain development-only and distinct from published annotation. ±3 s inclusive point-offset scoring remains unchanged.
