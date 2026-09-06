import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FluidEpisodes,
  visibleDroplets,
  mergeDroplets,
  rhythmicEvidence,
} from '../fluid-episodes.js';
import { waterAt, waterChannels, sampleWave } from '../water-math.js';
import { WaterRenderer } from '../water-renderer.js';
import { FeaturePipeline } from '../pipeline.js';
import { TemporalHistory, mergeBins } from '../history.js';
import { showcaseBlock } from '../showcase.js';
import { retainWaveform } from '../waveform.js';
import { normalize } from '../field-math.js';

function sampler(seconds = 40, slot = 0) {
  const episodes = new FluidEpisodes(),
    history = new TemporalHistory(12),
    frames = [];
  const pipeline = new FeaturePipeline((f) => {
    f.droplets = episodes.update(f);
    if (f.waveform) f.waveform.droplets = f.droplets;
    history.add(f);
    frames.push(f);
  });
  for (let t = 0; t < seconds; t += 0.5)
    pipeline.ingest(
      { start: t, duration: 0.5, rate: 128, channels: showcaseBlock(t, 0.5, 128, { slot }) },
      { source: 'demo', segment: 0 },
    );
  return { episodes, frames, history };
}
test('A produces region-local sharp/periodic droplets that brighten then retain fading ghosts', () => {
  const { frames } = sampler();
  const at = (t) =>
    visibleDroplets(
      frames.filter((f) => f.end <= t).flatMap((f) => f.droplets),
      t,
    );
  assert.equal(at(10).filter((d) => d.kind === 'sharp').length, 0);
  const early = at(14).find((d) => d.kind === 'periodic' && d.region === 'Left anterior');
  const late = at(22).find((d) => d.id === early.id);
  assert.ok(early.active && late.active);
  assert.ok(late.brightness > early.brightness);
  const faded = at(40).find((d) => d.kind === 'periodic' && d.region === 'Left anterior');
  assert.ok(!faded.active);
  assert.ok(faded.brightness >= 0.13 && faded.brightness < early.brightness);
  assert.ok(faded.start >= 12 && faded.end < 25);
  assert.ok(at(40).some((d) => d.kind === 'rhythmic'));
});
test('Repeated frames and gaps cannot extend measured persistence or connect recording segments', () => {
  const { episodes, frames } = sampler(16),
    last = frames.at(-1);
  assert.deepEqual(episodes.update(last), []);
  const ended = episodes.update({
    start: 16,
    end: 19,
    channels: [],
    gaps: 3,
    source: 'demo',
    segment: 0,
  });
  assert.ok(ended.length > 0 && ended.every((d) => d.closed && d.end <= 16));
  const after = episodes.update({
    ...last,
    start: 19,
    end: 20,
    segment: 1,
    channels: [],
    waveform: null,
  });
  assert.deepEqual(after, []);
});
test('Time compression retains ghost provenance and selected categories without advancing their clocks', () => {
  const { history, frames } = sampler(42);
  const summary = history.overview(1)[0];
  assert.ok(summary.droplets.some((d) => d.kind === 'periodic' && d.start >= 12 && d.end < 25));
  const ghosts = visibleDroplets(summary.droplets, 42, { kind: 'sharp', selected: 'F3-AVG' });
  assert.ok(
    ghosts.length && ghosts.every((d) => d.kind === 'sharp' && d.channels.includes('F3-AVG')),
  );
  assert.deepEqual(visibleDroplets(summary.droplets, 42, { kind: 'none' }), []);
  const e = frames
    .find((f) => f.droplets.some((d) => d.kind === 'sharp'))
    .droplets.find((d) => d.kind === 'sharp');
  assert.equal(mergeDroplets([e], [e]).length, 1);
  history.invalidateSince(0);
  assert.ok(history.bins().every((f) => f.droplets.length === 0));
});
test('Rhythm evidence requires repeated measured cycles and permits non-pathological rhythms', () => {
  const wave = retainWaveform(
    Float32Array.from({ length: 256 }, (_, i) => 15 * Math.sin((2 * Math.PI * 8 * i) / 128)),
    128,
  );
  assert.ok(rhythmicEvidence({ valid: true, rms: 10, peakHz: 8 }, wave) > 0.99);
  assert.equal(rhythmicEvidence({ valid: false, rms: 10, peakHz: 8 }, wave), 0);
  assert.equal(rhythmicEvidence({ valid: true, rms: 10, peakHz: 0.5 }, wave), 0);
  assert.equal(
    rhythmicEvidence({ valid: true, rms: 10, peakHz: 8 }, { ...wave, compressed: true }),
    0,
  );
});
test('Continuous water field preserves signed waveform timing, opposing bipolar lobes and smooth spatial edges', () => {
  const wave = retainWaveform(
    Float32Array.from({ length: 256 }, (_, i) => 20 * Math.cos((2 * Math.PI * 3 * i) / 128)),
    128,
  );
  const c = {
    name: 'F3-F4',
    valid: true,
    rms: 14,
    bands: [196, 0, 0, 0, 0],
    status: 'observed',
    wave,
  };
  const cs = waterChannels({ waveform: { channels: [c] } });
  const left = waterAt(cs[0].a, cs),
    right = waterAt(cs[0].b, cs);
  assert.ok(Math.abs(left.voltage + right.voltage) < 1e-8);
  const another = waterAt(normalize(cs[0].a.map((v, i) => v + (i === 1 ? 0.00001 : 0))), cs);
  assert.ok(Math.abs(left.height - another.height) < 0.0001);
  const atEnd = sampleWave(wave, 255 / 128);
  assert.equal(atEnd, wave.samples[255]);
  assert.equal(waterAt([0, 1, 0], []).height, 0);
  assert.deepEqual(waterChannels({ waveform: { channels: [{ ...c, valid: false }] } }), []);
  const deep = waterAt(cs[0].a, cs, { scale: 40 });
  assert.ok(Math.abs(deep.height - left.height * 2) < 1e-6);
});
test('GPU surface data remains bounded, monochrome keeps samples, and freeze holds the presentation clock', () => {
  const { frames } = sampler(16),
    f = frames.at(-1),
    scene = new THREE.Scene(),
    water = new WaterRenderer(scene);
  const options = {
    mode: 'live',
    scale: 80,
    selected: '',
    band: -1,
    monochrome: false,
    cut: 20,
    animate: true,
    dropletsFor: (f) => visibleDroplets(f.droplets, f.end),
  };
  const place = () => ({ scale: 1, radial: 1, offset: 0 });
  water.update([f], options, place);
  const m = water.surfaces[0],
    data = m.material.uniforms.waves.value.image.data.slice();
  assert.equal(data.length, 32 * 256);
  assert.ok(data.every(Number.isFinite));
  assert.ok(m.geometry.attributes.position.count < 20000);
  water.animate(m.userData.arrival + 200);
  const lag = m.material.uniforms.lag.value;
  water.update([f], { ...options, animate: false, frozen: true, monochrome: true }, place);
  water.animate(m.userData.arrival + 20000);
  assert.equal(m.material.uniforms.lag.value, lag);
  assert.deepEqual(m.material.uniforms.waves.value.image.data, data);
  assert.ok(water.drops.some((d) => d.visible && d.userData.episode));
  water.update([], options, place);
  assert.ok(water.surfaces.every((m) => !m.visible) && water.drops.every((m) => !m.visible));
});
