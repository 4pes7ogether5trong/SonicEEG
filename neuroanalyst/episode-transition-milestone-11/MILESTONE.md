# Neuroanalyst milestone 11 — episode transitions (2026-11-14)

Non-production branch: neuroanalyst/episode-boundaries-20261112
Directory: neuroanalyst/episode-transition-milestone-11/

## Verified progress
- Added episode-transition evidence gate and 14 constructed-data regression tests.
- Exact Git blob hashes for gate and tests match locally executed files: 163a50f276a2f8d20b4e774028010e4424f84515 and 7c31be254a2163acc6a6c08b8b4aeacb6adcf4d4.
- Local suite: 14/14 passing (Node.js 22.16.0). Full local multi-module suite: 38/38 passing.
- Copied standalone prevalence dependency; its Git blob differs from the local dependency (comment-only/formatting difference in transferred version), so the exact complete committed package has NOT been clean-checkout tested.
- No real EEG, clinical accuracy estimate, model training or physician-time experiment.

## Important design limits
- Boolean reviewerVerified is NOT identity verification, authorization, signature, or clinical review audit.
- Evidence recording ID is checked but evidence timestamp alignment is not enforced.
- The gate is research-only, cannot distinguish seizure/spread/postictal physiology, and never authorizes delivery.
- Pattern prevalence remains unconfirmed pending expert labeling.

## Prioritized next actions
1. Clean-checkout test all three committed files verbatim; strengthen evidence-time and pattern ID validation; introduce identity-bound immutable reviewer audit.
2. Integrate with report-evidence adapter and structured report, retaining sparse event references and human sign-off.
3. Independently compare EDF decoding with a second reader on legally usable, deidentified EEG.
4. Run patient-held-out three-mode comparisons with matched montages, epoch masks, nine age strata and ±3 s offset scoring.
5. Measure physician time, corrections, abstentions and misses prospectively.
