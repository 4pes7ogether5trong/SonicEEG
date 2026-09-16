# Individual patient sound controls

Open a patient's **Adjust** menu. Each slot independently controls octave, sound mode, sensitivity threshold and volume. The defaults retain the original continuous sound, zero amplitude threshold, and A–D octaves 3–6. Choices survive capture restarts within the tab. They are not stored across page reloads.

| Control | Behavior |
| --- | --- |
| Octave | C2–A2 through C6–A6. All patients retain the shared C/D/E/G/A scale and their distinct timbres. Octaves may overlap if the operator chooses. Test voice auditions that patient's selected register. |
| Continuous | The existing measured band rendition, with an adjustable 0–80 µV band-RMS threshold. Zero includes the background. Each channel contributes only amplitude above the threshold. |
| Changes only | Quiet until a compatible fixed baseline is pinned. An adjustable 1–24 dB threshold controls changes in either direction, using the same 2 µV reference floor as the visual baseline map. Default: 6 dB. |
| Volume | The existing 0–1.5× patient gain, independent of the threshold. Master volume and Focus still apply. |

Changes are computed for each observed channel before hemisphere pooling. This preserves focal redistribution that can disappear when only the largest hemispheric power is compared. For band RMS `r` and pinned reference `r₀`, define `d = abs(20 log10((r+2)/(r₀+2)))`. The audible difference amplitude is `abs(r-r₀) × clamp((d-threshold)/3, 0, 1)`. The 3 dB transition avoids a hard onset. Attenuation remains audible even when the current valid signal is zero. Missing measurements never stand in for zero.

Band tones, sharp-candidate accents and held persistence emphasis all obey the patient's gate. Returning inside the threshold cancels pending data accents and fades the tones. Technical data-loss cues and explicit Test voice remain separate from the activity gate. Test voice continues to bypass patient gain/mute while respecting master volume; it is an identity reference, not the patient's measured sound level. The audio clock still expires stale measurements after 2.5 seconds. Octave changes retune band voices, held emphasis and future reference/status cues without resetting freshness.

Pin baseline while fresh measurements are arriving. Source, segment or recording-setting changes clear it. A missing compatible baseline is shown explicitly in the patient card and changes-only remains quiet. Changing a threshold does not repin or gradually adapt the baseline. Audio thresholds do not alter visual measurements or the visual heat map's fixed 6 dB criterion.

The fixed listening exercise temporarily uses continuous sound at 0 µV, preserving the selected octaves and volume. Patient profile controls are locked during the exercise; closing it resumes their configured modes and thresholds. Exports record effective per-patient octave, mode and threshold alongside the existing listening settings.

This is a spectral rendition updated from analysis windows, not cycle-by-cycle raw waveform playback. A change in morphology with unchanged band powers may remain quiet in changes-only mode. The threshold is an attention preference, not a clinical event threshold. Code checks cover independent pitch, onset/return to silence, attenuation, focal changes, missing reference, source boundaries, settings retention and exercise behavior. Physical listening remains an operator evaluation.
