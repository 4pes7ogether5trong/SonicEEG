# Neuroanalyst: unverified report export gate

Status: engineering prototype; no clinical validation. Based on `neuroanalyst/seizure-retention-20261112`.

## Contract

Before exporting a preliminary draft, reject invalid schema versions, missing recording IDs, any status other than `draft_unverified`, automated interpretation, signed/approved drafts, inconsistent candidate counts, duplicate finding IDs, unsupported event kinds, invalid or reversed intervals, nonfinite/out-of-range confidence, invalid occurrence counts, malformed evidence IDs, or findings not marked `unverified_candidate` with `interpretation:null`.

Seizure candidates must carry `verify_onset_offset`; findings lacking evidence IDs must carry `missing_evidence`. Preserve low-confidence seizure candidates for human triage, not clinical interpretation. The export serializer must explicitly allowlist known fields and drop unknown keys, preventing unreviewed metadata from silently entering reports. This allowlist is **not** a substitute for PHI screening of allowed free-text fields: recording identifiers and evidence references must be pseudonymous and checked at ingestion.

## Synthetic test plan

1. Valid unverified seizure candidate passes.
2. Signed/approved draft fails.
3. Reversed interval fails.
4. Missing seizure-boundary review flag fails.
5. Missing evidence without explicit warning fails.
6. Nonfinite confidence fails.
7. Duplicate candidate IDs fail.
8. Inconsistent summary counts fail.
9. Non-null interpretation fails.
10. Unknown top-level and finding-level fields do not survive serialization.
11. Same input yields byte-identical output.
12. Empty valid findings array passes.

## Verification and next step

A standalone CommonJS reference implementation and twelve synthetic Node tests were executed locally on 2026-11-12 with `PASS 12 report export gate tests`. Those files have **not** been committed to this branch; the repository only contains this contract. Next step is to commit the implementation and tests, run them in repository CI, then test integration against `buildReviewDraft`. No production deployment or clinical review is authorized.
