import {defaults,exercises,dayKey,validSettings,signature,plan,proposal,eligible,fresh} from './model.js';
import {parseBackup,mergeHistory,restoreDraft,estimatedSeconds,formatDuration} from './storage.js';
import {SoundPlayer} from './sound.js';
const $=s=>document.querySelector(s), app=$('#app'),KEY='rehab-johan-v1';let state=fresh(),session=null,timer=null,deadline=0,remaining=0,running=false,lock=null,current='home',cancelPrompt=false,unreadStorage=null;
const DRAFT_KEY=KEY+'-pass';
let completed=null,savedDraft=null,unreadDraft=null,elapsedMs=0,activeSince=null,passPaused=false,importPreview=null,importRead=0;
let duration=0,lastSecond=-1;
let soundState='idle',soundTestMessage='',soundTesting=false,audioPreparing=false,soundAction=0,soundTestAction=0,soundPreferenceAction=0;
const sounds=new SoundPlayer({onState:status=>{soundState=status;if(['blocked','unsupported'].includes(status))soundTestMessage='';updateSoundUI()}});
function notice(t){$('#notice').hidden=!t;$('#notice').textContent=t}
try{const raw=localStorage.getItem(KEY);unreadStorage=raw;if(raw){const v=JSON.parse(raw);if(v.version!==1||!Array.isArray(v.history)||v.history.some(x=>!x||typeof x.at!=='string'||typeof x.day!=='string'))throw Error();state={...fresh(),...v,settings:validSettings(v.settings)}}unreadStorage=null;}catch{notice('Tidigare uppgifter kunde inte läsas. Ingenting skrivs över automatiskt. Exportera det som går att återställa eller ladda om sidan innan du sparar nya uppgifter.');}
function save(value=state){if(unreadStorage!==null){notice('Tidigare lagring kunde inte läsas. Exportera originalet via knappen nedan innan du ersätter det.');showRecovery();return false}try{localStorage.setItem(KEY,JSON.stringify(value));notice('');return true}catch{notice('Det gick inte att spara på enheten. Behåll sidan öppen och exportera historiken under Framsteg.');return false}}
function showRecovery(){const box=$('#notice');if(!box.querySelector('button')){const b=document.createElement('button');b.textContent='Exportera original och använd den nya historiken';b.onclick=()=>{const a=document.createElement('a'),u=URL.createObjectURL(new Blob([unreadStorage],{type:'application/json'}));a.href=u;a.download='rehab-original.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);unreadStorage=null;save()};box.append(document.createElement('br'),b)}}
function esc(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function button(id,text,cls='secondary'){return `<button id="${id}" class="${cls}">${text}</button>`}
function illustrationPath(e){return `assets/illustrations/1950s/exercise-${e.img}.png`}
function imageButton(e,inSession=false){
  return `<button type="button" class="image-preview" ${inSession?'id="enlarge-image"':''} data-image="${e.img}" aria-label="Förstora illustration: ${esc(e.name)}"><img class="exercise-image" src="${illustrationPath(e)}" alt="${esc(e.name)}" loading="lazy" decoding="async"><span>Förstora illustration ↗</span></button>`;
}
function imageDialog(){
  return `<dialog id="image-dialog" aria-labelledby="image-title"><div class="row"><h2 id="image-title"></h2>${button('close-image','Stäng')}</div><img class="dialog-image" id="dialog-image" alt=""><p class="note" id="image-credit"></p>${button('show-original','Visa originalbild')}</dialog>`;
}
function setDialogImage(original){
  const dialog=$('#image-dialog'),e=exercises[Number(dialog.dataset.exercise)];
  if(!e)return;
  const credit=e.img===0?'The Finnish Weightlifting Federation':e.img===7?'Joanne Elphinston':'Physiotools';
  dialog.dataset.original=String(original);
  $('#image-title').textContent=e.name;
  $('#dialog-image').src=original?`assets/exercise-${e.img}.png`:illustrationPath(e);
  $('#dialog-image').alt=(original?'Originalbild: ':'Illustration: ')+e.name;
  $('#image-credit').textContent=original?`Originalbild © ${credit}`:'AI-illustration utifrån övningsbeskrivningen.';
  $('#show-original').textContent=original?'Visa illustration':'Visa originalbild';
}
function bindImages(){
  const dialog=$('#image-dialog');if(!dialog)return;
  app.querySelectorAll('[data-image]').forEach(b=>b.onclick=()=>{
    const index=Number(b.dataset.image);
    // Pausing rebuilds the training view; use the newly rendered dialog.
    if(session)pause();
    const currentDialog=$('#image-dialog');currentDialog.dataset.exercise=String(index);
    setDialogImage(false);currentDialog.showModal();
  });
  $('#show-original').onclick=()=>setDialogImage(dialog.dataset.original!=='true');
  $('#close-image').onclick=()=>dialog.close();
  dialog.onclose=()=>app.querySelector(`[data-image="${dialog.dataset.exercise}"]`)?.focus({preventScroll:true});
}
function heading(k,t,p=''){return `<p class="eyebrow">${k}</p><h1 tabindex="-1">${t}</h1>${p?`<p class="lead">${p}</p>`:''}`}
function dateLabel(d){return new Date(d+'T12:00:00').toLocaleDateString('sv-SE',{day:'numeric',month:'short'})}
function dayDone(){return state.history.some(x=>x.day===dayKey())}
function pending(){return state.history.filter(x=>x.day<dayKey()&&!x.next)}
function week(){let h='';for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=dayKey(d);h+=`<div class="day ${state.history.some(x=>x.day===key)?'done':''} ${i===0?'today':''}">${d.toLocaleDateString('sv-SE',{weekday:'short'})}<b>${state.history.some(x=>x.day===key)?'✓':d.getDate()}</b></div>`}return `<div class="week" aria-label="De senaste sju dagarna">${h}</div>`}
function home(){const s=state.settings;return heading('Ett pass om dagen',dayDone()?'Dagens pass är klart.':'En stund för din återhämtning.','Dina hemövningar, lugnt och steg för steg.')+draftCard()+`<section class="card hero"><div class="row"><span class="pill">${dayDone()?'✓ Genomfört i dag':'Ditt nästa pass'}</span><span class="note">8 övningar</span></div><div class="metrics"><div><strong>${s.stretch} s</strong><span>stretch</span></div><div><strong>3 × ${s.reps}</strong><span>styrkeövningar</span></div><div><strong>${Math.ceil(estimatedSeconds(s)/60)}+ min</strong><span>inklusive vila</span></div></div>${button('start',dayDone()?'Passet sparat i dag':'Starta mitt pass','primary')}${soundControls()}<p class="note">Beräknad tid för stretch, tåhävningar och inställd vila. Knäböj och byten mellan övningar tillkommer.</p><p class="note divider">Ta fram en boll, en stadig stol och ett trappsteg. Du startar själv varje ny övning och sida.</p></section>${pending().length?`<section class="card"><p class="eyebrow">Följ upp</p><h2>Hur kändes kroppen dagen efter?</h2><p class="muted">Svara för tidigare pass innan du tar ställning till en ökning.</p>${button('follow','Följ upp senaste pass')}</section>`:''}${eligible(state)?`<section class="card"><p class="eyebrow">Du bestämmer</p><h2>Vill du ta nästa steg?</h2><p>Tre pass på olika dagar har känts bra, även dagen efter.</p><p><strong>${proposal(s).label}</strong></p><p class="note">Detta är appens förslag, inte en progressionsplan från fysioterapeuten.</p><div class="actions">${button('increase','Godkänn ökningen','primary')}${button('stay','Behåll nivån')}</div></section>`:''}<section class="card"><div class="row"><h2>Din vecka</h2><a href="#progress" class="note">Visa framsteg →</a></div>${week()}</section><p class="note">Övningar och intervall från ditt Physiotools-program. Antalet pass är ditt val. Öka en sak i taget och stäm av progressionen med fysioterapeuten.</p>`}
function program(){return heading('Ditt upplägg','Åtta övningar. Ett pass.','Öppna en övning för att se bild och instruktion.')+`<p class="note">Illustrationerna har tagits fram från övningsbeskrivningarna. Du kan visa originalbilden när du förstorar en illustration. Instruktionerna kommer från programmet. Varje pass innehåller alla åtta övningar. För ensidiga övningar utom vadstretch med rakt ben är båda sidor ett val i appen; PDF:en anger inte sida.</p>`+exercises.map((e,i)=>`<details><summary><span class="num">${i+1}</span>${e.name}</summary><div class="instruction program-instruction">${imageButton(e)}<div><p>${e.text}</p><p class="note">${e.dose}</p>${e.video?`<a class="button" href="${esc(e.video)}" target="_blank" rel="noopener">Visa originalvideo ↗</a>`:''}</div></div></details>`).join('')+`<section class="card"><h2>Progression i din takt</h2><p>Börja med 45 sekunder stretch och 3 × 10 repetitioner. Appen erbjuder en ökning efter tre pass på olika dagar på samma nivå, om du markerat att både passet och dagen efter kändes bra.</p><p>Först ökas stretchtiden med 5 sekunder till högst 60. Sedan ökas repetitionerna en i taget till 15, och sist sänkningen i tåhävningarna till högst 5 sekunder. Du godkänner varje ändring.</p><p class="note">Regeln är ett appupplägg som behöver stämmas av med fysioterapeuten. Missade dagar ger ingen ökning. Avbrutna pass räknas inte. Vila mellan set och sidval är appinställningar, inte en angiven ordination.</p></section>`+imageDialog()}
function progress(){const weekKeys=[];for(let i=0;i<7;i++){let d=new Date();d.setDate(d.getDate()-i);weekKeys.push(dayKey(d))}return heading('Översikt','Din träning hittills.')+`<div class="card"><div class="metrics"><div><strong>${state.history.length}</strong><span>genomförda pass</span></div><div><strong>${state.history.filter(x=>weekKeys.includes(x.day)).length} / 7</strong><span>senaste veckan</span></div><div><strong>${state.settings.stretch} s</strong><span>aktuell stretch</span></div></div>${week()}</div><h2>Passhistorik</h2>${state.history.length?state.history.slice().reverse().map(x=>`<div class="history"><div><strong>${dateLabel(x.day)}</strong><small>${esc(x.settings.stretch)} s · 3 × ${esc(x.settings.reps)}</small><small>${x.durationMs===undefined?'Passtid saknas':formatDuration(x.durationMs)}</small></div><div>${x.feel==='good'?'Kändes bra':x.feel==='hard'?'Ansträngande':'Besvär'}<small>${x.next?(x.next==='good'?'Bra dagen efter':x.next==='hard'?'Trött dagen efter':'Besvär dagen efter'):'Uppföljning återstår'}</small></div></div>`).join(''):'<p class="muted">Ditt första genomförda pass visas här.</p>'}<section class="card"><h2>Säkerhetskopiera och flytta</h2><div class="actions wrap">${button('export','Exportera historik')}${button('choose-import','Importera historik')}</div><input id="import-file" type="file" accept=".json,application/json" hidden><p id="import-status" role="status" class="note"></p><div id="import-preview">${importPreview?importMarkup():''}</div></section><p class="note">Sparas enbart i den här webbläsaren. Exportera en säkerhetskopia om du vill behålla dina uppgifter.</p><p class="note">Passtiden inkluderar vila och byten mellan övningarna. Pauser och tiden utanför appen räknas inte. Äldre pass saknar uppmätt tid.</p>`}
function settings(){const s=state.settings;return heading('Ditt upplägg','Gör det till ditt.','Justera inom intervallen från ditt program.')+`<form id="settings-form" class="card">${[['stretch','Stretchtid (sekunder)',45,60],['reps','Repetitioner per set · 3 set',10,15],['lower','Sänkning i tåhävning (sekunder)',3,5],['rounds','Omgångar där PDF:en anger 1–2',1,2],['rest','Vila mellan set (sekunder)',0,120]].map(([k,l,min,max])=>`<label><span>${l}</span><input name="${k}" type="number" min="${min}" max="${max}" step="1" value="${s[k]}" required></label>`).join('')}<label class="check"><span>Ljud som stöd</span><input name="sound" type="checkbox" ${s.sound?'checked':''}></label>${soundControls(false)}<label class="check"><span>Båda sidor för ensidiga övningar</span><input name="both" type="checkbox" ${s.both?'checked':''}></label><p class="note">Vadstretch med rakt ben görs alltid på båda sidor enligt PDF:en. Sidval för övriga övningar och 30 sekunders standardvila är appval; anpassa efter fysioterapeutens råd.</p>${button('save-settings','Spara mitt upplägg','primary')}<p id="settings-saved" role="status" class="note"></p></form><section class="card"><h2>På mobilen</h2><p>Lägg sidan på hemskärmen via webbläsarens meny. Håll appen synlig under passet. Om du lämnar den pausas passet och du fortsätter själv när du kommer tillbaka. Påbörjade pass sparas automatiskt på den här enheten, även om du laddar om sidan.</p><p class="note">Använd Testa ljud före passet. Om provet är tyst, kontrollera telefonens medievolym och vald ljudutgång, till exempel hörlurar. Kort signal markerar start och tempo; två toner markerar att en del eller vilan är klar.</p></section>`}
function render(view=location.hash.slice(1)||'home',focus=false){if(completed&&!session)view='complete';if(view==='complete'&&!completed)view='home';if(session){renderSession();return}app.classList.remove('session-view');current=['home','program','progress','settings','follow','complete'].includes(view)?view:'home';$('#nav').hidden=false;app.innerHTML=current==='program'?program():current==='progress'?progress():current==='settings'?settings():current==='follow'?follow():current==='complete'?complete():home();$('#nav').querySelectorAll('a').forEach(a=>{if(a.hash==='#'+current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});bind();if(focus)app.querySelector('h1')?.focus()}
function follow(){const x=pending().at(-1);return heading('Uppföljning',x?'Hur kändes dagen efter?':'Alla pass är uppföljda.',x?`Passet ${dateLabel(x.day)}. Ditt svar hjälper dig att bedöma nästa steg.`:'')+(x?choices('next'):'<a href="#home" class="button">Till hem</a>')}
function choices(prefix){return `<div class="choices">${button(prefix+'-good','Kändes bra')}${button(prefix+'-hard','Trött eller ansträngd')}${button(prefix+'-pain','Besvär eller mer ont')}</div><p class="note divider">Vid besvär föreslår appen ingen ökning. Anpassa träningen och kontakta din fysioterapeut om du är osäker på hur du ska fortsätta.</p>`}
function complete(){return heading('Ett pass genomfört','Passet är klart.','Hur kändes det?')+`<section class="card"><p>Du genomförde alla åtta övningar. Välj ett svar för att spara passet.</p>${choices('feel')}</section>`}
function bind(){bindImport();bindImages();bindSoundControls();function on(id,fn){const el=document.getElementById(id);if(el)el.onclick=fn}on('resume-saved',resumeSaved);on('recover-draft',()=>{download(unreadDraft,'rehab-olast-pass.json');unreadDraft=null;try{localStorage.removeItem(DRAFT_KEY);notice('');render('home')}catch{notice('Det gick inte att ta bort den oläsbara passkopian.')}});on('start',()=>{if(dayDone()||savedDraft||unreadDraft!==null)return;start()});if((dayDone()||savedDraft||unreadDraft!==null)&&$('#start'))$('#start').disabled=true;on('export',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rehab-historik-'+dayKey()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});on('follow',()=>{location.hash='follow'});on('increase',()=>{if(!eligible(state))return;const p=proposal(state.settings);state.settings[p.key]=p.value;state.progressAfter=new Date().toISOString();save();render('home')});on('stay',()=>{state.progressAfter=new Date().toISOString();save();render('home')});for(const v of ['good','hard','pain']){on('next-'+v,()=>{const x=pending().at(-1);if(x){x.next=v;if(v!=='good')state.progressAfter=new Date().toISOString();save()}render('follow')});on('feel-'+v,()=>{if(!completed)return;const nextState={...state,history:state.history.some(x=>x.id===completed.id)?state.history:[...state.history,{...completed,feel:v}],progressAfter:v!=='good'?new Date().toISOString():state.progressAfter};if(!save(nextState))return;state=nextState;completed=null;persistDraft();location.hash='home';render('home')})}const f=$('#settings-form');if(f)f.onsubmit=e=>{e.preventDefault();const d=new FormData(f),s={...defaults};for(const k of ['stretch','reps','lower','rounds','rest'])s[k]=Number(d.get(k));s.sound=d.has('sound');s.both=d.has('both');state.settings=validSettings(s);sounds.stop();soundTestMessage='';updateSoundUI();state.progressAfter=new Date().toISOString();if(save())$('#settings-saved').textContent='Ditt upplägg är sparat.'}}
function soundEnabled(){return session?.settings.sound??state.settings.sound}
function soundControls(toggle=true){return `<div class="sound-panel" aria-label="Ljudstöd"><div class="sound-actions">${toggle?`<button type="button" id="sound" class="secondary" aria-pressed="${soundEnabled()}">${soundEnabled()?'Ljud på':'Ljud av'}</button>`:''}<button type="button" id="test-sound" class="secondary">Testa ljud</button></div><p id="sound-status" class="note" role="status">${esc(soundStatusText())}</p></div>`}
function updateSoundUI(){
  const enabled=soundEnabled(),toggle=$('#sound'),test=$('#test-sound'),status=$('#sound-status');
  if(toggle){toggle.textContent=enabled?'Ljud på':'Ljud av';toggle.setAttribute('aria-pressed',String(enabled))}
  if(test){test.disabled=soundTesting||audioPreparing;test.textContent=soundTesting?'Testar ljud…':'Testa ljud'}
  for(const id of ['go','resume-pass'])if($('#'+id))$('#'+id).disabled=audioPreparing;
  const message=soundStatusText();if(status&&status.textContent!==message)status.textContent=message;
}
function soundStatusText(){const enabled=soundEnabled();return soundTesting?'Startar provljudet…':soundTestMessage||
    (soundState==='unsupported'?'Den här webbläsaren stöder inte ljuden. Timern fungerar ändå.':
      !enabled?'Ljuden är av. Testknappen spelar bara ett prov.':
        audioPreparing||soundState==='starting'?'Startar ljudet…':
          soundState==='blocked'?'Ljudet kunde inte startas. Tryck Testa ljud igen.':
            soundState==='ready'?'Ljudstöd är på.':'Ljuden aktiveras när du startar eller fortsätter.');
}
function cancelSoundTest(){soundTestAction++;soundTesting=false;soundTestMessage='';sounds.stop()}
async function testSound(){
  if(session)pause();
  cancelSoundTest();const token=++soundTestAction;soundTesting=true;updateSoundUI();
  const ready=await sounds.unlock();
  if(token!==soundTestAction)return;
  soundTesting=false;if(document.hidden){updateSoundUI();return}
  const played=ready&&sounds.play('test');
  soundTestMessage=played?`Provljudet har startats.${soundEnabled()?'':' Slå på ljudstöd för signaler under passet.'}`:
    soundState==='unsupported'?'Den här webbläsaren stöder inte ljuden.':'Provljudet kunde inte startas. Försök igen.';
  updateSoundUI();
}
function bindSoundControls(){
  if($('#sound'))$('#sound').onclick=()=>{
    const enabled=!soundEnabled(),token=++soundPreferenceAction;cancelSoundTest();
    state.settings.sound=enabled;if(session)session.settings.sound=enabled;save();
    if(savedDraft){savedDraft.session.settings.sound=enabled;try{localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,...savedDraft}))}catch{notice('Ljudvalet i det sparade passet kunde inte sparas.')}}
    if(session)persistDraft();updateSoundUI();
    if(enabled)return sounds.unlock().then(ready=>{if(ready&&token===soundPreferenceAction&&soundEnabled()&&!document.hidden)sounds.play('start')});
  };
  if($('#test-sound'))$('#test-sound').onclick=testSound;
  updateSoundUI();
}
function runWithSound(action){
  if(audioPreparing)return;
  cancelSoundTest();const active=session,token=++soundAction;
  const commit=()=>{if(session===active&&token===soundAction&&!document.hidden)action()};
  if(!soundEnabled()||sounds.ready){commit();return}
  audioPreparing=true;const preparation=sounds.unlock();updateSoundUI();
  return preparation.then(()=>{if(token!==soundAction||session!==active)return;audioPreparing=false;commit();updateSoundUI()});
}
function beep(cue='tick'){if(soundEnabled()&&!document.hidden&&!passPaused)sounds.play(cue)}
async function wake(){try{lock=await navigator.wakeLock?.request('screen')}catch{}}
function release(){lock?.release().catch(()=>{});lock=null}
function start(){cancelSoundTest();elapsedMs=0;activeSince=null;passPaused=false;session={settings:{...state.settings},steps:plan(state.settings),index:0,rep:1,phase:'ready',started:new Date().toISOString()};cancelPrompt=false;startClock();persistDraft();renderSession();window.scrollTo(0,0)}
function step(){return session.steps[session.index]}
function passTime(){return elapsedMs+(activeSince===null?0:Math.max(0,performance.now()-activeSince))}
function startClock(){if(activeSince===null&&!document.hidden)activeSince=performance.now()}
function stopClock(){elapsedMs=passTime();activeSince=null}
function clearDraft(){
  try{localStorage.removeItem(DRAFT_KEY);savedDraft=null;return true}
  catch{notice('Det sparade passet kunde inte tas bort. Försök igen.');return false}
}
function persistDraft(){
  if(unreadDraft!==null)return false;
  try{
    if(completed)localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,completed}));
    else if(session)localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,
      session:{settings:session.settings,index:session.index,rep:session.rep,phase:session.phase,started:session.started},
      remaining:running?Math.max(0,deadline-performance.now()):remaining,duration,elapsedMs:passTime()}));
    else return clearDraft();
    return true;
  }catch{notice('Passet kunde inte sparas på enheten. Behåll sidan öppen tills du har avslutat och exporterat historiken.');return false}
}
function loadDraft(){
  try{
    const raw=localStorage.getItem(DRAFT_KEY);
    if(!raw)return;
    unreadDraft=raw;
    const draft=restoreDraft(raw);
    if(draft.completed){
      if(state.history.some(x=>x.id===draft.completed.id))clearDraft();
      else completed=draft.completed;
    }else savedDraft=draft;
    unreadDraft=null;
  }catch{notice('Ett sparat pass kunde inte läsas. Du kan hämta originalkopian på Hem innan du börjar ett nytt pass.')}
}
function draftCard(){
  if(unreadDraft!==null)return `<section class="card"><h2>Sparat pass kunde inte läsas</h2><p>Hämta en kopia innan du börjar om.</p>${button('recover-draft','Exportera oläsbart pass och börja om')}</section>`;
  if(!savedDraft)return '';
  const draft=savedDraft.session,t=draft.steps[draft.index];
  return `<section class="card resume-card"><p class="eyebrow">Ditt påbörjade pass</p><h2>Fortsätt där du var.</h2><p>${partLabel(t)}</p><p class="note">Passtid hittills: ${formatDuration(savedDraft.elapsedMs)} · timern är pausad.</p>${button('resume-saved','Fortsätt passet','primary')}</section>`;
}
function resumeSaved(){
  if(!savedDraft)return;
  session=savedDraft.session;remaining=savedDraft.remaining;duration=savedDraft.duration;elapsedMs=savedDraft.elapsedMs;
  savedDraft=null;activeSince=null;passPaused=true;cancelPrompt=false;running=false;
  renderSession();window.scrollTo(0,0);
}
function download(text,filename){
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function importMarkup(){
  const result=mergeHistory(state.history,importPreview.history);
  return `<div class="import-summary"><h3>Förhandsvisning</h3><p>${importPreview.history.length} pass i filen: <strong>${result.added} nya</strong>, ${result.duplicates} dubbletter. ${result.updated} uppföljningar kompletteras.</p><p class="note">Befintliga pass och besvarade uppföljningar behålls. Saknad passtid fylls i om den finns i filen.</p><label class="check"><span>Återställ även upplägget från filen<br><small>${importPreview.settings.stretch} s stretch · 3 × ${importPreview.settings.reps} repetitioner</small></span><input id="import-settings" type="checkbox"></label><div class="actions">${button('confirm-import','Importera de här uppgifterna','primary')}${button('cancel-import','Avbryt')}</div></div>`;
}
function bindImport(){
  const file=$('#import-file');if(!file)return;
  $('#choose-import').onclick=()=>{file.value='';file.click()};
  file.onchange=async()=>{
    const read=++importRead;importPreview=null;$('#import-preview').innerHTML='';$('#import-status').textContent='';const selected=file.files[0];if(!selected)return;
    try{
      if(selected.size>5*1024*1024)throw Error('Filen är för stor. Välj en säkerhetskopia på högst 5 MB.');
      const backup=parseBackup(await selected.text());
      if(current!=='progress'||read!==importRead)return;
      importPreview=backup;$('#import-status').textContent='Filen är läst. Granska innehållet innan du importerar.';
      $('#import-preview').innerHTML=importMarkup();bindImportActions();
    }catch(error){if(read===importRead&&$('#import-status'))$('#import-status').textContent=error.message}
  };
  bindImportActions();
}
function bindImportActions(){
  if(!$('#confirm-import'))return;
  $('#cancel-import').onclick=()=>{importRead++;importPreview=null;$('#import-preview').innerHTML='';$('#import-status').textContent='Importen avbröts.'};
  $('#confirm-import').onclick=()=>{
    if(!importPreview)return;
    const result=mergeHistory(state.history,importPreview.history),restoreSettings=$('#import-settings').checked;
    const nextState={...state,history:result.history,
      ...(restoreSettings?{settings:{...importPreview.settings},progressAfter:new Date().toISOString()}: {})};
    if(!save(nextState))return;
    state=nextState;importPreview=null;render('progress');
    $('#import-status').textContent=`Import klar. ${result.added} nya pass, ${result.duplicates} dubbletter och ${result.updated} kompletterade uppföljningar.${restoreSettings?' Upplägget har återställts.':''}`;
  };
}
function partLabel(t){const e=exercises[t.ei];return `${e.name}${t.side?' · '+t.side.toLowerCase():''} · ${t.kind==='stretch'?'omgång':'set'} ${t.set} av ${t.sets}`}
function renderSession(){
  const t=step(),e=exercises[t.ei],next=session.steps[session.index+1];
  $('#nav').hidden=true;app.classList.add('session-view');
  const phase=passPaused?'Pausat':{ready:'Gör dig redo',up:'Upp',down:'Sänk långsamt',hold:'Håll kvar',manual:'Ditt eget tempo',rest:'Vila',done:'Bra, den delen är klar'}[session.phase];
  const finished=session.index+(session.phase==='done'?1:0);
  app.innerHTML=heading(`Övning ${t.ei+1} av 8`,e.name)+`
    <div class="row wrap"><span class="pill">${t.side?t.side+' · ':''}${t.kind==='stretch'?`Omgång ${t.set} av ${t.sets}`:`Set ${t.set} av ${t.sets}`}</span><span class="note">Del ${session.index+1} av ${session.steps.length}</span></div>
    <div class="progressbar" role="progressbar" aria-label="Passets framsteg" aria-valuemin="0" aria-valuemax="${session.steps.length}" aria-valuenow="${finished}"><i style="width:${100*finished/session.steps.length}%"></i></div>
    <section class="timer"><p class="phase" id="phase" role="status">${phase}</p><div class="ring"><div class="ring-inner" role="timer" aria-live="off"><strong id="digits">${session.phase==='ready'?(t.kind==='stretch'?t.seconds:t.reps):t.kind==='squat'&&session.phase==='manual'?session.rep:'—'}</strong><span id="timer-unit">${t.kind==='squat'?'repetitioner':session.phase==='ready'&&t.kind==='heel'?'repetitioner':'sekunder'}</span></div></div><p class="muted" id="count">${t.kind==='stretch'?'Andas lugnt':`Repetition ${session.rep} av ${t.reps}`}</p></section>
    <div class="session-primary" id="session-controls">${controls()}</div>
    ${soundControls()}
    <div class="session-meta"><p class="note">Passtid <strong id="elapsed">${formatDuration(passTime())}</strong></p><p class="note">${next?'Nästa: '+partLabel(next):'Sista delen · sedan följer du upp passet'}</p></div>
    <div class="exercise-guide">${imageButton(e,true)}<details class="session-instructions" ${session.phase==='ready'&&!passPaused?'open':''}><summary>Så gör du</summary><p>${e.text}</p><p class="note">${e.dose}</p>${e.video?`<a href="${esc(e.video)}" target="_blank" rel="noopener">Visa originalvideo ↗</a>`:''}</details></div>
    <div class="actions wrap">${!passPaused&&!running?button('pause-break','Pausa passet'):''}${button('cancel','Avbryt pass','danger')}</div>
    <div id="cancel-prompt">${cancelPrompt?`<div class="card"><p>Avbryta passet? Det räknas då inte som genomfört.</p><div class="actions">${button('confirm-cancel','Ja, avbryt','danger')}${button('keep','Stanna kvar')}</div></div>`:''}</div>
    ${imageDialog()}`;
  bindSession();paint();
}
function controls(){if(passPaused)return button('resume-pass','Fortsätt passet','primary');if(session.phase==='ready')return button('go',session.index?'Starta nästa del':'Starta övningen','primary');if(session.phase==='done')return button('next',session.index===session.steps.length-1?'Avsluta och följ upp':'Fortsätt →','primary');if(session.phase==='manual')return `${button('rep',`Klar med repetition ${session.rep}`,'primary')}<p class="note">Tryck efter varje knäböj. Ingen tid är föreskriven i PDF:en.</p>`;return button('pause',running?'Pausa':'Fortsätt','primary')}
function bindSession(){
  bindImages();bindSoundControls();const on=(id,f)=>{if($('#'+id))$('#'+id).onclick=f};
  on('pause-break',pause);
  on('resume-pass',()=>runWithSound(()=>{passPaused=false;wake();startClock();if(['up','down','hold','rest'].includes(session.phase))resume();else{persistDraft();renderSession()}}));
  on('go',()=>runWithSound(()=>{startClock();wake();if(step().kind==='squat'){session.phase='manual';persistDraft();beep('start');renderSession()}else begin(step().kind==='heel'?'up':'hold',step().kind==='heel'?1:step().seconds)}));
  on('pause',()=>{if(running)pause();else return runWithSound(()=>{wake();resume()})});
  on('rep',()=>runWithSound(()=>{if(session.rep<step().reps){session.rep++;persistDraft();beep('tick');renderSession()}else finishPart()}));
  on('next',()=>runWithSound(nextPart));
  on('cancel',()=>{pause();cancelPrompt=true;renderSession()});
  on('keep',()=>{cancelPrompt=false;renderSession()});
  on('confirm-cancel',()=>{if(!clearDraft())return;clearInterval(timer);running=false;stopClock();cancelSoundTest();soundAction++;audioPreparing=false;session=null;passPaused=false;release();render('home')});
}
function begin(phase,seconds){session.phase=phase;duration=seconds;remaining=seconds*1000;resume()}
function resume(){passPaused=false;startClock();deadline=performance.now()+remaining;running=true;lastSecond=Math.ceil(remaining/1000);clearInterval(timer);timer=setInterval(tick,60);persistDraft();renderSession();beep(session.phase==='up'?'up':session.phase==='down'?'down':'start')}
function pause(){soundAction++;audioPreparing=false;cancelSoundTest();passPaused=true;stopClock();if(running){remaining=Math.max(0,deadline-performance.now());running=false}clearInterval(timer);release();persistDraft();if(session)renderSession()}
function paint(){if(!session)return;const timed=['up','down','hold','rest'].includes(session.phase);if(timed){const secs=Math.ceil(Math.max(0,running?deadline-performance.now():remaining)/1000);$('#digits').textContent=secs;$('#timer-unit').textContent='sekunder';$('.ring').style.setProperty('--sweep',Math.min(100,100*(1-(running?deadline-performance.now():remaining)/(duration*1000)))+'%');}}
function tick(){if(!session||!running)return;if(performance.now()>=deadline){running=false;clearInterval(timer);remaining=0;if(session.phase==='up')begin('down',step().lower);else if(session.phase==='down'&&session.rep<step().reps){session.rep++;begin('up',1)}else if(session.phase==='rest'){session.phase='ready';persistDraft();renderSession();beep('restEnd')}else finishPart()}else{const second=Math.ceil(Math.max(0,deadline-performance.now())/1000);if(second!==lastSecond){lastSecond=second;if(['up','down'].includes(session.phase)&&second>0)beep('tick')}paint()}}
function finishPart(){running=false;clearInterval(timer);session.phase='done';persistDraft();release();beep('complete');renderSession()}
function nextPart(){startClock();const old=step();session.index++;session.rep=1;if(session.index>=session.steps.length){completed={id:crypto.randomUUID(),at:new Date().toISOString(),day:dayKey(),settings:session.settings,signature:signature(session.settings),next:null,durationMs:passTime()};stopClock();session=null;persistDraft();release();location.hash='complete';render('complete');return}if(step().ei===old.ei&&step().set!==old.set&&session.settings.rest>0)begin('rest',session.settings.rest);else{session.phase='ready';persistDraft();renderSession();window.scrollTo(0,0)}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelSoundTest();if(document.hidden&&session){pause();notice('Passet pausades när du lämnade appen. Fortsätt när du är redo.')}});
window.addEventListener('pagehide',()=>{cancelSoundTest();if(session)pause()});window.addEventListener('beforeunload',e=>{if((session||completed)&&!persistDraft()){e.preventDefault();e.returnValue=''}});
window.addEventListener('hashchange',()=>{if(!session)render(undefined,true)});
// Keep the completion questionnaire until it is answered, even if navigation changes.
window.addEventListener('hashchange',()=>{if(completed&&!session)render('complete')});
loadDraft();
setInterval(()=>{if(session&&activeSince!==null){persistDraft();if($('#elapsed'))$('#elapsed').textContent=formatDuration(passTime())}},1000);
render();if(unreadStorage!==null)showRecovery();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
