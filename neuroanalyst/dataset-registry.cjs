'use strict';
// Admission metadata only. Does not deidentify recordings or grant legal permission.
const ID=/^[a-zA-Z0-9_.:-]{1,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const validId=x=>typeof x==='string'&&ID.test(x);
function validateDatasetEntry(entry){
 const errors=[];
 if(!entry||typeof entry!=='object'||Array.isArray(entry))return {ok:false,errors:['entry_object_required']};
 if(!validId(entry.datasetId))errors.push('invalid_dataset_id');
 if(!validId(entry.recordingId))errors.push('invalid_recording_id');
 if(typeof entry.sourceUrl!=='string'||!/^https:\/\//.test(entry.sourceUrl))errors.push('source_https_required');
 if(typeof entry.licenseId!=='string'||!entry.licenseId.trim())errors.push('license_required');
 if(typeof entry.licenseEvidenceUrl!=='string'||!/^https:\/\//.test(entry.licenseEvidenceUrl))errors.push('license_evidence_required');
 if(entry.allowedUse!=='research_training_and_evaluation')errors.push('explicit_use_authorization_required');
 if(entry.redistributionAllowed!==true&&entry.redistributionAllowed!==false)errors.push('redistribution_status_required');
 if(entry.deidentificationAttested!==true)errors.push('deidentification_attestation_required');
 if(entry.provenanceReviewed!==true)errors.push('provenance_review_required');
 if(!HEX.test(entry.sha256||''))errors.push('sha256_required');
 if(!['train','validation','test'].includes(entry.split))errors.push('invalid_split');
 if(!validId(entry.subjectGroupId))errors.push('subject_group_required');
 return {ok:errors.length===0,errors};
}
function auditDatasetRegistry(entries){
 if(!Array.isArray(entries))throw new TypeError('registry array required');
 const errors=[],recordings=new Set(),subjects=new Map();
 for(const [i,entry] of entries.entries()){
  const result=validateDatasetEntry(entry);
  for(const error of result.errors)errors.push({index:i,error});
  if(!entry||typeof entry!=='object')continue;
  if(validId(entry.recordingId)){
   if(recordings.has(entry.recordingId))errors.push({index:i,error:'duplicate_recording'});
   recordings.add(entry.recordingId);
  }
  if(validId(entry.subjectGroupId)&&['train','validation','test'].includes(entry.split)){
   const old=subjects.get(entry.subjectGroupId);
   if(old&&old!==entry.split)errors.push({index:i,error:'subject_split_leakage'});
   subjects.set(entry.subjectGroupId,entry.split);
  }
 }
 return {ok:errors.length===0,errors};
}
module.exports={validateDatasetEntry,auditDatasetRegistry};
