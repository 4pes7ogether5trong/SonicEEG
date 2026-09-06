import test from 'node:test';
import assert from 'node:assert/strict';
import {
  settingsDifference,
  settingsWatchReference,
  validFilters,
} from '../display-settings.js';
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
  const manual = settingsWatchReference(confirmed, { hp: null, lp: null });
  assert.equal(
    settingsDifference(manual, { hp: null, lp: null }).needsReview,
    false,
  );
  const partial = settingsWatchReference(confirmed, { hp: 0.5 });
  assert.deepEqual(settingsDifference(partial, { hp: null }).unreadable, [
    'hp',
  ]);
  assert.equal(
    settingsDifference(partial, { hp: 0.5, lp: null }).needsReview,
    false,
  );
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
