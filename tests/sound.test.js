import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SoundPlayer} from '../dist/sound.js';

function context(state = 'suspended') {
  const nodes = [];
  const audio = {state, currentTime:10, destination:{}, nodes, resumeCalls:0, closed:false,
    async resume(){this.resumeCalls++;this.state='running';this.onstatechange?.()},
    async close(){this.closed=true;this.state='closed'},
    createOscillator(){
      const node={frequency:{setValueAtTime(value,time){node.frequencyValue=value;node.frequencyTime=time}},
        connect(target){node.target=target},disconnect(){node.disconnected=true},
        start(time){node.startTime=time},stop(time){node.stopTime=time;node.stopped=true}};
      nodes.push(node);return node;
    },
    createGain(){
      return {gain:{setValueAtTime(){},linearRampToValueAtTime(value){this.peak=value},exponentialRampToValueAtTime(){}},
        connect(target){this.target=target},disconnect(){this.disconnected=true}};
    }};
  return audio;
}

test('sound waits for asynchronous browser activation and shares one activation request',async()=>{
  const audio=context();let activate;
  audio.resume=()=>{audio.resumeCalls++;return new Promise(resolve=>{activate=()=>{audio.state='running';resolve()}})};
  const player=new SoundPlayer({createContext:()=>audio});
  assert.equal(player.play('up'),false);
  const pending=player.unlock();assert.equal(player.unlock(),pending);
  assert.equal(audio.resumeCalls,1);assert.equal(player.play('up'),false);assert.equal(audio.nodes.length,0);
  activate();assert.equal(await pending,true);assert.equal(player.play('up'),true);
  assert.equal(audio.nodes.length,1);assert.equal(audio.nodes[0].frequencyValue,760);
  assert.ok(audio.nodes[0].target.gain.peak>0);assert.equal(audio.nodes[0].target.target,audio.destination);
});

test('the finish signal has two notes; stopping cancels and disconnects every voice',async()=>{
  const audio=context('running'),player=new SoundPlayer({createContext:()=>audio});await player.unlock();
  player.play('complete');assert.equal(audio.nodes.length,2);
  assert.ok(audio.nodes[1].startTime>audio.nodes[0].startTime);
  player.stop();assert.equal(player.voices.size,0);
  assert.ok(audio.nodes.every(node=>node.stopTime===undefined&&node.disconnected&&node.target.disconnected));
});

test('interrupted or closed contexts are replaced on the next user activation',async()=>{
  const first=context('running'),second=context('running'),third=context('running'),contexts=[first,second,third];
  const player=new SoundPlayer({createContext:()=>contexts.shift()});await player.unlock();
  first.state='interrupted';assert.equal(await player.unlock(),true);assert.equal(first.closed,true);
  player.play('down');assert.equal(first.nodes.length,0);assert.equal(second.nodes.length,1);
  second.state='closed';assert.equal(await player.unlock(),true);player.play('up');assert.equal(third.nodes.length,1);
});

test('rejected browser activation reports failure and can be retried',async()=>{
  const audio=context(),states=[];audio.resume=()=>Promise.reject(Error('Not allowed'));
  const player=new SoundPlayer({createContext:()=>audio,onState:state=>states.push(state)});
  assert.equal(await player.unlock(),false);assert.equal(states.at(-1),'blocked');assert.equal(player.play('test'),false);
  audio.resume=async()=>{audio.state='running'};
  assert.equal(await player.unlock(),true);assert.equal(player.play('test'),true);
});

test('missing browser support is reported without throwing',async()=>{
  const states=[],player=new SoundPlayer({createContext:()=>{throw Object.assign(Error(),{name:'NotSupportedError'})},onState:state=>states.push(state)});
  assert.equal(await player.unlock(),false);assert.equal(states.at(-1),'unsupported');assert.equal(player.play(),false);
});

test('a browser that never resumes does not leave the app waiting forever',async()=>{
  const audio=context();audio.resume=()=>new Promise(()=>{});
  const player=new SoundPlayer({createContext:()=>audio,timeoutMs:5});
  assert.equal(await player.unlock(),false);assert.equal(player.pending,null);assert.equal(player.play(),false);
});
