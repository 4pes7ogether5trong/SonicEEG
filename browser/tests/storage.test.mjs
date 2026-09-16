import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalArchive } from '../history.js';
test('Saved sessions stay separate and allow exact quantitative-frame retrieval', async () => {
  const a = new LocalArchive();
  await a.open();
  const one = await a.create('screen'),
    two = await a.create('demo');
  const f = {
    start: 0,
    end: 1,
    channels: [{ name: 'F7-T7', valid: true, validSeconds: 1 }],
    settings: { hp: 1 },
  };
  await a.append(f, one);
  await a.append({ ...f, start: 1, end: 2 }, one);
  await a.append(f, two);
  assert.equal((await a.frames(one)).length, 2);
  assert.equal((await a.frames(two)).length, 1);
  assert.equal((await a.frames(one, 0.5, 2))[0].start, 1);
  let count = 0;
  await a.visit(one, () => count++);
  assert.equal(count, 2);
  await a.invalidateSince(one, 1);
  assert.equal((await a.frames(one))[1].channels[0].valid, false);
  await a.erase(one);
  assert.equal((await a.frames(one)).length, 0);
  assert.equal((await a.frames(two)).length, 1);
  a.db.close();
});
