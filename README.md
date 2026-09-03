# SonicEEG

Source-agnostic EEG sonification and research visualization experiments.

The current MVP turns synthetic EEG, deidentified raw recordings, or calibrated screen-extracted waveforms into one deterministic visual language. Screen capture and sonification are independent adapters; neither is required to run the visualizer.

## Run the visualizer

```bash
python -m eeg_visualizer_mvp --source synthetic --age 30
```

Then open <http://127.0.0.1:8765>.

Full setup, raw-file formats, screen calibration, architecture, and tests are documented in [`eeg_visualizer_mvp/README.md`](eeg_visualizer_mvp/README.md).

## Repository areas

- `eeg_visualizer_mvp/` — modular signal sources, feature contract, browser visualizer, tests, and optional consumers.
- `sonic_eeg_prototype/` — inherited offline screen-scraping and sonification proof of concept.
- `index.html` — redirects GitHub Pages to the static visualizer demonstration.
- `docs/roblox_easter_game_design.md` — previously contributed, unrelated design document retained from repository history.

## Safety boundary

Research prototype only. It is not for diagnosis, alarm generation, or patient monitoring. Pain, emotion, seizure, normal-variant, and abnormality classifications are outside v1.
