import {createHash} from 'node:crypto';
import {ApiError} from './core.mjs';
import contacts from './contacts.cjs';
import content from './content-policy.cjs';
import {inboxFeature as feature,inboxPolicy as policy} from './lab-inbox-policy.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const text=value=>typeof value==='string'&&!/^(null|undefined|nan)$/i.test(value.trim())?value.trim():typeof value==='number'?String(value):'';
const day=content.day,dayAfter=(today,n)=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const guard=(saved,revision)=>{if(revision&&revision!==feature.previewRevision)fail(409,'LAB_REVISION_CHANGED','تغير إصدار مكتب المتابعة؛ حدّث التطبيق.');if(saved.previewEnabled===false)fail(409,'LAB_PAUSED','مكتب متابعة المدير موقوف من المعمل.');};
const base=(saved,featureSaved)=>({audience:'admin',memberEnabled:false,productionWriteSupported:false,previewRevision:feature.previewRevision,version:saved.version||0,featureVersion:featureSaved.version||0,queueDetailsIncluded:false});
const providerKinds=['records','hospitals','labs','radiology','pharmacies','specialized_centers','emergency_services'];
const usable=parsed=>['mobile','landline','shortcode'].some(key=>parsed[key].length);
function identity(kind,row,index,counts){
 const id=text(row.id),valid=!!id&&counts.get(id)===1&&/^[\p{L}\p{N}_:-]{1,200}$/u.test(id);
 return {key:[kind,valid?'id':'row',valid?id:index],ref:valid?{kind,id}:null};
}
export function inboxTasks(catalog,at){
 const today=day(at),tasks=[],sources=new Set();
 const append=(kind,row,index,counts,details,fields)=>{
  const target=identity(kind,row,index,counts),taskId=hash(target.key);sources.add(taskId);if(!details)return;
  const title=(text(row.name)||text(row.display_name)||text(row.title)||'سجل بلا اسم').slice(0,200);
  tasks.push({id:taskId,fingerprint:hash([feature.previewRevision,fields,details.issues]),title,ref:target.ref,kind,markaz:(text(row.markaz)||text(row.city)).slice(0,120),centralReviewed:!!row.admin_reviewed_at,...details});
 };
 for(const kind of providerKinds){
  const rows=catalog[kind]||[],counts=new Map();for(const row of rows){const id=text(row.id);counts.set(id,(counts.get(id)||0)+1);}
  rows.forEach((row,index)=>{
   const parent=row.contract_type==='hospital'?(catalog.hospitals||[]).find(hospital=>String(hospital.id)===String(row.contract_entity_id)):null;
   const own=contacts.forEntity(row),parentPhones=parent?contacts.forEntity(parent):null,issues=[];
   const issue=(code,label,rank,category)=>issues.push({code,label,rank,category});
   if(!text(row.id)||counts.get(text(row.id))!==1)issue('identity','معرّف السجل مفقود أو مكرر؛ لا يفتح تعديل مباشر',0,'directory');
   if(!text(row.name)&&!text(row.display_name))issue('name','اسم الجهة غير مكتمل',0,'directory');
   if(own.invalid.length||row.contact_review_required)issue('invalid_phone','رقم يحتاج مراجعة الصيغة؛ لا نصححه بالتخمين',1,'contact');
   if(!usable(own)&&!usable(parentPhones||{mobile:[],landline:[],shortcode:[]}))issue('missing_phone','لا يوجد رقم صالح الصيغة في السجل أو استقبال المستشفى المرتبطة',1,'contact');
   if(!text(row.address))issue('address','عنوان السجل غير مكتمل',2,'directory');
   if(!text(row.markaz)&&!text(row.city))issue('area','مركز أو مدينة السجل غير محدد',2,'directory');
   if(kind==='records'&&!text(row.specialty))issue('specialty','التخصص غير محدد',2,'directory');
   const checked=text(row.verified_at)||text(row.verification_date);
   if(!checked)issue('missing_check','تاريخ المراجعة غير مسجل',3,'verification');
   else if(!date(checked)||checked>today)issue('invalid_check','تاريخ المراجعة يحتاج تصحيحًا',2,'verification');
   else if(Date.parse(today)-Date.parse(checked)>180*86400000)issue('stale','مر أكثر من 180 يومًا على المراجعة؛ ليس تاريخ انتهاء تعاقد',3,'verification');
   const hidden=row.directory_visibility==='hidden'||row.contract_listing===false||!!parent&&(parent.directory_visibility==='hidden'||parent.contract_listing===false);
   const fields={id:row.id??null,name:text(row.name)||text(row.display_name),address:text(row.address),area:text(row.markaz)||text(row.city),specialty:text(row.specialty),phones:own,source:text(row.source_url),checked,status:row.service_status||'active',hidden,parent:parent?{id:parent.id,phones:parentPhones,status:parent.service_status||'active',hidden:parent.directory_visibility==='hidden'||parent.contract_listing===false}:null};
   append(kind,row,index,counts,issues.length?{type:'directory',category:issues[0].category,rank:Math.min(...issues.map(issue=>issue.rank)),issues,hidden,suspended:row.service_status==='suspended',due:''}:null,fields);
  });
 }
 const rows=catalog.medical_guidelines||[],counts=new Map();for(const row of rows){const id=text(row.id);counts.set(id,(counts.get(id)||0)+1);}
 rows.forEach((row,index)=>{
  const status=content.status(row,at),issues=[];
  if(status==='draft')issues.push({code:'draft',label:'مسودة غير منشورة تنتظر مراجعة الإدارة',rank:3,category:'content'});
  if(status==='incomplete')issues.push({code:'incomplete',label:'مصدر أو جهة إصدار أو تاريخ تحقق غير مكتمل',rank:1,category:'content'});
  if(status==='expired')issues.push({code:'expired',label:'انتهى عرض المادة أو سريان تعليماتها؛ لا يعني انتهاء تعاقد جهة',rank:2,category:'content'});
  const candidates=[date(row.expires_at)?row.expires_at:null,Number.isFinite(Date.parse(row.display_until))?day(Date.parse(row.display_until)-1):null].filter(Boolean).sort(),end=candidates[0]||'';
  if(status==='published'&&end&&end<=dayAfter(today,7))issues.push({code:'ending',label:'تنتهي مدة عرض المادة أو سريانها خلال 7 أيام',rank:2,category:'content'});
  if(issues.length&&(!text(row.id)||counts.get(text(row.id))!==1))issues.unshift({code:'identity',label:'معرّف المادة مفقود أو مكرر؛ راجع قائمة الجودة',rank:0,category:'content'});
  append('medical_guidelines',row,index,counts,issues.length?{type:'content',category:'content',rank:Math.min(...issues.map(issue=>issue.rank)),issues,hidden:false,suspended:false,due:end}:null,{id:row.id??null,title:text(row.title)||text(row.name),status,summary:text(row.summary),steps:row.steps||[],issuing:text(row.issuing_authority),source:text(row.source_reference)||text(row.source_url),checked:text(row.verified_at),display_from:row.display_from||'',display_until:row.display_until||'',effective_from:row.effective_from||'',expires_at:row.expires_at||''});
 });
 return {tasks:tasks.sort((a,b)=>a.rank-b.rank||a.title.localeCompare(b.title,'ar')||a.id.localeCompare(b.id)),sources};
}
function progress(entry,task,today){
 if(!entry)return {status:'open',reason:'',due:'',changed:false};
 if(entry.fingerprint!==task.fingerprint)return {status:'changed',reason:'',due:'',changed:true,previousStatus:entry.status};
 return {status:['snoozed','following'].includes(entry.status)&&entry.due&&entry.due<=today?'due':entry.status,reason:entry.reason,due:entry.due,changed:false,updatedAt:entry.updatedAt};
}
function workspace(saved,tasks,sources,at){
 const today=day(at),entries=saved.state?.entries||[],byId=new Map(tasks.map(task=>[task.id,task]));
 return {entries:entries.map(entry=>({id:entry.id,title:entry.title,ref:entry.ref,status:byId.has(entry.id)?progress(entry,byId.get(entry.id),today).status:sources.has(entry.id)?'resolved':'unavailable',reason:entry.reason,due:entry.due,updatedAt:entry.updatedAt,history:entry.history.map(event=>({status:event.status,reason:event.reason,due:event.due,at:event.at}))})),used:entries.length,limit:policy.limits.entries};
}
const queueKeys=['reviews','profilePending','profileApplying'];
const safeCounts=value=>Object.fromEntries(queueKeys.map(key=>{const row=value?.[key],valid=row?.available===true&&Number.isSafeInteger(row.count)&&row.count>=0;return [key,{available:valid,count:valid?row.count:null,scope:'status-documents'}];}));
const missingCounts=()=>Object.fromEntries(['reviews','profilePending','profileApplying'].map(key=>[key,{available:false,count:null,scope:'status-documents'}]));
export function inboxLabService({store,authorize,now}){
 async function guarded(token,revision){const actor=await authorize(token,'admin'),saved=await store.labRead(feature.id);guard(saved,revision);return {actor,featureSaved:saved};}
 return {
  async labInbox(token,statusOnly=false){
   const {actor,featureSaved}=await guarded(token),saved=await store.labWorkspaceRead(feature.id,actor.sourceId),view=base(saved,featureSaved);if(statusOnly)return {...view,sourcePolled:false};
   const [catalog,queues]=await Promise.all([store.catalog(),Promise.resolve().then(()=>store.adminInboxCounts()).then(safeCounts).catch(()=>missingCounts())]),at=now(),data=inboxTasks(catalog,at),today=day(at),entries=new Map((saved.state?.entries||[]).map(entry=>[entry.id,entry]));
   return {...view,checkedAt:at,today,policy,queues,tasks:data.tasks.slice(0,policy.limits.tasks).map(task=>({...task,progress:progress(entries.get(task.id),task,today)})),totalTasks:data.tasks.length,truncated:data.tasks.length>policy.limits.tasks,workspace:workspace(saved,data.tasks,data.sources,at)};
  },
  async saveLabInbox(token,body){
   const {actor}=await guarded(token,body?.previewRevision);
   if(!exact(body,['expected_version','previewRevision','request_id','operation','payload'])||!Number.isSafeInteger(body.expected_version)||body.expected_version<0||body.previewRevision!==feature.previewRevision||!/^[a-f0-9]{32}$/.test(body.request_id)||!['track','remove'].includes(body.operation)||!exact(body.payload,body.operation==='track'?['task_id','fingerprint','status','reason','due']:['task_id'])||!/^[a-f0-9]{64}$/.test(body.payload.task_id))fail(400,'INVALID_INBOX','راجع إجراء المتابعة؛ لا تُرسل بيانات أعضاء أو نصوصًا حرة.');
   const payload=body.payload,at=now(),today=day(at);
   if(body.operation==='track'&&(!/^[a-f0-9]{64}$/.test(payload.fingerprint)||!Object.hasOwn(policy.statuses,payload.status)||typeof payload.reason!=='string'||payload.reason&&!Object.hasOwn(policy.reasons,payload.reason)||typeof payload.due!=='string'||payload.status==='open'&&(payload.reason||payload.due)||payload.status!=='open'&&!payload.reason||payload.status==='reviewed'&&payload.due||payload.due&&(!date(payload.due)||payload.due<today||payload.due>dayAfter(today,90))||payload.status==='snoozed'&&(!payload.due||payload.due<=today)))fail(400,'INVALID_INBOX','اختر حالة وسببًا من القوائم وموعد متابعة خلال 90 يومًا؛ التأجيل يبدأ من يوم لاحق.');
   const catalog=body.operation==='track'?await store.catalog():null,data=catalog?inboxTasks(catalog,at):null,intent=hash(body);
   return store.labWorkspaceTransact(feature.id,actor.sourceId,(saved,currentFeature)=>{
    guard(currentFeature,body.previewRevision);const seen=(saved.requests||[]).find(request=>request.id===body.request_id);if(seen){if(seen.intent!==intent)fail(409,'LAB_REQUEST_REUSED','معرف العملية مستخدم لقيم مختلفة.');return {changed:false,workspace:base(saved,currentFeature)};}
    if((saved.version||0)!==body.expected_version)fail(409,'LAB_WORKSPACE_CONFLICT','حُفظت متابعة أحدث؛ حدّث المكتب قبل القرار.');
    const state=structuredClone(saved.state||{entries:[]}),index=state.entries.findIndex(entry=>entry.id===payload.task_id),entry=state.entries[index];
    if(body.operation==='remove'){if(!entry)fail(404,'INBOX_ENTRY_NOT_FOUND','هذه المتابعة غير موجودة في مساحة حسابك.');state.entries.splice(index,1);}
    else{
     const task=data.tasks.find(task=>task.id===payload.task_id);if(!task)fail(409,'INBOX_TASK_CHANGED','لم تعد الملاحظة ضمن الفحص الحالي؛ حدّث المكتب.');if(task.fingerprint!==payload.fingerprint)fail(409,'INBOX_TASK_CHANGED','تغيرت بيانات الملاحظة؛ حدّث المكتب قبل تسجيل المتابعة.');
     if(entry&&entry.fingerprint===task.fingerprint&&entry.status===payload.status&&entry.reason===payload.reason&&entry.due===payload.due)return {changed:false,workspace:base(saved,currentFeature)};
     if(!entry&&state.entries.length>=policy.limits.entries)fail(409,'LAB_SPACE_LIMIT','حد المتابعات الخاصة 200؛ احذف متابعة قديمة صراحة لإضافة أخرى.');
     if((entry?.history.length||0)>=policy.limits.history)fail(409,'INBOX_HISTORY_LIMIT','اكتمل سجل هذه المتابعة؛ لا نحذف تاريخه تلقائيًا.');
     const next={id:task.id,fingerprint:task.fingerprint,title:task.title,ref:task.ref,status:payload.status,reason:payload.reason,due:payload.due,updatedAt:at,history:[...(entry?.history||[]),{status:payload.status,reason:payload.reason,due:payload.due,at,fingerprint:task.fingerprint}]};if(entry)state.entries[index]=next;else state.entries.push(next);
    }
    if(Buffer.byteLength(JSON.stringify(state))>policy.limits.bytes)fail(409,'LAB_SPACE_LIMIT','مساحة المتابعة ممتلئة؛ لا نحذف سجلًا تلقائيًا.');
    const next={state,version:(saved.version||0)+1,updatedAt:at,requests:[...(saved.requests||[]),{id:body.request_id,intent}].slice(-40)};return {changed:true,next,workspace:base(next,currentFeature)};
   });
  }
 };
}
