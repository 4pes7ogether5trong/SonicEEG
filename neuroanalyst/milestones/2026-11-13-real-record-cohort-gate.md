# 2026-11-13 real-record cohort readiness gate

Non-production branch: neuroanalyst/report-export-gate-20261112.

## Actual published data examined
NEMAR Siena PN13 annotation source: https://github.com/nemarDatasets/nm000385/tree/main/sub-PN13/eeg
The published run-01, run-02, run-03 annotation onsets/offsets are 7062–7110 s, 7249–7314 s, and 7553–7704 s. These are three recordings from ONE patient; no detector waveform results exist for these records in this milestone.

## Changes and verification
- Added real-record-cohort-gate.cjs, consuming the existing published-annotation audit, with checks for subject split leakage, duplicate recordings, invalid boundaries, absent waveform bytes, absent detector predictions, and unverified license admission.
- Added 10 executable regression assertions. Locally authored equivalent source/tests executed on Node 22.16.0: 10/10 passed. Exact GitHub committed files and CI NOT executed.
- The actual PN13 cohort returns eligibleForWaveformBenchmark=false, independentSubjects=1, referenceEvents=3, with waveform_unavailable, predictions_unavailable and license_unverified. This is a source annotation / readiness audit, NOT seizure detection accuracy.
- Attempts to fetch PhysioNet EDF and GitHub raw files from container failed due to DNS. The GitHub connector can retrieve annotation text, but rejects binary EDF.

## Prioritized next work
1. P0 Acquire verified licensed, deidentified EDF waveform bytes through an authorized route; independently verify license/terms, hash, channel metadata, sample rate, montage and usable reviewed masks. Never mark licenseVerified based on mere public availability.
2. P0 Run existing signal-only, visual assist and episode-aware detectors on waveform without reference labels as input; save blinded predictions, reproducible settings, code/model hashes and reviewer adjudication provenance.
3. P0 Score matched events with inclusive ±3 s onset/offset comparisons, missed seizures, false alarms/hour, uncertain/artifact intervals, and signed boundary differences; use independent patient-level holdouts, not three PN13 recordings as three patients.
4. P1 Age-stratified nine-group physiology and prevalence review using expert-labeled data; neonatal maturity and terminology separate; report per-stratum sample sizes and uncertainty.
5. P1 Technician-verifiable evidence navigation, actual measured time-on-task, and qualified clinical review before any clinical or physician-time claims.

PN13-2 reviewer offset 02:01:56 and landmark 02:01:31 remain development observations separate from published annotation (02:01:54 offset).
