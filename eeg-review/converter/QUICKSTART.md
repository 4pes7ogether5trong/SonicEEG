# EEG Review local converter

Prepare a recording on a Windows, macOS, or Linux computer, then open the resulting `.eegreview` file in EEG Review on your iPad. The converter reads local files and contains no network calls. Installing dependencies requires an internet connection once.

This is a Python utility with a file-picker window, not a signed application installer. Python 3.12 is the tested version. Keep the entire original recording and all companion files together; conversion creates a separate file.

## One-time setup

Install Python 3.12 from https://www.python.org/downloads/ if needed. Unzip this folder, open a terminal in it, and run the commands for your computer.

Windows (PowerShell):

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe convert_local.py --gui
```

macOS / Linux:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python convert_local.py --gui
```

Run the final command again whenever you want the file picker. If Tkinter is missing on Linux, install your distribution's Python 3.12 Tk package or use the command-line examples below. No Apple developer account or API key is needed.

## Convert and review

1. Browse to the main recording file, keeping companions next to it.
2. Leave format on `auto`, except for Nihon Kohden: select `nihon`. Specify its annotation encoding if the source uses something other than UTF-8.
3. Click **Convert to .eegreview** and choose a new filename on the computer's internal disk. Existing files are never overwritten. Large conversions can temporarily pause the window.
4. Transfer the output using your approved transfer method. Open https://eeg-review.electro-intelligence-tools.workers.dev/ in iPad Safari, tap **Open recording**, and choose the `.eegreview` file.
5. Review the import notes and channel mapping. Confirm a shared acquisition reference in **Recording details** before applying a derived montage. A familiar electrode label alone does not establish the original reference.

A prepared file can be larger than the source: size is approximately `8 × samples per channel × number of selected channels` bytes. For example, 24 hours at 256 Hz and 21 channels is about 3.72 GB (3.46 GiB). The iPad reads one selected time window; conversion of embedded EEGLAB and XDF recordings may require the full source in computer memory. No full-day tablet benchmark has been completed.

## Format selection

| Family | Main file and requirements | Current boundary |
|---|---|---|
| MNE FIF | `.fif` / `.fif.gz`; keep split companions | Continuous voltage channels; acquisition-gap annotations stop conversion |
| EEGLAB | Continuous `.set`; referenced `.fdt` if external | Epoched sets are unsupported; missing data stops conversion |
| Nihon Kohden | `.EEG`, same-stem `.21E`, with `.PNT` / `.LOG` when supplied; `--format nihon` | MNE-supported variants only; one continuous block; annotation encoding must match source |
| Nicolet binary export | `.data` and same-stem `.head` | Also opens directly in the iPad viewer; native NicoletOne `.e` / `.one` is different |
| Persyst | `.lay` and referenced `.dat` | Experimental; sequential channel map, int16/int32, at most one SampleTimes entry; real export comparison pending |
| XDF | `.xdf`; a single EEG stream or explicit stream ID | Numeric voltage data with channel labels/units and uniform timestamps; ordinary jittered streams may be rejected |
| NWB | HDF5 `.nwb`; one `ElectricalSeries` or explicit series path | Uniform samples × channels; preserves calibration and electrode-region ordering |
| Cadwell Arc / Easy III | Native files are not decoded | Export continuous EDF using acquisition/vendor software |
| Natus Xltek / NeuroWorks | Native study folders are not decoded | Use continuous EDF or a compatible Persyst export |

EDF/EDF+C, BDF/BDF+C, supported BrainVision, CSV/TSV and Nicolet binary exports open directly in the iPad viewer without this utility. Discontinuous EDF+D/BDF+D are not supported.

## Optional command line

Use the virtual environment's Python shown above in place of `python` below. Quotes are needed around paths with spaces.

```sh
python convert_local.py study.set study.eegreview
python convert_local.py study.EEG study.eegreview --format nihon
python convert_local.py study.xdf study.eegreview --stream-id 1
python convert_local.py study.nwb study.eegreview --series /acquisition/EEG
python convert_local.py study_raw.fif subset.eegreview --channels Fp1,F7,T7,P7,O1
python convert_local.py --verify study.eegreview
```

For multiple XDF streams or NWB series, the error lists available choices; rerun with the intended ID/path. `--unit uV` is available only for a verified XDF unit override. Do not use it to guess missing units. `--encoding gbk` is an example Nihon annotation override; select the actual source encoding.

## What is preserved and omitted

Calibrated voltage is stored as little-endian float64 microvolts without added filtering, resampling, or rereferencing. Acquisition/preexisting processing remains part of the source. Finite samples and a consistent channel count are required. Recognized acquisition gaps and segment boundaries stop conversion; the converter cannot detect every undocumented vendor timing convention.

Known voltage channels are retained. Non-voltage/untyped channels are excluded with a warning; source-marked bad voltage channels remain, also with a warning. MNE-reader annotations are retained. XDF imports one signal stream without clock synchronization, dejittering, or separate marker streams. NWB trials, intervals and separate event streams are not imported. Source timing origin is recorded in metadata; the display uses elapsed time from the first sample.

Output contains labels and annotations, which may contain identifying information. It is **not anonymized**. EEG files are not uploaded by the viewer or converter. This evaluation build has not undergone clinical validation or physical iPad/Safari acceptance.

## Checks and troubleshooting

`--verify` checks the full payload SHA-256 and byte length. The iPad checks structure and displayed samples, not the full-file checksum. A successful checksum does not establish clinical correctness or authenticate the source.

Save to an internal filesystem that supports hard links (normally NTFS/APFS/ext4). If saving to an external FAT/exFAT drive fails, convert to internal storage first, then copy the completed output.

If a reader rejects a file, preserve the original and use a supported export. Different native versions may need additional integration. Do not rename a vendor container to `.edf`; it must be exported by software that understands the recording.

Dependencies are separate open-source projects installed from their package distributions. The archive contains this utility and documentation, not vendor SDKs or proprietary decoders.
