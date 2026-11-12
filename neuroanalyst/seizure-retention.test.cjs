'use strict';
const assert=require('node:assert/strict');
const {groupEpisodesV2}=require('./episode-grouping-v2.cjs');
const {buildReviewDraft}=require('./review-draft.cjs');
const e=(kind,time,confidence,evidenceId)=>({kind,time,duration:2,confidence,evidenceId});
const cases=[
  ()=>{const g=groupEpisodesV2([e('seizure',10,.2,'s')]);assert.equal(g.length,1);assert.equal(g[0].belowThreshold,true);assert.equal(g[0].reviewRequired,true);},
  ()=>{const g=groupEpisodesV2([e('PD',1,.2,'p'),e('seizure',3,.2,'s')]);assert.deepEqual(g.map(x=>x.kind),['seizure']);},
  ()=>{const g=groupEpisodesV2([e('seizure',1,.95,'s')]);assert.equal(g[0].belowThreshold,false);},
  ()=>{const g=groupEpisodesV2([e('seizure',1,0,'s0'),e('seizure',5,1,'s1')]);assert.equal(g.length,2);assert.deepEqual(g.map(x=>x.evidenceIds[0]),['s0','s1']);},
  ()=>{const r=buildReviewDraft([e('seizure',10,.2,'s')]);assert.equal(r.findings.length,1);assert.equal(r.findings[0].confidenceRange.min,.2);assert.equal(r.findings[0].status,'unverified_candidate');assert.ok(r.findings[0].reviewIssues.includes('verify_onset_offset'));},
  ()=>{const r=buildReviewDraft([e('seizure',10,.2,'s')],{threshold:1});assert.equal(r.findings.length,1);},
  ()=>{const g=groupEpisodesV2([e('seizure',10,.2,'s'),e('PD',11,.95,'p')]);assert.equal(g.length,2);},
  ()=>assert.throws(()=>groupEpisodesV2([e('seizure',10,-.1,'s')]),/invalid event/)
];
cases.forEach((fn,i)=>{try{fn()}catch(err){console.error('FAILED case',i+1);throw err}});
console.log('PASS: '+cases.length+' seizure retention checks');
