// Optional DOM tests: use a local jsdom installation or REHAB_JSDOM_PATH.
const {JSDOM}=require(process.env.REHAB_JSDOM_PATH||'jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=__dirname+'/../dist/';
function boot({history,draft,failWrites=false,AudioContext}={}){
  const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{url:'https://example.com/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  let clock=0,intervals=new Map(),id=0,hidden=false;
  w.scrollTo=()=>{};w.setInterval=fn=>{intervals.set(++id,fn);return id};w.clearInterval=id=>intervals.delete(id);
  Object.defineProperty(w.performance,'now',{value:()=>clock});
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  if(AudioContext)w.AudioContext=AudioContext;
  // jsdom has no native dialog API; browser QA covers the modal itself.
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};
  if(history)w.localStorage.setItem('rehab-johan-v1',history);
  if(draft)w.localStorage.setItem('rehab-johan-v1-pass',draft);
  const originalSet=w.Storage.prototype.setItem;
  w.Storage.prototype.setItem=function(...args){if(failWrites)throw Error('Storage full');return originalSet.apply(this,args)};
  const source=['model.js','storage.js','sound.js','app.js'].map(name=>fs.readFileSync(root+name,'utf8').replace(/^import .*\n/gm,'').replaceAll('export ', '')).join('\n');
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
    const data=fresh();data.settings.sound=true;
    const fixture=soundFixture(true),b=boot({history:JSON.stringify(data),AudioContext:fixture.AudioContext});
    b.click('start');const activation=b.d.querySelector('#go').onclick();
    assert.equal(b.h.session.phase,'ready');assert.ok(b.d.querySelector('#go').disabled);
    assert.equal(fixture.contexts[0].nodes.length,0);fixture.release();await activation;
    const audio=fixture.contexts[0];assert.equal(b.h.session.phase,'up');assert.equal(audio.nodes.length,1);assert.equal(audio.nodes[0].hz,760);
    b.h.render();assert.equal(audio.nodes.length,1);
    b.advance(1000);assert.equal(b.h.session.phase,'down');assert.equal(audio.nodes.length,2);
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
    assert.equal(b.h.running,true);assert.equal(b.h.session.phase,'up');
    assert.ok(b.d.querySelector('#sound-status').textContent.includes('kunde inte startas'));
    b.advance(1000);assert.equal(b.h.session.phase,'down');b.close();
    console.log('PASS: an audio failure is visible and does not block the exercise timer');
  }
  {
    const fixture=soundFixture(),b=boot({AudioContext:fixture.AudioContext});b.h.render('settings');
    b.d.querySelector('[name=reps]').value=15;await b.d.querySelector('#test-sound').onclick();
    assert.equal(b.h.state.settings.reps,10);assert.equal(b.h.state.settings.sound,false);
    assert.equal(fixture.contexts[0].nodes.length,4);assert.ok(b.d.querySelector('#sound-status').textContent.includes('Provljudet har startats'));
    assert.equal(b.w.localStorage.getItem('rehab-johan-v1'),null);b.close();
    console.log('PASS: test sound plays while muted without submitting settings or changing preference');
  }
  {
    const data=fresh();data.settings.sound=true;
    const fixture=soundFixture(),b=boot({history:JSON.stringify(data),AudioContext:fixture.AudioContext});
    b.click('start');await b.d.querySelector('#go').onclick();const audio=fixture.contexts[0];
    for(let i=0;i<10;i++){b.advance(1000);b.advance(3000)}
    assert.equal(b.h.session.phase,'done');b.click('next');assert.equal(b.h.session.phase,'rest');
    const count=audio.nodes.length;b.advance(30000);assert.equal(b.h.session.phase,'ready');assert.equal(audio.nodes.length,count+2);
    while(b.h.session.steps[b.h.session.index].kind!=='stretch'){
      if(b.h.session.phase==='ready')b.click('go');else if(b.h.session.phase==='done')b.click('next');else b.advance(61000);
    }
    b.click('go');const stretchCount=audio.nodes.length;b.advance(44000);assert.equal(audio.nodes.length,stretchCount);
    b.advance(1000);assert.equal(b.h.session.phase,'done');assert.equal(audio.nodes.length,stretchCount+2);b.close();
    console.log('PASS: rest end and stretch completion signal exactly once without changing durations');
  }
  {
    const b=boot();b.click('start');b.click('go');assert.equal(b.h.session.phase,'up');b.advance(1000);assert.equal(b.h.session.phase,'down');b.advance(1200);b.click('pause');const time=b.h.passTime(),rep=b.h.session.rep;
    b.advance(20000);assert.equal(b.h.session.rep,rep);assert.equal(b.h.passTime(),time);assert.ok(b.d.querySelector('#resume-pass'));
    b.click('resume-pass');b.advance(1800);assert.equal(b.h.session.rep,2);
    b.click('cancel');b.click('confirm-cancel');assert.equal(b.h.session,null);assert.equal(b.h.state.history.length,0);assert.equal(b.draft(),null);b.close();
    console.log('PASS: cadence, measured time excludes pauses, cancellation clears only draft');
  }
  {
    const b=boot();b.click('start');b.click('go');b.advance(1000);b.advance(1200);b.hidden(true);
    const raw=b.draft(),saved=JSON.parse(raw);assert.equal(saved.session.phase,'down');assert.equal(saved.remaining,1800);
    b.advance(10000);assert.equal(b.h.passTime(),2200);
    const next=boot({draft:raw});assert.equal(next.h.session,null);assert.ok(next.d.querySelector('#resume-saved'));next.advance(20000);next.click('resume-saved');assert.equal(next.h.running,false);assert.equal(next.h.session.rep,1);assert.equal(next.h.passTime(),2200);
    next.click('resume-pass');next.advance(1800);assert.equal(next.h.session.rep,2);assert.equal(next.h.passTime(),4000);next.close();b.close();
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
    const unread=boot({draft:'{bad draft'});assert.ok(unread.d.querySelector('#start').disabled);assert.ok(unread.d.querySelector('#recover-draft'));assert.equal(unread.draft(),'{bad draft');unread.close();
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
    const b=boot();b.click('start');let guards=0;while(b.h.session.steps[b.h.session.index].kind!=='squat'){assert.ok(++guards<1000);if(b.h.session.phase==='ready')b.click('go');else if(b.h.session.phase==='done')b.click('next');else b.advance(61000)}
    b.click('go');b.click('rep');b.click('rep');b.advance(5000);const raw=b.draft();
    const restored=boot({draft:raw});restored.click('resume-saved');assert.equal(restored.h.session.phase,'manual');assert.equal(restored.h.session.rep,3);const time=restored.h.passTime();restored.advance(20000);assert.equal(restored.h.passTime(),time);restored.click('resume-pass');restored.click('rep');assert.equal(restored.h.session.rep,4);restored.close();b.close();
    console.log('PASS: manual squat repetition resumes without adding time away');
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
