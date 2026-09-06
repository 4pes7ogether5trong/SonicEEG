# Dynamic synthetic journey

**Explore synthetic EEG** starts a 144-second, four-patient demonstration. Each patient has a distinct phase, background frequency and mirrored travel direction. The first two seconds are generated immediately to populate the field; the rest plays at normal speed. The original 84-second sound demonstration and the eight listening trials remain under Practice with their original generators and targets.

| Time | Programmed scene |
| --- | --- |
| 0–24 s | Posterior alpha waxing/waning and two frontal blink-like deflections |
| 24–48 s | A moving spatial focus with a continuous-phase 4–22 Hz chirp |
| 48–72 s | A focal sharp/slow train with increasing amplitude, rate and spatial extent |
| 72–96 s | Bilateral rhythmic packets with a faster component |
| 96–120 s | Attenuated background with alternating lateral bursts |
| 120–144 s | Posterior alpha, frontal theta and lateral fast activity; gradual settling |

The generator constructs 19 schematic electrode potentials, then subtracts their common average at each sample. Blocks are deterministic and contiguous at 128 samples/second. This is a designed sensor field, not a cortical forward model, patient recording or diagnostic example. Smooth envelopes join the scenes. The same FeaturePipeline measurements drive rendering and sonification; labels only describe the script.

**Practice → Build full demo history** generates the full journey cooperatively, opens the side profile and stops playback. Intermediate frames enter history without entering the audio engine. Stop or a source change cancels generation; generated history never masquerades as elapsed live acquisition. The timeline, whole-history view, frequency layers, lens and section controls remain available. No patient data is used.

Numerical checks cover block continuity, common-average consistency, the moving focus and changing peak frequency, quiet/burst contrast, simultaneous bands, and complete four-stream processing through the history pipeline. Device appearance and physical listening still require user evaluation.
