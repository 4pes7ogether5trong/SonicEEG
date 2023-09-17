# SonicEEG
Sonification of EEG waveforms for cross-compatible multi-facility use
Certainly! Here's a draft for the `README.md` file based on our conversation:

---

# SonicEEG

SonicEEG is a web-based application designed to visually and audibly represent EEG patterns. The project provides a simplistic representation where an EEG waveform is shown on a screen, and a refresh bar scans across it. The ROI behind the refresh bar detects the waveform's amplitude, modulating the sound pitch to match the waveform's frequency.

## Features

- **Visual Representation**:
  - A sine wave representation of EEG data.
  - A moving refresh bar that simulates scanning the EEG waveform.
  - An ROI that follows the refresh bar, detecting the waveform's amplitude.
  
- **Audio Representation**:
  - Sound modulation based on the detected amplitude from the ROI.
  - Dynamic change in pitch according to the frequency of the sinus rhythm.
  - Control buttons to start, stop, and configure the base frequency for sound representation.

## Implementation

The project uses:
- **HTML**: To structure the content.
- **CSS**: For styling and animations.
- **JavaScript**: To control the dynamics of the waveform, ROI movement, and sound modulation.

## Usage

1. Open the web application.
2. Click on "Start Monitoring" to begin the visual representation.
3. Click on "Start Sound" to begin the audible representation. Adjust the base frequency as needed.
4. The waveform will be scanned, and as the refresh bar passes over it, the sound's pitch will change to reflect the waveform's frequency.

## Troubleshooting

If the GitHub Pages site isn't working:
- Ensure the repository structure is correct.
- Check that you're on the correct branch.
- Validate the GitHub Pages settings in the repository.
- Review any errors shown in the GitHub Pages section.
- Consider caching issues or delays in GitHub Pages updates.

## Contributions

This project was developed with the guidance and input from (https://github.com/4pes7ogether5trong). All contributions, suggestions, or issues are welcome.

---
