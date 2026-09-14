import {
  carrier,
  audioLevels,
  LiveAudioState,
  FRESH_SECONDS,
  VOICE_PROFILES,
  outputCurve,
  OCTAVES,
} from './audio-mapping.js';
import { PatternTracker } from './patterns.js';
import { whiteNoise, penColor, PenTimeline } from './pen-noise.js';

// Data clocks drive emphasis and accents; camera/UI clocks never do.
export class PatientMixer {
  constructor({ now, contextFactory = () => new AudioContext(), onState = () => {} } = {}) {
    this.live = new LiveAudioState(now);
    this.contextFactory = contextFactory;
    this.onState = onState;
    this.enabled = false;
    this.volume = 0.28;
    this.focus = -1;
    this.spatial = 'maximum';
    this.band = -1;
    this.ambient = true;
    this.exerciseMode = false;
    this.voices = [];
    this.trackers = Array.from({ length: 4 }, () => new PatternTracker());
    this.notes = new Set();
    this.lossNotified = [false, false, false, false];
  }
  wave(slot) {
    const c = this.context,
      partials = VOICE_PROFILES[slot].partials;
    const norm = Math.sqrt(partials.reduce((s, x) => s + x * x, 0));
    return c.createPeriodicWave(
      new Float32Array(partials.length + 1),
      Float32Array.from([0, ...partials.map((x) => x / norm)]),
      { disableNormalization: true },
    );
  }
  async enable() {
    if (!this.context) {
      const c = (this.context = this.contextFactory());
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.compressor = c.createDynamicsCompressor();
      this.compressor.threshold.value = -8;
      this.compressor.knee.value = 8;
      this.compressor.ratio.value = 10;
      const ceiling = c.createWaveShaper();
      ceiling.curve = Float32Array.from({ length: 8193 }, (_, i) =>
        outputCurve((2 * i) / 8192 - 1),
      );
      ceiling.oversample = '2x';
      this.master.connect(this.compressor);
      this.compressor.connect(ceiling);
      ceiling.connect(c.destination);
      for (let slot = 0; slot < 4; slot++) {
        const bus = c.createGain(),
          filter = c.createBiquadFilter();
        bus.gain.value = 0;
        filter.type = 'lowpass';
        filter.Q.value = 0.5;
        filter.frequency.value = 650 * 2 ** (this.live.slot(slot).octave - 3);
        filter.connect(bus);
        bus.connect(this.master);
        const wave = this.wave(slot);
        const voices = audioLevels(null).levels.map(({ band, side }) => {
          const oscillator = c.createOscillator(),
            gain = c.createGain(),
            pan = c.createStereoPanner();
          oscillator.setPeriodicWave(wave);
          oscillator.frequency.value = this.pitch(slot, band);
          gain.gain.value = 0;
          pan.pan.value = side * 0.65;
          oscillator.connect(gain);
          gain.connect(pan);
          pan.connect(filter);
          oscillator.start();
          return { oscillator, gain, band, side };
        });
        // This separate held tone encodes emphasis, not an EEG frequency band.
        const accent = c.createOscillator(),
          accentGain = c.createGain();
        accent.setPeriodicWave(wave);
        accent.frequency.value = this.pitch(slot, 2);
        accentGain.gain.value = 0;
        accent.connect(accentGain);
        accentGain.connect(filter);
        accent.start();
        this.voices.push({ bus, filter, wave, voices, accent, accentGain });
      }
      c.onstatechange = () => this.onState(c.state);
    }
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('The browser has not started audio.');
    this.enabled = true;
    this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.08);
    for (let i = 0; i < 4; i++) this.refresh(i);
    this.onState(this.context.state);
  }
  disable() {
    this.enabled = false;
    for (let i = 0; i < 4; i++) {
      this.cancelNotes(i, ['data', 'status', 'reference']);
      this.silence(i);
    }
    if (this.context) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
  }
  begin(slot) {
    this.cancelNotes(slot, ['data', 'status', 'reference']);
    this.live.begin(slot);
    this.trackers[slot].reset();
    this.lossNotified[slot] = false;
    this.silence(slot);
    this.voices[slot]?.pen?.timeline.reset();
  }
  stop(slot, reason = 'stopped') {
    this.cancelNotes(slot, ['data', 'status', 'reference']);
    const notify = reason === 'review' && this.live.status(slot) === 'live';
    this.live.stop(slot, reason);
    this.trackers[slot].reset({ keepBaseline: true });
    this.silence(slot);
    if (notify) this.lossCue(slot);
  }
  unavailable(slot) {
    const s = this.live.slot(slot),
      notify = s.active && !this.lossNotified[slot] && s.state === 'live';
    if (s.active) {
      s.frame = null;
      s.received = -Infinity;
      s.state = 'gap';
    }
    this.trackers[slot].gap();
    this.silence(slot);
    if (notify) this.lossCue(slot);
  }
  redraw(slot) {
    // A verified display wrap can retain its already scheduled, still-fresh
    // background. It must not refresh that background's expiry, replay an
    // event, or count unseen samples toward persistence.
    this.trackers[slot].gap();
    this.cancelNotes(slot, ['data']);
    this.voices[slot]?.accentGain.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
  }
  poll() {
    for (let slot = 0; slot < 4; slot++)
      if (this.live.status(slot) === 'stale' && !this.lossNotified[slot]) {
        this.trackers[slot].gap();
        this.silence(slot);
        this.lossCue(slot);
      }
  }
  pinBaseline(slot, reference = this.live.slot(slot).frame) {
    const pinned = this.live.status(slot) === 'live' && this.trackers[slot].pin(reference);
    if (pinned) {
      this.cancelNotes(slot);
      if (this.live.slot(slot).soundStyle === 'pen') this.silence(slot);
      this.refresh(slot);
    }
    return pinned;
  }
  pitch(slot, band) {
    return carrier(slot, band, this.live.slot(slot).octave);
  }
  soundSettings(slot) {
    const s = this.live.slot(slot),
      mode = this.exerciseMode ? 'continuous' : s.soundMode;
    return {
      mode,
      threshold: this.exerciseMode
        ? 0
        : mode === 'changes'
          ? s.changeThreshold
          : s.amplitudeThreshold,
    };
  }
  output(slot) {
    const s = this.live.slot(slot);
    const result = audioLevels(s.frame, {
      spatial: this.spatial,
      band: this.band,
      ...this.soundSettings(slot),
      baseline: this.trackers[slot].baseline,
    });
    if (s.soundStyle === 'pen' && !s.frame?.waveform)
      return { ...result, audible: false, waveformReady: false };
    return result;
  }
  ingest(slot, frame) {
    if (
      frame.source === 'screen' &&
      frame.screenRedraw === true &&
      frame.gaps > 0 &&
      !frame.channels.length
    ) {
      this.redraw(slot);
      return;
    }
    const before = this.live.status(slot),
      stale = before === 'stale';
    const previous = this.live.slot(slot).frame;
    if (!this.live.ingest(slot, frame)) return;
    if (
      previous &&
      JSON.stringify([previous.source, previous.segment, previous.settings]) !==
        JSON.stringify([frame.source, frame.segment, frame.settings])
    )
      this.silence(slot);
    if (stale) this.trackers[slot].gap();
    if (!this.live.slot(slot).frame) {
      this.unavailable(slot);
      if (before === 'live' && !this.lossNotified[slot]) this.lossCue(slot);
      return;
    }
    if (this.lossNotified[slot]) this.cancelNotes(slot, ['status']);
    this.lossNotified[slot] = false;
    const features = this.trackers[slot].update(frame);
    this.refresh(slot);
    const output = this.output(slot);
    if (
      this.live.slot(slot).soundStyle !== 'pen' &&
      this.ambient &&
      this.enabled &&
      output.audible
    ) {
      for (const event of features.events
        .filter((e) => e.channels.some((n) => output.activeChannels.has(n)))
        .slice(0, 5)) {
        const side = event.sides.includes(-1) && event.sides.includes(1) ? 0 : event.sides[0] || 0;
        this.note(slot, {
          level: 0.16 * Math.min(1.5, event.amplitude / 80) * (1 + features.emphasis),
          delay: Math.max(0, event.time - (frame.end - 0.65)),
          duration: 0.14 + 0.16 * event.afterwave,
          side,
        });
      }
      if (features.changed && !features.events.length)
        this.note(slot, { level: 0.12, duration: 0.4 });
    }
  }
  cancelNotes(slot, kinds = ['data']) {
    for (const n of [...this.notes])
      if (n.slot === slot && kinds.includes(n.kind)) {
        n.gain.gain.cancelScheduledValues(this.context.currentTime);
        n.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
        try {
          n.oscillator.stop(this.context.currentTime + 0.06);
        } catch {}
        this.notes.delete(n);
      }
  }
  silence(slot) {
    if (!this.context || !this.voices[slot]) return;
    this.cancelNotes(slot);
    const now = this.context.currentTime;
    for (const node of [
      ...this.voices[slot].voices.map((v) => v.gain),
      this.voices[slot].accentGain,
      ...(this.voices[slot].pen?.sides.flatMap((v) => [v.level, v.motion]) || []),
    ]) {
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(0, now, 0.04);
    }
    this.voices[slot].pen?.timeline.reset({ keepEnd: true, now });
  }
  ensurePen(slot) {
    const voice = this.voices[slot];
    if (voice.pen) return voice.pen;
    const c = this.context;
    const buffer = c.createBuffer(1, Math.round(c.sampleRate * 8), c.sampleRate);
    buffer.getChannelData(0).set(whiteNoise(buffer.length, 0x18a241 + slot * 9749));
    const sides = [-1, 1].map((side, i) => {
      const source = c.createBufferSource(),
        color = c.createBiquadFilter(),
        motion = c.createGain(),
        level = c.createGain(),
        pan = c.createStereoPanner();
      source.buffer = buffer;
      source.loop = true;
      color.type = 'bandpass';
      color.Q.value = 0.45;
      color.frequency.value = penColor(this.live.slot(slot).octave);
      motion.gain.value = level.gain.value = 0;
      pan.pan.value = side * 0.65;
      source.connect(color);
      color.connect(motion);
      motion.connect(level);
      level.connect(pan);
      pan.connect(voice.bus);
      source.start(0, i * 3.71);
      return { source, color, motion, level, side };
    });
    return (voice.pen = { sides, buffer, timeline: new PenTimeline() });
  }
  refreshPen(slot, output, remaining, emphasis) {
    const s = this.live.slot(slot),
      voice = this.voices[slot],
      now = this.context.currentTime;
    if (s.soundStyle !== 'pen') return;
    const pen = this.ensurePen(slot);
    for (const v of pen.sides) v.color.frequency.setTargetAtTime(penColor(s.octave), now, 0.08);
    for (const entry of pen.timeline.append(s.frame, output, now, remaining)) {
      for (const v of pen.sides) {
        const segment = entry.segments.find((p) => p.side === v.side),
          param = v.motion.gain,
          level = v.level.gain;
        // Only replace termination beyond this new interval's start. Never
        // cancel an already queued measured prefix when the next frame arrives.
        param.cancelScheduledValues(entry.at);
        level.cancelScheduledValues(entry.at);
        const gain =
          ((2 * 0.4) / 0.75) *
          Math.sqrt(
            output.levels.filter((l) => l.side === v.side).reduce((sum, l) => sum + l.gain ** 2, 0),
          );
        level.setTargetAtTime(segment ? gain * (1 + emphasis) : 0, entry.at, 0.008);
        if (segment) {
          param.setTargetAtTime(segment.points[0].value, entry.at, 0.004);
          for (const point of segment.points.slice(1))
            param.linearRampToValueAtTime(point.value, entry.at + point.time);
        } else param.setValueAtTime(0, entry.at);
        param.setTargetAtTime(0, entry.until, 0.004);
        param.setValueAtTime(0, entry.until + 0.025);
        level.setValueAtTime(0, entry.until + 0.025);
      }
    }
  }
  playback(slot) {
    const s = this.live.slot(slot),
      status = this.live.status(slot);
    const pen =
      s.soundStyle === 'pen'
        ? this.voices[slot]?.pen?.timeline.status(this.context.currentTime) || {}
        : {};
    // Keep omissions and cancellations visible after capture stops or expires.
    if (!s.active) return { ...pen, state: status };
    if (['gap', 'stale'].includes(status)) return { ...pen, state: 'lost' };
    if (!this.enabled || this.context?.state !== 'running') return { ...pen, state: 'disabled' };
    if (s.muted || !s.gain || !this.volume) return { ...pen, state: 'muted' };
    if (status !== 'live') return { ...pen, state: 'waiting' };
    const output = this.output(slot);
    if (s.soundStyle === 'pen') return { state: 'waiting', ...pen };
    return { state: !output.baselineReady ? 'baseline' : output.audible ? 'playing' : 'quiet' };
  }
  envelope(param, value, remaining, tau = 0.12) {
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, tau);
    param.setTargetAtTime(0, now + remaining, 0.04);
    param.setValueAtTime(0, now + remaining + 0.3);
  }
  refresh(slot) {
    if (!this.context) return;
    const s = this.live.slot(slot),
      now = this.context.currentTime,
      voice = this.voices[slot];
    for (const v of voice.voices)
      v.oscillator.frequency.setTargetAtTime(this.pitch(slot, v.band), now, 0.035);
    voice.accent.frequency.setTargetAtTime(this.pitch(slot, 2), now, 0.035);
    voice.bus.gain.setTargetAtTime(
      s.muted ? 0 : s.gain * (this.focus >= 0 && this.focus !== slot ? 0.25 : 1),
      now,
      0.05,
    );
    if (!this.enabled || this.live.status(slot) !== 'live') {
      this.silence(slot);
      return;
    }
    const output = this.output(slot);
    const emphasis = this.ambient && output.audible ? this.trackers[slot].value.emphasis : 0;
    if (!output.audible) this.cancelNotes(slot);
    const remaining = Math.max(0, FRESH_SECONDS - (this.live.now() - s.received));
    const { levels } = output;
    const pen = s.soundStyle === 'pen';
    voice.voices.forEach((v, i) =>
      this.envelope(v.gain.gain, pen ? 0 : levels[i].gain * (1 + 1.5 * emphasis), remaining),
    );
    this.envelope(voice.accentGain.gain, !pen && this.ambient ? 0.06 * emphasis : 0, remaining);
    this.refreshPen(slot, output, remaining, emphasis);
    voice.filter.frequency.setTargetAtTime(
      Math.min(16000, 650 * 2 ** (s.octave - 3) * (1 + 2 * emphasis)),
      now,
      0.5,
    );
  }
  configure({
    volume = this.volume,
    focus = this.focus,
    spatial = this.spatial,
    band = this.band,
    ambient = this.ambient,
  } = {}) {
    this.volume = Math.max(0, Math.min(0.8, volume));
    this.focus = focus;
    const policyChanged = this.spatial !== spatial || this.band !== band;
    this.spatial = spatial;
    this.band = band;
    this.ambient = ambient;
    if (this.context)
      this.master.gain.setTargetAtTime(
        this.enabled ? this.volume : 0,
        this.context.currentTime,
        0.05,
      );
    if (!ambient) for (let i = 0; i < 4; i++) this.cancelNotes(i);
    for (let i = 0; i < 4; i++) {
      if (policyChanged && this.live.slot(i).soundStyle === 'pen') this.silence(i);
      this.refresh(i);
    }
  }
  patient(
    slot,
    { gain, muted, octave, soundMode, soundStyle, amplitudeThreshold, changeThreshold } = {},
  ) {
    const s = this.live.slot(slot);
    if (gain != null) s.gain = Math.max(0, Math.min(1.5, gain));
    if (muted != null) s.muted = Boolean(muted);
    if (OCTAVES.includes(octave)) {
      s.octave = octave;
      this.cancelNotes(slot, ['data', 'reference', 'status']);
    }
    if (['continuous', 'changes'].includes(soundMode)) s.soundMode = soundMode;
    if (['tonal', 'pen'].includes(soundStyle) && s.soundStyle !== soundStyle) {
      s.soundStyle = soundStyle;
      this.cancelNotes(slot, ['data', 'reference']);
      this.silence(slot);
    }
    if (Number.isFinite(amplitudeThreshold))
      s.amplitudeThreshold = Math.max(0, Math.min(80, amplitudeThreshold));
    if (Number.isFinite(changeThreshold))
      s.changeThreshold = Math.max(1, Math.min(24, changeThreshold));
    if (soundMode != null || amplitudeThreshold != null || changeThreshold != null) {
      this.cancelNotes(slot);
      if (s.soundStyle === 'pen') this.silence(slot);
    }
    this.refresh(slot);
  }
  note(
    slot,
    {
      level = 0.12,
      duration = 0.35,
      delay = 0,
      side = 0,
      reference = false,
      frequency = null,
      kind = 'data',
    } = {},
  ) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const isPen = reference && this.live.slot(slot).soundStyle === 'pen';
    const c = this.context,
      oscillator = isPen ? c.createBufferSource() : c.createOscillator(),
      gain = c.createGain(),
      pan = c.createStereoPanner();
    const now = c.currentTime,
      start = now + delay;
    let noiseFilter;
    if (isPen) {
      oscillator.buffer = this.ensurePen(slot).buffer;
      oscillator.loop = true;
      noiseFilter = c.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.Q.value = 0.45;
      noiseFilter.frequency.value = penColor(this.live.slot(slot).octave);
      level *= 2;
    } else {
      oscillator.setPeriodicWave(this.voices[slot].wave);
      oscillator.frequency.value = frequency || this.pitch(slot, 2);
    }
    gain.gain.value = 0;
    pan.pan.value = side * 0.65;
    gain.gain.setTargetAtTime(level, start, 0.008);
    gain.gain.setTargetAtTime(0, start + duration, 0.06);
    gain.gain.setValueAtTime(0, start + duration + 0.4);
    if (noiseFilter) {
      oscillator.connect(noiseFilter);
      noiseFilter.connect(gain);
    } else oscillator.connect(gain);
    gain.connect(pan);
    pan.connect(reference ? this.master : this.voices[slot].bus);
    const note = {
      slot,
      oscillator,
      gain,
      kind: reference ? 'reference' : kind,
    };
    this.notes.add(note);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.45);
    oscillator.onended = () => {
      oscillator.disconnect();
      noiseFilter?.disconnect();
      gain.disconnect();
      pan.disconnect();
      this.notes.delete(note);
    };
  }
  identify(slot) {
    this.note(slot, { level: 0.14, duration: 1.25, reference: true });
  }
  lossCue(slot) {
    this.lossNotified[slot] = true;
    // A fixed descending pair is explicitly a data-status cue, never an event.
    if (this.live.slot(slot).muted) return;
    this.note(slot, {
      level: 0.1,
      duration: 0.1,
      frequency: this.pitch(slot, 3),
      kind: 'status',
    });
    this.note(slot, {
      level: 0.1,
      duration: 0.1,
      delay: 0.28,
      frequency: this.pitch(slot, 0),
      kind: 'status',
    });
  }
}
