import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {roadmapLabService,roadmapFeatures,refKey} from '../src/lab-roadmap.mjs';
import {ApiError} from '../src/core.mjs';
import {fixtureStore} from './memory-store.mjs';
const require=createRequire(import.meta.url),C=require('../../js/care-model.js'),M=require('../../js/directory-preview-model.js'),facilities=require('../src/facility-directory.cjs'),search=require('../../js/search.js'),contacts=require('../src/contacts.cjs');
const row=(id,more={})=>({id,name:'جهة مصطنعة '+id,provider_id:id,markaz:'طلخا',specialty:'باطنة',network_members:['employee'],address:'عنوان مصطنع '+id,service_status:'active',...more});
const ref=(id='one',network='employee')=>({target_id:'doctor:'+id,branch_id:id,network});
function fixture(){
 const catalog={records:[row('one'),row('two'),row('far',{markaz:'المنصورة'}),row('paused',{service_status:'suspended'}),row('other',{specialty:'جلدية'}),row('family',{network_members:['family','retiree']})],hospitals:[],labs:[],radiology:[],pharmacies:[],specialized_centers:[]},store=fixtureStore(catalog);
 let live=true,time=Date.UTC(2026,9,21,10),reads=0;
 const service=roadmapLabService({store,now:()=>time++,readDirectory:async()=>{reads++;return {catalog:structuredClone(catalog)};},authorize:async token=>{if(!token)throw new ApiError(401,'UNAUTHORIZED','');if(token==='member'||!live)throw new ApiError(403,'FORBIDDEN','');return {sourceId:token};}});
 const save=async(op,payload={},id='care_companion',extra={})=>service.saveLabWorkspace('admin-a',id,{expected_version:(await service.labWorkspace('admin-a',id)).version,previewRevision:roadmapFeatures.find(f=>f.id===id).previewRevision,request_id:randomBytes(16).toString('hex'),operation:op,payload,...extra});
 return {catalog,store,service,save,directoryReads:()=>reads,advance:ms=>{time+=ms;},revoke:()=>{live=false;}};
}
const draft=(id='a'.repeat(32),extra={})=>({id,title:'إجراء مصطنع للاختبار',type:'appointment',network:'employee',source_reference:'مرجع توضيحي فقط',source_url:'https://example.invalid/policy',source_date:'2026-10-20',authority:'جهة اختبار',responsible:'مسؤول مثال',steps:['خطوة توضيحية فقط'],status:'ready',valid_from:'2026-01-01',valid_until:'',review_by:'2027-01-01',documents:['متطلب توضيحي'],submission_channel:'قناة مصطنعة',service_window:'',...extra});
const reject=(action,code)=>assert.rejects(action,e=>e.code===code);

