import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {defaults,plan} from '../dist/model.js';

// Exercise the app's timer functions with a controlled clock, without real waits.
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const timerCode=source.slice(source.indexOf('function begin('),source.indexOf("document.addEventListener('visibilitychange'"));
function boot(index=0){
  let now=0;
  const session={settings:{...defaults},steps:plan(defaults),index,rep:1,phase:'ready'};
  const ctx=vm.createContext({session,remaining:0,duration:0,deadline:0,running:false,lastSecond:-1,timer:null,passPaused:false,soundAction:0,audioPreparing:false,
    performance:{now:()=>now},setInterval:()=>1,clearInterval(){},startClock(){},stopClock(){},cancelSoundTest(){},release(){},
    persistDraft(){},rememberCompletedExercises(){},renderSession(){},beep(){},step:()=>session.steps[session.index],
    $:()=>({style:{setProperty(){}},textContent:''}),window:{scrollTo(){}},
  });
  vm.runInContext(timerCode,ctx);
  return {ctx,advance(ms){now+=ms;ctx.tick()}};
}
test('heel raises get a full preparation second before each movement without shortening prescribed times',()=>{
  const {ctx:c,advance}=boot();c.begin('up',1);
  for(let rep=1;rep<=defaults.reps;rep++){
    assert.equal(c.session.rep,rep);assert.equal(c.session.phase,'transition');assert.equal(c.session.nextPhase,'up');
    advance(999);assert.equal(c.session.phase,'transition');advance(1);assert.equal(c.session.phase,'up');assert.equal(c.duration,1);
    advance(1000);assert.equal(c.session.phase,'transition');assert.equal(c.session.nextPhase,'down');
    advance(1000);assert.equal(c.session.phase,'down');assert.equal(c.duration,defaults.lower);
    advance(defaults.lower*1000);
  }
  assert.equal(c.session.phase,'rest');assert.equal(c.session.index,1);assert.equal(c.duration,defaults.rest);
  advance(defaults.rest*1000);assert.equal(c.session.phase,'transition');assert.equal(c.session.nextPhase,'up');
});
test('all six stretch exercises prepare for one second and retain their complete hold time',()=>{
  const steps=plan(defaults);
  for(let ei=1;ei<=6;ei++){
    const {ctx:c,advance}=boot(steps.findLastIndex(s=>s.ei===ei));c.begin('hold',defaults.stretch);
    advance(999);assert.equal(c.session.phase,'transition');advance(1);assert.equal(c.session.phase,'hold');
    advance(defaults.stretch*1000-1);assert.equal(c.session.phase,'hold');advance(1);assert.equal(c.session.phase,'done');
  }
});
test('a preparation pause resumes its remaining fraction instead of skipping or restarting it',()=>{
  const {ctx:c,advance}=boot();c.begin('down',defaults.lower);advance(400);c.pause();
  assert.equal(c.remaining,600);advance(20000);assert.equal(c.session.phase,'transition');
  c.resume();advance(599);assert.equal(c.session.phase,'transition');advance(1);
  assert.equal(c.session.phase,'down');assert.equal(c.remaining,defaults.lower*1000);
});
test('squat preparation returns to manual pace and never advances a repetition on a timer',()=>{
  const {ctx:c,advance}=boot(plan(defaults).findIndex(s=>s.kind==='squat'));c.begin('manual');
  advance(1000);assert.equal(c.session.phase,'manual');assert.equal(c.running,false);
  advance(60000);assert.equal(c.session.rep,1);assert.equal(c.session.phase,'manual');
});

test('all squat sets and rests run automatically, then wait for one next-exercise click',()=>{
  const {ctx:c,advance}=boot(plan(defaults).findIndex(s=>s.kind==='squat'));c.begin('squat');
  for(let set=1;set<=3;set++){
    for(let rep=1;rep<=10;rep++){
      assert.equal(c.session.rep,rep);assert.equal(c.session.phase,'transition');
      advance(1000);assert.equal(c.session.phase,'squat');assert.equal(c.duration,10);
      advance(9999);assert.equal(c.session.rep,rep);advance(1);
    }
    if(set<3){assert.equal(c.session.phase,'rest');advance(30000);assert.equal(c.session.phase,'transition')}
  }
  assert.equal(c.session.phase,'done');assert.equal(c.running,false);
});
test('side changes and set changes with zero rest start the next part automatically',()=>{
  const steps=plan(defaults),index=steps.findIndex(s=>s.ei===1),{ctx:c,advance}=boot(index);
  c.begin('hold');advance(1000);advance(45000);
  assert.equal(c.session.index,index+1);assert.equal(c.session.phase,'transition');
  advance(1000);assert.equal(c.session.phase,'hold');advance(45000);assert.equal(c.session.phase,'done');
  const noRest=boot();noRest.ctx.session.settings.rest=0;noRest.ctx.begin('up');
  for(let i=0;i<10;i++){noRest.advance(1000);noRest.advance(1000);noRest.advance(1000);noRest.advance(3000)}
  assert.equal(noRest.ctx.session.index,1);assert.equal(noRest.ctx.session.phase,'transition');
});
