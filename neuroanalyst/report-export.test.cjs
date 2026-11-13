'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildSyntheticReport,validateContext}=require('./report-export.cjs');
function fixture(){
 const e={id:'e1',recordingId:'r1',montageId:'m1',state:'awake',classification:'rhythmic',startSeconds:10,endSeconds:30,channels:['F3-C3'],features:{field:'left',frequencyHz:2,morphology:'smooth',evolution:false,fluctuation:false,plusModifiers:[]},evidenceIds:['clip'],qualityIntervals:[{startSeconds:10,endSeconds:30,quality:'usable'}],baseline:{sameStateReferenceId:'b1',priorEventComparisonIds:[]},ageContext:'non-neonatal',reviewStatus:'reviewer-confirmed'};
 const m={recordingId:'r1',montageId:'m1',traces:[{id:'clip',recordingId:'r1',montageId:'m1',startSeconds:14,endSeconds:16,channels:['F3-C3']}],baselines:[{id:'b1',recordingId:'r1',montageId:'m1',startSeconds:0,endSeconds:8,state:'awake',channels:['F3-C3']}],priorEvents:[]};return {e,m};
}
test('feature disabled by default',()=>{const {e,m}=fixture();assert.equal(buildSyntheticReport([e],m).findings[0].status,'withheld')});
test('enabled synthetic excerpt',()=>{const {e,m}=fixture();const r=buildSyntheticReport([e],m,{enabled:true});assert.equal(r.findings[0].status,'ready-for-technician-verification');assert.equal(r.clinicalUse,false)});
test('wrong state baseline',()=>{const {e,m}=fixture();m.baselines[0].state='sleep';assert.ok(validateContext(e,m).includes('baseline_state_mismatch'))});
test('future baseline',()=>{const {e,m}=fixture();m.baselines[0].endSeconds=12;assert.equal(buildSyntheticReport([e],m,{enabled:true}).findings[0].status,'withheld')});
test('cross recording baseline',()=>{const {e,m}=fixture();m.baselines[0].recordingId='r2';assert.ok(validateContext(e,m).includes('baseline_scope_mismatch'))});
test('unresolved baseline',()=>{const {e,m}=fixture();e.baseline.sameStateReferenceId='absent';assert.ok(validateContext(e,m).includes('baseline_unresolved'))});
test('missing baseline channel',()=>{const {e,m}=fixture();m.baselines[0].channels=['C3-P3'];assert.ok(validateContext(e,m).includes('baseline_channels_mismatch'))});
test('unresolved prior event',()=>{const {e,m}=fixture();e.baseline.priorEventComparisonIds=['missing'];assert.ok(validateContext(e,m).includes('prior_event_unresolved_or_future'))});
test('future prior event',()=>{const {e,m}=fixture();e.baseline.priorEventComparisonIds=['p'];m.priorEvents=[{id:'p',recordingId:'r1',endSeconds:31}];assert.ok(validateContext(e,m).includes('prior_event_unresolved_or_future'))});
test('duplicate episode ids',()=>{const {e,m}=fixture();assert.ok(buildSyntheticReport([e,{...e}],m,{enabled:true}).findings.every(f=>f.status==='withheld'))});
test('candidate withheld',()=>{const {e,m}=fixture();e.reviewStatus='candidate';assert.equal(buildSyntheticReport([e],m,{enabled:true}).findings[0].status,'withheld')});
test('artifact withheld',()=>{const {e,m}=fixture();e.qualityIntervals=[{startSeconds:10,endSeconds:15,quality:'usable'},{startSeconds:15,endSeconds:30,quality:'artifact'}];assert.equal(buildSyntheticReport([e],m,{enabled:true}).findings[0].status,'withheld')});
