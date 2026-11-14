# Neuroanalyst cumulative milestone — 2026-11-14, report evidence gate

Non-production branch: neuroanalyst/episode-boundaries-20261112.

## Added
- report-evidence-gate.cjs: report-facing population adapter for existing reviewed-prevalence.cjs.
- report-evidence-gate.test.cjs: 10 synthetic tests.
- Explicit population ID, localization, state, representative recording/time and run evidence.
- Overlap-unioned occupancy against usable reviewed epochs; no fabricated 20-minute denominator.
- Separate complete, observed estimate and unquantified evidence; block automatic ACNS grade without reviewer confirmation; neonatal ACNS grade withheld.
- Sporadic candidate runs are not counted as confirmed epileptiform discharge rates.

## Verification and limits
An equivalent local adapter passed 10/10 Node 22.16.0 tests. Exact committed files have not been executed from a clean checkout; CI is unverified. No patient recordings, training, sensitivity estimates, physician-time measurements or clinical approval.

## Prioritized next actions
1. Clean-checkout execute exact committed tests and existing evaluation/EDF suites; fix any discrepancy.
2. Validate EDF waveform samples against independent decoder on permitted recordings; capture acquisition metadata and licensing.
3. Connect report adapter to technician report UI with mandatory evidence navigation and human verification.
4. Add clinically reviewed sporadic discharge rate and ACNS category workflows; validate thresholds against ACNS 2021 B/C.3.a before enabling.
5. Patient-held-out three-mode evaluation with matched masks/montages, age strata, ±3s offset scoring and review burden.
6. Age-conditional EEG feature reference curriculum and expert-reviewed developmental fixtures.
