import { parseDerivation, POSITIONS } from './montage.js';
export class FieldAudio {
  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      const limit = this.context.createDynamicsCompressor();
      this.master.connect(limit);
      limit.connect(this.context.destination);
      this.voices = [];
      // A fixed spectral mapping; no audio is generated from hidden/invalid measurements.
      for (let b = 0; b < 5; b++)
        for (const side of [-1, 1]) {
          const oscillator = this.context.createOscillator(),
            gain = this.context.createGain(),
            pan = this.context.createStereoPanner();
          oscillator.type = 'sine';
          oscillator.frequency.value = [98, 147, 220, 330, 494][b];
          gain.gain.value = 0;
          pan.pan.value = side * 0.75;
          oscillator.connect(gain);
          gain.connect(pan);
          pan.connect(this.master);
          oscillator.start();
          this.voices.push({ b, side, gain });
        }
    }
    await this.context.resume();
    this.enabled = true;
    this.master.gain.setTargetAtTime(0.15, this.context.currentTime, 0.05);
  }
  silence() {
    if (this.context) {
      this.voices.forEach((v) =>
        v.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.04),
      );
    }
  }
  disable() {
    this.enabled = false;
    if (this.context)
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
  }
  update(frame, selected = null, band = -1) {
    if (!this.enabled) return;
    const channels =
      frame?.channels.filter(
        (c) => c.valid && (!selected || selected === c.name),
      ) || [];
    for (const v of this.voices) {
      const group = channels.filter((c) => {
        const p = parseDerivation(c.name);
        return p && Math.sign(POSITIONS[p.a][0] || v.side) === v.side;
      });
      const rms = Math.sqrt(
        group.reduce((s, c) => s + (c.bands[v.b] || 0), 0) /
          (group.length || 1),
      );
      const level = band >= 0 && band !== v.b ? 0 : Math.min(0.22, rms / 180),
        now = this.context.currentTime;
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(level, now, 0.08);
      v.gain.gain.setTargetAtTime(0, now + 1.2, 0.05);
    }
  }
}
