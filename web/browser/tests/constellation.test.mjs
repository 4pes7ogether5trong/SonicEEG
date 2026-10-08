import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { constellationFrames, constellationData, drawConstellation } from '../constellation.js';
import { ConstellationRenderer } from '../constellation-renderer.js';
import { canBlendCloud, cloudContext } from '../cloud-motion.js';

const channel = (name, valid = true) => ({
  name,
  valid,
  status: 'observed',
  validSeconds: valid ? 0.5 : 0,
  bands: [1, 4, 400, 2, 0],
  rms: 20,
  last: 0,
  sharpCount: 0,
});
const frame = (
  end,
  channels = [channel('F3-AVG'), channel('C3-AVG'), channel('F4-AVG')],
  extra = {},
) => ({
  start: end - 0.5,
  end,
  source: 'synthetic',
  segment: 'a',
  settings: { hp: 0.5, lp: 45 },
  channels,
  ...extra,
});
const opts = (total, extra = {}) => ({
  mode: 'constellation',
  map: 'frequency',
  band: -1,
  scale: 80,
  lens: 0.5,
  total,
  animate: true,
  ...extra,
});

test('Constellation retains bounded earlier summaries and exactly the selected interval, never future frames', () => {
  const history = Array.from({ length: 400 }, (_, i) => frame((i + 1) * 0.5));
  const current = history[199],
    saved = JSON.stringify(history);
  const frames = constellationFrames(history, current);
  assert.equal(frames.at(-1), current);
  assert.ok(frames.length <= 13);
  assert.equal(frames[0].start, 0);
  assert.ok(frames.slice(0, -1).every((f) => f.end <= current.start));
  assert.equal(JSON.stringify(history), saved);
  assert.deepEqual(constellationFrames(history, null), []);
});

test('Stars preserve channel identity and band mapping; missing and unmappable channels cannot become bright nodes', () => {
  const data = constellationData(
    [frame(1, [channel('F3-AVG'), channel('C3-AVG', false), channel('unknown')])],
    opts(1),
  );
  assert.equal(data.stars.length, 2);
  assert.equal(data.stars[0].color, '#5ce0b0');
  assert.equal(data.stars[1].available, false);
  assert.equal(data.stars[1].ring, -1);
  assert.equal(data.links.length, 0);
  assert.ok(data.stars.every((s) => s.position.every(Number.isFinite)));
  assert.ok(
    constellationData([frame(1)], opts(1, { selected: 'F3-AVG' })).stars.every(
      (s) => s.name === 'F3-AVG',
    ),
  );
  assert.ok(constellationData([frame(1)], opts(1, { cut: -5 })).stars.length === 0);
  assert.ok(
    constellationData([frame(1)], opts(1, { map: 'change' })).stars.every((s) => !s.available),
  );
});

test('Historical links require contiguous valid measurements in the same recording context', () => {
  const one = frame(1),
    two = frame(1.5);
  const count = (frames) =>
    constellationData(frames, opts(frames.at(-1).end)).links.filter((l) => l.kind === 'history')
      .length;
  assert.equal(count([one, two]), 3);
  for (const changed of [
    frame(2),
    { ...two, gaps: 0.5 },
    { ...two, segment: 'b' },
    { ...two, settings: { hp: 1 } },
    { ...two, mixed: true },
    frame(
      1.5,
      two.channels.map((c) => ({ ...c, valid: false })),
    ),
  ]) {
    assert.equal(count([one, changed]), 0);
  }
  const absent = frame(1.5, []);
  assert.equal(count([one, absent, frame(2)]), 0);
  const graph = constellationData([one, two], opts(1.5));
  assert.ok(
    graph.links
      .filter((l) => l.kind === 'spatial')
      .every((l) => graph.stars[l.a].current && graph.stars[l.b].current),
  );
});

test('GPU constellation eases measured updates, honors missingness and freeze, and keeps a bounded scene', () => {
  const scene = new THREE.Scene(),
    renderer = new ConstellationRenderer(scene);
  const update = (f, extra = {}, now = 0) =>
    renderer.update(constellationData([f], opts(f.end, extra)), [f], opts(f.end, extra), now);
  update(frame(1));
  const firstSize = renderer.states[0].size;
  const louder = frame(
    1.5,
    [channel('F3-AVG'), channel('C3-AVG'), channel('F4-AVG')].map((c) => ({
      ...c,
      bands: [1, 4, 1e5, 2, 0],
    })),
  );
  update(louder, {}, 500);
  assert.equal(renderer.states[0].size, firstSize);
  renderer.animate(680);
  assert.ok(
    renderer.states[0].size > firstSize && renderer.states[0].size < renderer.states[0].target.size,
  );
  renderer.animate(900);
  assert.equal(renderer.states[0].size, renderer.states[0].target.size);
  update(frame(2, [channel('F3-AVG', false)]), {}, 1000);
  assert.equal(renderer.states[0].ring, -1);
  assert.equal(renderer.from, null);
  update(frame(2.5), { frozen: true }, 1500);
  assert.equal(renderer.from, null);
  update(frame(3), { reducedMotion: true }, 2000);
  assert.equal(renderer.from, null);
  for (let i = 0; i < 50; i++) update(frame(4 + i * 0.5));
  assert.equal(scene.children.length, 1);
  assert.equal(renderer.group.children.length, 2);
  assert.equal(renderer.points.geometry.attributes.position.count, 3);
  renderer.hide();
  assert.equal(renderer.group.visible, false);
});

test('Software constellation draws measured stars and only current channels are selectable', () => {
  let arcs = 0;
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    fillText() {},
    arc() {
      arcs++;
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
  };
  const data = constellationData([frame(1), frame(1.5)], opts(1.5));
  const hits = drawConstellation(ctx, data, (p) => p, 1, 'F3-AVG');
  assert.equal(hits.length, 3);
  assert.ok(arcs >= data.stars.length);
  const o = opts(1),
    previous = { end: 0.5, context: cloudContext([frame(1)], o) };
  assert.equal(canBlendCloud(previous, [frame(1)], o), true);
  assert.equal(canBlendCloud(previous, [frame(1)], { ...o, frozen: true }), false);
  assert.equal(canBlendCloud(previous, [frame(1)], o, true), false);
});
