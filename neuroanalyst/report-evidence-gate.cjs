'use strict';
// Research-only report gate; no automatic diagnosis or ACNS grading.
const {occupancy}=require('./reviewed-prevalence.cjs');
function assemblePopulation({populationId,patternId,kind,localization,state,representativeTrace,reviewed,usable,runs,measurement,ageGroup,reviewerConfirmed=false,acnsCategory=null}){
  if(typeof populationId!=='string'||!populationId)throw new TypeError('populationId required');
  if(!['rhythmic_periodic','sporadic_epileptiform','other'].includes(kind))throw new RangeError('invalid kind');
  if(!['complete','observed_estimate','unquantified_example'].includes(measurement))throw new RangeError('measurement required');
  if(!localization||!state||!representativeTrace||typeof representativeTrace.recordingId!=='string'||!Number.isFinite(representativeTrace.elapsedSeconds)||representativeTrace.elapsedSeconds<0)throw new TypeError('localization, state and trace reference required');
  if(acnsCategory!==null&&!reviewerConfirmed)throw new Error('ACNS category requires reviewer confirmation');
  if(ageGroup==='neonatal'&&acnsCategory!==null)throw new Error('neonatal ACNS grading requires separate clinical workflow');
  if(kind!=='rhythmic_periodic'&&acnsCategory!==null)throw new Error('ACNS occupancy category only for rhythmic/periodic population');
  if(!Array.isArray(runs))throw new TypeError('runs required');
  const base={populationId,patternId,kind,localization,state,representativeTrace,measurement,ageGroup:ageGroup??'unknown',reviewerConfirmed,acnsCategory,runEvidence:runs.map(r=>({patternId:r.patternId,start:r.start,end:r.end,evidenceId:r.evidenceId??null}))};
  if(kind!=='rhythmic_periodic')return {...base,occupancy:null,reviewRequired:true,note:'Sporadic discharge rate requires confirmed discharges and a separately defined observation denominator.'};
  const result=occupancy({reviewed,usable,patterns:runs,patternId,measurement,ageGroup,clinicalConfirmation:reviewerConfirmed});
  return {...base,occupancy:{usableReviewedSeconds:result.usableReviewedSeconds,occupiedSeconds:result.occupiedSeconds,percent:result.occupancyPercent,observedIntervals:result.intervals},reviewRequired:!reviewerConfirmed||!acnsCategory};
}
module.exports={assemblePopulation};
