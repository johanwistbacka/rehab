import {test} from 'node:test';import assert from 'node:assert/strict';import {defaults,plan,proposal,eligible,signature,fresh,validSettings,dayKey} from '../dist/model.js';
test('default plan contains all prescribed exercises, three strength sets and both calf sides',()=>{const p=plan(defaults);assert.equal(new Set(p.map(x=>x.ei)).size,8);assert.equal(p.filter(x=>x.kind==='heel').length,3);assert.equal(p.filter(x=>x.kind==='squat').length,3);assert.deepEqual(p.filter(x=>x.ei===1).map(x=>x.side),['Vänster','Höger']);assert.equal(p.filter(x=>x.kind==='stretch').length,10);assert.ok(p.filter(x=>x.kind==='stretch').every(x=>x.seconds===45))});
test('second rounds apply only where prescribed',()=>{const p=plan({...defaults,rounds:2,both:false});assert.equal(p.filter(x=>x.ei===1).length,4);assert.equal(p.filter(x=>x.ei===3).length,1);assert.equal(p.filter(x=>x.ei===6).length,1)});
test('progression changes one dimension and never exceeds prescribed ranges',()=>{let s={...defaults};let count=0;while(proposal(s)){const p=proposal(s);s[p.key]=p.value;count++;assert.ok(s.stretch<=60&&s.reps<=15&&s.lower<=5);assert.ok(count<20)}assert.equal(count,10);assert.equal(s.rounds,1)});
test('three separate completed and followed-up days required, no automatic daily increase',()=>{const s=fresh();for(let i=1;i<=3;i++)s.history.push({at:`2026-10-0${i}T12:00:00Z`,day:`2026-10-0${i}`,signature:signature(s.settings),feel:'good',next:'good'});assert.equal(eligible(s,'2026-10-04'),true);s.history[2].next=null;assert.equal(eligible(s,'2026-10-04'),false);s.history[2].next='good';s.history[2].day='2026-10-02';assert.equal(eligible(s,'2026-10-04'),false);s.history[2].day='2026-10-03';s.progressAfter='2026-10-03T13:00:00Z';assert.equal(eligible(s,'2026-10-04'),false)});
test('settings bounds and local calendar date',()=>{assert.equal(validSettings({stretch:1,reps:90,lower:20}).stretch,45);assert.equal(validSettings({reps:90}).reps,15);assert.equal(dayKey(new Date(2026,10,4,23,55)),'2026-11-04')});

test('custom order includes every exercise with unchanged sets, sides and dose',()=>{
  const order=[7,5,3,1,0,2,4,6],settings={...defaults,order};
  const custom=plan(settings),original=plan(defaults);
  assert.deepEqual([...new Set(custom.map(s=>s.ei))],order);
  for(let ei=0;ei<8;ei++)assert.deepEqual(custom.filter(s=>s.ei===ei),original.filter(s=>s.ei===ei));
});
test('missing or malformed order falls back to the full original program',()=>{
  for(const order of [undefined,null,[],[0,0,2,3,4,5,6,7],[7,6,5,4,3,2,1,9],['0',1,2,3,4,5,6,7]]){
    assert.deepEqual([...new Set(plan({...defaults,order}).map(s=>s.ei))],[0,1,2,3,4,5,6,7]);
  }
});

test('selected exercise plans keep all prescribed sets and sides in configured order',()=>{
  const settings={...defaults,rounds:2,order:[7,6,5,4,3,2,1,0]};
  const full=plan(settings),selected=plan(settings,[1,7]);
  assert.deepEqual(selected,full.filter(s=>[1,7].includes(s.ei)));
  assert.equal(selected.filter(s=>s.ei===1).length,4);assert.equal(selected.filter(s=>s.ei===7).length,3);
  assert.deepEqual(plan(settings,[]),[]);
  for(const selection of [[8],[1,1],['1'],'1'])assert.throws(()=>plan(settings,selection));
});
