'use strict';
const assert=require('node:assert/strict');
const {groupWithIntervalSafety}=require('./interval-safety.cjs');
const event=(kind,time,duration,evidenceId)=>({kind,time,duration,confidence:.99,evidenceId});
function run(events){return groupWithIntervalSafety(events,{gapSeconds:0})}
const checks=[
 ['touching PD ends at seizure onset', [event('PD',1,2,'pd'),event('seizure',3,2,'sz')], 'PD',0],
 ['PD overlaps seizure onset', [event('PD',1,3,'pd'),event('seizure',3,2,'sz')], 'PD',1],
 ['blink at seizure onset', [event('blink',3,0,'blink'),event('seizure',3,2,'sz')], 'blink',1],
 ['blink at seizure offset', [event('seizure',3,2,'sz'),event('blink',5,0,'blink')], 'blink',0],
 ['blink inside seizure', [event('seizure',3,2,'sz'),event('blink',4,0,'blink')], 'blink',1],
 ['blink before seizure', [event('blink',2,0,'blink'),event('seizure',3,2,'sz')], 'blink',0],
 ['adjacent seizure candidates', [event('seizure',1,2,'sz1'),event('seizure',3,2,'sz2')], 'seizure',0],
 ['overlapping seizure candidates', [event('seizure',1,3,'sz1'),event('seizure',3,2,'sz2')], 'seizure',1],
];
for(const [name,events,kind,expected] of checks){
 const groups=run(events);
 const matching=groups.filter(g=>g.kind===kind);
 assert(matching.length>0,name);
 const count=kind==='seizure'?matching[0].overlappingSeizureCount:matching[0].seizureOverlapCount;
 assert.equal(count,expected,name);
}
console.log('PASS '+checks.length+' synthetic interval-boundary checks');
