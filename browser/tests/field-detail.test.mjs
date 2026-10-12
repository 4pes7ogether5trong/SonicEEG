import test from 'node:test';
import assert from 'node:assert/strict';
import { spectralField, sidePosition, sideTicks } from '../field-math.js';
import { FeaturePipeline } from '../pipeline.js';
import { mergeBins } from '../history.js';
import { patientDemoBlock } from '../demo.js';

test('Dominant-band surface preserves separate band selection and excludes unavailable channels', () => {
  const channels = [
    {name:'F3-AVG',valid:true,bands:[1,400,90,3,0],last:0},
    {name:'F4-AVG',valid:false,bands:[0,0,0,1e8,0],last:0},
  ];
  const weights = [{weight:1,signed:1},{weight:1,signed:1}];
  const dominant = spectralField(weights,channels);
  assert.equal(dominant.band,1);
  const alpha = spectralField(weights,channels,{band:2});
  assert.equal(alpha.band,2);
  assert.ok(alpha.amp>0 && alpha.amp<dominant.amp);
  const missing = spectralField(weights,channels,{selected:'F4-AVG'});
  assert.equal(missing.coverage,0);
  const loud = [{...channels[0], bands:[1e5,1e6,0,0,0]}];
  assert.equal(spectralField(weights.slice(0,1),loud,{scale:20}).band,1,
    'Brightness saturation must not change the strongest band');
});
test('Side ruler tracks actual timestamps through every lens and selected focus', () => {
  for(const lens of [0,.5,1])for(const focus of [0,40,144]) {
    const ticks=sideTicks(144,focus,lens);
    assert.equal(ticks[0].x,-4);assert.equal(ticks.at(-1).x,4);
    for(let i=1;i<ticks.length;i++)assert.ok(ticks[i].x>ticks[i-1].x);
    for(const t of ticks)assert.equal(t.x,sidePosition(t.time,144,focus,lens));
  }
});
test('Sharp candidate summaries deduplicate overlapping windows and survive time compression', () => {
  const frames=[],p=new FeaturePipeline(f=>frames.push(f));
  const events=[{start:2,end:12,slots:[0],type:'periodic',hz:1.25,location:'left'}];
  for(let t=0;t<14;t+=.5)p.ingest({start:t,duration:.5,rate:128,
    channels:patientDemoBlock(t,.5,128,{slot:0,changes:events})},
    {source:'demo',segment:'a',settings:{hp:.5,lp:45,notch:'off'}});
  const collapsed=frames.reduce((a,b)=>a?mergeBins(a,b):b,null);
  for(const c of collapsed.channels) {
    const original=frames.map(f=>f.channels.find(x=>x.name===c.name));
    assert.equal(c.sharpCount,original.reduce((s,x)=>s+x.sharpCount,0));
    assert.ok(c.sharpCount<=13, 'A repeated observation must not count as another event');
  }
  assert.ok(collapsed.channels.some(c=>c.sharpCount>=10));
});
