# Continuity gate milestone — 2026-11-13
Branch: neuroanalyst/report-export-gate-20261112. Synthetic metadata only.

## Delivered
- continuity-gate.cjs: validates elapsed-time segments, sample-index ordering and sample-rate-derived duration; rejects discontinuities across episode coverage.
- continuity-gate.test.cjs: 16 synthetic assertions including adjacent segments, gaps, overlapping samples, bad sample durations, missing quality, artifact, post-artifact review, and quality mask gaps/overlaps.
- Local authored counterpart executed with Node's test runner; test file exited 0. Exact committed files and GitHub Actions have not been executed. No clinical validation.
- Artifact or uncertain intervals are never cleared solely by a post-artifact check; human review remains required. No PHI or production changes.

## Prioritized next gates
1. Fetch exact commit and execute complete Node synthetic suite in a clean checkout; investigate CI status.
2. Integrate continuityDecision behind reversible opt-in report-export feature flag, preserving unverified-only output and evidence links.
3. Replace segment metadata assumptions with EDF/EDF+D discontinuity fixtures; verify per-record timestamps and sample clocks. Do not equate sample-count adjacency with elapsed-time continuity.
4. Reconcile desktop v0.8.1 report schema; measure technician corrections and physician review burden on licensed patient-held-out cohorts.
5. Continue nine-stratum age-conditioned reference review and ACNS prevalence evaluation; no model training claimed.

## Known limitations
No waveform review, no clinical ground truth, no age-conditioned model weights, no measured physician time savings. Segment timestamps and quality labels are caller-provided and not independently authenticated. A metadata coverage pass does not imply correct seizure boundaries.