test('roadmap workspaces authorize every operation, isolate administrators and never write public/member/source data',async()=>{
 const f=fixture(),before=await f.store.catalog();
 for(const token of ['', 'member'])for(const call of [()=>f.service.labWorkspace(token,'care_companion'),()=>f.service.saveLabWorkspace(token,'care_companion',{})])await assert.rejects(call,e=>e.status===(token?403:401));
 await f.save('follow',{ref:ref()});assert.equal((await f.service.labWorkspace('admin-b','care_companion')).state.follows.length,0);
 assert.equal((await f.service.labWorkspace('admin-a','service_planning')).state.drafts.length,0);
 const p=await f.service.labWorkspace('admin-a','care_companion');assert.equal(p.memberEnabled,false);assert.equal(p.bookingConnected,false);assert.equal(p.sandboxOnly,true);
 assert.deepEqual(await f.store.catalog(),before);assert.equal(f.store.reviews.size,0);assert.equal(f.store.profileNotes.size,0);assert.equal(f.store.overlays.size,0);
 assert.equal(f.store.audit[0].action,'lab.workspace');assert.ok(f.store.audit[0].at);assert.ok(!JSON.stringify(f.store.audit).includes('عنوان'));
 f.revoke();await assert.rejects(()=>f.service.labWorkspace('admin-a','care_companion'),e=>e.status===403);
});
test('workspace transactions reject changed replay intents, stale/concurrent edits and a pause inside the transaction',async()=>{
 const f=fixture(),body={expected_version:0,previewRevision:roadmapFeatures[0].previewRevision,request_id:'b'.repeat(32),operation:'follow',payload:{ref:ref()}};
 const results=await Promise.all([1,2].map(()=>f.service.saveLabWorkspace('admin-a','care_companion',body)));assert.equal(results.filter(r=>r.changed).length,1);
 await reject(()=>f.service.saveLabWorkspace('admin-a','care_companion',{...body,payload:{ref:ref('two')}}),'LAB_REQUEST_REUSED');
 await reject(()=>f.save('follow',{ref:ref('two')},'care_companion',{expected_version:0}),'LAB_WORKSPACE_CONFLICT');
 const concurrent=await Promise.allSettled(['two','far'].map(id=>f.save('follow',{ref:ref(id)},'care_companion',{expected_version:1})));assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
 const transact=f.store.labWorkspaceTransact;f.store.labWorkspaceTransact=(...args)=>{f.store.labRows.set('care_companion',{previewEnabled:false});return transact(...args);};await reject(()=>f.save('follow',{ref:ref('other')}),'LAB_PAUSED');
 await reject(()=>f.service.labWorkspace('admin-a','care_companion'),'LAB_PAUSED');
});
test('follow scan ignores routine saves, records meaningful changes once, handles withdrawn/restored network, and labels simulations',async()=>{
 const f=fixture();await f.save('follow',{ref:ref()});f.catalog.records[0]._version=22;f.catalog.records[0].updated_at='new timestamp';
 assert.equal((await f.save('scan')).changed,false);f.catalog.records[0].address='عنوان جديد مصطنع';let w=(await f.save('scan')).workspace;assert.deepEqual(w.state.events[0].fields,['address']);assert.equal(w.state.events[0].simulated,false);
 assert.equal((await f.save('scan')).changed,false);await f.save('simulate',{ref:ref(),field:'hours'});w=await f.service.labWorkspace('admin-a','care_companion');assert.equal(w.state.events.at(-1).simulated,true);
 const event=w.state.events[0];await f.save('read_event',{id:event.id});assert.ok((await f.service.labWorkspace('admin-a','care_companion')).state.events[0].readAt);
 await reject(()=>f.service.saveLabWorkspace('admin-b','care_companion',{expected_version:0,previewRevision:roadmapFeatures[0].previewRevision,request_id:'c'.repeat(32),operation:'read_event',payload:{id:event.id}}),'LAB_EVENT_NOT_FOUND');
 f.catalog.records[0].network_members=['family'];w=(await f.save('scan')).workspace;assert.deepEqual(w.state.events.at(-1).fields,['availability']);assert.equal(w.state.follows[0].available,false);assert.equal((await f.save('scan')).changed,false);
 f.catalog.records[0].network_members=['employee'];w=(await f.save('scan')).workspace;assert.equal(w.state.follows[0].available,true);await f.save('unfollow',{ref:ref()});
 assert.equal((await f.service.labWorkspace('admin-a','care_companion')).state.follows.length,0);
});
test('care reference validation, network/availability and journey order prevent wrong-network routes and injected identifiers',async()=>{
 const f=fixture();await reject(()=>f.save('journey_add',{ref:ref('paused')}),'LAB_TARGET_PAUSED');await reject(()=>f.save('follow',{ref:ref('one','family')}),'LAB_TARGET_UNAVAILABLE');
 await f.save('journey_add',{ref:ref()});await f.save('journey_add',{ref:ref('two')});assert.equal((await f.save('journey_add',{ref:ref('two')})).changed,false);
 await reject(()=>f.save('journey_add',{ref:ref('family','family')}),'LAB_JOURNEY_NETWORK');
 await reject(()=>f.save('reorder',{keys:[refKey(ref()),refKey(ref())]}),'INVALID_LAB_WORKSPACE');
 await f.save('reorder',{keys:[refKey(ref('two')),refKey(ref())]});assert.equal((await f.service.labWorkspace('admin-a','care_companion')).state.journey[0].branch_id,'two');
 f.catalog.records=f.catalog.records.filter(r=>r.id!=='two');await f.save('journey_remove',{ref:ref('two')});assert.equal((await f.service.labWorkspace('admin-a','care_companion')).state.journey.length,1);
 for(const payload of [{ref:{...ref(),role:'admin'}},{ref:ref(),latitude:31}])await reject(()=>f.save('follow',payload),'INVALID_LAB_WORKSPACE');
 await reject(()=>f.save('scan',{query:'secret raw query'}),'INVALID_LAB_WORKSPACE');
});
test('preview pins require a source, real calendar date and explicit confirmation; feedback only accepts preset fields',async()=>{
 const f=fixture(),pin={ref:ref(),lat:31.04,lng:31.38,source_url:'https://example.invalid/location',checked_at:'2026-10-20',confirmed:true};
 for(const extra of [{lat:0},{lng:100},{lat:'31'},{source_url:'javascript:alert(1)'},{source_url:'https://user:pass@example.invalid/'},{checked_at:'2026-02-30'},{checked_at:'2026-10-25'},{confirmed:false},{member_id:'a'}])await reject(()=>f.save('pin',{...pin,...extra}),extra.member_id?'INVALID_LAB_WORKSPACE':'INVALID_LAB_PIN');
 await f.save('pin',pin);const w=await f.service.labWorkspace('admin-a','care_companion');assert.equal(w.state.pins[0].previewOnly,true);await f.save('remove_pin',{ref:ref()});assert.equal((await f.service.labWorkspace('admin-a','care_companion')).state.pins.length,0);
 await f.save('feedback',{reason:'missing_service',network:'employee',city:'طلخا',specialty:'باطنة'});
 await reject(()=>f.save('feedback',{reason:'missing_service',network:'employee',city:'طلخا',specialty:'باطنة',comment:'health data'}),'INVALID_LAB_WORKSPACE');
 await reject(()=>f.save('feedback',{reason:'missing_service',network:'employee',city:'مدينة غير موجودة',specialty:''}),'INVALID_LAB_WORKSPACE');
});
test('planning requires sourced procedures, freezes the meaning of a used draft and distinguishes requests from bookings',async()=>{
 const f=fixture(),id='service_planning',d=draft();
 await reject(()=>f.save('save_draft',draft(d.id,{source_reference:'',source_url:''}),id),'LAB_SOURCE_REQUIRED');
 await reject(()=>f.save('save_draft',draft(d.id,{steps:[]}),id),'LAB_SOURCE_REQUIRED');
 for(const extra of [{source_date:'2026-02-30'},{source_date:'2026-10-25'},{source_url:'http://example.invalid/'},{title:'<script>'},{member_id:'real'}])await reject(()=>f.save('save_draft',draft(d.id,extra),id),'INVALID_LAB_DRAFT');
 await f.save('save_draft',d,id);const c={id:'d'.repeat(32),draft_id:d.id};await f.save('create_case',c,id);assert.equal((await f.save('create_case',c,id)).changed,false);
 let w=await f.service.labWorkspace('admin-a',id);assert.equal(w.state.cases[0].bookingConfirmed,false);assert.equal(w.state.cases[0].syntheticOnly,true);
 await reject(()=>f.save('save_draft',draft(d.id,{title:'محتوى مختلف'}),id),'LAB_DRAFT_IN_USE');
 await f.save('save_draft',draft('e'.repeat(32),{title:'مراجعة ثانية مصطنعة'}),id);
 await reject(()=>f.save('case_status',{id:c.id,status:'confirmed'},id),'INVALID_LAB_CASE');
 await reject(()=>f.save('case_status',{id:c.id,status:'completed'},id),'LAB_CASE_TRANSITION');
 await f.save('save_role',{id:'8'.repeat(32),label:'دور اختبار',channel:'قناة اختبار'},id);await f.save('assign_case',{id:c.id,role_id:'8'.repeat(32),follow_up_at:'2026-10-21'},id);
 for(const status of ['review','needs_info','review','completed'])await f.save('case_status',{id:c.id,status,...(status==='needs_info'?{reason:'source',items:[]}:{})},id);
 w=await f.service.labWorkspace('admin-a',id);assert.equal(w.state.cases[0].history.length,6);assert.equal(w.state.cases[0].draft_revision,1);
 await reject(()=>f.save('case_status',{id:c.id,status:'review'},id),'LAB_CASE_TRANSITION');
 await f.save('save_draft',draft(d.id,{status:'archived'}),id);await reject(()=>f.save('create_case',{id:'f'.repeat(32),draft_id:d.id},id),'LAB_DRAFT_NOT_READY');
});
test('pure care alternatives honor identity, specialty, availability, city and exact beneficiary network',()=>{
 const f=fixture(),model=M.create({catalog:f.catalog,stats:{},facilityStats:{}},{facilities,search,contacts});
 assert.deepEqual(C.alternatives(model,ref()).map(e=>e.p.id),['doctor:two']);assert.deepEqual(C.alternatives(model,ref(),true).map(e=>e.p.id).sort(),['doctor:far','doctor:two']);
 f.catalog.records.push(row('second-branch',{provider_id:'one'}));const multi=M.create({catalog:f.catalog,stats:{},facilityStats:{}},{facilities,search,contacts});assert.equal(C.entries(multi,'employee','جهة مصطنعة one').filter(e=>e.p.id==='doctor:one').length,2);assert.equal(C.entries(multi,'employee','عنوان مصطنع second-branch').filter(e=>e.p.id==='doctor:one').length,1);
 assert.equal(C.entries(model,'family').length,1);assert.equal(C.entries(model,'retiree').length,1);assert.equal(C.entries(model,'employee','جهة مصطنعة one').some(e=>e.ref.branch_id==='family'),false);
});
test('distance and routes stay explicit, optional and bounded; stale or suspended preview pins do not qualify',()=>{
 const f=fixture(),model=M.create({catalog:f.catalog,stats:{},facilityStats:{}},{facilities,search,contacts}),point={lat:31,lng:31};
 assert.equal(C.distance(point,point),0);assert.ok(Math.abs(C.distance(point,{lat:32,lng:31})-111.195)<.01);assert.equal(C.distance(point,{lat:100,lng:31}),null);
 const pins=[{ref:ref('one'),...point,previewOnly:true},{ref:ref('paused'),...point,previewOnly:true},{ref:ref('two'),...point,previewOnly:false},{ref:ref('family','family'),...point,previewOnly:true}];assert.equal(C.nearest(model,pins,point,'employee').length,1);assert.equal(C.nearest(model,pins,point,'employee','المنصورة').length,0);
 assert.equal(C.directions(['one']),null);assert.equal(C.directions(Array(7).fill('one')),null);const url=new URL(C.directions(['العنوان أ','العنوان ب','العنوان ج']));assert.equal(url.searchParams.get('origin'),'العنوان أ');assert.equal(url.searchParams.get('destination'),'العنوان ج');assert.equal(url.searchParams.get('waypoints'),'العنوان ب');assert.equal(url.searchParams.has('currentLocation'),false);
});

