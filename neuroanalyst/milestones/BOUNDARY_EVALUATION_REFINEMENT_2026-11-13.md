# Boundary evaluation refinement — 2026-11-13

Status: **local implementation tested; repository integration pending**.

The local `boundary-evaluator.cjs` prototype now uses maximum-cardinality, minimum-total-error one-to-one overlap matching rather than greedy assignment. It scores both onset and offset independently at an inclusive ±3-second tolerance, preserves signed deltas, reports missed reference events and unmatched predictions separately, and counts premature closure only for determinate offsets more than 3 seconds early. Artifact and uncertain intervals trigger boundary-specific abstentions. Duplicate prediction IDs and malformed quality intervals are rejected.

**Executed locally:** Node.js v22, 24 synthetic assertions passed. These are scoring-logic checks, **not** patient-held-out waveform detection results. Local artifacts: `boundary-evaluator.cjs`, `boundary-evaluator.test.cjs`, `BOUNDARY_EVALUATION_LEDGER_2026-11-13.md`. Source code has **not** been committed by this milestone; do not imply exact-commit tests.

## Next prioritized work

1. Commit tested boundary evaluator and regression suite on this non-production branch; execute exact committed tests and inspect deterministic assignment for dense overlapping events.
2. Add provenance-qualified reference types (published annotation, adjudicated reviewer point, plausible range, indeterminate) and enforce non-scoring of non-point references. Preserve PN13-2 Event A reviewer offset 02:01:56 as development observation only.
3. Integrate with same-mask, same-montage, patient-held-out three-arm comparisons; stratify onset/offset errors, missed events, false detections, premature closure and abstentions.
4. Keep clinical review and reporting gates separate from algorithmic test success.

No PHI, production deployment, model training or clinical performance claim. **Not review-ready.**
