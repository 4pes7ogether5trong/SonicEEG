'use strict';
// Evaluation grouping only; age does not establish an EEG interpretation.
const GROUPS=Object.freeze(['neonatal','<1','1-2','3-6','7-13','14-18','19-30','31-60','61+']);
function classifyAge({completedYears=null,ageDays=null,neonatal=false,gestationalWeeks=null,postmenstrualWeeks=null}={}){
  if(typeof neonatal!=='boolean')throw new TypeError('neonatal must be boolean');
  for(const [name,v] of Object.entries({completedYears,ageDays,gestationalWeeks,postmenstrualWeeks}))
    if(v!==null&&(!Number.isFinite(v)||v<0||(name==='completedYears'&&!Number.isInteger(v))))throw new RangeError('invalid '+name);
  if(completedYears!==null&&ageDays!==null)throw new RangeError('supply completed years or age days, not both');
  if(!neonatal&&completedYears===null&&ageDays!==null&&ageDays>=365)throw new RangeError('completed years required near or after first birthday');
  if(neonatal)return {group:'neonatal',gestationalWeeks,postmenstrualWeeks,uncertainty:postmenstrualWeeks===null?'postmenstrual age unknown':null,adultAcnsAutomatic:false};
  if(completedYears===null&&ageDays===null)return {group:'unknown',uncertainty:'age unknown',adultAcnsAutomatic:false};
  const y=completedYears??0;
  const group=y===0?'<1':y<=2?'1-2':y<=6?'3-6':y<=13?'7-13':y<=18?'14-18':y<=30?'19-30':y<=60?'31-60':'61+';
  return {group,uncertainty:null,adultAcnsAutomatic:false};
}
module.exports={GROUPS,classifyAge};
