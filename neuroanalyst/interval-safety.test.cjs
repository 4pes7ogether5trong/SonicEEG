'use strict';
const assert=require('node:assert/strict');
const {groupWithIntervalSafety:g}=require('./interval-safety.cjs');
const e=(kind,time,duration=0,evidenceId=kind+time)=>({kind,time,duration,confidence:.95,evidenceId});
const checks=[
()=>{const r=g([e('PD',0,30),e('seizure',10,5)]);assert.equal(r.find(x=>x.kind==='PD').boundaryStatus,'overlaps_seizure_candidate');},
()=>{const r=g([e('PD',0,2),e('seizure',10,5)]);assert.equal(r.find(x=>x.kind==='PD').reviewRequired,false);},
()=>{const r=g([e('seizure',10,10,'s1'),e('seizure',15,10,'s2')]);assert.equal(r.length,2);assert.equal(r[0].overlappingSeizureCount,1);},
()=>{const r=g([e('BIRD',11,2),e('seizure',10,5,'s')]);assert.deepEqual(r[1].overlappingSeizureEvidenceIds,['s']);},
()=>{const r=g([e('PD',10,0),e('seizure',10,0)]);assert.equal(r.find(x=>x.kind==='PD').reviewRequired,true);},
()=>{const r=g([e('PD',0,1),e('seizure',5,2),e('PD',10,1)]);assert.equal(r.filter(x=>x.kind==='PD').length,2);},
()=>assert.throws(()=>g([e('PD',0,-1)]),/invalid event/),
()=>assert.deepEqual(g([]),[]),
];
checks.forEach((f,i)=>{try{f()}catch(err){console.error('FAILED',i+1);throw err}});
console.log('PASS: '+checks.length+' interval safety checks');
