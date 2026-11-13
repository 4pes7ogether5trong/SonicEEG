'use strict';
const assert=require('node:assert/strict'),{evaluate}=require('./boundary-evaluator.cjs');
const r=(a,b,id='r')=>({id,onset:a,offset:b});let n=0;function t(name,fn){fn();n++;console.log('PASS',name)}
t('published PN13-2 label remains independent',()=>{const x=evaluate([r(7249,7314)],[r(7249,7316,'reviewer')]);assert.equal(x.offsetAgreed,1);assert.equal(x.matched[0].offsetDelta,2)});
t('inclusive ±3',()=>{assert.equal(evaluate([r(10,20)],[r(10,23,'p')]).offsetAgreed,1);assert.equal(evaluate([r(10,20)],[r(10,17,'p')]).offsetAgreed,1)});
t('outside tolerance',()=>assert.equal(evaluate([r(10,20)],[r(10,23.01,'p')]).offsetAgreed,0));
t('maximum matching',()=>assert.equal(evaluate([r(0,10,'a'),r(9,19,'b')],[r(8,12,'x'),r(1,8,'y')]).matchedCount,2));
t('minimum total error',()=>assert.equal(evaluate([r(0,10,'a'),r(2,12,'b')],[r(2,12,'x'),r(0,10,'y')]).matched.find(x=>x.referenceId==='a').predictionId,'y'));
t('misses',()=>assert.equal(evaluate([r(1,2)],[]).missedCount,1));
t('false alarms',()=>assert.equal(evaluate([],[r(1,2,'p')]).unmatchedPredictionCount,1));
t('artifact abstention',()=>assert.equal(evaluate([r(10,20)],[r(10,21,'p')],{artifact:[[19,22]]}).offsetScoredDenominator,0));
t('onset denominator',()=>assert.equal(evaluate([r(10,20)],[r(11,20,'p')],{uncertain:[[10,11]]}).onsetScoredDenominator,0));
t('premature closure',()=>assert.equal(evaluate([r(10,30)],[r(10,25,'p')]).prematureClosureCount,1));
t('duplicate IDs',()=>assert.throws(()=>evaluate([],[r(1,2,'x'),r(3,4,'x')])));
t('invalid intervals',()=>assert.throws(()=>evaluate([],[],{artifact:[[3,2]]})));
t('no denominator',()=>assert.equal(evaluate([],[]).offsetAgreementRate,null));
console.log(n+' tests passed');
