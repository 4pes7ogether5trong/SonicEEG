'use strict';
const {compareCohorts}=require('./evaluation-cohort.cjs');
const {evaluateOccupancyPair}=require('./prevalence-evaluation.cjs');
function guardedOccupancyEvaluation(model,reference,modelCohort,referenceCohort){
 if(!modelCohort||!referenceCohort)return {comparable:false,reasons:['missing_cohort_metadata']};
 const cohort=compareCohorts(modelCohort,referenceCohort);
 if(!cohort.comparable)return {comparable:false,reasons:cohort.reasons,cohort};
 const actual=cohort.reviewedSecondsA;
 if(![model.usableSeconds,reference.usableSeconds].every(n=>Number.isFinite(n)&&Math.abs(n-actual)<1e-6))
  return {comparable:false,reasons:['occupancy_denominator_mask_mismatch'],cohort};
 const result=evaluateOccupancyPair(model,reference);
 return {...result,reasons:result.comparable?[]:[result.reason],cohort};
}
module.exports={guardedOccupancyEvaluation};
