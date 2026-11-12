'use strict';
const assert=require('node:assert/strict');
const {indexEvidence,auditDraftEvidence}=require('./evidence-index.cjs');
const f=(start=1,end=3,ids=['e1'])=>({id:'candidate-0001',intervalSeconds:{start,end},evidenceIds:ids,overlappingSeizureEvidenceIds:[]});
const d=(finding=f())=>({recordingId:'rec-1',findings:[finding]});
const e=(start=1,end=3,recordingId='rec-1')=>({id:'e1',start,end,recordingId});
const tests=[
 ()=>assert.equal(auditDraftEvidence(d(),[e()]).ok,true),
 ()=>assert.deepEqual(auditDraftEvidence(d(f(1,3,[])),[]).problems.map(p=>p.issue),['missing_evidence']),
 ()=>assert.equal(auditDraftEvidence(d(),[]).problems[0].issue,'unresolved_evidence'),
 ()=>assert.equal(auditDraftEvidence(d(),[e(1,3,'rec-2')]).problems[0].issue,'wrong_recording'),
 ()=>assert.equal(auditDraftEvidence(d(),[e(5,6)]).problems[0].issue,'evidence_outside_candidate'),
 ()=>assert.equal(auditDraftEvidence(d(),[e(3,5)]).problems[0].issue,'evidence_outside_candidate'),
 ()=>assert.equal(auditDraftEvidence(d(f(1,3)),[e(1,1)]).ok,true),
 ()=>assert.throws(()=>indexEvidence([e(),e()]),/duplicate/),
 ()=>assert.throws(()=>indexEvidence([e(-1,3)]),/invalid/),
 ()=>assert.throws(()=>indexEvidence([e(3,1)]),/invalid/),
 ()=>assert.throws(()=>indexEvidence([{...e(),id:'patient name'}]),/invalid/),
 ()=>assert.equal(auditDraftEvidence(d({...f(),overlappingSeizureEvidenceIds:['sz1']}),[e(),{id:'sz1',start:2,end:4,recordingId:'rec-1'}]).ok,true),
 ()=>assert.equal(auditDraftEvidence(d({...f(),overlappingSeizureEvidenceIds:['sz1']}),[e()]).problems[0].issue,'unresolved_evidence')
];
for(const [i,t] of tests.entries()){t();console.log('ok',i+1)}
console.log('PASS',tests.length,'evidence-index synthetic tests');
