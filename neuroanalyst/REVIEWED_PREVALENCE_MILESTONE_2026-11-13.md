# Neuroanalyst reviewed prevalence milestone — 2026-11-13
Non-production branch: neuroanalyst/report-export-gate-20261112

## Delivered
- reviewed-prevalence.cjs measures occupancy of a *reviewer-confirmed single clinically distinct pattern population*, unions overlapping half-open pattern runs, clips to unioned usable-reviewed epochs, uses actual reviewed seconds as denominator.
- Preserves complete measurements vs observed estimates vs unquantified examples; no invented percentage for the latter two.
- Neonatal ACNS categorization is blocked pending separate clinical protocol. Zero occupancy reports absent, not rare.
- Comparability rejects differences in reviewed epoch masks even when total reviewed duration matches, plus acquisition/montage metadata mismatches.
- Local node --test reviewed-prevalence.test.cjs: 12/12 passed after correcting an initially mistaken test expectation (the correct union intersection was 70 s, not 60 s).
- Commits: 695783c9dc34715a2d6d72ba339b7337b2ce3076 and 10daadea0c7454b46735a059526b464b5ba30366.
## Boundaries
Not a waveform classifier, not verified against clinical traces, not a determination of epileptiformity. Must not infer clinical prevalence from candidate detector counts. Clinical ACNS thresholds require qualified review before deployment. GitHub exact-head tests/CI not run. No patient EEG data processed.
## Next prioritized work
1. Obtain legally reusable deidentified EDF waveform bytes and independent hash/license review; evaluate actual blinded predictions, not only published annotations.
2. Run exact committed tests/CI and integrate with report evidence IDs, localization, state, trace links and explicit reviewer signoff.
3. Compare three detector modes on patient-held-out records, identical montage, masks and sampling/filter settings; score misses, false alarms, signed ±3s offset agreement, abstentions, review burden.
4. Add age-specific reference curriculum and separate neonatal rules; stratify evaluation by nine mandatory age groups.
