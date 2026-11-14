# Reviewed-epoch pattern occupancy prototype — 2026-11-14

Status: local prototype only; not integrated or clinically validated.

Local artifacts: `reviewed-prevalence.cjs` and `reviewed-prevalence.test.cjs` (conversation attachments). Node 22.16.0 `node --test` passed 12/12 constructed-data tests on 2026-11-14. GitHub source is NOT committed by this milestone; do not treat this as production implementation.

Prototype computes same-pattern interval unions, intersects with usable AND reviewed masks, and uses actual usable-reviewed seconds for denominator. Overlapping runs are counted once; different pattern IDs stay separate; unreviewed gaps and unusable segments are excluded. Measurement provenance distinguishes `complete`, `observed_estimate`, and `unquantified_example`; latter has no numeric occupancy. It deliberately refuses to auto-assign ACNS prevalence categories, including neonatal recordings. Detector candidate counts do not establish clinical pattern identity.

Priority backlog:
1. Commit the exact tested source and test bytes to this non-production branch, run clean-checkout tests and CI; inspect numerical precision and malformed-input handling.
2. Integrate with report pattern populations (localization, state/epoch, representative trace, reviewer confirmation) and the existing evaluation-admission gate; preserve provenance and distinct pattern IDs.
3. Implement qualified-reviewer ACNS category mapping after checking primary ACNS 2021 B/C.3.a text and v0.8.1 reporting semantics. Keep neonatal-specific rules separate.
4. Independent EDF decoder comparison on authorized deidentified real recordings; capture hashes, licensing, montage, filters, sampling, references, review masks.
5. Blinded held-out three-mode comparisons: misses, ±3s offset agreement among matched seizures, abstentions, burden, age/montage/state stratification, physician review time.

No real EEG processed; no weights trained; no clinical performance or physician-time benefit measured. Human verification required before any report delivery.