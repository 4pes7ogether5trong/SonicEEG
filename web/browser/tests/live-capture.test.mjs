import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenStitcher } from '../stitch.js';
import { FeaturePipeline } from '../pipeline.js';
import { settingsDifference, settingsWatchReference } from '../display-settings.js';
import { captureStatusMessage } from '../capture-status.js';

function scroll(start, missing = false) {
  return ['F7-T7', 'F8-T8'].map((name, row) => {
    const samples = Float32Array.from({ length: 1024 }, (_, x) => {
      const t = (start + x) / 128;
      return (
        10 * Math.sin(2 * Math.PI * 7.3 * t + row) +
        5 * Math.sin(2 * Math.PI * 11.67 * t + row * 0.7) +
        3 * Math.cos(2 * Math.PI * 2.33 * t)
      );
    });
    const observed = new Uint8Array(samples.length).fill(1);
    if (missing) {
      samples[200] = samples[1000] = NaN;
      observed[200] = observed[1000] = 0;
    }
    return { name, samples, observed, clippedPixels: new Uint8Array(samples.length), valid: true };
  });
}

test('Scrolling aligns on available ink without converting missing samples into analyzed data', () => {
  const stitch = new ScreenStitcher({ mode: 'scroll', seconds: 8 });
  stitch.push(scroll(0, true), 0);
  const frames = [],
    pipeline = new FeaturePipeline((f) => frames.push(f));
  for (let frame = 1; frame <= 5; frame++) {
    const part = stitch.push(scroll(frame * 64, true), frame * 0.5);
    assert.equal(part.gap, undefined, part.reason);
    assert.equal(part.channels[0].samples.length, 64);
    assert.equal(part.channels[0].observed[40], 0);
    assert.ok(Number.isNaN(part.channels[0].samples[40]));
    pipeline.ingest(part);
  }
  assert.ok(frames.length > 0);
  assert.ok(frames.every((f) => f.channels.every((c) => !c.valid)));
  const frozen = stitch.push(scroll(5 * 64, true), 3);
  assert.equal(frozen.reason, 'Screen has not advanced');
  assert.equal(frozen.channels, undefined);
  for (let frame = 6; frame <= 10; frame++) {
    const part = stitch.push(scroll(frame * 64), frame * 0.5);
    assert.ok(part.channels, part.reason);
    pipeline.ingest(part);
  }
  assert.ok(
    frames.at(-1).channels.every((c) => c.valid),
    'analysis recovers after missing samples leave the window',
  );
});

test('Auto detects an advancing sweep even when old parts of the page are unreadable', () => {
  const partial = () =>
    scroll(0).map((row) => {
      row.valid = false;
      row.samples.fill(NaN, 600);
      row.observed.fill(0, 600);
      return row;
    });
  const stitch = new ScreenStitcher({ mode: 'auto', seconds: 8 });
  stitch.push(partial(), 0, 64);
  const part = stitch.push(partial(), 0.5, 128);
  assert.equal(stitch.mode, 'sweep');
  assert.equal(part.duration, 0.5);
  assert.ok(part.channels.every((c) => c.valid));
  const frozen = stitch.push(partial(), 1, 128);
  assert.equal(frozen.channels, undefined);
  assert.equal(stitch.time, 0.5);
});

test('Capture feedback distinguishes stopped input, incomplete windows, and analyzed channels', () => {
  assert.match(
    captureStatusMessage({
      mode: 'scroll',
      accepted: false,
      usableChannels: 2,
      reason: 'Screen has not advanced',
    }),
    /has not advanced/,
  );
  assert.doesNotMatch(
    captureStatusMessage({ accepted: false, usableChannels: 2, reason: 'Screen has not advanced' }),
    /analyzed/,
  );
  assert.match(
    captureStatusMessage({ mode: 'auto', accepted: true, usableChannels: null }),
    /first 2-second/,
  );
  assert.match(
    captureStatusMessage({ mode: 'sweep', accepted: true, usableChannels: 0 }),
    /no complete/,
  );
  assert.match(
    captureStatusMessage({ mode: 'sweep', gap: true, reason: 'Sweep cursor unavailable' }),
    /Continuous scrolling/,
  );
});

