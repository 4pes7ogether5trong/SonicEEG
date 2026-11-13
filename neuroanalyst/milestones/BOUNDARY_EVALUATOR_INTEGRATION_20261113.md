# Boundary evaluator integration milestone — 2026-11-13

## Verified repository changes
- New `boundary-evaluator.cjs` commit `8929665faee85a1b3c67600654192a9b34f461d2`; new `boundary-evaluator.test.cjs` commit `64a10a6ecac501a36cb40c82e11c730741c762cc`.
- Both files independently fetched back from GitHub branch; blobs `688e37d41afe0846d4c70f6cfb01f88057a66e5f` and `7ccd98f20539809ab736128c8d1f859267eb3364`.
- Local predecessor scorer passed 24/24 tests under Node 22.16.0. **New committed implementation and its 13-case test file have NOT been executed**; do not transfer the predecessor test result to this commit.
- Evaluation-only: maximum-cardinality/minimum-total-timing-error one-to-one matching for overlapping intervals; separate onset/offset ±3-second scoring denominators, missed events, unmatched predictions, abstentions, premature closure.
- PN13-2 published annotation 7249–7314 seconds; John's separate reviewer offset 7316 seconds (+2s) and earlier change landmark 7291 seconds. This checks annotation provenance, not a detector prediction.

## Known limits and priority backlog
1. **P0** Run the exact committed test file under Node in an environment with repository checkout, fix failures and integrate into CI. The branch was read/written through GitHub connector because container DNS cannot resolve github.com.
2. **P0** Obtain licensed/deidentified *actual EDF waveform bytes*, verify hashes, acquisition metadata, masks, and clinical annotation provenance. NEMAR GitHub EDF entries are LFS pointers, not waveforms. Do not claim waveform validation from annotation audits.
3. **P0** Run signal-only, visual-assist and episode-aware detectors blinded to reference labels on new patient-held-out EEG, then score event misses, false alarms, ±3s onset/offset, uncertainty and review time. PN13-1/2/3 are one patient.
4. **P1** Reject invalid cross-mode comparisons with unmatched montages, derivations, reviewed masks, filter/sampling/reference settings; use 20 minutes only when 20 minutes actually reviewed. Occupancy denominator always usable reviewed time.
5. **P1** Enforce nine age strata, neonatal precedence, clinical expert review, and separate age-conditioned validation. Preserve ACNS prevalence distinctions and uncertainty.
6. **P1** Stress test dense overlapping events and split/merge behavior: overlap alone can match physiologically different events; identity must be clinically adjudicated. Large match graphs can be expensive.

No PHI, model training, clinical validation, physician-time estimate or production change. Not review-ready.
