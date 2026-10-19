import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('../../js/install.js');
function fixture({standalone=false,stored=false,probe,probeTimeout=30}={}){
 const events=new EventTarget(),media=new EventTarget(),data=new Map(stored?[['medical_install_confirmed_v1','1']]:[]),messages=[];
 media.matches=standalone;
 const host={addEventListener:(...a)=>events.addEventListener(...a),removeEventListener:(...a)=>events.removeEventListener(...a),matchMedia:q=>{assert.equal(q,'(display-mode: standalone)');return media;}};
 const navigator={};if(probe)navigator.getInstalledRelatedApps=probe;
 const controller=create({host,navigator,manifestURL:'https://app.example.invalid/Medical/manifest.json?v=1',storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},onInstalled:()=>messages.push('installed'),probeTimeout});
 const offer=(outcome='accepted',prompt=async()=>{})=>{const e=new Event('beforeinstallprompt',{cancelable:true});Object.assign(e,{prompt,userChoice:Promise.resolve({outcome})});events.dispatchEvent(e);assert.equal(e.defaultPrevented,true);};
 return {controller,events,media,data,messages,offer};
}
test('accepted native prompt waits for actual appinstalled confirmation; repeated clicks report already installed',async()=>{
 const f=fixture();let prompts=0;f.offer('accepted',async()=>prompts++);
 const pending=f.controller.install();assert.equal(prompts,1,'prompt retains user activation before any await');
 assert.equal((await pending).status,'pending');assert.equal(f.controller.state().installed,false);assert.equal(f.data.size,0);assert.equal(f.messages.length,0);
 f.events.dispatchEvent(new Event('appinstalled'));assert.equal(f.controller.state().installed,true);assert.equal(f.data.get('medical_install_confirmed_v1'),'1');assert.equal(f.messages.length,1);
 assert.equal((await f.controller.install()).status,'already');f.events.dispatchEvent(new Event('appinstalled'));assert.equal(f.messages.length,1);
 f.offer();assert.equal(f.controller.state().installed,false,'a fresh browser offer supersedes stale installation knowledge');assert.equal(f.controller.state().ready,true);f.controller.dispose();
});
test('dismissal and prompt errors never declare installation or reuse a consumed native prompt',async()=>{
 const f=fixture();let count=0;f.offer('dismissed',async()=>count++);assert.equal((await f.controller.install()).status,'dismissed');assert.equal((await f.controller.install()).status,'manual');assert.equal(count,1);assert.equal(f.data.size,0);
 f.offer('accepted',async()=>{throw new Error('not allowed');});assert.equal((await f.controller.install()).status,'manual');assert.equal(f.controller.state().busy,false);assert.equal(f.messages.length,0);f.controller.dispose();
});
test('double clicks cannot open two prompts while the native choice is unresolved',async()=>{
 const f=fixture();let resolvePrompt,count=0;f.offer('accepted',()=>{count++;return new Promise(r=>resolvePrompt=r);});const first=f.controller.install();assert.equal((await f.controller.install()).status,'busy');resolvePrompt();await first;assert.equal(count,1);f.controller.dispose();
});
test('stored installation history alone is not proof, and standalone execution is verified',async()=>{
 const f=fixture({stored:true});assert.deepEqual(await f.controller.install(),{status:'manual',history:true});assert.equal(f.controller.state().installed,false);f.media.matches=true;assert.equal((await f.controller.install()).status,'already');assert.equal(f.messages.length,0);f.controller.dispose();
});
test('related-app checks accept only this exact web manifest and ignore other apps or native packages',async()=>{
 const no=fixture({probe:async()=>[{platform:'play',url:'https://app.example.invalid/Medical/manifest.json'},{platform:'webapp',url:'https://other.example.invalid/manifest.json'}]});assert.equal((await no.controller.install()).status,'manual');no.controller.dispose();
 const yes=fixture({probe:async()=>[{platform:'webapp',url:'https://app.example.invalid/Medical/manifest.json?v=old'}]});assert.equal((await yes.controller.install()).status,'already');assert.equal(yes.messages.length,0);yes.controller.dispose();
});
test('unsupported, failed, timed out and stale probes fall back without inventing success',async()=>{
 for(const probe of [async()=>{throw new Error('unsupported');},()=>new Promise(()=>{})]){const f=fixture({probe,probeTimeout:5});assert.equal((await f.controller.install()).status,'manual');assert.equal(f.messages.length,0);f.controller.dispose();}
 let resolveProbe;const f=fixture({probe:()=>new Promise(r=>resolveProbe=r)});const pending=f.controller.check();f.offer();resolveProbe([{platform:'webapp',url:'https://app.example.invalid/Medical/manifest.json'}]);await pending;assert.equal(f.controller.state().installed,false);assert.equal(f.controller.state().ready,true);f.controller.dispose();
});

test('first verified standalone launch confirms installation once, including browsers without appinstalled',async()=>{
 const f=fixture({standalone:true});await f.controller.check();assert.deepEqual(f.messages,['installed']);await f.controller.check();assert.equal(f.messages.length,1);assert.equal((await f.controller.install()).status,'already');assert.equal(f.data.get('medical_install_confirmed_v1'),'1');f.controller.dispose();
});
