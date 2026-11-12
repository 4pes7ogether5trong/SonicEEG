'use strict';
const {occupancy,sporadicRate}=require('./pattern-prevalence.cjs');
const MODES=new Set(['complete','observed-estimate','unquantified-example']);
function reviewedPopulation(population,reviewedEpochs){
 if(!population||typeof population!=='object'||!Array.isArray(reviewedEpochs))throw Error('population and reviewed epochs required');
 const {id,kind,localization,state,representativeTrace,confirmation,coverage,runs=[],dischargeTimes=[]}=population;
 if(typeof id!=='string'||!id.trim()||typeof localization!=='string'||!localization.trim()||typeof state!=='string'||!state.trim())throw Error('population identity/localization/state required');
 if(!representativeTrace||typeof representativeTrace.evidenceId!=='string'||!representativeTrace.evidenceId.trim()||!Number.isFinite(representativeTrace.start)||!Number.isFinite(representativeTrace.end)||representativeTrace.start>=representativeTrace.end)throw Error('representative trace reference required');
 if(!MODES.has(coverage))throw Error('coverage declaration required');
 if(!['rhythmic-periodic','sporadic-epileptiform'].includes(kind))throw Error('unsupported population kind');
 if(confirmation!=='reviewer-confirmed')throw Error('unconfirmed detector candidates cannot establish clinical prevalence');
 const result=kind==='rhythmic-periodic'?occupancy({usableReviewed:reviewedEpochs,runs,coverage}):sporadicRate({usableReviewed:reviewedEpochs,dischargeTimes,coverage});
 return {id,kind,localization,state,representativeTrace,confirmation,...result};
}
function comparePrevalence(model,reference){
 if(!model||!reference||model.kind!=='rhythmic-periodic'||reference.kind!=='rhythmic-periodic')throw Error('rhythmic-periodic pair required');
 if(model.id!==reference.id)throw Error('population mismatch');
 if(model.percent===null||reference.percent===null||!Number.isFinite(model.percent)||!Number.isFinite(reference.percent))return {comparable:false,reason:'unquantified'};
 return {comparable:true,absolutePercentagePointError:Math.abs(model.percent-reference.percent),categoryAgreement:model.category===reference.category,modelCategory:model.category,referenceCategory:reference.category};
}
module.exports={reviewedPopulation,comparePrevalence};
