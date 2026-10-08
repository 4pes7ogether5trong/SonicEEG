import { BANDS } from './signal.js';
import { POSITIONS, parseDerivation } from './montage.js';
import { normalize, spectralField, timePosition } from './field-math.js';
import { summarizeFrames } from './history.js';

// Retain bounded, measured summaries before the selected interval. Never let
// future measurements appear while the user scrubs back through a recording.
export function constellationFrames(history, current, limit = 12) {
  if (!current) return [];
  const earlier = history.filter((f) => f.end <= current.start + 1e-6);
  return [...summarizeFrames(earlier, limit), current];
}

const context = (f) => JSON.stringify([f.source, f.segment, f.settings]);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

export function constellationData(frames, options = {}) {
  const o = { band: -1, scale: 80, lens: 0.5, cut: 20, map: 'frequency', ...options };
  const stars = [],
    links = [],
    previous = new Map();
  const newest = frames.at(-1);
  const span = Math.max(1, (newest?.end || 0) - (frames[0]?.start || 0));
  for (const [index, frame] of frames.entries()) {
    const current = index === frames.length - 1;
    const age = current ? 0 : timePosition(newest.end - frame.end, span, 0, o.lens);
    const radial = 1.12 + age * 1.05;
    const identity = context(frame);
    const seen = new Set();
    for (const channel of frame.channels) {
      const name = channel.name;
      if (o.selected && name !== o.selected) continue;
      const derivation = parseDerivation(name);
      if (!derivation) continue;
      const a = POSITIONS[derivation.a],
        b = derivation.bipolar ? POSITIONS[derivation.b] : a;
      const direction = normalize(a.map((v, i) => v + b[i]));
      const position = [direction[0], direction[1] * 0.88, direction[2] * 1.12].map(
        (v) => v * radial,
      );
      if (position[0] > o.cut) continue;
      const value = spectralField([{ weight: 1, signed: 0 }], [channel], o);
      const available = !!channel.valid && !frame.mixed && value.coverage > 0;
      const color = !available
        ? '#62768a'
        : o.monochrome
          ? '#deebf6'
          : value.heat == null
            ? BANDS[value.band].color
            : value.heat < 0
              ? '#409fff'
              : '#ff963e';
      const star = {
        key: JSON.stringify([identity, current ? 'current' : [frame.start, frame.end], name]),
        name,
        position,
        color,
        current,
        available,
        ring: !available ? -1 : channel.status !== 'derived' && channel.sharpCount > 0 ? 1 : 0,
        size: current ? (available ? 7 + value.amp * 13 : 7) : 3 + value.amp * 4,
        alpha:
          (current ? 0.48 + value.amp * 0.52 : 0.12 + (1 - age) * 0.2) *
          (channel.status === 'derived' ? 0.65 : 1),
        frame,
        identity,
        status: channel.status,
      };
      const i = stars.push(star) - 1;
      const priorIndex = previous.get(name),
        prior = stars[priorIndex];
      if (
        prior &&
        prior.available &&
        available &&
        prior.identity === identity &&
        prior.status === star.status &&
        !frame.gaps &&
        !prior.frame.gaps &&
        Math.abs(frame.start - prior.frame.end) < 1e-5
      ) {
        links.push({ a: priorIndex, b: i, kind: 'history', alpha: 0.2 });
      }
      previous.set(name, i);
      seen.add(name);
    }
    for (const name of previous.keys()) if (!seen.has(name)) previous.delete(name);
  }
  // A sparse nearest-neighbour guide uses position only, never correlation.
  // Unavailable nodes do not carry an edge or a luminous historical trail.
  const current = stars.map((s, i) => ({ ...s, i })).filter((s) => s.current && s.available);
  const pairs = new Set();
  for (const star of current) {
    const nearest = current
      .filter((s) => s.i !== star.i)
      .map((s) => ({ i: s.i, d: distance(star.position, s.position) }))
      .filter((s) => s.d > 1e-4 && s.d < 1.18)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const next of nearest) {
      const a = Math.min(star.i, next.i),
        b = Math.max(star.i, next.i),
        key = `${a}:${b}`;
      if (!pairs.has(key)) links.push({ a, b, kind: 'spatial', alpha: 0.34 });
      pairs.add(key);
    }
  }
  return { stars, links };
}

// The same measured nodes and edges are used with and without WebGL.
export function drawConstellation(ctx, data, project, pixelRatio = 1, selected = '') {
  const points = data.stars.map((star) => ({ ...star, screen: project(star.position) }));
  ctx.save();
  ctx.lineWidth = pixelRatio;
  for (const link of data.links) {
    const a = points[link.a],
      b = points[link.b];
    ctx.globalAlpha = link.alpha;
    ctx.strokeStyle = link.kind === 'history' ? b.color : '#91b5d8';
    ctx.beginPath();
    ctx.moveTo(a.screen[0], a.screen[1]);
    ctx.lineTo(b.screen[0], b.screen[1]);
    ctx.stroke();
  }
  const hits = [];
  for (const p of points.sort((a, b) => a.screen[2] - b.screen[2])) {
    const [x, y] = p.screen,
      radius = (p.size * pixelRatio) / 2;
    ctx.globalAlpha = p.alpha;
    if (p.available) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.1);
      glow.addColorStop(0, p.color);
      glow.addColorStop(0.25, p.color + '9a');
      glow.addColorStop(1, p.color + '00');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.current ? '#f1f6ff' : p.color;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(pixelRatio, radius * 0.25), 0, Math.PI * 2);
      ctx.fill();
      if (p.current) {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = p.alpha * 0.7;
        ctx.beginPath();
        ctx.moveTo(x - radius, y);
        ctx.lineTo(x + radius, y);
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x, y + radius);
        ctx.stroke();
      }
    }
    if (p.ring !== 0) {
      ctx.globalAlpha = p.available ? 0.8 : 0.65;
      ctx.strokeStyle = p.ring > 0 ? '#ffffff' : p.color;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.65, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.current) {
      hits.push({ x, y, radius: Math.max(radius, 7 * pixelRatio), name: p.name });
      if (selected === p.name) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#e7f0fc';
        ctx.font = `${12 * pixelRatio}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(p.name, x + radius + 7 * pixelRatio, y - 6 * pixelRatio);
      }
    }
  }
  ctx.restore();
  return hits.reverse();
}
