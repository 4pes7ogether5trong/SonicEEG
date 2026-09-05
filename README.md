# SonicEEG

SonicEEG explores EEG as a luminous, spatial field with memory and synchronized sound. The new browser application reconstructs **visible, calibrated screen traces** from a user-selected EEG application window, then renders measurements around schematic electrode positions. Technologists use a hosted page; they do not install Python, a browser extension, or a capture agent.

This is an implemented research prototype. Compatibility with Natus, Cadwell, Nihon Kohden and other vendor displays is **not yet established**. The extractor currently needs separated trace rows and a continuously scrolling display or a colored sweep cursor. It cannot access another application's hidden recordings or reverse display filtering.

## What is implemented

- **Living surface:** signed displacement, absolute spectral amplitude as light, five separately selectable frequency colors, rotation, zoom, perspective lens, cutaway and fly navigation. The main analysis view contains no waveform traces.
- **Accumulating history:** older measurements expand outward or along a side profile. A temporal pyramid preserves the recording extent, weighted power, rare peaks, valid duration, gaps and amplitude prevalence.
- **Prevalence:** choose a band RMS threshold and see the fraction of valid time represented by windows meeting it. This is an amplitude criterion, not an automatic abnormality or seizure label.
- **Montage awareness:** local OCR proposes electrode pairs and row positions, including legacy T3/T4/T5/T6 aliases. Common longitudinal, transverse and referential templates suggest expected unseen derivations. Editable confirmation remains necessary.
- **Hidden-channel provenance:** observed, algebraically derived, expected unseen and unavailable measurements remain distinct. A missing voltage difference is derived only from a connected, aligned path of observed differences.
- **Capture calibration:** separate waveform/label/settings regions, two-click voltage-bar calibration, seconds per region, polarity, filters, row alignment preview, duplicate rejection and explicit capture gaps.
- **Local processing:** image extraction and FFT in a Web Worker; bundled local OCR worker, WASM and English model; no application upload, analytics or cloud-AI integration.
- **Four patient voices:** independent capture, montage, calibration and history for slots A–D. Fixed C3–A3, C4–A4, C5–A5 and C6–A6 ranges share a C–D–E–G–A band palette, with restrained timbre differences, hemisphere stereo placement and a shared voltage scale.
- **Independent live audio:** each patient's gain, mute and focus controls operate separately. Visual patient/band selection, time review, freeze and disabling 3D never redirect live sound. Only fresh measurements refresh a voice; stale sound fades after 2.5 seconds. Focus lowers other patients by 12 dB without fully silencing them.
- **Listening exercise:** eight repeatable synthetic trials with one, two and four active patients, including simultaneous changes. Select the patients that changed, reveal the programmed targets and optionally export responses locally. This is not a validated clinical or psychometric test.
- **Local history:** opt-in IndexedDB persistence and per-session deletion. Opening a saved session restores quantitative frames; the original EEG recording and screenshots are not archived.
- **Explicit synthetic example:** a repeatable background and recurrent temporal activity for exploration. Capture errors never switch to synthetic data.

## Build and run — developers / site administrators

Node 22 or newer is recommended for the development tooling. These commands run on the development or hosting machine, **not on each technologist's workstation**.

```bash
npm ci
node browser/build-assets.mjs
npm run dev
```

Open the local URL printed by Vite. For a deployable static application:

```bash
npm run check
npm test
npm run build
```

Serve the contents of `dist/` on an approved HTTPS static host. Include its `ocr/` directory and license files. The build has a relative base path and can be hosted under a subdirectory. Opening source files directly with `file://` is unsupported. Screen capture requires a browser permission gesture and may be restricted by workstation/browser policy. Keep the source window and SonicEEG visible; browser throttling and a non-advancing capture produce gaps.

The root `index.html` remains the **legacy** static demo entry. To serve the new interface, publish `dist/`, not the repository root. The CI workflow checks and packages the static build; it does not change a deployed website or GitHub Pages settings.

## First capture

1. Open the hosted page, select patient **A**, then choose **Capture EEG window**. Use the browser's native chooser to select that patient's EEG application window. Repeat setup independently for B, C and D as needed; each selection requires a browser permission gesture.
2. Draw the waveform, channel-label and display-setting regions. Exclude headers and patient video from these processing regions. The initial full-window preview exists locally for this selection.
3. Read the labels with local OCR, or enter the visible derivations in row order. Confirm any suggested glyph corrections. A printed montage name alone is insufficient.
4. Confirm time scale, polarity, filters and voltage per captured pixel. Use a visible voltage bar; printed µV/mm alone cannot calibrate a resized screenshot.
5. Use **Show extraction alignment** and verify the orange extracted points against the source. Adjust the crop/row offset, then confirm and begin.
6. Enable sound at a comfortable volume. Identify plays the selected patient's brief octave reference tone. Explore Live surface, Whole history and Side profile, select a visual channel/band, change the history statistic, or scrub time while all live patients continue sounding. Enable local saving before capture if detailed older quantitative frames must remain available. Opening a saved session stops only its own slot; live patients in other slots continue.

For an immediate demonstration, choose **Try four synthetic patients**, then **Enable sound**. Switch patient cards and try **Freeze view** or turn off **3D view** while listening. The listening exercise becomes available when no real capture is attached; it never replaces an active real capture. **Stop all** stops the four sources; **Mute all sound** leaves acquisition running.

Labels and readable settings are rechecked about every five seconds. A discrepancy or lost alignment requests setup review and marks recent measurements uncertain. Settings that are not readable cannot be monitored automatically. An uncertain channel does not become a zero-amplitude channel.

## Design and evidence

See [visual and measurement design](docs/browser-field-design.md) for the mapping equations, privacy boundary, temporal compression, limitations and corrections to the earlier concept. See [validation and comparison protocol](docs/browser-validation.md) for completed checks and the work still needed on actual EEG displays and physical devices.

The browser tests use generated pixels and synthetic measurements. They establish specific reconstruction, calibration, OCR, storage and aggregation properties, not clinical performance. No browser interaction, graphics-device or vendor-display acceptance test has been completed for this revision.

## Existing work

- `browser/` — new install-free end-user application and numerical tests.
- `eeg_visualizer_mvp/` — earlier modular Python/raw-file project, preserved as a separate path; [its documentation](eeg_visualizer_mvp/README.md).
- `sonic_eeg_prototype/` — original offline screen/sonification experiment.
- `docs/roblox_easter_game_design.md` — unrelated contributed document retained from repository history.

Developed with [4pes7ogether5trong](https://github.com/4pes7ogether5trong). Suggestions and reproducible, synthetic or appropriately deidentified test fixtures are welcome. Do not submit patient screenshots or recordings to the public repository.
