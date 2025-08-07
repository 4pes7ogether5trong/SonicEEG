# Sonic EEG – Autonomous Offline Prototype Agent

Proof-of-concept EEG screen sonification tool. Captures screen quadrants (4 panels), extracts visual waveform traces, performs frequency analysis, and synthesizes harmonic-rich audio per quadrant with stereo panning. Offline-capable, no installation on host system required when bundled with portable Python.

## Quick start

- Optional: create a venv and install dependencies from `requirements.txt`.
- Run a demo without screen capture:

```
python main.py --demo --once
```

Artifacts are saved under `output/`:
- `output/debug_screenshots/<run>/stepXXX_*.png`
- `output/logs/<run>/stepXXX.json`
- `output/audio/<run>/stepXXX.wav`

## Notes

- Screen capture tries `mss`, then `pyautogui`, then `PIL.ImageGrab`. If all fail, it falls back to `sample_inputs/demo_screen.png` or a blank image.
- Waveform extraction uses OpenCV Canny if available; otherwise a numpy-based gradient threshold.
- Sonification is additive synthesis per EEG band with stereo panning per quadrant.

## Not for clinical use.