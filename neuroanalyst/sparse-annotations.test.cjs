'use strict';
// Synthetic nonclinical fixture; annotation selection only, not EEG detection.
const assert = require('node:assert/strict');
function selectAnnotations(events, threshold = 0.9) {
  const firstSeen = new Set();
  return events.filter(e => {
    if (!Number.isFinite(e.time) || !Number.isFinite(e.confidence) || e.confidence < 0 || e.confidence > 1) throw Error('invalid event');
    if (e.confidence < threshold) return false;
    if (e.kind === 'seizure') return true;
    if (['blink', 'vertex', 'k_complex', 'spindle', 'state_change'].includes(e.kind)) {
      if (firstSeen.has(e.kind)) return false;
      firstSeen.add(e.kind);
      return true;
    }
    if (['RDA', 'PD', 'BIRD', 'interictal_discharge'].includes(e.kind)) return true;
    return false;
  });
}
const synthetic = [
  {time:1,kind:'blink',confidence:.99}, {time:2,kind:'blink',confidence:.99},
  {time:3,kind:'vertex',confidence:.95}, {time:4,kind:'vertex',confidence:.96},
  {time:5,kind:'seizure',confidence:.98}, {time:20,kind:'seizure',confidence:.97},
  {time:21,kind:'PD',confidence:.94}, {time:22,kind:'BIRD',confidence:.75},
  {time:23,kind:'state_change',confidence:.93}, {time:24,kind:'state_change',confidence:.94}
];
assert.deepEqual(selectAnnotations(synthetic).map(e=>[e.time,e.kind]),[[1,'blink'],[3,'vertex'],[5,'seizure'],[20,'seizure'],[21,'PD'],[23,'state_change']]);
assert.deepEqual(selectAnnotations([{time:0,kind:'seizure',confidence:.89}]),[]);
assert.throws(()=>selectAnnotations([{time:0,kind:'PD',confidence:1.1}]),/invalid event/);
assert.deepEqual(selectAnnotations([{time:0,kind:'unknown',confidence:1}]),[]);
console.log('PASS: 4 synthetic sparse-annotation checks');
module.exports = {selectAnnotations};
