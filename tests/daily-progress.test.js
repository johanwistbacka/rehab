import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,defaults,plan,dailyExerciseProgress} from '../dist/model.js';
const today='2026-11-23';
function active(index,phase='ready',settings=defaults){return {steps:plan(settings),index,phase,started:today+'T12:00:00',settings}}
const count=(state=fresh(),options={})=>dailyExerciseProgress(state,{today,...options});
test('starts at eight, counts an exercise only after its last set and side',()=>{
  assert.equal(count().remaining,8);
  const steps=plan(defaults);
  steps.forEach((step,index)=>{
    const last=steps.findLastIndex(s=>s.ei===step.ei)===index;
    const ready=count(fresh(),{active:active(index)}),done=count(fresh(),{active:active(index,'done')});
    assert.equal(ready.remaining,8-step.ei);
    assert.equal(done.remaining,8-step.ei-(last?1:0));
  });
});
test('all configured rounds and both sides must finish',()=>{
  const settings={...defaults,rounds:2,both:true};const steps=plan(settings);
  const indices=steps.map((s,i)=>s.ei===1?i:-1).filter(i=>i>=0);
  assert.equal(indices.length,4);
  indices.forEach((index,i)=>assert.equal(count(fresh(),{active:active(index,'done',settings)}).remaining,i===3?6:7));
});
test('saved daily work persists independently of pass cancellation and is never counted twice',()=>{
  const state={...fresh(),dailyExercises:{day:today,done:[0,1,1,-1,8,'2']}};
  assert.deepEqual(count(state).done,[0,1]);
  assert.equal(count(state,{active:active(4,'done')}).remaining,6);
  assert.equal(count(state,{active:active(0)}).remaining,6);
});
test('new day ignores yesterday\'s ledger, history, questionnaire and old draft',()=>{
  const state={...fresh(),dailyExercises:{day:'2026-11-22',done:[0,1,2]},history:[{day:'2026-11-22'}]};
  const old=active(10,'done');old.started='2026-11-22T12:00:00';
  assert.equal(count(state,{active:old,completed:{day:'2026-11-22'}}).remaining,8);
});
test('today\'s completed pass gives zero even before the questionnaire is saved',()=>{
  assert.equal(count({...fresh(),history:[{day:today}]}).remaining,0);
  assert.equal(count(fresh(),{completed:{day:today}}).remaining,0);
});

test('daily count tracks exercise identity when the pass order changes',()=>{
  const settings={...defaults,order:[7,6,5,4,3,2,1,0]};
  const progress=count(fresh(),{active:active(2,'done',settings)});
  assert.deepEqual(progress.done,[7]);assert.equal(progress.remaining,7);
});
