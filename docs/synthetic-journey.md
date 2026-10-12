# Four-patient synthetic sampler

**Explore synthetic EEG** starts a twelve-minute, four-patient demonstration. The first two seconds populate the field immediately; the rest plays at normal speed. The original 84-second sound demonstration and the eight listening trials remain under Practice with their original generators and targets. Each patient retains its established octave and timbre, driven by its own measured signal.

| Patient | Programmed appearance |
| --- | --- |
| A | Six 12-second episodes of symmetric, synchronous 3/s generalized spike-wave, starting at 0:12 and repeating every two minutes. Low-amplitude awake background between episodes. |
| B | Reference background for ten seconds, then continuous rhythmic sharp/slow activity through 12:00. Rate, amplitude and spatial extent evolve, beginning with a right temporal maximum. The final interval exceeds ten continuous minutes of scripted activity. |
| C | Sustained N3-like slow waves at 0.87 and 1.43 Hz, waxing and waning, with occasional small spindle packets. |
| D | Low-amplitude mixed faster activity with weak posterior alpha, representing eyes open; unevenly spaced broad frontal blink deflections, including occasional double blinks. |

The generator constructs 19 schematic electrode potentials, then subtracts their common average at each sample. Blocks are deterministic and contiguous at 128 samples/second. Spatial contrasts and polarity reflect that reference. This is a designed sensor field, not a cortical forward model or patient recording. The same FeaturePipeline measurements drive rendering and sonification; scenario labels and interval strips are read from the script, never fed into an inference algorithm. The fixed reference is pinned at six seconds in both live and precomputed demonstration modes.

**Practice → Build full demo history** generates the full sampler cooperatively, opens the side profile and stops playback. Intermediate frames enter history without entering the audio engine. Stop or a source change cancels generation; generated history never masquerades as elapsed live acquisition. The timeline, whole-history view, frequency and baseline maps, lens and section controls remain available. No patient data is used.

Numerical checks cover continuity for all four patients, common-average consistency, A's 3 Hz peak and paired frontal symmetry, B's sustained evolving activity, C's dominant slow power and amplitude, D's intermittent frontal blinks, independent baselines and duration-preserving compression. These checks establish programmed behavior; device appearance, physical listening and clinical representativeness require expert evaluation.

The morphology is informed by the ILAE description of [childhood absence EEG](https://www.epilepsydiagnosis.org/syndrome/cae-eeg.html), the [ACNS 2021 critical-care EEG terminology](https://cdn-links.lww.com/permalink/jcnp/a/jcnp_2020_12_21_fong_00313_sdc098.pdf), and the EEG criteria in the [AASM scoring manual](https://www.neumosur.net/files/grupos-trabajo/suenio/AASM-Manual-2012.pdf). Absence and nonconvulsive status labels describe intended demonstration scenarios; clinical behavior and diagnosis are not inferred from this synthetic EEG.
