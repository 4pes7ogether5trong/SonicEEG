import { POSITIONS, parseDerivation } from './montage.js';
import { normalize } from './field-math.js';
import { PatternTracker } from './patterns.js';

export const PATTERN_NAMES = {
  sharp: 'Sharp shape',
  periodic: 'Periodic repetition',
  rhythmic: 'Rhythmic activity',
};
export function channelRegion(name) {
  const d = parseDerivation(name);
  if (!d) return null;
  const a = POSITIONS[d.a],
    b = d.bipolar ? POSITIONS[d.b] : a;
  const position = normalize(a.map((v, i) => (v + b[i]) / 2));
  const side = position[0] < -0.18 ? 'Left' : position[0] > 0.18 ? 'Right' : 'Midline';
  return {
    name:
      side + (position[2] < -0.15 ? ' anterior' : position[2] > 0.3 ? ' posterior' : ' central'),
    position,
  };
}
export function rhythmicEvidence(c, wave) {
  if (!c.valid || !wave || wave.compressed || c.rms < 3 || c.peakHz < 1.5 || c.peakHz > 20)
    return 0;
  const x = wave.samples,
    lag = Math.round(wave.rate / c.peakHz);
  if (lag < 3 || lag * 3 > x.length) return 0;
  let xy = 0,
    xx = 0,
    yy = 0;
  for (let i = lag; i < x.length; i++) {
    xy += x[i] * x[i - lag];
    xx += x[i] ** 2;
    yy += x[i - lag] ** 2;
  }
  return xy / Math.sqrt(xx * yy || 1);
}
// These are screen-derived shape descriptors, not diagnostic labels. Channel
// trackers and episode clocks advance only when a new measured frame arrives.
export class FluidEpisodes {
  constructor() {
    this.reset();
  }
  reset() {
    this.trackers = new Map();
    this.active = new Map();
    this.lastEnd = null;
    this.context = null;
  }
  update(frame) {
    if (frame.end <= (this.lastEnd ?? -Infinity)) return [];
    const context = JSON.stringify([frame.source, frame.segment, frame.settings]);
    const broken =
      frame.mixed ||
      frame.settingsUncertain ||
      frame.gaps > 0 ||
      (this.context !== null && context !== this.context) ||
      (this.lastEnd !== null && frame.start - this.lastEnd > 0.1);
    const closed = [];
    if (broken) {
      for (const e of this.active.values()) closed.push({ ...e, closed: true });
      this.reset();
    }
    this.context = context;
    this.lastEnd = frame.end;
    if (frame.mixed || frame.settingsUncertain || frame.gaps > 0) return closed;
    const evidence = new Map();
    for (const c of frame.channels) {
      if (!c.valid || c.status !== 'observed') continue;
      const region = channelRegion(c.name);
      if (!region) continue;
      let tracker = this.trackers.get(c.name);
      if (!tracker) {
        tracker = new PatternTracker();
        this.trackers.set(c.name, tracker);
      }
      const value = tracker.update({ ...frame, channels: [c] });
      const wave = frame.waveform?.channels.find((w) => w.name === c.name)?.wave;
      const latest = value.events.at(-1)?.time;
      const kinds = [];
      if (latest != null) kinds.push(['sharp', latest, value.events[0].time]);
      if (value.repetitionHz > 0 && value.regularity >= 0.75 && latest != null)
        kinds.push(['periodic', latest, latest - value.sharpSeconds]);
      if (rhythmicEvidence(c, wave) >= 0.78)
        kinds.push(['rhythmic', frame.end, frame.waveform.start]);
      for (const [kind, end, start] of kinds) {
        const key = region.name + '|' + kind,
          old = evidence.get(key);
        const w = Math.max(1, c.rms);
        if (!old)
          evidence.set(key, {
            kind,
            region: region.name,
            position: region.position.map((v) => v * w),
            weight: w,
            start,
            end,
            channels: [c.name],
            band: c.bands.indexOf(Math.max(...c.bands)),
          });
        else {
          old.position = old.position.map((v, i) => v + region.position[i] * w);
          old.weight += w;
          old.start = Math.min(old.start, start);
          old.end = Math.max(old.end, end);
          old.channels.push(c.name);
        }
      }
    }
    for (const [key, e] of this.active) {
      const next = evidence.get(key);
      if (!next || next.end - e.end > 1.3) {
        if (frame.end - e.end > 1.3) {
          closed.push({ ...e, closed: true });
          this.active.delete(key);
        }
      }
    }
    for (const [key, v] of evidence) {
      let e = this.active.get(key);
      if (!e) {
        e = {
          id: context + '|' + key + '|' + v.start,
          kind: v.kind,
          region: v.region,
          start: v.start,
          end: v.end,
          count: 1,
          channels: v.channels,
          position: normalize(v.position),
          band: v.band,
        };
        this.active.set(key, e);
      }
      e.end = Math.max(e.end, v.end);
      e.position = normalize(v.position);
      e.channels = [...new Set([...e.channels, ...v.channels])];
      e.seconds = Math.max(0, e.end - e.start);
    }
    return [...closed, ...[...this.active.values()].map((e) => ({ ...e, closed: false }))];
  }
}
export function mergeDroplets(a = [], b = [], limit = 96) {
  const map = new Map();
  for (const e of [...a, ...b]) {
    const old = map.get(e.id);
    if (!old || e.end > old.end || (e.end === old.end && e.closed)) map.set(e.id, e);
  }
  const values = [...map.values()];
  if (values.length <= limit) return values;
  // Keep a bounded regional summary, retaining count, total occupied duration,
  // original extent and the latest example's exact start for inspection.
  return aggregateGhosts(values);
}
export function aggregateGhosts(values) {
  const map = new Map();
  for (const e of values) {
    const key = e.region + '|' + e.kind;
    let old = map.get(key);
    if (!old) {
      map.set(key, { ...e, closed: true, exampleStart: e.exampleStart ?? e.start });
      continue;
    }
    const count = old.count + (e.count || 1),
      seconds = (old.seconds || 0) + (e.seconds || 0),
      start = Math.min(old.start, e.start),
      latest = e.end > old.end ? e : old;
    map.set(key, {
      ...latest,
      id: 'summary|' + key + '|' + start + '|' + Math.max(old.end, e.end),
      closed: true,
      aggregate: true,
      count,
      seconds,
      start,
      end: Math.max(old.end, e.end),
      channels: [...new Set([...old.channels, ...e.channels])],
      exampleStart: latest.exampleStart ?? latest.start,
    });
  }
  return [...map.values()];
}
export function visibleDroplets(values, time, { kind = 'all', selected = '' } = {}) {
  const eligible = mergeDroplets(values, [], Infinity).filter(
    (e) =>
      e.start <= time &&
      (kind === 'all' || kind === e.kind) &&
      (!selected || e.channels.includes(selected)),
  );
  const live = eligible.filter((e) => !e.closed && time <= e.end + 1.3);
  const ghosts = eligible.filter((e) => !live.includes(e));
  return [...aggregateGhosts(ghosts), ...live].map((e) => {
    const age = Math.max(0, time - e.end - 1.3),
      active = live.includes(e);
    const strength =
      0.22 + 0.78 * (1 - Math.exp(-Math.min(e.seconds || 0, Math.max(0, time - e.start)) / 8));
    return {
      ...e,
      active,
      brightness: active ? strength : 0.13 + (strength - 0.13) * Math.exp(-age / 5),
      opacity: active ? 1 : 0.18 + 0.65 * Math.exp(-age / 5),
    };
  });
}
