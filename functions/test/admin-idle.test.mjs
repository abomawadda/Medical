import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('../../js/admin-idle.js');
function fixture(overrides={}){let time=1000000,calls=0,expired=0,warnings=[];const control=create({now:()=>time,renew:async()=>{calls++;},expire:()=>expired++,warn:value=>warnings.push(value),...overrides});control.start(time);return {control,advance:ms=>time+=ms,calls:()=>calls,expired:()=>expired,warnings};}
test('idle ticks and background polling never renew, warning precedes expiry at ten minutes',async()=>{
  const f=fixture();f.advance(540000);await f.control.tick();assert.equal(f.calls(),0);assert.equal(f.warnings.at(-1),60);
  f.advance(60000);await f.control.tick();await f.control.tick();assert.equal(f.expired(),1);assert.equal(f.calls(),0);
});
test('typing over a long work session renews at a bounded rate and expires after inactivity',async()=>{
  const f=fixture();for(let i=0;i<25;i++){f.advance(30000);await f.control.activity();await f.control.tick();}
  assert.equal(f.expired(),0);assert.ok(f.calls()>=10 && f.calls()<=13);
  f.advance(600000);assert.equal(f.control.check(),true);assert.equal(f.expired(),1);
});
test('returning from sleep cannot turn an expired idle session into an active one',async()=>{
  const f=fixture();f.advance(600001);await f.control.activity(true);assert.equal(f.expired(),1);assert.equal(f.calls(),0);
});
test('hidden tabs cannot renew pending activity and overlapping activity uses one request',async()=>{
  let resolve;const f=fixture({renew:()=>new Promise(r=>resolve=r)});
  f.advance(10000);await f.control.activity();f.advance(40000);await f.control.tick(false);assert.equal(resolve,undefined);
  const request=f.control.activity();await Promise.resolve();await f.control.activity();assert.equal(typeof resolve,'function');
  resolve();await request;
});

test('restoring near the deadline permits immediate renewal on genuine activity',async()=>{
  const f=fixture();f.advance(585000);f.control.start(1000000);await f.control.activity();assert.equal(f.calls(),1);assert.equal(f.expired(),0);
});

test('a delayed foreground timer cannot renew activity that happened many minutes earlier',async()=>{
  const f=fixture();f.advance(10000);await f.control.activity();f.advance(540000);await f.control.tick();assert.equal(f.calls(),0);assert.equal(f.expired(),0);
});

test('logout cancels queued activity before it can renew a different session',async()=>{
  const f=fixture();f.advance(60000);const pending=f.control.activity();f.control.stop();await pending;assert.equal(f.calls(),0);
});
