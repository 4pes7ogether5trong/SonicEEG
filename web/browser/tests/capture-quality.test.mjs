import test from 'node:test';
import assert from 'node:assert/strict';
import { recentTraceQuality } from '../capture-quality.js';
import { traceDisplayScale } from '../trace-view.js';

test('Recent quality counts fully missing leads, repairs, and absent columns in its denominator', () => {
  const rows = [
    {
      end: 8,
      elapsed: 8,
      fragments: [{ start: 4, end: 8, rate: 1, samples: [10, 20, 30, 0], observed: [1, 1, 2, 0] }],
    },
    { end: 8, elapsed: 8, fragments: [] },
  ];
  const q = recentTraceQuality(rows);
  assert.equal(q.expectedSeconds, 8);
  assert.equal(q.observed, 0.25);
  assert.equal(q.repaired, 0.125);
  assert.equal(q.missing, 0.625);
  const stale = recentTraceQuality(rows.map((r) => ({ ...r, end: 12, elapsed: 12 })));
  assert.equal(stale.missing, 1);
  assert.equal(stale.observed, 0);
});

test('Recent coverage clips to the window, rejects nonfinite samples, and does not double-count fragments', () => {
  const fragment = {
    start: 3.5,
    end: 6,
    rate: 2,
    samples: [5, 5, NaN, 5, 5],
    observed: [1, 1, 1, 1, 1],
  };
  const q = recentTraceQuality([{ end: 8, elapsed: 8, fragments: [fragment, fragment] }]);
  assert.equal(q.observed, 1.5 / 4);
  assert.equal(q.missing, 2.5 / 4);
  assert.equal(recentTraceQuality([]).expectedSeconds, 0);
});

test('Inspector auto-fit includes the largest visible lead and ignores missing or expired peaks', () => {
  const rows = [
    {
      end: 8,
      fragments: [
        { start: 4, end: 8, rate: 1, samples: [25, -290, 9999, NaN], observed: [1, 2, 0, 1] },
      ],
    },
    {
      end: 8,
      fragments: [{ start: 0, end: 4, rate: 1, samples: [5000, 0, 0, 0], observed: [1, 1, 1, 1] }],
    },
  ];
  assert.equal(traceDisplayScale(rows), 320);
  assert.equal(traceDisplayScale(rows, 80), 80);
  assert.equal(traceDisplayScale([]), 40);
});
