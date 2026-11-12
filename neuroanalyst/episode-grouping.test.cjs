'use strict';
const assert=require('node:assert/strict');
const {groupEpisodes}=require('./episode-grouping.cjs');
const sample=[
 {kind:'PD',time:20,duration:2,confidence:.95,evidenceId:'p1'},
 {kind:'blink',time:1,confidence:.99},
 {kind:'PD',time:25,duration:1,confidence:.96,evidenceId:'p2'},
 {kind:'blink',time:2,confidence:.99},
 {kind:'seizure',time:40,duration:8,confidence:.98,evidenceId:'s1'},
 {kind:'seizure',time:45,duration:8,confidence:.97,evidenceId:'s2'},
 {kind:'BIRD',time:80,confidence:.8}
];
const result=groupEpisodes(sample);
assert.deepEqual(result.map(x=>[x.kind,x.start,x.end,x.count]),[['blink',1,1,1],['PD',20,26,2],['seizure',40,48,1],['seizure',45,53,1]]);
assert.deepEqual(result[1].evidenceIds,['p1','p2']);
assert.deepEqual(groupEpisodes([{kind:'PD',time:0,confidence:.91},{kind:'PD',time:30,confidence:.92}]).length,2);
assert.deepEqual(groupEpisodes([{kind:'PD',time:0,confidence:.91},{kind:'PD',time:30,confidence:.92}],{gapSeconds:30}).length,1);
assert.throws(()=>groupEpisodes([{kind:'PD',time:0,confidence:1.2}]),/invalid event/);
assert.throws(()=>groupEpisodes([{kind:'PD',time:0,confidence:1,evidenceId:''}]),/invalid evidenceId/);
assert.throws(()=>groupEpisodes([],{threshold:2}),/invalid options/);
assert.deepEqual(groupEpisodes([]),[]);
console.log('PASS: 8 synthetic episode-grouping checks');
