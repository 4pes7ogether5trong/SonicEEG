# Neuroanalyst evaluation admission milestone — 2026-11-13
Non-production branch: neuroanalyst/episode-boundaries-20261112.

## Delivered
- Pure, fail-closed evaluation comparability gate for 20-minute standard reference windows, actual usable-reviewed denominators, montage derivation direction, electrode coverage, sample rate, filters and reference.
- Prevalence mode additionally requires identical union-normalized reviewed epoch masks, not merely equal duration.
- 12 constructed-metadata regression cases committed. Locally tested equivalent working version: 12/12 passed on Node 22.16.0. Exact committed implementation and tests have **not** been executed; CI not verified.
- No clinical EEG bytes, predictions, model training or physician-time measurement. No production changes.

## Important limitations
- Gate enforces strict acquisition equality, not independently adjudicated equivalence; a qualified reviewer may document scientifically justified comparability in a future controlled exception mechanism.
- This is a **standard-window** benchmark gate; shorter clinical reviews remain legitimate but cannot be labeled 20-minute standard comparisons.
- Pattern prevalence must use the actual usable-reviewed denominator and union overlapping runs; this module checks comparability, not pattern identification.
- Neonatal ACNS IIC and adult prevalence labels require separate clinically approved handling.
- All outputs are preliminary technician-review aids, not autonomous diagnostic decisions.

## Prioritized backlog
1. Run exact committed tests in repository CI; correct any failures and retain immutable test evidence.
2. Verify authorized real EDF access, licensing and privacy; compare decoded samples with independent EDF implementation.
3. Blinded patient-held-out seizure/pattern evaluation across signal-only, visual-assist, episode-aware modes; report misses, false alarms, ±3 s offset agreement among matched seizures, abstentions, and review time.
4. Population-specific evidence-backed structured reports, sparse annotations, measured occupancy, technician verification.
5. Age-conditioned physiology reference and qualified clinical review for all nine strata; report denominators and uncertainty.
6. Physician-time baseline and prospective paired workflow measurement.
