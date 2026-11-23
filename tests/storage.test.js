import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults, fresh, plan} from '../dist/model.js';
import {parseBackup, mergeHistory, restoreDraft, estimatedSeconds, formatDuration} from '../dist/storage.js';

const record = (overrides={}) => ({id:'pass-1',at:'2026-11-01T12:00:00.000Z',day:'2026-11-01',settings:{...defaults},feel:'good',next:null,...overrides});
const backup = records => JSON.stringify({...fresh(),history:records});
const draft = (phase='down', overrides={}) => JSON.stringify({version:1,session:{settings:{...defaults},index:0,rep:4,phase,started:'2026-11-04T12:00:00Z'},remaining:1750,duration:3,elapsedMs:60000,...overrides});

test('old exports import without inventing a measured duration',()=>{
  const parsed=parseBackup(backup([record()]));
  assert.equal(parsed.history.length,1);
  assert.equal(parsed.history[0].durationMs,undefined);
  assert.equal(parseBackup(backup([record({durationMs:82000})])).history[0].durationMs,82000);
});
test('invalid backups, settings, dates and measurements are rejected',()=>{
  for(const value of ['{oops','null',JSON.stringify({...fresh(),version:2}),backup([record({day:'2026-02-30'})]),backup([record({feel:'unknown'})]),backup([record({settings:{...defaults,reps:99}})]),backup([record({durationMs:-1})]),backup([record({settings:null})])])assert.throws(()=>parseBackup(value));
});
test('merge is repeatable, fills missing follow-ups and preserves existing answers',()=>{
  const existing=[record()],incoming=[record({next:'good',durationMs:100000}),record({id:'second',day:'2026-11-02',at:'2026-11-02T12:00:00Z'})];
  const merged=mergeHistory(existing,incoming);
  assert.equal(merged.added,1);assert.equal(merged.duplicates,1);assert.equal(merged.updated,1);
  assert.equal(existing[0].next,null);
  assert.equal(merged.history[0].durationMs,100000);
  const again=mergeHistory(merged.history,incoming);
  assert.equal(again.added,0);assert.equal(again.updated,0);assert.equal(again.history.length,2);
  assert.equal(mergeHistory([record({next:'pain'})],[record({next:'good'})]).history[0].next,'pain');
  assert.equal(mergeHistory([record()],[record({id:'another-id'})]).added,0);
});
test('draft derives the prescribed plan and restores the exact phase, repetition and remaining time',()=>{
  const saved=restoreDraft(draft());
  assert.deepEqual(saved.session.steps,plan(defaults));assert.equal(saved.session.rep,4);assert.equal(saved.session.phase,'down');
  assert.equal(saved.remaining,1750);assert.equal(saved.elapsedMs,60000);
  assert.throws(()=>restoreDraft(draft('down',{remaining:4000})));
  assert.throws(()=>restoreDraft(draft('hold')));
  assert.throws(()=>restoreDraft(draft('down',{elapsedMs:-1})));
});
test('completed questionnaire survives separately from an active session',()=>{
  const completed=record({durationMs:123000});delete completed.feel;
  const restored=restoreDraft(JSON.stringify({version:1,completed}));
  assert.equal(restored.completed.id,completed.id);assert.equal(restored.completed.durationMs,123000);
});
test('duration estimate includes exactly the configured rests, and labels measured time',()=>{
  assert.equal(estimatedSeconds(defaults),790);
  assert.equal(estimatedSeconds({...defaults,rest:0}),670);
  assert.equal(estimatedSeconds({...defaults,rounds:2})-estimatedSeconds({...defaults,rounds:2,rest:0}),210);
  assert.equal(formatDuration(0),'0 s');assert.equal(formatDuration(124999),'2 min 4 s');
});

test('transition drafts preserve their destination and reject invalid timers or exercise phases',()=>{
  const transition=(index,nextPhase,overrides={})=>draft('transition',{session:{settings:{...defaults},index,rep:1,phase:'transition',nextPhase,started:'2026-11-04T12:00:00Z'},duration:1,remaining:650,...overrides});
  for(const [index,nextPhase] of [[0,'up'],[0,'down'],[3,'hold'],[13,'manual']]){
    const restored=restoreDraft(transition(index,nextPhase));
    assert.equal(restored.session.nextPhase,nextPhase);assert.equal(restored.remaining,650);
  }
  assert.throws(()=>restoreDraft(transition(0,'hold')));
  assert.throws(()=>restoreDraft(transition(3,'up')));
  assert.throws(()=>restoreDraft(transition(13,'hold')));
  assert.throws(()=>restoreDraft(transition(0,undefined)));
  assert.throws(()=>restoreDraft(transition(0,'up',{duration:2})));
  assert.throws(()=>restoreDraft(transition(0,'up',{remaining:1001})));
});

test('legacy backups and drafts without order retain the original program',()=>{
  const settings={...defaults};delete settings.order;
  const restored=restoreDraft(draft('down',{session:{settings,index:0,rep:1,phase:'down',started:'2026-11-04T12:00:00Z'}}));
  assert.deepEqual(restored.session.steps,plan(defaults));
  const parsed=parseBackup(JSON.stringify({version:1,settings,history:[record({settings})]}));
  assert.deepEqual(parsed.settings.order,[0,1,2,3,4,5,6,7]);
});
test('custom-order draft preserves exact exercise position and set rest, rejecting corrupt order',()=>{
  const settings={...defaults,order:[7,6,5,4,3,2,1,0],rest:60};
  const raw={version:1,session:{settings,index:1,rep:1,phase:'rest',started:'2026-11-04T12:00:00Z'},duration:60,remaining:42000,elapsedMs:123000};
  const restored=restoreDraft(JSON.stringify(raw));assert.equal(restored.session.steps[1].ei,7);assert.equal(restored.remaining,42000);
  raw.session.settings.order=[0,0,2,3,4,5,6,7];assert.throws(()=>restoreDraft(JSON.stringify(raw)));
});
