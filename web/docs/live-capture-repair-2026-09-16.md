# Live capture repair — 16 September 2026

The report was that live capture, analysis, and coherence were not functioning properly. No exact error message or workstation recording was supplied. Three failures were reproduced against source revision `3a2f64c655f75dc1e56409b9b4a4aca41771636b` before changing the implementation.

## Reproduced failures and corrections

1. **Scrolling alignment failed with missing pixels.** A nonfinite sample contaminated every candidate alignment cost. Alignment now compares finite, directly observed, unclipped pixels. It requires at least 70% of the candidate overlap and at least 16 comparisons in each contributing row, with the existing requirement for two reliable rows (one for a single-channel source). The previous mismatch and ambiguity rejection thresholds are retained. Missing samples in the appended interval remain missing and invalidate their analysis windows.
2. **Automatic sweep detection was blocked by old unreadable sections.** The whole-row readability gate ran before cursor-motion detection. A correctly advancing cursor is now evaluated first. New sections still undergo their own extraction and analysis checks. Automatic progression is the initial selection; explicit sweep and scroll options remain available.
3. **Untracked settings could cause a false change alert.** OCR values that had never established an automatic reference were compared as changes. Only established keys are now compared. Entirely manual configurations no longer run an automatic OCR check with no reference. Previously readable tracked settings that change or disappear still pause capture. The pause message identifies the affected fields or labels.

Capture status now distinguishes receiving columns, building the first window, incomplete data, and analyzed captured channels. Frozen screens do not keep announcing old analysis as a new result. Derived channels do not inflate the captured-channel count. A 15-second processing-response timeout and a message-decoding error handler provide a recoverable pause instead of leaving capture indefinitely busy.

## Verification

- Before correction: three targeted regression cases failed (scroll alignment, partial-page automatic sweep, and untracked settings).
- After correction: all **162 tests passed**, including six new live-capture checks; syntax, UI references, and network policy checks passed; production build succeeded.
- The production signal worker processed generated two-channel pixels in automatic mode, recognized the sweep, recovered the programmed 10 Hz rhythm in both channels, produced four seconds of analysis, credited no new interval on a frozen image, and marked a later interruption as a gap.
- Scrolling tests preserve missing samples and reject their spectra, then recover analysis after the missing samples leave the two-second window. Sparse alignment evidence remains rejected.
- Existing tests for simultaneous channel phase, voltage calibration, missing data, sweep retention, crossing rejection, and audio freshness passed.

## Limits

This is code-level and pixel-replay validation. Browser window-sharing permissions, the user's live workstation, and actual audio output were not exercised. The previous CHB-MIT benchmark was not rerun; these changes do not establish improved recovery at dense same-color crossings.

The current site computes waveform and band-power features, not a cross-channel EEG coherence estimator. The spatial surface is not evidence of EEG coherence. No new coherence measurement or clinical interpretation was introduced by this repair.
