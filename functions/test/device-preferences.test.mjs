import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),D=require('../../js/device-preferences.js'),at=Date.parse('2026-10-23T10:00:00Z');
const fixture=()=>{const entries=new Map([['session','opaque-session'],['favorites','opaque-favorites']]);const storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};return {entries,storage,store:D.create({storage,now:()=>at})};};

test('device preferences do not write without explicit save and clearing is narrowly scoped',()=>{
 const f=fixture(),before=[...f.entries];assert.equal(f.store.read().status,'session');assert.deepEqual([...f.entries],before);
 assert.equal(f.store.save({size:'large',contrast:true}).status,'saved');assert.equal(f.store.read().reading.size,'large');
 assert.equal(f.store.clear().status,'session');assert.deepEqual([...f.entries],before);
});
test('saving projects four presentation choices and never persists member, search, position or review data',()=>{
 const f=fixture();f.store.save({size:'larger',contrast:true,compact:true,calm:true,name:'PRIVATE',query:'PRIVATE',coordinates:[1,2],comment:'PRIVATE',session:'PRIVATE'});
 const raw=f.entries.get(D.key);assert.ok(!raw.includes('PRIVATE'));assert.deepEqual(JSON.parse(raw),{version:1,savedAt:at,reading:{size:'larger',contrast:true,compact:true,calm:true}});
});
test('retention is exactly ninety days from last explicit save; future or invalid timestamps are rejected',()=>{
 const f=fixture();f.store.save({size:'large'});const raw=f.entries.get(D.key);
 assert.ok(D.decode(raw,at+D.retention-1));assert.equal(D.decode(raw,at+D.retention),null);assert.equal(D.decode(raw,at-1),null);
 for(const savedAt of [0,-1,1.5,'1',Number.MAX_SAFE_INTEGER])assert.equal(D.decode(JSON.stringify({...JSON.parse(raw),savedAt}),at),null);
 const later=D.create({storage:f.storage,now:()=>at+D.retention});assert.equal(later.read().status,'discarded');assert.equal(f.entries.has(D.key),false);assert.equal(f.entries.get('session'),'opaque-session');
});
test('malformed, unversioned, extended and unsupported records are removed rather than migrated or displayed',()=>{
 const f=fixture(),normal={version:1,savedAt:at,reading:D.defaults()};
 for(const value of ['{bad','x'.repeat(401),JSON.stringify({...normal,version:2}),JSON.stringify({...normal,member:'PRIVATE'}),JSON.stringify({...normal,reading:{...normal.reading,query:'PRIVATE'}}),JSON.stringify({...normal,reading:{...normal.reading,calm:'true'}}),JSON.stringify({...normal,reading:{...normal.reading,size:'999px'}})]){f.entries.set(D.key,value);assert.equal(f.store.read().status,'discarded');assert.equal(f.entries.has(D.key),false);}
});
test('storage denial, quota, silent write failure and failed removal stay explicit and do not break the session',()=>{
 const denied=D.create({storage:()=>{throw new Error('blocked');}});assert.equal(denied.read().status,'blocked');assert.equal(denied.save({}).status,'blocked');assert.equal(denied.clear().status,'blocked');
 const f=fixture();const failed=D.create({storage:{...f.storage,setItem:()=>{throw new Error('quota');}},now:()=>at});assert.equal(failed.save({}).status,'blocked');assert.equal(f.entries.get('session'),'opaque-session');
 const silent=D.create({storage:{...f.storage,setItem:()=>{}},now:()=>at});assert.equal(silent.save({}).status,'blocked');
 f.store.save({});const removal=D.create({storage:{...f.storage,removeItem:()=>{throw new Error('blocked');}},now:()=>at+D.retention});assert.equal(removal.read().status,'blocked');assert.equal(f.entries.has(D.key),true);
});
test('permission inspection only queries status and does not obtain location or request notification permission',async()=>{
 let queries=0;const forbidden=()=>assert.fail('Permission inspection must not request access');
 const result=await D.permissions({navigator:{permissions:{query:async descriptor=>{assert.deepEqual(descriptor,{name:'geolocation'});queries++;return {state:'denied'};}},geolocation:{getCurrentPosition:forbidden},serviceWorker:{register:forbidden}},Notification:{permission:'default',requestPermission:forbidden},matchMedia:query=>{assert.equal(query,'(display-mode: standalone)');return {matches:false};}});
 assert.deepEqual(result,{location:'denied',notifications:'default',installed:false});assert.equal(queries,1);
});
test('missing, rejected and unfamiliar permission APIs show unknown or unsupported without claiming installation',async()=>{
 assert.deepEqual(await D.permissions(),{location:'unknown',notifications:'unsupported',installed:null});
 assert.deepEqual(await D.permissions({navigator:{permissions:{query:async()=>{throw new Error('unsupported');}}},Notification:{permission:'unrecognized'},matchMedia:()=>{throw new Error('unsupported');}}),{location:'unknown',notifications:'unknown',installed:null});
 assert.equal((await D.permissions({navigator:{standalone:true},matchMedia:()=>({matches:false})})).installed,true);
});
