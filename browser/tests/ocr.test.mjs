import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createWorker, PSM } from 'tesseract.js';
import {
  labelCandidates,
  findDerivations,
  recognizeMontage,
} from '../montage.js';

test('Local OCR reads an eight-row generated label fixture with explicit repair suggestions', async () => {
  const w = await createWorker('eng', 1, {
    langPath: resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
    cacheMethod: 'none',
    logger: () => {},
  });
  try {
    await w.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      tessedit_char_whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-+ ',
    });
    const { data } = await w.recognize(
      'browser/tests/fixtures/channel-labels.png',
      {},
      { blocks: true, text: true },
    );
    const rows = data.blocks
      .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
      .flatMap((l) =>
        labelCandidates(l.text).map((d) => ({ ...d, y: l.bbox.y0 })),
      );
    assert.deepEqual(
      rows.map((r) => r.name),
      [
        'FP1-F7',
        'F7-T7',
        'T7-P7',
        'P7-O1',
        'FP2-F8',
        'F8-T8',
        'T8-P8',
        'P8-O2',
      ],
    );
    assert.ok(rows.some((r) => r.corrected));
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i].y > rows[i - 1].y);
  } finally {
    await w.terminate();
  }
});
test('OCR proposals never silently alter authoritative electrode names', () => {
  assert.deepEqual(findDerivations('F7-17'), []);
  assert.equal(labelCandidates('F7-17')[0].corrected, true);
  assert.deepEqual(labelCandidates('Patient 17 / 01'), []);
  assert.deepEqual(labelCandidates('F7-C2'), []);
  assert.equal(findDerivations('F7-A1+A2')[0].name, 'F7-A1+A2');
  assert.equal(
    recognizeMontage(['F3-CZ', 'F4-CZ', 'C3-CZ', 'C4-CZ']).name,
    'Referential (CZ)',
  );
});
