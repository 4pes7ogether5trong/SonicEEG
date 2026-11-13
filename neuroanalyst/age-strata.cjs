'use strict';
const DAY_MS=86400000;
function utcDate(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('ISO date required');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)throw Error('invalid calendar date');return d;}
function completedYears(b,r){let n=r.getUTCFullYear()-b.getUTCFullYear();if(r<new Date(Date.UTC(r.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate())))n--;return n;}
function classifyAge({birthDate,recordDate,neonatalStatus='unknown',gestationalAgeWeeks=null,postmenstrualAgeWeeks=null}={}){
if(!['yes','no','unknown'].includes(neonatalStatus))throw Error('invalid neonatal status');
for(const [k,v] of Object.entries({gestationalAgeWeeks,postmenstrualAgeWeeks}))if(v!==null&&(!Number.isFinite(v)||v<0||v>60))throw Error('invalid '+k);
if(neonatalStatus==='yes')return {group:'neonatal',gestationalAgeWeeks,postmenstrualAgeWeeks,uncertainty:postmenstrualAgeWeeks===null?'postmenstrual_age_unknown':null};
if(!birthDate||!recordDate)return {group:'unknown',uncertainty:'age_unavailable'};
const b=utcDate(birthDate),r=utcDate(recordDate),days=Math.round((r-b)/DAY_MS);if(days<0)throw Error('record predates birth');
const years=completedYears(b,r);
if(years<1)return neonatalStatus==='unknown'?{group:'unknown',days,uncertainty:'neonatal_status_unknown'}:{group:'<1',days,uncertainty:null};
if(years<=2)return {group:'1-2',years,uncertainty:null};
if(years<=6)return {group:'3-6',years,uncertainty:null};
if(years<=13)return {group:'7-13',years,uncertainty:null};
if(years<=18)return {group:'14-18',years,uncertainty:null};
if(years<=30)return {group:'19-30',years,uncertainty:null};
if(years<=60)return {group:'31-60',years,uncertainty:null};
return {group:'61+',years,uncertainty:null};
}
module.exports={classifyAge};
