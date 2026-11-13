# Episode landmark triage milestone — 2026-11-13

Branch: `neuroanalyst/report-export-gate-20261112`. Additive, non-production metadata review helper.

Files: `episode-landmarks.cjs`, `episode-landmarks.test.cjs`. Synthetic locally authored tests: 14/14 passed on Node v22.16.0; existing local boundary evaluator 24/24 passed. Exact committed-file execution and CI are NOT verified.

The helper keeps independent pattern IDs and field labels for overlapping onsets/offsets, flags orphan/duplicate onsets, unresolved offsets, baseline-return before offset, state-change without baseline context, obscured landmarks, and missing post-artifact continuation. These are REVIEW FLAGS, not evidence that an EEG is ictal or postictal. No patient data, model training, physician review or clinical performance claims.

Priority next:
1. Execute exact committed tests and existing integration suite in CI; do not infer passing CI from local counterparts.
2. Wire landmark flags into technician evidence queue behind opt-in gate; require verified waveform span provenance and montage/recording identity.
3. Refine artifact continuation to require same-pattern/same-field quality-aware post-gap evidence, rather than any post-gap landmark (current coarse heuristic can false-clear).
4. Validate independently labeled onset/offset on patient-held-out licensed EEG, compare signal-only, visual and episode-aware methods with identical montage and reviewed masks; measure ±3-second agreement, misses, false alarms, abstentions and review time.
5. Verify ACNS source thresholds and v0.8.1 desktop schema before clinical prevalence export.

Not review-ready.
