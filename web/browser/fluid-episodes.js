import { POSITIONS, parseDerivation } from './montage.js';
import { normalize } from './field-math.js';
import { PatternTracker } from './patterns.js';
import { deltaRhythm } from './visual-patterns.js';

export const PATTERN_NAMES = {
  sharp: 'Sharp shape',
  periodic: 'Periodic repetition',
  rhythmic: 'Delta rhythmicity',
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
  if (!c.valid || !wave || wave.compressed || c.rms < 3 || c.peakHz < 0.5 || c.peakHz >= 4)
    return 0;
  return deltaRhythm(wave.samples, wave.rate, wave.duration).strength;
}
// These are screen-derived shape descriptors, not diagnostic labels. Channel
// trackers and episode clocks advance only when a new measured frame arrives.
export class FluidEpisodes {
  constructor() {
    this.reset();
  }
  reset() {
    this.trackers = new Map();
    this.bluntSeen = new Map();
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
      const blunt = c.visual?.blunt;
      if (
        blunt?.strength &&
        blunt.end > (this.bluntSeen.get(c.name) ?? -Infinity) &&
        !kinds.some(([kind]) => kind === 'periodic')
      ) {
        kinds.push(['periodic', blunt.end, blunt.start]);
        this.bluntSeen.set(c.name, blunt.end);
      }
      const delta = c.visual?.delta;
      if (delta ? delta.strength >= 0.78 : rhythmicEvidence(c, wave) >= 0.78)
        kinds.push(['rhythmic', frame.end, delta?.start ?? frame.waveform.start]);
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
            amplitudeUv: Math.max(Math.abs(c.min || 0), Math.abs(c.max || 0)),
          });
        else {
          old.position = old.position.map((v, i) => v + region.position[i] * w);
          old.weight += w;
          old.start = Math.min(old.start, start);
          old.end = Math.max(old.end, end);
          old.channels.push(c.name);
          old.amplitudeUv = Math.max(old.amplitudeUv, Math.abs(c.min || 0), Math.abs(c.max || 0));
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
          encodingVersion: 2,
        };
        this.active.set(key, e);
      }
      e.end = Math.max(e.end, v.end);
      e.amplitudeUv = v.amplitudeUv;
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
      (e.kind !== 'rhythmic' || e.encodingVersion === 2) &&
      (kind === 'all' || kind === e.kind) &&
      (!selected || e.channels.includes(selected)),
  );
  const live = eligible.filter((e) => !e.closed && time <= e.end + 1.3);
  const ghosts = eligible.filter((e) => !live.includes(e));
  return [...aggregateGhosts(ghosts), ...live].map((e) => {
    const age = Math.max(0, time - e.end),
      active = live.includes(e);
    const strength =
      0.55 + 0.45 * (1 - Math.exp(-Math.min(e.seconds || 0, Math.max(0, time - e.start)) / 8));
    const decay = 2 ** (-age / 3);
    return {
      ...e,
      active,
      brightness: 0.13 + (strength - 0.13) * decay,
      opacity: 0.18 + 0.82 * decay,
    };
  });
}

// Combine concurrent regional descriptors on one axis. Distinct time intervals
// remain separate ghosts. Each part retains its own measured interval and fade.
export function regionalArchitectures(values, ruler = 80) {
  const groups = [];
  for (const e of [...values].sort((a, b) => b.end - a.end)) {
    let group = groups.find(
      (g) =>
        g.region === e.region &&
        !g.features[e.kind] &&
        Boolean(g.aggregate) === Boolean(e.aggregate) &&
        e.start <= g.end + 1.3 &&
        e.end >= g.start - 1.3,
    );
    if (!group) {
      group = {
        region: e.region,
        start: e.start,
        end: e.end,
        exampleStart: e.exampleStart,
        aggregate: e.aggregate,
        features: {},
        position: e.position,
      };
      groups.push(group);
    }
    group.features[e.kind] = e;
    group.start = Math.min(group.start, e.start);
    group.end = Math.max(group.end, e.end);
  }
  return groups.map((g) => {
    const es = Object.values(g.features),
      { sharp, rhythmic, periodic } = g.features;
    // Peak absolute centered voltage, same ruler for every component. The small
    // floor keeps low-voltage shapes visible; the upper bound prevents occlusion.
    const measured = es.map((e) => e.amplitudeUv).filter(Number.isFinite);
    const size = measured.length
      ? Math.max(0.3, Math.min(1.8, Math.max(...measured) / Math.max(1, ruler)))
      : 0.65;
    const parts = [];
    if (sharp) parts.push({ shape: 'stem', radius: 0.078, height: 0.34, y: 0.17, episode: sharp });
    const y = sharp ? 0.37 : 0.17;
    if (periodic) {
      parts.push({ shape: 'round', radius: 0.064, y, episode: periodic });
      parts.push({ shape: 'round', radius: 0.044, y: y + 0.235, episode: periodic });
    }
    if (rhythmic) parts.push({ shape: 'round', radius: 0.122, y, episode: rhythmic });
    return {
      ...g,
      size,
      active: es.some((e) => e.active),
      brightness: Math.max(...es.map((e) => e.brightness)),
      parts,
    };
  });
}
