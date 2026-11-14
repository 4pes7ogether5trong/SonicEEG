# Offset-scoring milestone — 2026-11-14

Added evaluation-only point-offset scorer with inclusive ±3 s agreement, signed errors, distinct missed seizures, abstentions, non-point references, and unmatched predictions. Event IDs must be externally assigned by an independently validated seizure matching process; matching by offset alone is prohibited. Patient/recording mismatches fail closed.

## Verification
15/15 constructed-data Node.js tests passed locally on Node 22.16.0 before commit. Committed bytes and CI are not yet independently verified. No real EEG or model inference evaluated; no clinical accuracy or time saving established.

## Cumulative next-action backlog
1. Run exact committed tests in clean checkout/CI; integrate scorer with blinded three-mode evaluation and verified event matching.
2. Independently cross-check EDF decoding; admit licensed/deidentified real patient-held-out waveforms and preserve provenance.
3. Integrate reviewed-mask-aware prevalence populations with trace references, clinician confirmation and age-specific applicability gates.
4. Develop and validate whole-episode overlapping-pattern reader, baseline/state recovery and onset/offset landmarks; report stratified misses, burden, abstentions and confidence intervals.
5. Qualified clinical review and timed physician workflow baseline before service claims.

PN13-2 Event A reviewer offset 02:01:56 (7316 s), change landmark 02:01:31; preserve separately from published reference. Held out; never use this reviewer observation as a training label.
