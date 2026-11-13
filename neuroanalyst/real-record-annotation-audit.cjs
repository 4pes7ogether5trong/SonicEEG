'use strict';
// Real published NEMAR/Siena annotations, not detector outputs or waveform validation.
// Source: https://github.com/nemarDatasets/nm000385/tree/main/sub-PN13/eeg
// Each event TSV was independently retrieved from the published repository 2026-11-13.
// Recheck upstream version/checksums before a formal evaluation.
const assert=require('node:assert/strict');
const runs=[
 {run:'01',source:'PN13-1.edf',duration:9355,tsv:'7062.000\t48.000\tseizure\t1\tseizure 1'},
 {run:'02',source:'PN13-2.edf',duration:9312,tsv:'7249.000\t65.000\tseizure\t2\tseizure 2'},
 {run:'03',source:'PN13-3.edf',duration:12527,tsv:'7553.000\t151.000\tseizure\t3\tseizure 3'}
];
function parse(run){const cols=run.tsv.split('\t');const onset=Number(cols[0]),duration=Number(cols[1]);assert(Number.isFinite(onset)&&onset>=0);assert(Number.isFinite(duration)&&duration>0);if(run.duration!==undefined)assert(onset+duration<=run.duration);return {recording:run.source,run:run.run,onset,offset:onset+duration,duration,label:cols[4],source:'published NEMAR annotation',detectorPrediction:false};}
const events=runs.map(parse);
assert.deepEqual(events.map(x=>x.offset),[7110,7314,7704]);
assert.equal(events.length,3);
const reviewer={recording:'PN13-2.edf',changeLandmark:7291,offset:7316,provenance:'John development observation; not ground truth'};
const published=events.find(e=>e.recording===reviewer.recording);
assert.equal(reviewer.offset-published.offset,2);
assert.equal(reviewer.changeLandmark-published.offset,-23);
assert(Math.abs(reviewer.offset-published.offset)<=3);
const result={sourceUrl:'https://github.com/nemarDatasets/nm000385/tree/main/sub-PN13/eeg',events,reviewer,reviewerMinusPublishedOffsetSeconds:2,withinThreeSeconds:true,recordsWithPublishedAnnotations:3,detectorPredictionsScored:0,waveformsDownloaded:false,clinicalValidation:false,notes:'All three runs are from the SAME patient; not three held-out patients. Published annotations are reference observations, not algorithm predictions. The PN13-2 change landmark is not a seizure termination label.'};
if(require.main===module)console.log(JSON.stringify(result,null,2));
module.exports={runs,parse,events,result};
