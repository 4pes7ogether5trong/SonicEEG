import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsDifference, validFilters } from '../display-settings.js';
test('Confirmed settings survive unreadable OCR and expose later changes without reference drift', () => {
  const confirmed = {
    hp: 0.5,
    lp: 70,
    notch: 'off',
    seconds: 10,
    sensitivity: 7,
  };
  assert.equal(
    settingsDifference(confirmed, { ...confirmed }).needsReview,
    false,
  );
  assert.deepEqual(
    settingsDifference(confirmed, { ...confirmed, lp: null }).unreadable,
    ['lp'],
  );
  assert.deepEqual(
    settingsDifference(confirmed, { ...confirmed, lp: 35 }).changed,
    ['lp'],
  );
  assert.equal(confirmed.lp, 70);
  assert.deepEqual(
    settingsDifference(confirmed, {
      ...confirmed,
      seconds: 20,
      sensitivity: 14,
    }).changed,
    ['seconds', 'sensitivity'],
  );
  assert.equal(settingsDifference(confirmed, null).unreadable.length, 5);
  assert.deepEqual(settingsDifference({ hp: null }, { hp: 1 }).changed, ['hp']);
});
test('Filter-only confirmation rejects inverted, nonfinite and ambiguous settings', () => {
  assert.ok(validFilters({ hp: 0.5, lp: 35, notch: 'off' }));
  assert.ok(validFilters({ hp: null, lp: null, notch: null }));
  for (const s of [
    { hp: 40, lp: 35, notch: 'off' },
    { hp: NaN, lp: 35, notch: 'off' },
    { hp: 0.5, lp: Infinity, notch: 'off' },
    { hp: 0.5, lp: 35, notch: 'on' },
  ])
    assert.equal(validFilters(s), false);
});
