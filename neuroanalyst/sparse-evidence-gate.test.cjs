'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {exactCoverage,assessSparseEvidence,gateSparseEpisode}=require('./sparse-evidence-gate.cjs');
const {prepareEpisodeReview}=require('./episode-review.cjs');
function fixture(){
 const e={id:'synthetic-1',recordingId:'rec',montageId:'longitudinal',classification:'rhythmic',startSeconds:10,endSeconds:30,channels:['F3-C3'],features:{field:'left',frequencyHz:2,morphology:'smooth',evolution:false,fluctuation:false,plusModifiers:[]},evidenceIds:['clip'],qualityIntervals:[{startSeconds:10,endSeconds:30,quality:'usable'}],baseline:{sameStateReferenceId:'baseline',priorEventComparisonIds:[]},ageContext:'non-neonatal',reviewStatus:'reviewer-confirmed'};
 const m={recordingId:'rec',montageId:'longitudinal',traces:[{id:'clip',recordingId:'rec',montageId:'longitudinal',startSeconds:14,endSeconds:17,channels:['F3-C3']}]};
 return {e,m};
}
test('short representative clip accepted with full review coverage',()=>{const {e,m}=fixture();assert.deepEqual(assessSparseEvidence(e,m),[]);assert.equal(gateSparseEpisode(e,m,prepareEpisodeReview).exportEligible,true)});
test('gap in reviewed EEG rejected',()=>{const {e,m}=fixture();e.qualityIntervals=[{startSeconds:10,endSeconds:19,quality:'usable'},{startSeconds:20,endSeconds:30,quality:'usable'}];assert.ok(assessSparseEvidence(e,m).includes('review_coverage_incomplete'))});
test('overlapping coverage rejected',()=>{const {e,m}=fixture();e.qualityIntervals=[{startSeconds:10,endSeconds:21,quality:'usable'},{startSeconds:20,endSeconds:30,quality:'usable'}];assert.equal(exactCoverage(e.qualityIntervals,10,30),false)});
test('excerpt outside episode rejected',()=>{const {e,m}=fixture();m.traces[0].endSeconds=31;assert.ok(assessSparseEvidence(e,m).includes('evidence_scope_invalid'))});
test('cross-recording excerpt rejected',()=>{const {e,m}=fixture();m.traces[0].recordingId='other';assert.ok(assessSparseEvidence(e,m).includes('evidence_scope_invalid'))});
test('missing channel rejected',()=>{const {e,m}=fixture();m.traces[0].channels=['C3-P3'];assert.ok(assessSparseEvidence(e,m).includes('evidence_channels_mismatch'))});
test('duplicate manifest IDs rejected',()=>{const {e,m}=fixture();m.traces.push({...m.traces[0]});assert.ok(assessSparseEvidence(e,m).includes('manifest_trace_id_invalid'))});
test('unreviewed episode withheld',()=>{const {e,m}=fixture();e.reviewStatus='candidate';assert.equal(gateSparseEpisode(e,m,prepareEpisodeReview).exportEligible,false)});
test('nonusable artifact withheld',()=>{const {e,m}=fixture();e.qualityIntervals[0].quality='artifact';assert.equal(gateSparseEpisode(e,m,prepareEpisodeReview).exportEligible,false)});
test('unknown trace withheld',()=>{const {e,m}=fixture();e.evidenceIds=['missing'];assert.ok(assessSparseEvidence(e,m).includes('evidence_unresolved'))});
