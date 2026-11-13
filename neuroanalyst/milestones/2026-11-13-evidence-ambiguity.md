# Evidence-reference ambiguity hardening — 2026-11-13

## Verified repository changes
- `neuroanalyst/report-export.cjs`: reject duplicate baseline IDs selected by an episode, rather than silently using the first match.
- Prior-event comparison now requires exactly one matching ID, same recording and montage, finite ordered nonnegative start/end times, and an event ending before the candidate episode begins.
- `neuroanalyst/report-export.test.cjs`: four new synthetic regression scenarios: duplicate baseline IDs, cross-montage prior event, duplicate prior-event IDs, and a valid preceding prior event.

## Verification and limitations
GitHub accepted the module and test commits. Exact committed tests and CI have **not** been run in this execution environment; repository checkout from the container failed because github.com DNS resolution was unavailable. No clinical inference or patient data used. These changes tighten evidence-reference integrity only, and do not verify that referenced waveforms are correctly classified.

## Next bounded steps
1. Execute exact committed Node.js suite on the branch, fix any failures, record command/output and CI SHA.
2. Enforce manifest-wide uniqueness, recording discontinuity checks and post-artifact continuity, then test end-to-end synthetic report export.
3. Reconcile with desktop v0.8.1 report schema before enabling any integration.
4. Continue patient-held-out age-stratified, montage-matched adjudicated evaluations and physician-time measurements.

No production changes; not clinically validated or ready for user review.
