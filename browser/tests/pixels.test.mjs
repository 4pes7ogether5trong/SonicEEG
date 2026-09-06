import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTraces, findSweepCursor } from '../pixels.js';
import { analyze } from '../signal.js';
function image({
  amplitude = 12,
  frequency = 10,
  rate = 128,
  width = 512,
  height = 130,
  gap = false,
  cursor = null,
} = {}) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const set = (x, y, value) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value;
  };
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++)
      if (x % 64 === 0 || y % 32 === 0) set(x, y, 215);
  for (const base of [35, 95]) {
    let previous = base;
    for (let x = 0; x < width; x++) {
      const y =
        base +
        Math.round(amplitude * Math.sin((2 * Math.PI * frequency * x) / rate));
      if (!(gap && x > 200 && x < 235)) {
        for (let yy = Math.min(y, previous); yy <= Math.max(y, previous); yy++)
          set(x, yy, 15);
      }
      previous = y;
    }
  }
  if (cursor != null)
    for (let y = 0; y < height; y++) {
      const i = (y * width + cursor) * 4;
      data[i] = 255;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
  return { width, height, data };
}
const rows = [
  { name: 'F7-T7', y: 35 },
  { name: 'F8-T8', y: 95 },
];
test('Worker distinguishes an unchanged capture from a real signal gap', async () => {
  const oldSelf = globalThis.self, oldPost = globalThis.postMessage;
  const messages = [];
  globalThis.self = {};
  globalThis.postMessage = (m) => messages.push(m);
  try {
    await import('../signal-worker.js');
    self.onmessage({ data: { type: 'configure', config: {
      rows, uvPerPixel: 2, seconds: 4, mode: 'scroll', settings: {}, segment: '1',
    } } });
    const push = (img, wall) => self.onmessage({ data: {
      type: 'pixels', width: img.width, height: img.height,
      buffer: img.data.buffer, wall,
    } });
    push(image(), 0);
    push(image(), .5);
    assert.equal(messages.at(-1).accepted, false);
    assert.equal(messages.at(-1).gap, false);
    assert.equal(messages.at(-1).reason, 'Screen has not advanced');
    const blank = image();
    blank.data.fill(255);
    push(blank, 1);
    assert.equal(messages.at(-1).gap, true);
  } finally {
    globalThis.self = oldSelf;
    globalThis.postMessage = oldPost;
  }
});
test('Generated EEG pixels recover the programmed rhythm and amplitude', () => {
  const result = extractTraces(image(), rows, { uvPerPixel: 2 });
  assert.equal(result.length, 2);
  assert.ok(result[0].valid);
  const f = analyze(result[0].samples, 128);
  assert.ok(Math.abs(f.peakHz - 10) < 0.3);
  assert.ok(Math.abs(f.rms - 24 / Math.sqrt(2)) < 2, `RMS ${f.rms}`);
});
test('Polarity follows the confirmed display convention', () => {
  const a = extractTraces(image(), rows, { uvPerPixel: 2, negativeUp: true }),
    b = extractTraces(image(), rows, { uvPerPixel: 2, negativeUp: false });
  for (let i = 0; i < 512; i++) assert.equal(a[0].samples[i], -b[0].samples[i]);
});
test('Blank crops do not become valid EEG', () => {
  const data = new Uint8ClampedArray(512 * 130 * 4).fill(255);
  assert.equal(
    extractTraces({ width: 512, height: 130, data }, rows, { uvPerPixel: 1 })[0]
      .valid,
    false,
  );
});
test('Sweep cursor needs evidence across the waveform height', () => {
  assert.equal(findSweepCursor(image({ cursor: 220 })), 220);
  assert.equal(findSweepCursor(image()), null);
});
test('Clipped traces are not accepted as calibrated amplitudes', () => {
  const r = extractTraces(image({ amplitude: 42 }), rows, { uvPerPixel: 1 });
  assert.ok(r.some((c) => !c.valid));
});
