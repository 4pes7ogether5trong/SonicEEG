# Neuroanalyst evidence-gate milestone — 2026-11-13
Branch: neuroanalyst/report-export-gate-20261112 (non-production).

Implemented: evidence-gate.cjs with strict contiguous, usable quality-interval coverage and recording-local evidence-manifest checks (recording, montage, channels, trace span, unique identifiers). gateEpisodeExport composes with existing episode-review.cjs and fails closed for candidates or missing evidence. No EEG signal inference.

Local verification: Node.js v22.16.0, node --test episode-review.test.cjs evidence-gate.test.cjs: 29/29 passing (13 existing + 16 new). GitHub exact-head CI not yet confirmed. No patient data.

Limits: metadata consistency cannot verify waveform identity or clinical validity. Current gate requires a trace spanning the entire episode, which may be stricter than practical sparse representative clips; refine to a clearly documented representative-clip policy with a separate full-episode coverage proof before connecting to reports. Baseline reference IDs are not yet resolved. The new gate is not wired to technician report export.

Next priorities:
1. Run tests on exact committed branch head and add CI; integrate evidence gate into report-export path without altering production.
2. Resolve baseline IDs and acquisition-clock/sample discontinuities against a recording-local manifest; test missing, overlapping and post-artifact windows.
3. Replace full-episode trace requirement with separate full-episode reviewed coverage and representative excerpt references.
4. Reconcile v0.8.1 desktop schema, ACNS prevalence categories, age-stratified clinical references and held-out validation; quantify physician review time.
Clinical and physician-time-saving claims remain unvalidated; not review-ready.
