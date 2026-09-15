import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTraces } from '../pixels.js';

test('Subpixel antialiased voltages retain their amplitude and polarity without filling blank columns', () => {
  const width = 256,
    height = 120,
    baseline = 60;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const truth = Float64Array.from(
    { length: width },
    (_, x) => 0.35 + 17 * Math.sin((2 * Math.PI * x) / 51),
  );
  for (let x = 0; x < width; x++) {
    if (x >= 120 && x < 128) continue;
    for (let y = 0; y < height; y++) {
      const opacity = Math.max(0, 1 - Math.abs(y - baseline - truth[x]) / 2);
      const gray = Math.round(255 - 230 * opacity);
      const p = (y * width + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = gray;
    }
  }
  for (const negativeUp of [true, false]) {
    const [trace] = extractTraces({ width, height, data }, [{ name: 'F7-T7', y: baseline }], {
      uvPerPixel: 2,
      negativeUp,
    });
    const errors = truth
      .map((value, x) => Math.abs(trace.samples[x] - value * 2 * (negativeUp ? 1 : -1)))
      .filter((_, x) => trace.observed[x] === 1);
    assert.ok(errors.length > 240);
    assert.ok(Math.max(...errors) < 0.35, `maximum calibrated error ${Math.max(...errors)} µV`);
    assert.ok(
      trace.observed.slice(120, 128).every((v) => v === 0),
      'a wide erased interval stays absent',
    );
  }
});
