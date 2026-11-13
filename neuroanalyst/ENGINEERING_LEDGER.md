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

## 2026-11-12 temporal provenance hardening
- Commits `2cd4f593` and `39c490ed`: strict export now rejects seizure evidence IDs linked to seizure candidates that do not temporally overlap the referring finding; half-open interval boundaries prevent endpoint-touching events from being treated as overlap. Two synthetic regression cases authored.
- Verification: connector confirmed both commits. **Exact committed tests not executed**; local clone failed DNS resolution again. The change is not clinically validated. Next: execute full suite in CI, fix any fixture/contract mismatch, then exercise technician-facing strict export with genuine recording-local provenance manifests.
- Risk: event intervals and evidence manifests originate upstream; this gate cannot verify raw waveform truth or patient deidentification. Clinical review and physician-time benchmarks remain outstanding.

## 2026-11-12 dataset admission and leakage milestone
- Commits `bb1b79a` and `d68a164`: added `dataset-registry.cjs` and 10 synthetic regression checks. The local counterpart of these two files passed 10/10 assertions under Node; exact committed GitHub suite has not been executed. CI combined status for test commit returned no statuses.
- Entry-level admission requires explicit source URL, license evidence, authorized research/training/evaluation use, redistribution declaration, deidentification attestation, provenance review, SHA-256 digest, and subject-group split. Registry audit rejects duplicate recording IDs and subjects crossing train/validation/test.
- **Important limitation:** metadata declarations are not independent verification of licenses, consent, deidentification, or SHA-256 content; source review and checksum recomputation are required before actual dataset admission. `subjectGroupId` must be a trusted stable pseudonym across recordings, never patient-identifying text.
- Next P0: obtain exact-commit CI execution for all regression suites; then integrate dataset registry checks into a gated ingestion workflow with real file hashing and documented license review. Do not download or train on datasets yet.

## 2026-11-12 population-prevalence metadata milestone
- Commits `0531b049`, `1fcaef4`, `018cc356`: reviewed-epoch occupancy union, sporadic discharge rate, reviewer-confirmed population summary with localization/state/representative trace, and measured-occupancy/category comparison. 18 locally constructed synthetic tests passed before upload; **exact GitHub committed suite and CI remain unverified**.
- Percent denominator is the union of usable reviewed intervals, not whole-recording duration. Runs are intersected with those intervals and unioned to avoid duplicate occupancy. Unquantified examples have no numeric percentage/category; detector candidates are rejected as clinical population summaries.
- P0: run exact committed tests in CI; verify section B/C.3.a ACNS 2021 thresholds against primary text and inspect v0.8.1 desktop schema before wiring reports. Sporadic discharge **rate is deliberately not converted to a named ACNS grade until verified**. Estimate provenance and denominator completeness must be attested upstream; metadata flags alone are not evidence of exhaustive review.
- P1: connect evidence IDs to recording-local manifest, state-specific denominators, and technician-facing report export. Evaluate prevalence against adjudicated reviewers; do not infer epileptiformity from sharpness or candidate counts.

## 2026-11-12 population evaluation comparability guard
- Commits `5efc7a3` and `b9b2cb4`: added `prevalence-evaluation.cjs` and ten synthetic checks. A local identical authored counterpart passed 10/10 on Node 22.16.0; exact GitHub-commit CI remains unverified.
- Do not score model-versus-reviewer percentage-point errors when the usable reviewed duration differs, coverage modes differ, or a reviewer prevalence category is absent. Reject mismatched population identity, localization or state. This avoids apparently precise but misleading comparisons across different observation bases.
- The new guarded evaluator is additive and **not yet wired into existing `comparePrevalence` callers**. Next: integrate it into evaluation/reporting, preserve non-comparability reasons in output, then verify exact committed tests and compare actual reviewed epoch masks (equal duration alone does not prove equal reviewed epochs).
- Source mapping to ACNS 2021 B/C.3.a and the v0.8.1 desktop schema remains pending; no clinical or physician-time claims.

## 2026-11-12 20-minute age/montage evaluator milestone
- Commits `57f8323` and `1b51244`: added additive `evaluation-cohort.cjs` and 11 authored regression cases. It enforces identical unioned reviewed-epoch masks, a full 1200 seconds of usable reviewed EEG, ordered montage derivation and reference/electrode compatibility, and nine explicit age strata. Neonatal takes precedence. Missing age/montage fails closed.
- A separately authored local prototype (not byte-identical to committed source) passed 12/12 Node synthetic tests. **The 11 exact committed tests have not been executed**; CI status remains unknown. No claim of clinical validity or trained age-aware model.
- Limitation: exact montage matching is deliberately conservative; normalized reference/filter/sampling metadata and temporal alignment are not yet independently checked. Calendar-year age must be computed upstream, and neonatal maturity requires separate PMA/GA metadata. This guard is not yet wired into prevalence-evaluation.cjs.
- Next P0: run exact committed suite in CI, integrate guard into reviewer prevalence comparisons, add recording-clock alignment and montage acquisition metadata, and build clinician-reviewed age-dependent EEG reference cases.


## 2026-11-12 prevalence integration and seizure-offset evaluator
- Commits `09c0f20`, `310364e`, `2105e28`: additive `evaluation-guard.cjs` composes 20-minute, identical reviewed-mask, age and montage comparison with the existing prevalence evaluator, and rejects numeric denominators inconsistent with reviewed epoch coverage. `seizure-offset-evaluation.cjs` scores matched seizure offset point references at inclusive ±3 s, reports signed differences and agreement numerator/denominator, counts missed seizures separately, and leaves ranges/indeterminate readings unscored. Held-out Siena PN13-2.edf Event A reviewer observation remains 02:01:56 elapsed (7316 s), separate from any published annotation or training label.
- A locally assembled counterpart with 12 synthetic integration cases passed 12/12 under Node 22.16.0. **Exact committed test file has not been executed in CI**, and the local copies of existing dependency modules were transcribed from connector reads rather than checked out from GitHub; no claim of exact-commit verification. These are metadata-only evaluators, not waveform inference or trained age-aware model.
- Next P0: run exact-commit suite, integrate these opt-in evaluators into a synthetic technician report pipeline, ensure clock alignment and acquisition metadata, verify ACNS B/C.3.a thresholds and v0.8.1 report schema. Define an adjudicated seizure matching protocol to avoid artificially high agreement by scoring only successfully matched cases. Preserve all nine age strata; begin expert-reviewed age-specific case curriculum.
- No patient data, production deployment, or clinical performance claims.
