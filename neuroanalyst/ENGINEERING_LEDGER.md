# Neuroanalyst engineering ledger (non-production)

Updated 2026-11-12. Scope: synthetic metadata postprocessing only. No waveform detection, clinical validation, PHI processing, or physician signoff.

## Verified repository state
- Branch: `neuroanalyst/report-export-gate-20261112`.
- `episode-grouping-v2.cjs` -> `interval-safety.cjs` -> `review-draft.cjs` -> `report-export-gate.cjs`.
- `pipeline-integration.test.cjs` contains 12 authored integration checks; no claim that they passed.
- Added branch-scoped GitHub Actions synthetic suite in `.github/workflows/neuroanalyst-synthetic.yml`. At the time of writing, no workflow run was returned by GitHub Actions for this branch. Local clone failed with DNS resolution error.
- No production code or deployment changed.

## Priority backlog / acceptance gates
1. **P0 Execute exact committed suite**: confirm Actions run, retrieve logs and failure count; if Actions does not trigger, determine repository workflow permissions and use another approved runner. Fix failures before claiming passing tests. Avoid manual deployment.
2. **P0 Verify interval-boundary patch**: half-open `[start,end)` overlap and instantaneous point-at-start inclusion implemented in `interval-safety.cjs` (2026-11-12), with eight authored integration regressions in `interval-boundary.test.cjs`. Run exact committed suite in CI; inspect cases where grouped episodes span seizure candidates. Point-at-offset is non-overlap. This is a provisional metadata convention, not a clinically validated seizure-boundary rule.
3. **P0 Provenance integrity**: evidence IDs must resolve to actual recording-local waveform spans; fail closed on missing/duplicate evidence and invalid spans. No raw PHI in reports or logs.
4. **P1 Reporting workflow**: export draft -> technician verifies/amends each flagged candidate -> physician receives concise unsigned preliminary report with one-click evidence links; measure review time and false-positive burden.
5. **P1 Adaptive waveform passes**: define detector-independent data contract for montage, reference, sensitivity, filter, baseline-state windows, candidate onset/offset, uncertainty, and reproducible processing parameters. Do not equate display sensitivity with a signal transformation.
6. **P1 Dataset provenance**: registry of source, license, consent/use terms, redistribution restrictions, deidentification attestations, split manifest, and immutable checksums; never ingest data merely because it is publicly downloadable.
7. **P2 Clinical evaluation**: qualified EEG reviewers, adjudicated labels, patient-level holdouts, event sensitivity, false alarms/hour, boundary error, and physician time-on-task; no accuracy or regulatory claims before evidence.

## Review gate
Do not request user review until a reproducible passing integration suite and a coherent technician-facing synthetic demonstration exist. Then request one 5–10-minute review of report usability and evidence navigation, not clinical approval.

## 2026-11-12 boundary milestone
- Commits `2d2bbbb` and `53bfdeb`: corrected inclusive-endpoint false positives and added 8 synthetic integration cases. Separately executed 10 standalone predicate assertions locally (PASS); **the committed integration suite has not been executed**, so do not conflate those results.
- Rationale: fewer spurious overlap warnings for adjacent events, while retaining flags for points at candidate onset. The grouping policy still needs review for long episodes that bridge seizure candidates.

## 2026-11-12 evidence provenance milestone
- Commits `64c6e018` and `57c5ab6`: added `evidence-index.cjs` and 13 synthetic regression cases. Local counterpart passed 13/13 on Node; exact committed CI run remains unverified.
- `auditDraftEvidence(draft, spans)` checks recording-local ID resolution, duplicate evidence identifiers, invalid span geometry, cross-recording references, and candidate/evidence temporal intersection. It reports structured problems; **it is not wired into report export yet**. Existing export still permits flagged missing evidence, so provenance audit is an additional mandatory future gate, not a current guarantee.
- Next P0: run committed suite, wire evidence index into a separate strict export path requiring a complete recording-local manifest, and test the full pipeline with evidence spans. Define whether overlap references must resolve to seizure candidates and verify they are linked to the same recording.
- No deidentification guarantee follows from restricted identifier syntax; do not place PHI in identifiers.

## 2026-11-12 strict provenance export milestone
- Commits `69d9973`, `8725595`, `a920119`: added `strict-evidence-export.cjs` and 14 authored synthetic checks (fixed frozen-fixture mutation in the test). The strict path validates the unsigned draft, requires an explicit recording-local evidence manifest, rejects unresolved/duplicate/foreign/out-of-interval references, and requires overlap references to resolve to seizure-candidate evidence. The original permissive `exportUnverifiedDraft` remains unchanged for backward compatibility; consumers must explicitly opt into `exportWithVerifiedEvidence`.
- Verification: local authored source and test syntax checked using Node 22.16.0; **the exact committed regression tests were not executed** because the repository cannot be cloned from the current execution environment (DNS failure). Do not claim 14 passing tests or clinical validity. CI status still needs independent confirmation.
- P0 next: execute committed strict evidence tests and existing pipeline tests in CI, correct any failing assumptions, then make the strict path the default in the technician-facing synthetic workflow. Ensure provenance manifests are generated from actual waveform references rather than inferred from candidate metadata.
- Important limitation: syntax-constrained identifiers are not PHI detection; manifest completeness and recording ownership require trusted upstream provenance. No patient data or production modifications.
