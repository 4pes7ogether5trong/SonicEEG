import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { canBlendCloud, cloudContext, cloudEase, cloudKey } from '../cloud-motion.js';
import { WaterRenderer } from '../water-renderer.js';

const frame = (end, valid = true) => ({
  start: end - 0.5,
  end,
  source: 'screen',
  segment: 'one',
  settings: {},
  channels: [{ name: 'F7-T7', valid, status: 'observed' }],
});
const options = (total) => ({
  total,
  mode: 'history',
  fluid: true,
  animate: true,
  scale: 80,
  band: -1,
  cut: 20,
  dropletsFor: () => [],
});

test('Cloud fades stop at exact endpoints and never animate missingness, freezes or context changes', () => {
  const frames = [frame(2)],
    o = options(2);
  const previous = { context: cloudContext(frames, o), end: 2 };
  assert.equal(cloudEase(0), 0);
  assert.equal(cloudEase(180), 0.5);
  assert.equal(cloudEase(9999), 1);
  assert.ok(canBlendCloud(previous, [frame(2.5)], options(2.5)));
  assert.ok(canBlendCloud(previous, [{ ...frame(2.5), mixed: false }], options(2.5)),
    'summary bins with unchanged settings retain the same context as single frames');
  for (const overrides of [
    { frozen: true },
    { animate: false },
    { mode: 'live' },
    { selected: 'F7-T7' },
  ])
    assert.equal(canBlendCloud(previous, [frame(2.5)], { ...options(2.5), ...overrides }), false);
  assert.equal(canBlendCloud(previous, [frame(2.5, false)], options(2.5)), false);
  assert.equal(canBlendCloud(previous, [{ ...frame(2.5), gaps: 0.5 }], options(2.5)), false);
  assert.equal(canBlendCloud(previous, [frame(2.5)], options(2.5), true), false);
});

test('GPU history retains snapshot identities, eases their placement, retires replaced layers and bounds allocation', () => {
  const renderer = new WaterRenderer(new THREE.Scene());
  renderer.update([frame(2)], options(2), () => ({ offset: 0, scale: 1, radial: 1 }));
  const first = renderer.surfaces[0];
  renderer.update([frame(2), frame(2.5)], options(2.5), (f) => ({
    offset: 0,
    scale: 1,
    radial: f.end === 2 ? 2 : 1,
  }));
  assert.equal(first.userData.cloudKey, cloudKey(frame(2)));
  const motion = first.userData.motion;
  renderer.animate(motion.start + 180);
  assert.ok(Math.abs(first.material.uniforms.radial.value - 1.5) < 0.001);
  renderer.animate(motion.start + 360);
  assert.equal(first.material.uniforms.radial.value, 2);
  for (let n = 6; n < 100; n++) {
    const end = n / 2;
    renderer.update([frame(end - 0.5), frame(end)], options(end), () => ({
      offset: 0,
      scale: 1,
      radial: 1,
    }));
    renderer.animate(performance.now() + 400);
    assert.ok(renderer.surfaces.length <= 4);
    assert.equal(renderer.surfaces.filter((m) => m.visible).length, 2);
  }
  renderer.update([frame(51, false)], options(51), () => ({ offset: 0, scale: 1, radial: 1 }));
  assert.equal(renderer.surfaces.filter((m) => m.visible).length, 1);
  assert.equal(renderer.surfaces.find((m) => m.visible).userData.motion, null);
});
