'use strict';
const assert=require('node:assert/strict');
const {exportUnverifiedDraft}=require('./report-export-gate.cjs');
const f=()=>({id:'candidate-0001',kind:'seizure',intervalSeconds:{start:1,end:3},occurrences:1,confidenceRange:{min:.2,max:.9},evidenceIds:['ev-1'],overlappingSeizureEvidenceIds:[],reviewIssues:['verify_onset_offset'],status:'unverified_candidate',interpretation:null});
const draft=()=>({schemaVersion:'0.1.0',recordingId:'synthetic-01',reportStatus:'draft_unverified',automatedClinicalInterpretation:false,findings:[f()],summary:{candidateCount:1,reviewRequiredCount:1},signoff:{technician:null,physician:null,approved:false}});
let n=0;function test(name,fn){fn();n++;console.log('ok',n,name)}
function rejects(fn){assert.throws(fn,TypeError)}
test('valid draft',()=>assert.equal(JSON.parse(exportUnverifiedDraft(draft())).findings.length,1));
test('signed draft rejected',()=>{let d=draft();d.signoff.approved=true;rejects(()=>exportUnverifiedDraft(d))});
test('reversed interval rejected',()=>{let d=draft();d.findings[0].intervalSeconds.end=0;rejects(()=>exportUnverifiedDraft(d))});
test('seizure flag required',()=>{let d=draft();d.findings[0].reviewIssues=[];rejects(()=>exportUnverifiedDraft(d))});
test('missing evidence flagged',()=>{let d=draft();d.findings[0].evidenceIds=[];rejects(()=>exportUnverifiedDraft(d))});
test('nonfinite confidence rejected',()=>{let d=draft();d.findings[0].confidenceRange.max=NaN;rejects(()=>exportUnverifiedDraft(d))});
test('duplicate IDs rejected',()=>{let d=draft();d.findings.push(f());d.summary.candidateCount=2;d.summary.reviewRequiredCount=2;rejects(()=>exportUnverifiedDraft(d))});
test('summary mismatch rejected',()=>{let d=draft();d.summary.candidateCount=0;rejects(()=>exportUnverifiedDraft(d))});
test('interpretation rejected',()=>{let d=draft();d.findings[0].interpretation='diagnosis';rejects(()=>exportUnverifiedDraft(d))});
test('unknown keys removed',()=>{let d=draft();d.secret='extra';d.findings[0].extra='extra';let out=exportUnverifiedDraft(d);assert(!out.includes('extra'))});
test('deterministic bytes',()=>{let d=draft();assert.equal(exportUnverifiedDraft(d),exportUnverifiedDraft(d))});
test('low-confidence seizure flag accepted',()=>{let d=draft();d.findings[0].reviewIssues.push('low_confidence_seizure_candidate');assert.equal(JSON.parse(exportUnverifiedDraft(d)).findings[0].reviewIssues.length,2)});
test('empty findings accepted',()=>{let d=draft();d.findings=[];d.summary={candidateCount:0,reviewRequiredCount:0};assert.equal(JSON.parse(exportUnverifiedDraft(d)).findings.length,0)});
test('zero-duration routine point is preserved',()=>{let d=draft();let x=d.findings[0];x.kind='blink';x.intervalSeconds={start:2,end:2};x.reviewIssues=['verify_state_or_artifact'];assert.deepEqual(JSON.parse(exportUnverifiedDraft(d)).findings[0].intervalSeconds,{start:2,end:2})});
test('zero-duration interictal point is preserved',()=>{let d=draft();let x=d.findings[0];x.kind='interictal_discharge';x.intervalSeconds={start:2,end:2};x.reviewIssues=['verify_pattern_classification'];assert.equal(JSON.parse(exportUnverifiedDraft(d)).findings[0].intervalSeconds.end,2)});
test('zero-duration seizure rejected',()=>{let d=draft();d.findings[0].intervalSeconds.end=1;rejects(()=>exportUnverifiedDraft(d))});
test('zero-duration RDA rejected',()=>{let d=draft();d.findings[0].kind='RDA';d.findings[0].intervalSeconds.end=1;rejects(()=>exportUnverifiedDraft(d))});
test('zero-duration BIRD rejected',()=>{let d=draft();d.findings[0].kind='BIRD';d.findings[0].intervalSeconds.end=1;rejects(()=>exportUnverifiedDraft(d))});
console.log(`PASS ${n} synthetic export gate tests`);
