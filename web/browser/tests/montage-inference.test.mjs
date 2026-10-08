import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, POSITIONS, derive } from '../montage.js';
import { suggestMontageLabels } from '../montage-inference.js';
import { FeaturePipeline } from '../pipeline.js';
import { mergeBins } from '../history.js';

const lb = TEMPLATES[0].channels;
const rows = (names) =>
  names.map((name, i) => ({
    name,
    y: (i + 0.5) / names.length,
    height: 0.02,
    x0: 0.02,
    x1: 0.15,
    confidence: name === '?' ? 0 : 80,
  }));

test('Montage proposals fill existing gaps, preserve read labels/geometry, and do not bootstrap themselves', () => {
  for (const template of TEMPLATES) {
    const observed = rows(
      template.channels.map((name, i) => ([1, 8, 14].includes(i) ? '?' : name)),
    );
    const before = structuredClone(observed),
      result = suggestMontageLabels(observed);
    assert.equal(result.inferred, 3);
    assert.deepEqual(
      result.rows.map((r) => r.name),
      template.channels,
    );
    assert.deepEqual(observed, before);
    assert.equal(result.rows.length, observed.length);
    result.rows.forEach((row, i) => {
      assert.equal(row.y, observed[i].y);
      assert.equal(row.x1, observed[i].x1);
      assert.equal(row.height, observed[i].height);
      if (observed[i].name === '?') {
        assert.equal(row.inferred, true);
        assert.equal(row.ocrName, '?');
      } else assert.deepEqual(row, observed[i]);
    });
    assert.deepEqual(suggestMontageLabels(result.rows), result);
  }
  const prior = rows(lb).map((row) => ({ ...row, ocrName: '?', inferred: true }));
  assert.equal(suggestMontageLabels(prior).inferred, 0);
  assert.ok(suggestMontageLabels(prior).rows.every((r) => r.name === '?'));
});

test('Only consensus is proposed when whole missing chains have multiple possible row orders', () => {
  const observed = rows(lb.map((name, i) => (i === 1 || (i >= 4 && i < 12) ? '?' : name)));
  const result = suggestMontageLabels(observed);
  assert.equal(result.inferred, 1);
  assert.equal(result.rows[1].name, 'F7-T7');
  assert.equal(result.rows.filter((r) => r.name === '?').length, 8);
});

test('Two midline labels, conflicting/custom orders, duplicate labels, and missing rows cannot establish a full layout', () => {
  const examples = [
    rows(lb.map((name) => (['FZ-CZ', 'CZ-PZ'].includes(name) ? name : '?'))),
    rows(lb.map((name, i) => (i === 1 ? '?' : i === 6 ? 'F3-C4' : name))),
    rows(lb.map((name, i) => (i === 1 ? '?' : i === 6 ? lb[5] : name))),
    rows(lb.slice(1).map((name, i) => (i === 1 ? '?' : name))),
    rows(lb.map((name, i) => (i === 1 ? '?' : i === 9 ? lb[10] : i === 10 ? lb[9] : name))),
  ];
  for (const observed of examples) {
    const result = suggestMontageLabels(observed);
    assert.equal(result.inferred, 0);
    assert.deepEqual(result.rows, observed);
  }
});

test('A full common-reference set can suggest one missing electrode but cannot order several', () => {
  for (const ref of ['AVG', 'CZ']) {
    const names = Object.keys(POSITIONS)
      .slice(0, 19)
      .filter((e) => e !== ref)
      .map((e) => `${e}-${ref}`)
      .reverse();
    const observed = rows(names.map((name, i) => (i === 6 ? '?' : name)));
    const result = suggestMontageLabels(observed);
    assert.equal(result.inferred, 1);
    assert.deepEqual(
      result.rows.map((r) => r.name),
      names,
    );
    observed[4].name = '?';
    assert.equal(suggestMontageLabels(observed).inferred, 0);
  }
});

test('Inferred-label provenance survives voltage analysis, derivation and compressed history', () => {
  const samples = Float32Array.from(
    { length: 256 },
    (_, i) => 30 * Math.sin((2 * Math.PI * 5 * i) / 128),
  );
  const frames = [],
    pipeline = new FeaturePipeline((frame) => frames.push(frame));
  for (let start = 0; start < 4; start += 2)
    pipeline.ingest(
      {
        start,
        duration: 2,
        rate: 128,
        channels: [{ name: 'FZ-CZ', labelInferred: true, samples, valid: true }],
      },
      { expected: ['CZ-PZ'] },
    );
  assert.deepEqual(
    frames.map((f) => f.end),
    [2, 2.5, 3, 3.5, 4],
  );
  for (const frame of frames) {
    assert.equal(frame.channels[0].labelInferred, true);
    assert.equal(frame.channels[0].valid, true);
    assert.equal(frame.channels[1].valid, false);
  }
  assert.equal(mergeBins(frames[0], frames[1]).channels[0].labelInferred, true);
  const channels = [
    { name: 'FZ-CZ', start: 0, rate: 128, segment: 'one', valid: true, samples },
    {
      name: 'CZ-PZ',
      start: 0,
      rate: 128,
      segment: 'one',
      valid: true,
      samples,
      labelInferred: true,
    },
  ];
  const result = derive('FZ-PZ', channels);
  assert.equal(result.labelInferred, true);
  assert.equal(result.samples[10], samples[10] * 2);
  assert.equal(derive('F7-T7', channels), null);
});
