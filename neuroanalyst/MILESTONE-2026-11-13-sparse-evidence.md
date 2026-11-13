# Sparse evidence milestone — 2026-11-13

## Implemented
- `sparse-evidence-gate.cjs`: independently checks complete, contiguous usable reviewed coverage of the episode and allows short representative waveform excerpts strictly within its time bounds. Matches recording, montage, channels and evidence IDs; rejects missing or duplicate manifest IDs.
- `sparse-evidence-gate.test.cjs`: ten synthetic cases (short excerpt acceptance, gap, overlap, outside excerpt, recording mismatch, channel mismatch, duplicate IDs, unreviewed, artifact, unresolved trace).

## Validation status
- Files committed to non-production branch. Tests **not executed** in this run; do not claim clinical validation.
- The earlier `evidence-gate.cjs` remains unchanged and retains its conservative full-episode-trace requirement. The new module is not wired to production exports or the existing gate.
- Full review coverage is metadata-only, not cryptographically attested against samples. Representative excerpt checks are not proof of EEG classification, montage correctness or a reviewed baseline.
- Reviewer baseline references, post-artifact continuity, discontinuous EDF clocks, exact-commit CI, and report integration remain unresolved.

## Priority backlog
1. Execute exact-branch test suite; fix failures; verify both old and new gates.
2. Replace the old full-episode-trace restriction with sparse-gate logic behind a feature flag, retaining fail-closed review-coverage checks.
3. Resolve baseline and prior-event IDs against recording-local evidence manifests and enforce sample-index/clock alignment.
4. Generate synthetic technician-verifiable report and compare report contents against reviewed evidence.
5. Establish licensed, patient-held-out, age-stratified waveform validation with qualified clinical reviewers and measured review burden.

No patient data, diagnosis, production deployment, or performance claim.
