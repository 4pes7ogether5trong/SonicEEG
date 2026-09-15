# Controlled CHB-MIT capture benchmark

Run the same original EEG through a fixed raster display and the production signal worker. This is a reconstruction benchmark, not a seizure classifier or clinical validation. Display conditions, scoring intervals, amplitude scales and polarity are fixed in `spec.json`. The original reference revision is `ab6485b`; candidate revisions are recorded by their full commit and source hashes.

From this directory, install the benchmark-only Python dependencies in a separate environment and download the open source EDF:

```bash
python -m pip install -r requirements.txt
curl -fL --max-time 900 -o source/chb01_03.edf https://physionet.org/files/chbmit/1.0.0/chb01/chb01_03.edf
python scripts/prepare.py ../..
node scripts/replay.mjs ../.. isolated_2uv
node scripts/replay.mjs ../.. dense_2uv
node scripts/replay.mjs ../.. dense_6uv
python scripts/score.py
```

The EDF must match SHA-256 `4c4a95a9b4331aeaadadd538763eb2e735950d9aa615b85ee6246c784be8ae90`. `prepare.py` independently parses the numerical EDF header and samples, cross-checks every extracted digital sample and physical voltage with pyedflib, and verifies the supplied annotation. Patient and date header fields are not exported.

The scored interval is [2960, 3070) seconds. The supplied seizure annotation is [2996, 3036). Before and after do not imply normal or artifact-free EEG. Each condition has 221 lossless RGBA frames, a 10-second sweep across 1,800 columns, and 180 reconstructed columns per second. The first 18 derivations are used for montage conditions; the isolated control uses F7-T7. Every original 256-Hz point is rendered. No extra filtering, fitted gain, fitted time lag, relabeling or zero-filled gaps are used.

`results/metrics.json` reports every expected channel/column position, including missing samples. Voltage error is calculated on observed and repaired samples separately, so read it together with coverage. `*_aligned.npz` holds original and recovered voltages, production visibility masks and feature-valid intervals. Valid feature time is a production analysis flag, not a clinical accuracy measure. The saved JSONL logs must contain one status record for every input frame. Logs are written to a temporary file, checked, and renamed atomically when complete; the scorer checks them again.

The harness invokes the unchanged application worker in Node. It does not exercise the browser capture picker, OCR, codecs, the clinical workstation, audio hardware or listener interpretation. The output error includes rasterization and reconstruction, not preservation of all original 256-Hz samples. Data and generated outputs stay outside source control. This benchmark does not select a pass/fail threshold or support population performance claims.

Results of the first improvement pass are in `../../docs/chbmit-fidelity-2026-09-15.md`. The initial variant that changed channel acceptance was discarded; the selected change keeps path-selection geometry separate from measured stroke position.

Data attribution: Guttag, J. (2010). [CHB-MIT Scalp EEG Database, version 1.0.0](https://physionet.org/content/chbmit/1.0.0/). PhysioNet. [DOI 10.13026/C2K01R](https://doi.org/10.13026/C2K01R). Original publication: Ali Shoeb, [Application of Machine Learning to Epileptic Seizure Onset Detection and Treatment](https://hdl.handle.net/1721.1/54669), MIT PhD thesis, 2009. Data license: [Open Data Commons Attribution v1.0](https://physionet.org/content/chbmit/view-license/1.0.0/). The included checksum and summary files are the source metadata downloaded from this dataset.
