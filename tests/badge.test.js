import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BadgeController} from '../dist/badge.js';
function fixture({enabled=false,permission='default',installed=true}={}){
  const calls=[],saved=[];let requests=0;
  const notification={permission,async requestPermission(){requests++;notification.permission='granted';return 'granted'}};
  const navigator={async setAppBadge(n){calls.push(n)},async clearAppBadge(){calls.push(0)}};
  const badge=new BadgeController({navigator,notification,installed:()=>installed,enabled,save:v=>saved.push(v)});
  return {badge,calls,saved,notification,navigator,get requests(){return requests}};
}
test('no automatic permission prompts or icon changes before explicit opt-in',async()=>{
  const f=fixture();await f.badge.sync(8);assert.equal(f.requests,0);assert.deepEqual(f.calls,[]);
  const permissionGranted=fixture({permission:'granted'});await permissionGranted.badge.sync(8);assert.deepEqual(permissionGranted.calls,[]);
});
test('enable requests permission in the click turn and writes the actual remaining count',async()=>{
  const f=fixture();const activation=f.badge.enable(7);assert.equal(f.requests,1);
  assert.equal(await activation,true);assert.deepEqual(f.calls,[7]);assert.deepEqual(f.saved,[true]);
  assert.equal(f.badge.status,'enabled');
});
test('restored opt-in syncs once per count, clears zero, then resets next day without asking again',async()=>{
  const f=fixture({enabled:true,permission:'granted'});
  await f.badge.sync(8);await f.badge.sync(8);await f.badge.sync(7);await f.badge.sync(0);await f.badge.sync(8);
  assert.deepEqual(f.calls,[8,7,0,8]);assert.equal(f.requests,0);
});
test('unsupported or noninstalled apps never request permission or break the daily counter',async()=>{
  const f=fixture({installed:false});assert.equal(f.badge.status,'install');assert.equal(await f.badge.enable(8),false);assert.equal(f.requests,0);
  const unsupported=new BadgeController({navigator:{},installed:()=>true});assert.equal(unsupported.status,'unsupported');await unsupported.sync(8);
});
test('permission denial does not save opt-in or write a badge',async()=>{
  const f=fixture();f.notification.requestPermission=async()=>{f.notification.permission='denied';return 'denied'};
  assert.equal(await f.badge.enable(8),false);assert.equal(f.badge.status,'denied');assert.deepEqual(f.saved,[]);assert.deepEqual(f.calls,[]);
});
test('an old in-flight write cannot restore a badge after disabling',async()=>{
  const f=fixture({enabled:true,permission:'granted'});let finish;
  f.navigator.setAppBadge=n=>{f.calls.push(n);return new Promise(resolve=>{finish=resolve})};
  const write=f.badge.sync(8);await Promise.resolve();const disable=f.badge.disable();finish();await Promise.all([write,disable]);
  assert.deepEqual(f.calls,[8,0]);assert.deepEqual(f.saved,[false]);await f.badge.sync(6);assert.deepEqual(f.calls,[8,0]);
});
test('a late write is followed by the latest count, skipping obsolete intermediate updates',async()=>{
  const f=fixture({enabled:true,permission:'granted'});let finish;
  f.navigator.setAppBadge=n=>{f.calls.push(n);return new Promise(resolve=>{finish=resolve})};
  const first=f.badge.sync(8);await Promise.resolve();f.badge.sync(7);f.badge.sync(0);finish();await first;
  assert.deepEqual(f.calls,[8,0]);
});
test('platform errors stay contained and explicit retry recovers',async()=>{
  const f=fixture({enabled:true,permission:'granted'});f.navigator.setAppBadge=async()=>{throw Error('Unavailable')};
  await f.badge.sync(8);assert.equal(f.badge.status,'error');await f.badge.sync(8);
  f.navigator.setAppBadge=async n=>f.calls.push(n);assert.equal(await f.badge.enable(8),true);assert.deepEqual(f.calls,[8]);
});
