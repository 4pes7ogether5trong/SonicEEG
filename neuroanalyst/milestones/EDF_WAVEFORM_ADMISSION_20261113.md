# EDF waveform admission milestone — 2026-11-13

Non-production commits: eabf54930aec7dc75c31e9dab9a01f2b79352eba (inspector), fe71d1961bafd5bd0531ce35e5ad03e1b7439cd6 (regressions).

## Completed
- Implemented local EDF header and per-channel sample geometry inspector with full-file SHA-256, expected payload size, physical/digital calibration validation, recording duration, channel sample rates and explicit fail-closed readiness.
- The local authored implementation passed 8/8 generated EDF file regressions on Node 22.16.0: valid file, multi-channel geometry, trailing bytes, empty record count, unsupported version, bad calibration, truncation and missing file.
- Published both implementation and tests on the non-production branch. Exact committed files have NOT been executed in CI.
- Real EDF retrieval attempted from PhysioNet, but the execution container's DNS failed. No real EEG signal has been inspected or analyzed. NEMAR GitHub EDF entries are pointers, not actual EDF bytes.

## Limitations
- Only classic fixed-record EDF is admitted. EDF+D discontinuities, EDF+ annotations, unknown record counts, BDF and vendor formats require dedicated parsing; no assumption of contiguous sample time is valid for EDF+D.
- File integrity and sample geometry are not clinical validity, deidentification or licensing authorization. No PHI is emitted from patient or recording header fields; local files remain local.
- SHA-256 currently buffers the entire file; replace with streaming hashing before large clinical recordings.
- No detector model, weights, training, patient-held-out waveform evaluation or physician-time benefit was measured.

## Prioritized next actions
1. P0 Obtain legally reusable actual EDF bytes through an approved download path; inspect file and reconcile recording length, sampling and channel metadata against Siena/NEMAR annotations. Do not admit until license/privacy review.
2. P0 Execute exact committed EDF suite in CI, then replace buffered hashing with streaming and verify large files.
3. P0 Generate blinded waveform-only detector predictions and compare with published and independent reviewer boundaries using the existing ±3-second evaluator; keep PN13 recordings in one patient split.
4. P1 Validate discontinuities, EDF+ annotations, reference/montage derivations, reviewed-epoch masks and 20-minute evaluation windows.
5. P1 Expand to legally reusable multi-patient pediatric and neonatal records with age-appropriate clinical review.
