import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {inboxLabService,inboxTasks} from '../src/lab-inbox.mjs';
import {inboxFeature as feature} from '../src/lab-inbox-policy.mjs';
import {adminInboxStore} from '../src/admin-inbox-store.mjs';
import {fixtureStore} from './memory-store.mjs';
import {ApiError} from '../src/core.mjs';
const row=(id,more={})=>({id,name:'جهة مصطنعة '+id,address:'عنوان مصطنع',markaz:'طلخا',raw_phone:'01012345678',verified_at:'2026-10-20',...more});
function fixture(){
 const catalog={labs:[row('phone',{raw_phone:'1012345678'}),row('address',{address:''}),row('checked',{verified_at:''}),row('hidden',{directory_visibility:'hidden',address:''}),row('reviewed',{admin_reviewed_at:'2026-10-22',address:''}),row('fine')],medical_guidelines:[{id:'content',title:'مادة مصطنعة',publication_status:'draft',summary:'نص جهة توضيحي'}]},store=fixtureStore(catalog);let time=Date.UTC(2026,9,23,10),revoked=false,catalogReads=0,queueReads=0;
 store.catalog=async()=>{catalogReads++;return structuredClone(catalog);};const counts=store.adminInboxCounts;store.adminInboxCounts=async()=>{queueReads++;return counts();};
 const service=inboxLabService({store,now:()=>time,authorize:async token=>{if(!token)throw new ApiError(401,'UNAUTHORIZED','');if(token==='member'||revoked)throw new ApiError(403,'FORBIDDEN','');return {sourceId:token};}});
 const view=()=>service.labInbox('admin');
 const body=async(operation,payload,more={})=>({expected_version:(await service.labInbox('admin',true)).version,previewRevision:feature.previewRevision,request_id:randomBytes(16).toString('hex'),operation,payload,...more});
 const save=async(op,payload,more={})=>service.saveLabInbox('admin',await body(op,payload,more));
 const track=async(id='phone',more={})=>{const task=(await view()).tasks.find(task=>task.ref?.id===id);return save('track',{task_id:task.id,fingerprint:task.fingerprint,status:'following',reason:'phone',due:'',...more});};
 return {catalog,store,service,view,body,save,track,advance:n=>time+=n,revoke:()=>{revoked=true;},reads:()=>({catalog:catalogReads,queues:queueReads})};
}
const reject=(fn,code)=>assert.rejects(fn,error=>error.code===code);
test('inbox uses live administrator authorization on every read and write, isolates follow-up owners and never changes queues or source data',async()=>{
 const f=fixture(),before=structuredClone(f.catalog);
 f.store.reviews.set('synthetic',{status:'pending',comment:'تعليق خاص لا يعرض',author_name:'عضو لا يعرض'});f.store.profileRequests.set('synthetic',{status:'pending',changes:{phone:'private-profile-value'},name:'اسم عضو لا يعرض'});
 for(const token of ['','member'])for(const fn of [()=>f.service.labInbox(token),()=>f.service.labInbox(token,true),()=>f.service.saveLabInbox(token,{})])await assert.rejects(fn,error=>error.status===(token?403:401));
 let view=await f.view();assert.equal(view.queues.reviews.count,1);assert.equal(view.queues.profilePending.count,1);assert.equal(view.queueDetailsIncluded,false);assert.equal(view.memberEnabled,false);assert.equal(view.productionWriteSupported,false);assert.ok(!JSON.stringify(view).includes('لا يعرض'));assert.ok(!JSON.stringify(view).includes('private-profile-value'));
 await f.track();view=await f.view();assert.equal(view.workspace.used,1);assert.equal((await f.service.labInbox('other')).workspace.used,0);assert.equal(f.store.reviews.get('synthetic').status,'pending');assert.equal(f.store.profileRequests.get('synthetic').status,'pending');assert.equal(f.store.profileNotes.size,0);assert.equal(f.store.overlays.size,0);assert.deepEqual(f.catalog,before);assert.ok(!JSON.stringify(f.store.audit).includes('جهة مصطنعة'));
 f.revoke();await assert.rejects(()=>f.service.labInbox('admin',true),error=>error.status===403);
});
test('queue count adapter uses aggregation only, handles failed sources independently and never loads documents',async()=>{
 const calls=[],db={collection(name){return {
  where(field,op,value){calls.push([name,field,op,value]);return {
   count(){return {async get(){
    if(value==='applying')throw new Error('private failure');
    return {data:()=>({count:name==='medical_reviews'?7:3})};
   }};}
  };}
 };}};

 const result=await adminInboxStore(db).adminInboxCounts();assert.deepEqual(calls,[['medical_reviews','status','==','pending'],['medical_profile_requests','status','==','pending'],['medical_profile_requests','status','==','applying']]);assert.equal(result.reviews.count,7);assert.equal(result.profilePending.count,3);assert.equal(result.profileApplying.available,false);assert.equal(result.profileApplying.count,null);assert.ok(!JSON.stringify(result).includes('failure'));
});
test('unavailable counts remain unknown and adapter extras are stripped rather than presented as an empty queue',async()=>{
 const f=fixture();f.store.adminInboxCounts=async()=>({reviews:{available:true,count:4,comment:'NEVER_EXPORT'},profilePending:{available:true,count:-1},member:{name:'NEVER_EXPORT'}});let view=await f.view();assert.equal(view.queues.reviews.count,4);assert.equal(view.queues.profilePending.count,null);assert.equal(view.queues.profileApplying.available,false);assert.ok(!JSON.stringify(view).includes('NEVER_EXPORT'));
 f.store.adminInboxCounts=async()=>{throw new Error('NEVER_EXPORT');};view=await f.view();assert.ok(Object.values(view.queues).every(row=>row.count===null&&!row.available));assert.ok(view.tasks.length);
});
test('task checks distinguish metadata review from contract expiry and respect real hospital reception fallback',()=>{
 const at=Date.UTC(2026,9,23,10),catalog={hospitals:[row('hospital')],records:[row('doctor',{specialty:'باطنة',raw_phone:'',contract_type:'hospital',contract_entity_id:'hospital'}),row('old',{verified_at:'2025-01-01'})],medical_guidelines:[{id:'ending',title:'مادة',publication_status:'published',issuing_authority:'جهة توضيحية',source_reference:'مرجع مصطنع',verified_at:'2026-10-20',display_until:'2026-10-25T12:00:00Z'},{id:'archived',title:'مؤرشفة',publication_status:'archived'}]};
 const {tasks}=inboxTasks(catalog,at);assert.equal(tasks.some(task=>task.ref?.id==='doctor'),false);assert.ok(tasks.find(task=>task.ref?.id==='old').issues.some(issue=>issue.label.includes('ليس تاريخ انتهاء تعاقد')));assert.ok(tasks.find(task=>task.ref?.id==='ending').issues.some(issue=>issue.code==='ending'));assert.equal(tasks.some(task=>task.ref?.id==='archived'),false);
 const malformed=inboxTasks({labs:[row('duplicate',{address:''}),row('duplicate',{address:''}),row(null,{name:'null',address:''})]},at).tasks;assert.ok(malformed.every(task=>task.ref===null));assert.equal(new Set(malformed.map(task=>task.id)).size,3);assert.ok(!malformed.some(task=>task.title==='null'));
});
test('follow-up transactions are version guarded and retry safe with immutable request intents',async()=>{
 const f=fixture(),task=(await f.view()).tasks.find(task=>task.ref?.id==='phone'),body=await f.body('track',{task_id:task.id,fingerprint:task.fingerprint,status:'following',reason:'phone',due:''});
 const result=await Promise.all([1,2].map(()=>f.service.saveLabInbox('admin',body)));assert.equal(result.filter(row=>row.changed).length,1);assert.equal((await f.view()).workspace.entries[0].history.length,1);
 await reject(()=>f.service.saveLabInbox('admin',{...body,payload:{...body.payload,status:'reviewed',reason:'checked'}}),'LAB_REQUEST_REUSED');
 await reject(()=>f.save('track',{...body.payload,status:'reviewed',reason:'checked'},{expected_version:0}),'LAB_WORKSPACE_CONFLICT');
});
test('pause is checked again inside the write transaction and status polling does not fetch catalog or queues',async()=>{
 const f=fixture();await f.service.labInbox('admin',true);assert.deepEqual(f.reads(),{catalog:0,queues:0});const task=(await f.view()).tasks[0],before=f.reads();await f.service.labInbox('admin',true);assert.deepEqual(f.reads(),before);
 const transact=f.store.labWorkspaceTransact;f.store.labWorkspaceTransact=(...args)=>{f.store.labRows.set(feature.id,{previewEnabled:false});return transact(...args);};await reject(()=>f.save('track',{task_id:task.id,fingerprint:task.fingerprint,status:'following',reason:'source',due:''}),'LAB_PAUSED');assert.equal(f.store.labWorkspaces.size,0);await reject(()=>f.service.labInbox('admin'),'LAB_PAUSED');
});
test('changed source data invalidates saved review and postponement, while routine saves leave the meaningful fingerprint unchanged',async()=>{
 const f=fixture();await f.track('phone',{status:'reviewed',reason:'checked'});let view=await f.view();const original=view.tasks.find(task=>task.ref?.id==='phone');assert.equal(original.progress.status,'reviewed');
 f.catalog.labs[0]._version=10;f.catalog.labs[0].admin_reviewed_at='new';view=await f.view();assert.equal(view.tasks.find(task=>task.ref?.id==='phone').progress.status,'reviewed');
 f.catalog.labs[0].address='عنوان تغير';view=await f.view();const changed=view.tasks.find(task=>task.ref?.id==='phone');assert.equal(changed.progress.status,'changed');assert.equal(changed.progress.due,'');await reject(()=>f.save('track',{task_id:original.id,fingerprint:original.fingerprint,status:'reviewed',reason:'checked',due:''}),'INBOX_TASK_CHANGED');
 await f.track('phone',{status:'snoozed',reason:'waiting',due:'2026-10-24'});f.catalog.labs[0].markaz='المنصورة';view=await f.view();assert.equal(view.tasks.find(task=>task.ref?.id==='phone').progress.status,'changed');
});
test('Cairo dates control follow-up due state without claiming a company service deadline or sending notifications',async()=>{
 const f=fixture();await f.track('phone',{status:'snoozed',reason:'waiting',due:'2026-10-24'});assert.equal((await f.view()).tasks.find(task=>task.ref?.id==='phone').progress.status,'snoozed');f.advance(86400000);assert.equal((await f.view()).tasks.find(task=>task.ref?.id==='phone').progress.status,'due');assert.equal(f.store.profileNotes.size,0);
 await f.track('address',{status:'following',reason:'address',due:'2026-10-24'});assert.equal((await f.view()).tasks.find(task=>task.ref?.id==='address').progress.status,'due');
 for(const due of ['2026-02-30','2026-10-23','2027-12-01'])await reject(()=>f.track('phone',{status:'snoozed',reason:'waiting',due}),'INVALID_INBOX');
});
test('resolved and removed source records remain distinctly described in the private journal and another owner cannot remove them',async()=>{
 const f=fixture();await f.track('phone');const task=(await f.view()).tasks.find(task=>task.ref?.id==='phone');f.catalog.labs[0].raw_phone='01012345678';let view=await f.view();assert.equal(view.tasks.some(row=>row.id===task.id),false);assert.equal(view.workspace.entries[0].status,'resolved');
 f.catalog.labs.shift();view=await f.view();assert.equal(view.workspace.entries[0].status,'unavailable');await reject(()=>f.service.saveLabInbox('other',{expected_version:0,previewRevision:feature.previewRevision,request_id:'a'.repeat(32),operation:'remove',payload:{task_id:task.id}}),'INBOX_ENTRY_NOT_FOUND');
 await f.save('remove',{task_id:task.id});assert.equal((await f.view()).workspace.used,0);
});
test('payload allowlists forbid member fields, free text, publication and hidden status values',async()=>{
 const f=fixture(),task=(await f.view()).tasks[0],payload={task_id:task.id,fingerprint:task.fingerprint,status:'following',reason:'phone',due:''};
 for(const extra of [{owner:'other'},{memberEnabled:true},{note:'نص حر'},{status:'published'},{reason:'private narrative'}])await reject(()=>f.save('track',{...payload,...extra}),'INVALID_INBOX');await reject(()=>f.save('publish',payload),'INVALID_INBOX');await reject(()=>f.save('track',payload,{previewRevision:'old'}),'LAB_REVISION_CHANGED');assert.equal(f.store.labWorkspaces.size,0);
});
test('journal limits preserve saved history instead of silently dropping older decisions',async()=>{
 const f=fixture();for(let i=0;i<20;i++)await f.track('phone',{status:i%2?'reviewed':'following',reason:i%2?'checked':'phone'});const before=await f.view();await reject(()=>f.track('phone',{status:'following',reason:'phone'}),'INBOX_HISTORY_LIMIT');assert.deepEqual((await f.view()).workspace,before.workspace);
});

test('large catalogs report truncation explicitly while retaining the true total task count',async()=>{
 const f=fixture();f.catalog.labs=Array.from({length:1002},(_,index)=>row('many-'+index,{address:''}));f.catalog.medical_guidelines=[];
 const view=await f.view();assert.equal(view.totalTasks,1002);assert.equal(view.tasks.length,1000);assert.equal(view.truncated,true);assert.equal(view.workspace.used,0);
});

test('unresolved row keys cannot collide with legitimate IDs resembling an internal fallback',()=>{
 const result=inboxTasks({labs:[row(null,{address:''}),row('unresolved:0',{address:''})]},Date.UTC(2026,9,23));assert.equal(result.tasks.length,2);assert.equal(new Set(result.tasks.map(task=>task.id)).size,2);
});
