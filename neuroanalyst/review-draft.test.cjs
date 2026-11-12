'use strict';
const assert=require('node:assert/strict');
const {buildReviewDraft}=require('./review-draft.cjs');
const e=(kind,time,duration=0,evidenceId=kind+time)=>({kind,time,duration,confidence:.95,evidenceId});
const tests=[
()=>{const r=buildReviewDraft([e('PD',0,30,'p'),e('seizure',10,5,'s')]);assert.equal(r.reportStatus,'draft_unverified');assert.equal(r.findings.length,2);assert.ok(r.findings[0].reviewIssues.includes('review_seizure_overlap'));},
()=>{const r=buildReviewDraft([e('seizure',10,5,'s')]);assert.ok(r.findings[0].reviewIssues.includes('verify_onset_offset'));assert.equal(r.signoff.approved,false);},
()=>{const r=buildReviewDraft([e('BIRD',10,2,'b')]);assert.ok(r.findings[0].reviewIssues.includes('verify_BIRD_criteria'));},
()=>{const r=buildReviewDraft([{kind:'PD',time:10,duration:2,confidence:.95}]);assert.equal(r.findings[0].evidenceIds.length,0);assert.ok(r.findings[0].reviewIssues.includes('missing_evidence'));},
()=>{const r=buildReviewDraft([e('blink',1),e('blink',2)]);assert.equal(r.findings.length,1);},
()=>{const r=buildReviewDraft([e('seizure',0,4,'s1'),e('seizure',2,4,'s2')]);assert.equal(r.findings.length,2);assert.ok(r.findings.every(f=>f.reviewIssues.includes('review_overlapping_seizure_candidates')));},
()=>assert.deepEqual(buildReviewDraft([]).findings,[]),
()=>assert.throws(()=>buildReviewDraft([e('PD',0)],{recordingId:''}),/invalid recordingId/),
()=>assert.throws(()=>buildReviewDraft([e('PD',0,-1)]),/invalid event/),
()=>{const r=buildReviewDraft([e('PD',0,2,'p1'),e('PD',3,2,'p2')]);assert.deepEqual(r.findings[0].evidenceIds,['p1','p2']);assert.equal(r.findings[0].occurrences,2);},
()=>{const r=buildReviewDraft([e('seizure',0,2)]);assert.equal(r.findings[0].interpretation,null);assert.equal(r.automatedClinicalInterpretation,false);},
()=>{const r=buildReviewDraft([e('PD',0,1)],{threshold:1});assert.equal(r.findings.length,0);}
];
tests.forEach((t,i)=>{try{t()}catch(err){console.error('FAILED',i+1);throw err}});
console.log('PASS: '+tests.length+' review draft checks');