test('The production worker detects a partial sweep, analyzes new ink, and stops credit at a frozen screen or gap', async () => {
  const oldSelf = globalThis.self,
    oldPost = globalThis.postMessage,
    messages = [];
  globalThis.self = {};
  globalThis.postMessage = (m) => messages.push(m);
  try {
    await import('../signal-worker.js');
    self.onmessage({
      data: {
        type: 'configure',
        config: {
          rows: [
            { name: 'F7-T7', y: 35 },
            { name: 'F8-T8', y: 105 },
          ],
          uvPerPixel: 2,
          seconds: 8,
          mode: 'auto',
          settings: {},
          segment: 'live-check',
          expected: [],
        },
      },
    });
    const push = (cursor, wall) => {
      const width = 1024,
        height = 140,
        data = new Uint8ClampedArray(width * height * 4).fill(255);
      for (const base of [35, 105]) {
        let previous = base;
        for (let x = 0; x < 850; x++) {
          const y = base + Math.round(10 * Math.sin((2 * Math.PI * 10 * x) / 128));
          for (let yy = Math.min(previous, y); yy <= Math.max(previous, y); yy++) {
            const p = (yy * width + x) * 4;
            data[p] = data[p + 1] = data[p + 2] = 15;
          }
          previous = y;
        }
      }
      for (let y = 0; y < height; y++) data.set([255, 220, 0, 255], (y * width + cursor) * 4);
      self.onmessage({ data: { type: 'pixels', width, height, buffer: data.buffer, wall } });
    };
    for (let frame = 0; frame <= 8; frame++) push(80 + 64 * frame, frame * 0.5);
    assert.ok(!messages.some((m) => m.type === 'error'));
    const status = messages.at(-1);
    assert.equal(status.mode, 'sweep');
    assert.equal(status.usableChannels, 2);
    const frames = messages.filter((m) => m.type === 'frame').map((m) => m.frame);
    assert.ok(frames.length > 0);
    assert.equal(frames.at(-1).end, 4);
    assert.ok(frames.at(-1).channels.every((c) => c.valid && Math.abs(c.peakHz - 10) < 0.3));
    push(592, 4.5);
    assert.equal(messages.at(-1).accepted, false);
    assert.equal(messages.filter((m) => m.type === 'frame').length, frames.length);
    push(656, 10);
    assert.equal(messages.at(-1).gap, true);
    assert.equal(messages.at(-1).usableChannels, 0);
    assert.ok(messages.filter((m) => m.type === 'frame').at(-1).frame.gaps > 0);
  } finally {
    globalThis.self = oldSelf;
    globalThis.postMessage = oldPost;
  }
});

test('Scrolling rejects an alignment supported only by a few finite samples', () => {
  const sparse = (start) =>
    scroll(start).map((row) => {
      for (let x = 0; x < row.samples.length; x++)
        if (x % 16) {
          row.samples[x] = NaN;
          row.observed[x] = 0;
        }
      return row;
    });
  const stitch = new ScreenStitcher({ mode: 'scroll', seconds: 8 });
  stitch.push(sparse(0), 0);
  const part = stitch.push(sparse(64), 0.5);
  assert.equal(part.gap, true);
  assert.equal(part.channels, undefined);
});

test('Automatic settings checks only compare the values established at confirmation', () => {
  const reference = settingsWatchReference({ hp: 0.5, lp: 70 }, { hp: 0.5 });
  assert.equal(settingsDifference(reference, { hp: 0.5, lp: 35 }).needsReview, false);
  assert.equal(settingsDifference({}, { seconds: 20 }).needsReview, false);
  assert.deepEqual(settingsDifference(reference, { hp: 1 }).changed, ['hp']);
  assert.deepEqual(settingsDifference(reference, {}).unreadable, ['hp']);
});
