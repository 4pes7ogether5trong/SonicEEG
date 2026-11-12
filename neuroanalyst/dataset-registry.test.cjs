'use strict';
const assert=require('node:assert/strict');
const {validateDatasetEntry,auditDatasetRegistry}=require('./dataset-registry.cjs');
const good=()=>({datasetId:'synthetic',recordingId:'r1',subjectGroupId:'p1',sourceUrl:'https://example.org/data',licenseId:'TEST-ONLY',licenseEvidenceUrl:'https://example.org/license',allowedUse:'research_training_and_evaluation',redistributionAllowed:false,deidentificationAttested:true,provenanceReviewed:true,sha256:'a'.repeat(64),split:'train'});
const tests=[
()=>assert.equal(validateDatasetEntry(good()).ok,true),
()=>assert(validateDatasetEntry({...good(),licenseId:''}).errors.includes('license_required')),
()=>assert(validateDatasetEntry({...good(),allowedUse:'unknown'}).errors.includes('explicit_use_authorization_required')),
()=>assert(validateDatasetEntry({...good(),deidentificationAttested:false}).errors.includes('deidentification_attestation_required')),
()=>assert(validateDatasetEntry({...good(),sha256:'bad'}).errors.includes('sha256_required')),
()=>assert(validateDatasetEntry({...good(),redistributionAllowed:undefined}).errors.includes('redistribution_status_required')),
()=>assert(validateDatasetEntry({...good(),sourceUrl:'http://example.org'}).errors.includes('source_https_required')),
()=>assert(auditDatasetRegistry([good(),{...good(),recordingId:'r2',split:'test'}]).errors.some(x=>x.error==='subject_split_leakage')),
()=>assert(auditDatasetRegistry([good(),good()]).errors.some(x=>x.error==='duplicate_recording')),
()=>assert.equal(auditDatasetRegistry([good(),{...good(),recordingId:'r2',subjectGroupId:'p2',split:'test'}]).ok,true)
];
for(const [i,t] of tests.entries()){t();console.log('ok',i+1)}
console.log('PASS',tests.length);
