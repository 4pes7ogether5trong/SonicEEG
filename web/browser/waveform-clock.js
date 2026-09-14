// Presentation follows retained source time at 1× speed. Incoming overlapping
// windows can carry an unfinished prefix; a fixed latest-half-second shortcut
// would discard that visible morphology. This clock never fabricates a sample.
export class WaveformClock {
  position(now) {
    return Math.min(this.end, this.start + Math.max(0, now - this.arrival) / 1000);
  }
  ingest(frame, now, mode = 'live') {
    const wave = frame?.waveform;
    if (!wave) {
      this.wave = null;
      this.context = null;
      return;
    }
    const context = JSON.stringify([mode, frame.source, frame.segment, frame.settings]);
    if (wave === this.wave && context === this.context) return;
    const prior = this.position(now);
    const continuous =
      this.wave &&
      context === this.context &&
      wave.end > this.end &&
      frame.start <= this.end + 0.000001;
    this.start = Math.min(wave.end, Math.max(wave.start, continuous ? prior : frame.start));
    this.end = wave.end;
    this.arrival = now;
    this.wave = wave;
    this.context = context;
  }
  lag(now) {
    return this.wave ? Math.max(0, this.end - this.position(now)) : 0;
  }
}
