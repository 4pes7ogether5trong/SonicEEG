'use strict';
const assert=require('node:assert/strict');
const {exportWithVerifiedEvidence}=require('./strict-evidence-export.cjs');
const {buildReviewDraft}=require('./review-draft.cjs');
const ev=(kind,time,duration,confidence,evidenceId)=>({kind,time,duration,confidence,evidenceId});
const draft=(events,recordingId='synthetic-1')=>buildReviewDraft(events,{recordingId});
const span=(id,start,end,recordingId='synthetic-1')=>({id,start,end,recordingId});
const tests=[
 ['empty draft',()=>assert.equal(JSON.parse(exportWithVerifiedEvidence(draft([]),[])).findings.length,0)],
 ['valid point',()=>assert.equal(JSON.parse(exportWithVerifiedEvidence(draft([ev('blink',1,0,.99,'b1')]),[span('b1',1,1)])).findings.length,1)],
 ['valid unsigned seizure',()=>{const x=JSON.parse(exportWithVerifiedEvidence(draft([ev('seizure',1,3,.4,'s1')]),[span('s1',1,4)]));assert.equal(x.signoff.approved,false);assert(x.findings[0].reviewIssues.includes('verify_onset_offset'))}],
 ['missing manifest',()=>assert.throws(()=>exportWithVerifiedEvidence(draft([])),/manifest/)],
 ['missing evidence',()=>assert.throws(()=>exportWithVerifiedEvidence(draft([ev('BIRD',1,2,.95,undefined)]),[]),/missing_evidence/)],
 ['unresolved evidence',()=>assert.throws(()=>exportWithVerifiedEvidence(draft([ev('blink',1,0,.99,'b1')]),[]),/unresolved_evidence/)],
 ['foreign evidence',()=>assert.throws(()=>exportWithVerifiedEvidence(draft([ev('blink',1,0,.99,'b1')]),[span('b1',1,1,'other')]),/foreign/)],
 ['unused foreign evidence',()=>assert.throws(()=>exportWithVerifiedEvidence(draft([]),[span('foreign',1,2,'other')]),/foreign/)],
 ['duplicate evidence',()=>assert.throws(()=>exportWithVerifiedEvidence(draft([]),[span('b1',1,1),span('b1',1,1)]),/duplicate/)],
 ['outside interval',()=>assert.throws(()=>exportWithVerifiedEvidence(draft([ev('blink',1,0,.99,'b1')]),[span('b1',2,2)]),/outside/)],
 ['valid seizure overlap',()=>{const d=draft([ev('PD',1,5,.96,'p1'),ev('seizure',3,2,.9,'s1')]);assert.equal(JSON.parse(exportWithVerifiedEvidence(d,[span('p1',1,6),span('s1',3,5)])).findings.length,2)}],
 ['overlap id must be seizure evidence',()=>{const d=draft([ev('PD',1,5,.96,'p1'),ev('seizure',3,2,.9,'s1')]);d.findings.find(f=>f.kind==='PD').overlappingSeizureEvidenceIds=['p1'];assert.throws(()=>exportWithVerifiedEvidence(d,[span('p1',1,6),span('s1',3,5)]),/seizure candidate/)}],
 ['deterministic',()=>{const d=draft([ev('blink',1,0,.99,'b1')]),m=[span('b1',1,1)];assert.equal(exportWithVerifiedEvidence(d,m),exportWithVerifiedEvidence(d,m))}],
 ['reject signoff',()=>{const d=draft([]);d.signoff.approved=true;assert.throws(()=>exportWithVerifiedEvidence(d,[]),/signoff/)}],
];
for(const [name,fn] of tests){fn();console.log('ok',name)}
console.log('PASS',tests.length,'strict evidence export synthetic tests');
