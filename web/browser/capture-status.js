export function captureStatusMessage(message) {
  const { accepted, gap, expectedRedraw, usableChannels, channels = [], reason, mode } = message;
  const progression = mode === 'sweep' ? 'Sweep' : mode === 'scroll' ? 'Scroll' : 'Auto';
  if (gap && !expectedRedraw) {
    const advice =
      reason === 'Sweep cursor unavailable'
        ? 'Keep the moving colored bar inside the waveform box, or choose Continuous scrolling if the traces move left.'
        : reason === 'Too few reliable traces'
          ? 'Check row alignment, show fewer channels, or increase their spacing.'
          : reason === 'Screen alignment lost' || reason === 'Ambiguous screen alignment'
            ? 'Check seconds across the waveform region and display progression.'
            : 'Review capture setup if this continues.';
    return `${progression} · Analysis paused: ${reason}. ${advice}`;
  }
  if (!accepted) return `${progression} · ${reason || 'Waiting for new EEG columns'}`;
  if (usableChannels == null)
    return `${progression} · Receiving EEG columns · building the first 2-second analysis window`;
  if (!usableChannels)
    return `${progression} · Receiving trace fragments · no complete, qualified 2-second analysis window`;
  return `${progression} · ${usableChannels}/${channels.length} captured channels analyzed · ${reason}`;
}
