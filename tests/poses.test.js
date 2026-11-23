import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exercises} from '../dist/model.js';
import {exercisePose,poseAssets,poseOptions,allPoses} from '../dist/poses.js';

test('all eight pose sheets exist, use WebP, and have valid frame selections',()=>{
  assert.equal(poseAssets.length,8);
  for(const e of exercises){
    const file=readFileSync(new URL('../dist/'+poseAssets[e.img],import.meta.url));
    assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WEBP');
    for(const phase of ['ready','up','down','hold','manual','rest','done']){
      const p=exercisePose(e,phase);assert.equal(p.src,poseAssets[e.img]);
      assert(p.frames.every(frame=>frame>=0&&frame<p.columns));
    }
  }
});
test('heel images preview the next movement throughout its preparation second',()=>{
  const heel=exercises[0];
  assert.deepEqual(exercisePose(heel,'ready').frames,[0]);
  for(const [phase,frame] of [['up',1],['down',2]]){
    assert.deepEqual(exercisePose(heel,phase).frames,[frame]);
    assert.deepEqual(exercisePose(heel,'transition',phase),exercisePose(heel,phase));
  }
  assert.deepEqual(exercisePose(heel,'rest').frames,[0]);
});
test('stretch images keep the hold pose through preparation and timed hold, reset on completion',()=>{
  for(const e of exercises.filter(e=>e.kind==='stretch')){
    assert.deepEqual(exercisePose(e,'ready').frames,[0]);
    assert.deepEqual(exercisePose(e,'transition','hold').frames,[1]);
    assert.deepEqual(exercisePose(e,'hold').frames,[1]);
    assert.deepEqual(exercisePose(e,'done').frames,[0]);
  }
});
test('manual squats show both positions together without inventing a movement timer',()=>{
  const squat=exercises[7];
  assert.deepEqual(exercisePose(squat,'ready').frames,[0]);
  assert.deepEqual(exercisePose(squat,'manual').frames,[0,1]);
  assert.deepEqual(exercisePose(squat,'transition','manual').frames,[0,1]);
});

test('pose gallery provides every frame in order and individual named choices for each exercise',()=>{
  for(const e of exercises){
    const options=poseOptions(e),all=allPoses(e);
    assert.equal(options.length,e.kind==='heel'?3:2);
    assert.deepEqual(all.frames,options.map((_,i)=>i));
    options.forEach((pose,i)=>{assert.deepEqual(pose.frames,[i]);assert.equal(pose.src,all.src);assert(pose.label.length>0)});
  }
});
