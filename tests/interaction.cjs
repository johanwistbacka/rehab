// Optional DOM tests: use a local jsdom installation or REHAB_JSDOM_PATH.
const {JSDOM}=require(process.env.REHAB_JSDOM_PATH||'jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=__dirname+'/../dist/';
function boot({history,draft,failWrites=false,AudioContext,badge}={}){
  const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{url:'https://example.com/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  let clock=0,intervals=new Map(),id=0,hidden=false;
  w.scrollTo=()=>{};w.setInterval=fn=>{intervals.set(++id,fn);return id};w.clearInterval=id=>intervals.delete(id);
  Object.defineProperty(w.performance,'now',{value:()=>clock});
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  if(AudioContext)w.AudioContext=AudioContext;
  if(badge){
    Object.defineProperty(w.navigator,'standalone',{value:true});
    w.navigator.setAppBadge=async n=>badge.calls.push(n);w.navigator.clearAppBadge=async()=>badge.calls.push(0);
    w.Notification=badge.notification;
    if(badge.enabled)w.localStorage.setItem('rehab-johan-v1-icon-badge','true');
  }
  // jsdom has no native dialog API; browser QA covers the modal itself.
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};
  if(history)w.localStorage.setItem('rehab-johan-v1',history);
  if(draft)w.localStorage.setItem('rehab-johan-v1-pass',draft);
  const originalSet=w.Storage.prototype.setItem;
  w.Storage.prototype.setItem=function(...args){if(failWrites)throw Error('Storage full');return originalSet.apply(this,args)};
  const source=['model.js','storage.js','sound.js','badge.js','poses.js','app.js'].map(name=>fs.readFileSync(root+name,'utf8').replace(/^import .*\n/gm,'').replaceAll('export ', '')).join('\n');
  w.eval(source+'\nglobalThis.hooks={get state(){return state},get session(){return session},get completed(){return completed},get running(){return running},get remaining(){return remaining},render,passTime,eligible};');
  return {w,d:w.document,h:w.hooks,click(id){const el=w.document.getElementById(id);assert.ok(el,'missing control '+id);el.click()},
    advance(ms){clock+=ms;[...intervals.values()].forEach(fn=>fn())},
    hidden(value){hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'))},
    fail(value){failWrites=value},draft(){return w.localStorage.getItem('rehab-johan-v1-pass')},close(){dom.window.close()}};
}
function finish(b){let guards=0;while(b.h.session){assert.ok(++guards<2000);const s=b.h.session;if(b.d.querySelector('#resume-pass'))b.click('resume-pass');else if(s.phase==='ready')b.click('go');else if(s.phase==='done')b.click('next');else if(s.phase==='manual')b.click('rep');else b.advance(61000)}}
async function importFile(b,data){b.h.render('progress');const input=b.d.querySelector('#import-file');Object.defineProperty(input,'files',{value:[{size:data.length,text:async()=>data}],configurable:true});await input.onchange()}
function soundFixture(deferred=false){
  const contexts=[],waiting=[];let hold=deferred;
  class AudioContext{
    constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.nodes=[];contexts.push(this)}
    resume(){return new Promise(resolve=>{const ready=()=>{this.state='running';this.onstatechange?.();resolve()};if(hold)waiting.push(ready);else ready()})}
    async close(){this.state='closed';this.closed=true}
    createOscillator(){const node={frequency:{setValueAtTime(value){node.hz=value}},connect(target){node.gain=target},disconnect(){node.disconnected=true},start(time){node.started=time},stop(time){node.stoppedAt=time;node.stopped=true}};this.nodes.push(node);return node}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
  }
  return {AudioContext,contexts,release(){hold=false;waiting.splice(0).forEach(fn=>fn())}};
}
async function main(){
  const {fresh}=await import('../dist/model.js');
  {
    const b=boot();b.click('start');b.click('go');let guard=0;
    while(b.h.session.phase!=='done'){
      assert.ok(++guard<180);assert.equal(b.d.querySelector('#go'),null);assert.equal(b.d.querySelector('#next'),null);assert.equal(b.d.querySelector('#rep'),null);b.advance(61000);
    }
    assert.equal(b.h.session.index,2);assert.equal(b.h.running,false);assert.equal(b.d.querySelector('#next').textContent,'Starta nästa övning');
    b.click('next');assert.equal(b.h.session.steps[b.h.session.index].ei,1);assert.equal(b.h.session.phase,'transition');assert.equal(b.h.running,true);assert.equal(b.d.querySelector('#go'),null);
    guard=0;while(b.h.session.phase!=='done'){assert.ok(++guard<10);assert.equal(b.d.querySelector('#next'),null);assert.equal(b.d.querySelector('#go'),null);b.advance(61000)}
    assert.equal(b.h.session.steps[b.h.session.index].side,'Höger');assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('6 av 8'));b.close();
    console.log('PASS: all sets and side changes run without clicks, and one next-exercise click both changes and starts');
  }
  {
    const state=fresh();state.settings.rounds=2;state.settings.rest=15;
    const b=boot({history:JSON.stringify(state)});b.d.querySelector('[data-start-exercise="1"]').click();b.click('go');let guard=0;const positions=new Set();let paused=false;
    while(b.h.session.phase!=='done'){
      assert.ok(++guard<30);positions.add(b.h.session.index);assert.equal(b.d.querySelector('#go'),null);assert.equal(b.d.querySelector('#next'),null);
      if(b.h.session.phase==='rest'&&!paused){
        paused=true;b.advance(5000);b.click('pause');const raw=b.draft(),time=b.h.passTime();b.advance(60000);assert.equal(b.h.passTime(),time);assert.equal(b.h.session.phase,'rest');
        const restored=boot({history:b.w.localStorage.getItem('rehab-johan-v1'),draft:raw});restored.click('resume-saved');restored.click('resume-pass');restored.advance(10000);
        assert.equal(restored.h.session.phase,'transition');assert.equal(restored.d.querySelector('#go'),null);restored.close();b.click('resume-pass');
      }
      b.advance(61000);
    }
    assert.deepEqual([...positions],[0,1,2,3]);assert.equal(paused,true);assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('7 av 8'));b.close();
    console.log('PASS: two rounds on both sides and set rest run automatically; pause and draft recovery never bypass the remaining rest');
  }
  {
    const state=fresh();state.settings.squatSeconds=0;const b=boot({history:JSON.stringify(state)});
    b.d.querySelector('[data-start-exercise="7"]').click();b.click('go');assert.equal(b.h.session.settings.squatSeconds,10);assert.equal(b.h.session.nextPhase,'squat');
    let guard=0;while(b.h.session.phase!=='done'){assert.ok(++guard<100);assert.equal(b.d.querySelector('#rep'),null);assert.equal(b.d.querySelector('#go'),null);assert.equal(b.d.querySelector('#next'),null);b.advance(61000)}
    assert.equal(b.h.session.index,2);assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('7 av 8'));b.close();
    console.log('PASS: new squats always use timing and complete all three sets without repetition or set buttons');
  }
  {
    const b=boot();b.click('start');b.click('go');b.advance(1000);assert.equal(b.h.running,true);
    b.click('skip-exercise');assert.equal(b.h.running,true);assert.equal(b.h.session.steps[b.h.session.index].ei,1);assert.equal(b.h.session.phase,'transition');
    assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('8 av 8'));b.advance(1000);assert.equal(b.h.session.phase,'hold');
    const raw=b.draft();assert.deepEqual(JSON.parse(raw).session.skippedExerciseIds,[0]);
    const restored=boot({draft:raw,history:b.w.localStorage.getItem('rehab-johan-v1')});restored.click('resume-saved');
    assert.ok(restored.d.querySelector('[data-daily-count]').textContent.startsWith('8 av 8'));finish(restored);
    assert.equal(restored.h.completed,null);assert.equal(restored.h.state.history.length,0);assert.ok(restored.d.querySelector('[data-start-exercise="0"]'));
    assert.ok(restored.d.querySelector('[data-daily-count]').textContent.startsWith('1 av 8'));restored.close();b.close();
    console.log('PASS: skip stops the old timer, bypasses all sets, survives reload and leaves the exercise undone without full-pass credit');
  }
  {
    const b=boot();b.d.querySelector('[data-start-exercise="1"]').click();assert.equal(b.h.session.steps.length,2);
    b.click('skip-exercise');assert.equal(b.h.session,null);assert.equal(b.h.completed,null);assert.equal(b.draft(),null);
    assert.ok(b.d.querySelector('[data-start-exercise="1"]'));assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('8 av 8'));b.close();
    console.log('PASS: skipping a single exercise bypasses both sides and returns to the daily list');
  }
  {
    const b=boot();b.click('start');let guard=0;while(b.h.session.phase!=='rest'){
      assert.ok(++guard<100);if(b.h.session.phase==='ready')b.click('go');else b.advance(61000);
    }
    assert.equal(b.h.session.index,1);b.click('skip-exercise');assert.equal(b.h.session.steps[b.h.session.index].ei,1);
    assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('8 av 8'));b.close();
    const last=boot();last.click('start');guard=0;
    while(last.h.session.steps[last.h.session.index].ei!==7){
      assert.ok(++guard<1500);const phase=last.h.session.phase;if(phase==='ready')last.click('go');else if(phase==='done')last.click('next');else last.advance(61000);
    }
    last.click('skip-exercise');assert.equal(last.h.session,null);assert.equal(last.h.completed,null);assert.equal(last.h.state.history.length,0);
    assert.ok(last.d.querySelector('[data-start-exercise="7"]'));assert.ok(last.d.querySelector('[data-daily-count]').textContent.startsWith('1 av 8'));last.close();
    console.log('PASS: skipping after a partial set or at the final exercise preserves correct daily completion');
  }
  {
    const b=boot();b.click('start');b.click('go');b.advance(1000);b.fail(true);b.click('skip-exercise');
    assert.equal(b.h.session.index,0);assert.equal(b.h.running,false);assert.equal(b.h.session.skippedExerciseIds,undefined);
    b.fail(false);b.click('skip-exercise');assert.equal(b.h.session.steps[b.h.session.index].ei,1);b.close();
    console.log('PASS: failed skip persistence keeps the original exercise paused and recoverable');
  }
  {
    const b=boot();b.d.querySelector('[data-start-exercise="2"]').click();b.click('go');b.advance(1000);b.advance(45000);
    assert.equal(b.h.session.phase,'done');b.fail(true);b.click('next');assert.ok(b.h.session);assert.equal(b.h.session.index,0);assert.equal(b.h.session.phase,'done');
    b.fail(false);b.click('next');assert.equal(b.h.session,null);assert.equal(b.d.querySelector('[data-start-exercise="2"]'),null);
    b.fail(true);b.d.querySelector('[data-reopen-exercise="2"]').click();assert.equal(b.d.querySelector('[data-start-exercise="2"]'),null);
    b.fail(false);b.d.querySelector('[data-reopen-exercise="2"]').click();assert.ok(b.d.querySelector('[data-start-exercise="2"]'));b.close();
    console.log('PASS: storage failures retain the recoverable single-exercise draft and never silently reopen a completed exercise');
  }
  {
    const b=boot();b.d.querySelector('[data-start-exercise="0"]').click();
    assert.equal(b.h.session.steps.length,3);assert.ok(b.h.session.steps.every(s=>s.ei===0));
    assert.ok(b.d.querySelector('.eyebrow').textContent.includes('Övning 1 av 1'));finish(b);
    assert.equal(b.h.completed,null);assert.equal(b.h.state.history.length,0);assert.equal(b.draft(),null);
    assert.equal(b.d.querySelector('[data-start-exercise="0"]'),null);assert.ok(b.d.querySelector('[data-reopen-exercise="0"]'));
    assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('7 av 8'));
    const stored=b.w.localStorage.getItem('rehab-johan-v1');const restored=boot({history:stored});
    assert.equal(restored.d.querySelector('[data-start-exercise="0"]'),null);restored.click('start');
    assert.ok(restored.h.session.steps.every(s=>s.ei!==0));assert.equal(new Set(restored.h.session.steps.map(s=>s.ei)).size,7);finish(restored);
    assert.ok(restored.d.querySelector('[data-daily-count]').textContent.startsWith('0 av 8'));assert.ok(restored.d.querySelector('#start').disabled);
    restored.d.querySelector('[data-reopen-exercise="0"]').click();assert.ok(restored.d.querySelector('[data-start-exercise="0"]'));
    assert.ok(restored.d.querySelector('[data-daily-count]').textContent.startsWith('1 av 8'));restored.click('start');assert.ok(restored.h.session.steps.every(s=>s.ei===0));finish(restored);
    assert.ok(restored.d.querySelector('[data-daily-count]').textContent.startsWith('0 av 8'));restored.close();b.close();
    console.log('PASS: single exercise checks off only itself, stays removed after reload, is skipped by remaining sessions and can be added back manually');
  }
  {
    const b=boot();b.d.querySelector('[data-start-exercise="1"]').click();b.click('go');b.advance(1000);b.advance(45000);
    assert.equal(b.h.session.phase,'transition');assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('8 av 8'));
    b.advance(1000);b.advance(12000);b.hidden(true);
    const draft=b.draft(),stored=b.w.localStorage.getItem('rehab-johan-v1'),saved=JSON.parse(draft);
    assert.deepEqual(saved.session.exerciseIds,[1]);assert.equal(saved.remaining,33000);
    const restored=boot({history:stored,draft});assert.ok(restored.d.querySelector('[data-start-exercise="2"]').disabled);
    restored.d.querySelector('[data-start-exercise="2"]').click();assert.equal(restored.h.session,null);
    restored.click('resume-saved');assert.equal(restored.h.session.steps.length,2);assert.equal(restored.h.session.index,1);finish(restored);
    assert.equal(restored.d.querySelector('[data-start-exercise="1"]'),null);assert.ok(restored.d.querySelector('[data-daily-count]').textContent.startsWith('7 av 8'));
    restored.close();b.close();
    console.log('PASS: both sides must finish; partial single-exercise drafts keep their selection, side and exact remaining time');
  }
  {
    const state=fresh(),now=new Date();state.history=[{at:now.toISOString(),day:[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')}];
    const b=boot({history:JSON.stringify(state)});assert.ok(b.d.querySelector('#start').disabled);
    b.d.querySelector('[data-reopen-exercise="2"]').click();assert.equal(b.d.querySelector('#start').disabled,false);
    b.d.querySelector('[data-start-exercise="2"]').click();finish(b);assert.equal(b.h.state.history.length,1);assert.ok(b.d.querySelector('#start').disabled);
    const key=b.w.dayKey;b.w.dayKey=date=>date?key(date):'2099-01-01';b.advance(1000);
    assert.equal(b.d.querySelectorAll('[data-start-exercise]').length,8);b.close();
    console.log('PASS: adding back works after a saved full pass without duplicating history, and all eight return on a new day');
  }
  {
    const setup=fresh();setup.settings.order=[7,0,1,2,3,4,5,6];
    const b=boot({history:JSON.stringify(setup)});b.click('start');b.click('go');
    assert.equal(b.d.querySelector('#rep'),null);assert.equal(b.d.querySelector('#digits').textContent,'10');
    b.advance(1000);assert.equal(b.h.session.phase,'squat');
    b.advance(9999);assert.equal(b.h.session.rep,1);b.advance(1);assert.equal(b.h.session.rep,2);assert.equal(b.h.session.phase,'transition');
    b.advance(1000);b.advance(3500);b.click('pause');const raw=b.draft();assert.equal(JSON.parse(raw).remaining,6500);
    const restored=boot({history:JSON.stringify(setup),draft:raw});restored.click('resume-saved');restored.click('resume-pass');
    restored.advance(6499);assert.equal(restored.h.session.rep,2);restored.advance(1);assert.equal(restored.h.session.rep,3);
    for(let rep=3;rep<=10;rep++){restored.advance(1000);restored.advance(10000)}
    assert.equal(restored.h.session.phase,'rest');assert.equal(restored.h.session.rep,1);assert.equal(restored.h.session.index,1);
    assert.equal(restored.d.querySelector('#next'),null);assert.equal(restored.h.session.settings.rest,30);
    restored.close();b.close();
    const c=boot();c.h.render('settings');assert.equal(c.d.querySelector('[name=squatSeconds]').value,'10');
    c.d.querySelector('[name=squatSeconds]').value='15';c.d.querySelector('#settings-form').dispatchEvent(new c.w.Event('submit',{cancelable:true}));assert.equal(c.h.state.settings.squatSeconds,15);c.close();
    console.log('PASS: timed squats default to ten seconds, advance without clicks, resume exact remaining time, stop after ten repetitions and retain set rest');
  }
  {
    const state=fresh();state.settings.sound=true;
    const fixture=soundFixture(),raw={version:1,session:{settings:state.settings,index:1,rep:1,phase:'rest',started:new Date().toISOString()},remaining:30000,duration:30,elapsedMs:0};
    const b=boot({history:JSON.stringify(state),draft:JSON.stringify(raw),AudioContext:fixture.AudioContext});
    b.click('resume-saved');await b.d.querySelector('#resume-pass').onclick();const audio=fixture.contexts[0];assert.equal(audio.nodes.length,1);assert.equal(audio.nodes[0].hz,340);
    for(let i=0;i<29;i++){b.advance(1000);assert.equal(audio.nodes.at(-1).hz,340)}
    assert.equal(audio.nodes.length,30);b.advance(1000);assert.equal(b.h.session.phase,'transition');assert.equal(audio.nodes.length,32);b.close();
    console.log('PASS: set rest sounds once per second with its own tone, then gives the distinct end signal');
  }
  {
    const b=boot();b.h.render('settings');
    b.d.querySelector('[data-move="0"][data-direction="1"]').click();
    assert.equal(b.d.querySelector('#exercise-order-list li').dataset.orderExercise,'1');
    assert.deepEqual(Array.from(b.h.state.settings.order),[0,1,2,3,4,5,6,7]);
    b.d.querySelector('[data-rest="60"]').click();assert.equal(b.d.querySelector('[name=rest]').value,'60');
    b.d.querySelector('#settings-form').dispatchEvent(new b.w.Event('submit',{cancelable:true}));
    assert.deepEqual(Array.from(b.h.state.settings.order),[1,0,2,3,4,5,6,7]);assert.equal(b.h.state.settings.rest,60);
    b.h.render('home');b.click('start');assert.equal(b.h.session.steps[0].ei,1);assert.ok(b.d.querySelector('.eyebrow').textContent.includes('Övning 1 av 8'));
    const raw=b.draft(),stored=b.w.localStorage.getItem('rehab-johan-v1');
    const updated=JSON.parse(stored);updated.settings.order=[7,6,5,4,3,2,1,0];updated.settings.rest=15;
    const restored=boot({history:JSON.stringify(updated),draft:raw});restored.click('resume-saved');assert.equal(restored.h.session.steps[0].ei,1);assert.equal(restored.h.session.settings.rest,60);
    restored.close();b.close();
    console.log('PASS: order and set rest save for new passes, while a restored pass keeps its snapshot');
  }
  {
    const badge={enabled:true,calls:[],notification:{permission:'granted',async requestPermission(){throw Error('Must not prompt')}}};
    const b=boot({badge});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(badge.calls,[8]);
    b.click('start');finish(b);await new Promise(resolve=>setImmediate(resolve));assert.equal(badge.calls.at(-1),0);
    assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('0 av 8'));
    const original=b.w.dayKey;b.w.dayKey=date=>date?original(date):'2099-01-01';b.advance(1000);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(badge.calls.at(-1),8);b.close();
    console.log('PASS: icon badge follows the daily counter, clears on completion and resets on the next open day without new prompts');
  }
  {
    const badge={calls:[],notification:{permission:'default',requests:0,async requestPermission(){this.requests++;this.permission='granted';return 'granted'}}};
    const b=boot({badge});assert.equal(badge.notification.requests,0);b.h.render('settings');
    assert.equal(b.d.querySelector('#enable-badge').disabled,false);
    const activation=b.d.querySelector('#enable-badge').onclick();assert.equal(badge.notification.requests,1);await activation;
    assert.deepEqual(badge.calls,[8]);assert.equal(b.d.querySelector('#enable-badge').disabled,true);
    await b.d.querySelector('#disable-badge').onclick();assert.deepEqual(badge.calls,[8,0]);assert.equal(b.w.localStorage.getItem('rehab-johan-v1-icon-badge'),'false');b.close();
    const plain=boot();plain.h.render('settings');assert.equal(plain.d.querySelector('#enable-badge').disabled,true);assert.ok(plain.d.querySelector('#badge-status').textContent.includes('hemskärmen'));plain.close();
    console.log('PASS: icon badge settings opt in only on click, sync daily count, disable and explain installation');
  }
  {
    const state=fresh(),today=new Date(),key=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    state.history=[{at:today.toISOString(),day:key}];
    const b=boot({history:JSON.stringify(state)});assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('0 av 8'));assert.ok(b.d.querySelector('#start').disabled);
    const original=b.w.dayKey;b.w.dayKey=date=>date?original(date):'2099-01-01';b.advance(1000);
    assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('8 av 8'));assert.equal(b.d.querySelector('#start').disabled,false);b.close();
    console.log('PASS: open home resets the counter and re-enables today’s pass when the local day changes');
  }
  {
    const b=boot();assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('8 av 8'));
    b.click('start');let guard=0;
    while(!b.d.querySelector('[data-daily-count]').textContent.startsWith('7 av 8')){
      assert.ok(++guard<150);
      const phase=b.h.session.phase;
      if(phase==='ready')b.click('go');else if(phase==='done')b.click('next');else b.advance(61000);
    }
    assert.equal(b.h.session.index,2);assert.equal(b.h.session.phase,'done');
    b.click('cancel');b.click('confirm-cancel');assert.equal(b.h.state.history.length,0);
    assert.ok(b.d.querySelector('[data-daily-count]').textContent.startsWith('7 av 8'));
    const restored=boot({history:b.w.localStorage.getItem('rehab-johan-v1')});
    assert.ok(restored.d.querySelector('[data-daily-count]').textContent.startsWith('7 av 8'));restored.close();b.close();
    console.log('PASS: daily exercise count waits for every set, survives cancellation and reload, and does not complete pass history');
  }
  {
    const b=boot();b.h.render('program');
    assert.equal(b.d.querySelectorAll('[data-image]').length,8);
    for(let i=0;i<8;i++){
      b.d.querySelector(`[data-image="${i}"]`).click();
      const expected=i===0?3:2;
      assert.equal(b.d.querySelectorAll('#dialog-pose .pose-frame').length,expected);
      assert.equal(b.d.querySelectorAll('#pose-controls [data-frame]').length,expected+1);
      b.d.querySelector('#pose-controls [data-frame="1"]').click();
      assert.equal(b.d.querySelectorAll('#dialog-pose .pose-frame').length,1);
      assert.equal(b.d.querySelector('#pose-controls [data-frame="1"]').getAttribute('aria-pressed'),'true');
      b.click('show-original');assert.equal(b.d.querySelector('#pose-controls').hidden,true);
      b.click('show-original');assert.equal(b.d.querySelector('#pose-controls [data-frame="1"]').getAttribute('aria-pressed'),'true');
      b.click('close-image');
    }
    b.h.render('home');b.click('start');b.click('go');b.advance(1000);b.advance(1000);
    b.click('enlarge-image');const phase=b.h.session.phase,rep=b.h.session.rep;
    b.d.querySelector('#pose-controls [data-frame="0"]').click();b.advance(10000);
    assert.equal(b.h.running,false);assert.equal(b.h.session.phase,phase);assert.equal(b.h.session.rep,rep);
    b.click('close-image');assert.equal(b.d.querySelector('#enlarge-image').dataset.pose,'2');b.close();
    console.log('PASS: all eight galleries select poses, preserve selection across original comparison and do not alter training');
  }
  {
    const b=boot();b.click('start');b.click('go');
    const info=()=>['#phase','#digits','#timer-unit','#count'].map(id=>b.d.querySelector(id).textContent).join('|')+'|'+b.d.querySelector('#enlarge-image').dataset.pose;
    const upcomingUp=info();assert.ok(upcomingUp.startsWith('Upp|1|sekunder|'));
    b.advance(999);assert.equal(info(),upcomingUp);b.advance(1);assert.equal(info(),upcomingUp);
    b.advance(1000);const upcomingDown=info();assert.ok(upcomingDown.startsWith('Sänk långsamt|3|sekunder|'));
    b.advance(999);assert.equal(info(),upcomingDown);b.advance(1);assert.equal(info(),upcomingDown);b.close();
    console.log('PASS: upcoming instruction, image and duration stay unchanged throughout preparation and movement start');
  }
  {
    const b=boot();b.click('start');assert.equal(b.d.querySelector('#enlarge-image').dataset.pose,'0');
    b.click('go');assert.equal(b.d.querySelector('#enlarge-image').dataset.pose,'1');
    b.advance(1000);assert.equal(b.d.querySelector('#enlarge-image').dataset.pose,'1');
    b.advance(1000);assert.equal(b.d.querySelector('#enlarge-image').dataset.pose,'2');
    b.click('enlarge-image');assert.equal(b.h.running,false);assert.equal(b.d.querySelector('#dialog-pose').hidden,false);
    b.click('show-original');assert.equal(b.d.querySelector('#dialog-pose').hidden,true);assert.equal(b.d.querySelector('#dialog-image').hidden,false);
    b.click('show-original');assert.equal(b.d.querySelector('#dialog-pose').hidden,false);
    const image=b.d.querySelector('#dialog-pose .pose-image');image.dispatchEvent(new b.w.Event('error'));
    assert.ok(image.src.endsWith('/illustrations/1950s/exercise-0.png'));assert.equal(image.style.width,'100%');
    b.click('close-image');
    const restored=boot({draft:b.draft()});restored.click('resume-saved');assert.equal(restored.d.querySelector('#enlarge-image').dataset.pose,'2');restored.close();b.close();
    console.log('PASS: poses preview upcoming movement, freeze and restore, enlarge and fall back');
  }
  {
    const data=fresh();data.settings.sound=true;
    const fixture=soundFixture(true),b=boot({history:JSON.stringify(data),AudioContext:fixture.AudioContext});
    b.click('start');const activation=b.d.querySelector('#go').onclick();
    assert.equal(b.h.session.phase,'ready');assert.ok(b.d.querySelector('#go').disabled);
    assert.equal(fixture.contexts[0].nodes.length,0);fixture.release();await activation;
    const audio=fixture.contexts[0];assert.equal(b.h.session.phase,'transition');assert.equal(audio.nodes.length,0);b.advance(1000);assert.equal(b.h.session.phase,'up');assert.equal(audio.nodes.length,1);assert.equal(audio.nodes[0].hz,760);
    b.h.render();assert.equal(audio.nodes.length,1);
    b.advance(1000);assert.equal(b.h.session.phase,'transition');assert.equal(audio.nodes.length,1);b.advance(1000);assert.equal(b.h.session.phase,'down');assert.equal(audio.nodes.length,2);
    b.advance(1000);assert.equal(audio.nodes.length,3);
    b.click('pause');const count=audio.nodes.length;b.advance(10000);assert.equal(audio.nodes.length,count);
    audio.state='interrupted';audio.onstatechange();await b.d.querySelector('#resume-pass').onclick();
    assert.equal(audio.closed,true);assert.equal(fixture.contexts.length,2);assert.equal(fixture.contexts[1].nodes.length,1);
    b.click('sound');const muted=fixture.contexts[1].nodes.length;b.advance(10000);
    assert.equal(fixture.contexts[1].nodes.length,muted);assert.equal(b.h.state.settings.sound,false);b.close();
    console.log('PASS: audio activation precedes first cue, no render duplicates, pause/recovery and mute');
  }
  {
    const data=fresh();data.settings.sound=true;
    const fixture=soundFixture(true),b=boot({history:JSON.stringify(data),AudioContext:fixture.AudioContext});
    b.click('start');const activation=b.d.querySelector('#go').onclick();b.click('cancel');fixture.release();await activation;
    assert.equal(b.h.running,false);assert.equal(b.h.session.phase,'ready');assert.equal(fixture.contexts[0].nodes.length,0);b.close();
    console.log('PASS: cancelling while browser audio starts cannot restart the timer later');
  }
  {
    const data=fresh();data.settings.sound=true;
    class UnavailableAudioContext{constructor(){throw Error('Audio unavailable')}}
    const b=boot({history:JSON.stringify(data),AudioContext:UnavailableAudioContext});
    b.click('start');await b.d.querySelector('#go').onclick();
    assert.equal(b.h.running,true);assert.equal(b.h.session.phase,'transition');
    assert.ok(b.d.querySelector('#sound-status').textContent.includes('kunde inte startas'));
    b.advance(1000);assert.equal(b.h.session.phase,'up');b.advance(1000);assert.equal(b.h.session.phase,'transition');b.advance(1000);assert.equal(b.h.session.phase,'down');b.close();
    console.log('PASS: an audio failure is visible and does not block the exercise timer');
  }
  {
    const fixture=soundFixture(),b=boot({AudioContext:fixture.AudioContext});b.h.render('settings');
    b.d.querySelector('[name=reps]').value=15;await b.d.querySelector('#test-sound').onclick();
    assert.equal(b.h.state.settings.reps,10);assert.equal(b.h.state.settings.sound,false);
    assert.equal(fixture.contexts[0].nodes.length,6);assert.ok(b.d.querySelector('#sound-status').textContent.includes('Provljudet har startats'));
    assert.equal(b.w.localStorage.getItem('rehab-johan-v1'),null);b.close();
    console.log('PASS: test sound plays while muted without submitting settings or changing preference');
  }
  {
    const data=fresh();data.settings.sound=true;
    const fixture=soundFixture(),b=boot({history:JSON.stringify(data),AudioContext:fixture.AudioContext});
    b.click('start');await b.d.querySelector('#go').onclick();const audio=fixture.contexts[0];
    for(let i=0;i<10;i++){b.advance(1000);b.advance(1000);b.advance(1000);b.advance(3000)}
    assert.equal(b.h.session.phase,'rest');
    const count=audio.nodes.length;b.advance(30000);assert.equal(b.h.session.phase,'transition');assert.equal(audio.nodes.length,count+2);
    while(b.h.session.steps[b.h.session.index].kind!=='stretch'){
      if(b.h.session.phase==='ready')b.click('go');else if(b.h.session.phase==='done')b.click('next');else b.advance(61000);
    }
    b.advance(1000);const stretchCount=audio.nodes.length;for(let i=0;i<44;i++)b.advance(1000);assert.equal(audio.nodes.length,stretchCount+44);assert.equal(audio.nodes.at(-1).hz,640);
    b.advance(1000);assert.equal(b.h.session.phase,'transition');assert.equal(b.h.session.steps[b.h.session.index].side,'Höger');assert.equal(audio.nodes.length,stretchCount+46);b.close();
    console.log('PASS: rest end and stretch completion signal exactly once, with a hold cue each second');
  }
  {
    const b=boot();b.click('start');b.click('go');b.advance(1000);assert.equal(b.h.session.phase,'up');b.advance(1000);assert.equal(b.h.session.phase,'transition');b.advance(1000);assert.equal(b.h.session.phase,'down');b.advance(1200);b.click('pause');const time=b.h.passTime(),rep=b.h.session.rep;
    b.advance(20000);assert.equal(b.h.session.rep,rep);assert.equal(b.h.passTime(),time);assert.ok(b.d.querySelector('#resume-pass'));
    b.click('resume-pass');b.advance(1800);assert.equal(b.h.session.rep,2);
    b.click('cancel');b.click('confirm-cancel');assert.equal(b.h.session,null);assert.equal(b.h.state.history.length,0);assert.equal(b.draft(),null);b.close();
    console.log('PASS: cadence, measured time excludes pauses, cancellation clears only draft');
  }
  {
    const b=boot();b.click('start');b.click('go');b.advance(1000);b.advance(1000);b.advance(1000);b.advance(1200);b.hidden(true);
    const raw=b.draft(),saved=JSON.parse(raw);assert.equal(saved.session.phase,'down');assert.equal(saved.remaining,1800);
    b.advance(10000);assert.equal(b.h.passTime(),4200);
    const next=boot({draft:raw});assert.equal(next.h.session,null);assert.ok(next.d.querySelector('#resume-saved'));next.advance(20000);next.click('resume-saved');assert.equal(next.h.running,false);assert.equal(next.h.session.rep,1);assert.equal(next.h.passTime(),4200);
    next.click('resume-pass');next.advance(1800);assert.equal(next.h.session.rep,2);assert.equal(next.h.passTime(),6000);next.close();b.close();
    console.log('PASS: background and reload preserve exact position and exclude time away');
  }
  {
    const b=boot();b.click('start');finish(b);assert.ok(b.h.completed);assert.equal(b.h.state.history.length,0);assert.ok(b.h.completed.durationMs>0);
    const restored=boot({draft:b.draft()});assert.ok(restored.h.completed);assert.ok(restored.d.querySelector('#feel-good'));
    restored.fail(true);restored.click('feel-good');assert.ok(restored.h.completed);assert.equal(restored.h.state.history.length,0);
    restored.fail(false);restored.click('feel-good');assert.equal(restored.h.state.history.length,1);assert.equal(restored.h.completed,null);assert.equal(restored.draft(),null);assert.ok(restored.d.querySelector('#start').disabled);
    restored.h.render('progress');assert.ok(restored.d.querySelector('.history').textContent.includes('min'));
    const again=boot({history:restored.w.localStorage.getItem('rehab-johan-v1')});assert.equal(again.h.state.history.length,1);again.close();restored.close();b.close();
    console.log('PASS: full prescribed pass, questionnaire recovery, failed save retry and duration history');
  }
  {
    const b=boot();b.h.render('settings');const f=b.d.querySelector('form');f.querySelector('[name=stretch]').value=60;f.dispatchEvent(new b.w.Event('submit',{cancelable:true}));assert.equal(b.h.state.settings.stretch,60);assert.ok(b.d.querySelector('#settings-saved').textContent.includes('sparat'));
    b.h.render('program');assert.equal(b.d.querySelectorAll('details').length,8);assert.equal(b.d.querySelectorAll('a[target="_blank"]').length,6);b.close();
    console.log('PASS: settings and all original program exercises and video links');
  }
  {
    const b=boot();b.h.render('program');b.d.querySelector('[data-image="3"]').click();
    assert.ok(b.d.querySelector('#image-dialog').open);
    assert.ok(b.d.querySelector('#dialog-image').getAttribute('src').endsWith('illustrations/1950s/exercise-3.png'));
    b.click('show-original');assert.equal(b.d.querySelector('#dialog-image').getAttribute('src'),'assets/exercise-3.png');
    b.click('show-original');assert.ok(b.d.querySelector('#dialog-image').getAttribute('src').includes('illustrations/'));
    b.click('close-image');assert.equal(b.d.querySelector('#image-dialog').open,false);
    assert.equal(b.d.activeElement.dataset.image,'3');
    b.h.render('home');b.click('start');b.click('go');b.advance(1000);b.click('enlarge-image');
    assert.equal(b.h.running,false);assert.ok(b.d.querySelector('#image-dialog').open);
    b.click('show-original');assert.equal(b.d.querySelector('#dialog-image').getAttribute('src'),'assets/exercise-0.png');
    b.click('close-image');assert.ok(b.d.querySelector('#resume-pass'));b.close();
    console.log('PASS: illustrations and originals can be compared, focus returns and training pauses');
  }
  {
    const b=boot({history:'{bad data'});b.h.render('settings');b.d.querySelector('form').dispatchEvent(new b.w.Event('submit',{cancelable:true}));assert.equal(b.w.localStorage.getItem('rehab-johan-v1'),'{bad data');b.close();
    const unread=boot({draft:'{bad draft'});assert.equal(unread.d.querySelector('#start'),null);assert.ok(unread.d.querySelector('#recover-draft'));assert.equal(unread.draft(),'{bad draft');unread.close();
    console.log('PASS: unreadable history and draft are preserved');
  }
  {
    const b=boot(),settings={...b.h.state.settings,stretch:60};
    const record={id:'import-1',at:'2026-10-01T12:00:00Z',day:'2026-10-01',settings,feel:'good',next:null};
    const data=JSON.stringify({version:1,settings,history:[record]});
    await importFile(b,data);assert.ok(b.d.querySelector('#confirm-import'));assert.equal(b.h.state.history.length,0);assert.equal(b.h.state.settings.stretch,45);
    b.click('confirm-import');assert.equal(b.h.state.history.length,1);assert.equal(b.h.state.settings.stretch,45);
    await importFile(b,data);b.click('confirm-import');assert.equal(b.h.state.history.length,1);
    await importFile(b,data);b.d.querySelector('#import-settings').checked=true;b.click('confirm-import');assert.equal(b.h.state.settings.stretch,60);
    await importFile(b,'{broken');assert.equal(b.d.querySelector('#confirm-import'),null);assert.ok(b.d.querySelector('#import-status').textContent.includes('JSON'));assert.equal(b.h.state.history.length,1);
    await importFile(b,data);b.click('cancel-import');assert.equal(b.d.querySelector('#confirm-import'),null);b.close();
    console.log('PASS: import previews, merges, requires opt-in for settings and rejects bad files');
  }
  {
    const manual=fresh();manual.settings.squatSeconds=0;
    const draft={version:1,session:{settings:manual.settings,index:13,rep:1,phase:'ready',started:new Date().toISOString()},remaining:0,duration:0,elapsedMs:0};
    const b=boot({draft:JSON.stringify(draft)});b.click('resume-saved');b.click('resume-pass');b.advance(1000);b.click('rep');b.advance(1000);b.click('rep');b.advance(5000);const raw=b.draft();
    const restored=boot({draft:raw});restored.click('resume-saved');assert.equal(restored.h.session.phase,'manual');assert.equal(restored.h.session.rep,3);const time=restored.h.passTime();restored.advance(20000);assert.equal(restored.h.passTime(),time);restored.click('resume-pass');restored.click('rep');assert.equal(restored.h.session.rep,4);restored.close();b.close();
    console.log('PASS: manual squat repetition resumes without adding time away');
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
