'use strict';
// Manifest admission is not EEG interpretation; asserted fields require external verification.
const HEX=/^[a-f0-9]{64}$/i;
function assess(records){
 if(!Array.isArray(records))throw new TypeError('records array required');
 const issues=[],splits=new Map(),ids=new Set(),eventIds=new Set();
 if(!records.length)issues.push('empty_cohort');
 for(const r of records){
  if(!r||typeof r!=='object'){issues.push('invalid_record');continue;}
  if(typeof r.subjectId!=='string'||!r.subjectId.trim()||!['train','validation','test'].includes(r.split)){issues.push('invalid_subject_split');continue;}
  if(splits.has(r.subjectId)&&splits.get(r.subjectId)!==r.split)issues.push('patient_split_leakage');
  splits.set(r.subjectId,r.split);
  if(typeof r.recordingId!=='string'||!r.recordingId.trim()||ids.has(r.recordingId))issues.push('duplicate_or_missing_recording_id');
  ids.add(r.recordingId);
  if(!Number.isFinite(r.durationSeconds)||r.durationSeconds<=0)issues.push('invalid_duration');
  if(!r.waveform||!HEX.test(r.waveform.sha256||'')||!Number.isInteger(r.waveform.bytes)||r.waveform.bytes<256||r.waveform.verifiedLocally!==true)issues.push('waveform_integrity_unverified');
  if(!r.license||!r.license.identifier||!/^https:\/\//.test(r.license.sourceUrl||'')||r.license.reviewedForReuse!==true)issues.push('license_review_missing');
  if(!r.acquisition||!Number.isFinite(r.acquisition.sampleHz)||r.acquisition.sampleHz<=0||!Array.isArray(r.acquisition.channels)||!r.acquisition.channels.length)issues.push('acquisition_metadata_missing');
  if(!Array.isArray(r.reviewedEpochs)||!r.reviewedEpochs.length||r.reviewedEpochs.some(x=>!Array.isArray(x)||x.length!==2||!Number.isFinite(x[0])||!Number.isFinite(x[1])||x[0]<0||x[1]<=x[0]||x[1]>r.durationSeconds))issues.push('reviewed_epoch_mask_invalid');
  if(!Array.isArray(r.referenceEvents))issues.push('reference_events_missing');
  else for(const e of r.referenceEvents){
   const key=r.recordingId+':'+e?.id;
   if(!e||typeof e.id!=='string'||!e.id.trim()||eventIds.has(key)||!Number.isFinite(e.onset)||!Number.isFinite(e.offset)||e.onset<0||e.offset<=e.onset||e.offset>r.durationSeconds)issues.push('reference_event_invalid');
   else eventIds.add(key);
   if(!e||!['published','reviewer_point','plausible_range','indeterminate'].includes(e.provenance)||!e.sourceUrl)issues.push('reference_provenance_missing');
  }
  if(!r.detector||!HEX.test(r.detector.predictionsSha256||'')||!r.detector.modelVersion||r.detector.referenceBlinded!==true||r.detector.generatedBeforeUnblinding!==true)issues.push('blinded_prediction_provenance_missing');
 }
 return {ready:issues.length===0,issues:[...new Set(issues)],independentSubjects:splits.size,recordings:ids.size,referenceEvents:eventIds.size};
}
module.exports={assess};