test('procedure validity uses Cairo dates and excludes future, expired, review-due and incomplete legacy procedures',async()=>{
 const W=require('../src/service-workflow.cjs'),f=fixture(),id='service_planning';
 assert.equal(W.day(Date.UTC(2026,9,20,22,30)),'2026-10-21');
 const cases=[['current',{}],['future',{valid_from:'2026-10-22'}],['expired',{valid_until:'2026-10-20'}],['review_due',{review_by:'2026-10-20'}],['incomplete',{valid_from:''}],['draft',{status:'draft'}],['archived',{status:'archived'}]];
 for(const [expected,extra]of cases)assert.equal(W.validity(draft(undefined,extra),'2026-10-21'),expected);
 await reject(()=>f.save('save_draft',draft(undefined,{valid_from:''}),id),'LAB_VALIDITY_REQUIRED');
 for(const extra of [{valid_until:'2025-12-31'},{review_by:'2025-12-31'},{valid_from:'2026-02-30'}])await reject(()=>f.save('save_draft',draft(undefined,extra),id),'INVALID_LAB_DRAFT');
 for(const extra of [{valid_from:'2026-10-22'},{valid_until:'2026-10-20'},{review_by:'2026-10-20'}]){const d=draft(randomBytes(16).toString('hex'),extra);await f.save('save_draft',d,id);await reject(()=>f.save('create_case',{id:randomBytes(16).toString('hex'),draft_id:d.id},id),'LAB_PROCEDURE_NOT_CURRENT');}
 // Legacy drafts stay readable and archivable; missing validity is never inferred.
 const saved=await f.store.labWorkspaceRead(id,'admin-a'),legacy=draft('9'.repeat(32));for(const k of ['valid_from','valid_until','review_by','documents','submission_channel','service_window'])delete legacy[k];saved.state.drafts.push({...legacy,revision:1});f.store.labWorkspaces.set(id+'|admin-a',saved);
 await reject(()=>f.save('create_case',{id:'7'.repeat(32),draft_id:legacy.id},id),'LAB_PROCEDURE_NOT_CURRENT');await f.save('save_draft',{...legacy,status:'archived'},id);
});
test('assignments snapshot roles, prevent removal while open and gate review; missing requirements are source-bound',async()=>{
 const f=fixture(),id='service_planning',d=draft(),c='b'.repeat(32),role={id:'c'.repeat(32),label:'دور مصطنع',channel:'قناة مصطنعة'};
 await f.save('save_draft',d,id);await f.save('create_case',{id:c,draft_id:d.id},id);
 await reject(()=>f.save('case_status',{id:c,status:'review'},id),'LAB_ASSIGNMENT_REQUIRED');
 await f.save('save_role',role,id);await reject(()=>f.save('save_role',{...role,id:'d'.repeat(32)},id),'LAB_ROLE_DUPLICATE');
 await reject(()=>f.save('assign_case',{id:c,role_id:role.id,follow_up_at:'2026-10-20'},id),'INVALID_LAB_ASSIGNMENT');
 await f.save('assign_case',{id:c,role_id:role.id,follow_up_at:'2026-10-21'},id);
 assert.equal((await f.save('assign_case',{id:c,role_id:role.id,follow_up_at:'2026-10-21'},id)).changed,false);
 await f.save('save_role',{...role,label:'اسم دور أحدث',channel:'قناة أحدث'},id);
 let w=await f.service.labWorkspace('admin-a',id);assert.equal(w.state.cases[0].assignment.label,'دور مصطنع');
 await reject(()=>f.save('remove_role',{id:role.id},id),'LAB_ROLE_IN_USE');
 await f.save('case_status',{id:c,status:'review'},id);
 for(const extra of [{reason:'documents',items:[]},{reason:'documents',items:[1]},{reason:'documents',items:[0,0]},{reason:'source',items:[0]},{reason:'diagnosis',items:[]}])await reject(()=>f.save('case_status',{id:c,status:'needs_info',...extra},id),'INVALID_LAB_MISSING');
 await f.save('case_status',{id:c,status:'needs_info',reason:'documents',items:[0]},id);w=await f.service.labWorkspace('admin-a',id);assert.deepEqual(w.state.cases[0].missing,{reason:'documents',items:[0]});assert.equal(w.state.cases[0].procedure.documents[0],'متطلب توضيحي');
 await reject(()=>f.save('case_status',{id:c,status:'needs_info',reason:'source',items:[]},id),'LAB_CASE_TRANSITION');
 f.advance(86400000);w=await f.service.labWorkspace('admin-a',id);const W=require('../src/service-workflow.cjs');assert.equal(W.summary(w.state,w.today).overdue,1);
 await f.save('case_status',{id:c,status:'cancelled'},id);await reject(()=>f.save('case_status',{id:c,status:'review'},id),'LAB_CASE_TRANSITION');await reject(()=>f.save('assign_case',{id:c,role_id:role.id,follow_up_at:'2026-10-22'},id),'LAB_CASE_TRANSITION');
 await f.save('remove_role',{id:role.id},id);assert.equal(W.summary((await f.service.labWorkspace('admin-a',id)).state,'2026-10-22').overdue,0);
});
test('case source snapshots survive expiry, archival and copied procedures; cancellation never confirms or sends a booking',async()=>{
 const f=fixture(),id='service_planning',d=draft(),c='b'.repeat(32);await f.save('save_draft',d,id);await f.save('create_case',{id:c,draft_id:d.id},id);
 const original=structuredClone((await f.service.labWorkspace('admin-a',id)).state.cases[0].procedure);await f.save('save_draft',{...d,status:'archived'},id);
 assert.equal((await f.save('create_case',{id:c,draft_id:d.id},id)).changed,false);
 await f.save('save_draft',{...d,id:'e'.repeat(32),title:'إجراء أحدث'},id);await f.save('case_status',{id:c,status:'cancelled'},id);
 const row=(await f.service.labWorkspace('admin-a',id)).state.cases[0];assert.deepEqual(row.procedure,original);assert.equal(row.bookingConfirmed,false);assert.equal(row.history.at(-1).status,'cancelled');assert.equal(f.store.profileNotes.size,0);assert.equal(f.store.overlays.size,0);
 await reject(()=>f.service.saveLabWorkspace('admin-a',id,{expected_version:0,previewRevision:'p4-p5-20261021-1',request_id:'f'.repeat(32),operation:'create_case',payload:{id:c,draft_id:d.id}}),'LAB_REVISION_CHANGED');
});
test('private workspace byte budget rejects oversized Arabic source snapshots atomically',async()=>{
 const f=fixture(),id='service_planning',d=draft(),state={drafts:[],cases:[],roles:[]};
 for(let i=0;i<50;i++)state.cases.push({id:String(i).padStart(32,'0'),status:'new',procedure:{...d,steps:Array.from({length:10},(_,j)=>'س'.repeat(295)+j),documents:Array.from({length:10},(_,j)=>'ص'.repeat(115)+j),source_reference:'ق'.repeat(490),source_url:'https://example.invalid/'+ 'a'.repeat(450)}});
 f.store.labWorkspaces.set(id+'|admin-a',{version:1,state});const before=structuredClone(await f.store.labWorkspaceRead(id,'admin-a'));
 // Fill the existing sandbox snapshot to its byte limit without allowing an eviction.
 for(const c of state.cases)c.history=Array.from({length:20},()=>({at:1,status:'review',action:'assigned',role_label:'س'.repeat(80),follow_up_at:'2026-10-21'}));
 f.store.labWorkspaces.set(id+'|admin-a',{version:1,state});const full=structuredClone(await f.store.labWorkspaceRead(id,'admin-a'));
 await reject(()=>f.save('save_role',{id:'f'.repeat(32),label:'دور جديد',channel:'قناة'},id),'LAB_SPACE_LIMIT');assert.deepEqual(await f.store.labWorkspaceRead(id,'admin-a'),full);assert.equal(f.store.audit.length,0);assert.ok(before.state.cases.length===50);
});


test('procedure and responsibility writes do not reread the directory or published review statistics',async()=>{
 const f=fixture(),id='service_planning',d=draft(),role={id:'1'.repeat(32),label:'دور مصطنع',channel:'قناة مصطنعة'},caseId='2'.repeat(32);
 await f.save('save_draft',d,id);await f.save('save_role',role,id);await f.save('create_case',{id:caseId,draft_id:d.id},id);await f.save('assign_case',{id:caseId,role_id:role.id,follow_up_at:'2026-10-21'},id);await f.save('case_status',{id:caseId,status:'cancelled'},id);
 assert.equal(f.directoryReads(),0);await f.save('follow',{ref:ref()});assert.equal(f.directoryReads(),1);
});
