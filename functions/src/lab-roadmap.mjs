import {planning} from './lab-planning.mjs';
import workflow from './service-workflow.cjs';
import {ApiError} from './core.mjs';
import {createHash} from 'node:crypto';
import facilities from './facility-directory.cjs';
import {roadmapFeatures,roadmapPolicy} from './lab-roadmap-policy.mjs';
export {roadmapFeatures,roadmapPolicy};
const fail=(status,code,message)=>{throw new ApiError(status,code,message);},hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean=(v,n)=>typeof v==='string'&&v.length<=n&&!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>ks.includes(k));
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const https=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const refKeys=['target_id','branch_id','network'];
export const refKey=r=>[r.target_id,r.branch_id,r.network].join('|');
export function roadmapTarget(catalog,ref){
 if(!exact(ref,refKeys)||!clean(ref.target_id,200)||!clean(ref.branch_id,128)||!['employee','family','retiree'].includes(ref.network))return null;
 if(ref.target_id.startsWith('doctor:'))return (catalog.records||[]).find(r=>'doctor:'+r.provider_id===ref.target_id&&String(r.id)===ref.branch_id&&r.network_members?.includes(ref.network))||null;
 const kind=ref.target_id.split(':')[0];if(!['hospitals','labs','radiology','pharmacies','specialized_centers'].includes(kind))return null;
 const b=facilities.organizations(kind,catalog[kind]||[]).flatMap(g=>g.branches).find(b=>kind+':'+b.id===ref.target_id&&String(b.id)===ref.branch_id);return b?.entries.find(r=>r.network_members?.includes(ref.network))||null;
}
function fields(row,network,catalog){
 const rel=(row.contract_relationships||[]).find(r=>r.route==='family_network'&&r.network_members?.includes(network));
 const parent=(catalog.hospitals||[]).find(h=>h.id===row.contract_entity_id);
 return Object.fromEntries(Object.entries({name:[row.name,row.display_name,row.specialty,row.category],address:[rel?.address||row.address,parent?.address],contacts:[rel?.contact_groups||row.contact_groups||row.raw_phone,parent?.raw_phone],hours:[row.schedule,row.working_hours],status:[row.service_status,parent?.service_status],network:[row.network_members,row.contract_entity,row.contract_type]}).map(([k,v])=>[k,hash(v)]));
}
const initial=id=>id==='care_companion'?{follows:[],events:[],pins:[],journey:[],feedback:[]}:{drafts:[],cases:[],roles:[]};
const project=(id,saved,at=Date.now())=>({version:saved.version||0,previewRevision:roadmapFeatures.find(f=>f.id===id).previewRevision,audience:'admin',memberEnabled:false,sandboxOnly:true,bookingConnected:false,today:workflow.day(at),state:{...initial(id),...saved.state}});
function guard(id,saved,revision){const f=roadmapFeatures.find(f=>f.id===id);if(!f)fail(404,'LAB_NOT_FOUND','هذه المعاينة غير موجودة.');if(revision&&f.previewRevision!==revision)fail(409,'LAB_REVISION_CHANGED','تغير إصدار المعاينة؛ حدّث التطبيق.');if(saved.previewEnabled===false)fail(409,'LAB_PAUSED','هذه المعاينة موقوفة؛ يمكن استئنافها من المعمل.');return f;}
function requireTarget(catalog,ref,active=false){const row=roadmapTarget(catalog,ref);if(!row)fail(404,'LAB_TARGET_UNAVAILABLE','المقر أو شبكته غير متاحين في الدليل المنشور.');if(active&&row.service_status==='suspended')fail(409,'LAB_TARGET_PAUSED','المقر موقوف مؤقتًا؛ اختر جهة متاحة.');return row;}
function care(state,op,p,catalog,at,version){
 const cap=roadmapPolicy.limits;
 if(['follow','unfollow','journey_add','journey_remove','pin','remove_pin','simulate'].includes(op)){
  const allowed=op==='pin'?['ref','lat','lng','source_url','checked_at','confirmed']:op==='simulate'?['ref','field']:['ref'];if(!exact(p,allowed))fail(400,'INVALID_LAB_WORKSPACE','حقول التجربة غير صالحة.');
  if(!exact(p.ref,refKeys)||!clean(p.ref.target_id,200)||!clean(p.ref.branch_id,128)||!Object.hasOwn(roadmapPolicy.networks,p.ref.network))fail(400,'INVALID_LAB_WORKSPACE','راجع مرجع المقر والشبكة.');
  const key=refKey(p.ref),old=state.follows.find(r=>refKey(r.ref)===key);
  const row=['unfollow','journey_remove','remove_pin'].includes(op)?null:requireTarget(catalog,p.ref,op==='journey_add');
  if(op==='follow'&&!old){if(state.follows.length>=cap.follows)fail(409,'LAB_LIMIT','حد المتابعة 40 مقرًا في المعاينة.');state.follows.push({ref:p.ref,baseline:fields(row,p.ref.network,catalog),available:true});}
  if(op==='unfollow')state.follows=state.follows.filter(r=>refKey(r.ref)!==key);
  if(op==='journey_add'&&state.journey.some(r=>r.network!==p.ref.network))fail(409,'LAB_JOURNEY_NETWORK','اجمع المشوار داخل شبكة مستفيد واحدة.');
  if(op==='journey_add'&&!state.journey.some(r=>refKey(r)===key)){if(state.journey.length>=cap.journey)fail(409,'LAB_LIMIT','اختر حتى ست جهات للمشوار.');state.journey.push(p.ref);}
  if(op==='journey_remove')state.journey=state.journey.filter(r=>refKey(r)!==key);
  if(op==='remove_pin')state.pins=state.pins.filter(r=>refKey(r.ref)!==key);
  if(op==='pin'){
   if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||p.lat<22||p.lat>32||p.lng<24||p.lng>37||!https(p.source_url)||!clean(p.source_url,500)||!date(p.checked_at)||p.checked_at>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(at)||p.confirmed!==true)fail(400,'INVALID_LAB_PIN','أدخل إحداثيات مصر ورابط مصدر وتاريخ مراجعة صحيحًا، وأكد مطابقة دبوس المعاينة.');
   if(!state.pins.some(r=>refKey(r.ref)===key)&&state.pins.length>=cap.pins)fail(409,'LAB_LIMIT','حد دبابيس المعاينة 40.');state.pins=state.pins.filter(r=>refKey(r.ref)!==key);state.pins.push({ref:p.ref,lat:p.lat,lng:p.lng,source_url:p.source_url,checked_at:p.checked_at,previewOnly:true});
  }
  if(op==='simulate'){if(!old||!Object.hasOwn(roadmapPolicy.changes,p.field))fail(400,'INVALID_LAB_WORKSPACE','اختر جهة تتابعها ونوع تغيير توضيحي.');state.events.push({id:hash([key,p.field,version]),ref:p.ref,fields:[p.field],simulated:true,at,readAt:null});}
 }else if(op==='scan'){
  if(!exact(p,[])||Object.keys(p).length)fail(400,'INVALID_LAB_WORKSPACE','لا ترسل بيانات موقع أو بحث مع فحص المتابعة.');
  for(const follow of state.follows){const row=roadmapTarget(catalog,follow.ref),available=!!row,current=row?fields(row,follow.ref.network,catalog):null,changed=available!==follow.available?['availability']:available?Object.keys(current).filter(k=>current[k]!==follow.baseline[k]):[];if(changed.length)state.events.push({id:hash([refKey(follow.ref),current,available,version]),ref:follow.ref,fields:changed,simulated:false,at,readAt:null});follow.available=available;if(current)follow.baseline=current;}
 }else if(op==='read_event'){
  if(!exact(p,['id'])||!clean(p.id,64))fail(400,'INVALID_LAB_WORKSPACE','راجع معرف التنبيه.');const e=state.events.find(r=>r.id===p.id);if(!e)fail(404,'LAB_EVENT_NOT_FOUND','التنبيه غير موجود في مساحة حسابك.');e.readAt||=at;
 }else if(op==='reorder'){
  if(!exact(p,['keys'])||!Array.isArray(p.keys)||p.keys.length!==state.journey.length||new Set(p.keys).size!==p.keys.length||p.keys.some(k=>!state.journey.some(r=>refKey(r)===k)))fail(400,'INVALID_LAB_WORKSPACE','رتب الجهات الموجودة نفسها دون إضافة معرفات.');state.journey=p.keys.map(k=>state.journey.find(r=>refKey(r)===k));
 }else if(op==='feedback'){
  if(!exact(p,['reason','network','city','specialty'])||!Object.hasOwn(roadmapPolicy.feedbackReasons,p.reason)||!Object.hasOwn(roadmapPolicy.networks,p.network)||!clean(p.city,160)||!clean(p.specialty,160))fail(400,'INVALID_LAB_WORKSPACE','اختر مثال ملاحظة دون نص حر أو بيانات صحية.');const rows=Object.values(catalog).flat();if(p.city&&!rows.some(r=>(r.markaz||r.city)===p.city)||p.specialty&&!(catalog.records||[]).some(r=>r.specialty===p.specialty))fail(400,'INVALID_LAB_WORKSPACE','اختر مركزًا وتخصصًا موجودين بالدليل.');state.feedback.push({...p,at,syntheticOnly:true});state.feedback=state.feedback.slice(-cap.feedback);
 }else fail(400,'INVALID_LAB_OPERATION','إجراء غير متاح في هذه المعاينة.');
 state.events=state.events.slice(-cap.events);return state;
}
export function roadmapLabService({store,authorize,now,readDirectory}){return {
 async labWorkspace(token,id){const actor=await authorize(token,'admin');guard(id,await store.labRead(id));return project(id,await store.labWorkspaceRead(id,actor.sourceId),now());},
 async saveLabWorkspace(token,id,body){const actor=await authorize(token,'admin');guard(id,await store.labRead(id),body?.previewRevision);
  if(!exact(body,['expected_version','previewRevision','request_id','operation','payload'])||!Number.isSafeInteger(body.expected_version)||body.expected_version<0||!/^[a-f0-9]{32}$/.test(body.request_id)||!clean(body.operation,40)||!body.previewRevision||!exact(body.payload,Object.keys(body.payload||{})))fail(400,'INVALID_LAB_WORKSPACE','راجع إجراء المعاينة؛ لا ترسل موقع العضو أو بياناته.');
  const intent=hash([body.operation,body.payload,body.expected_version,body.previewRevision]),catalog=id==='care_companion'?(await readDirectory()).catalog:null;
  return store.labWorkspaceTransact(id,actor.sourceId,(saved,feature)=>{guard(id,feature,body.previewRevision);const seen=(saved.requests||[]).find(r=>r.id===body.request_id);if(seen){if(seen.intent!==intent)fail(409,'LAB_REQUEST_REUSED','معرف العملية مستخدم لقيم مختلفة.');return {changed:false,workspace:project(id,saved,now())};}if((saved.version||0)!==body.expected_version)fail(409,'LAB_WORKSPACE_CONFLICT','حُفظ تغيير أحدث في مساحة حسابك؛ حدّثها قبل إعادة القرار.');
   const before={...initial(id),...saved.state},nextState=id==='care_companion'?care(structuredClone(before),body.operation,body.payload,catalog,now(),(saved.version||0)+1):planning(structuredClone(before),body.operation,body.payload,now());
   if(Buffer.byteLength(JSON.stringify(nextState),'utf8')>700000)fail(409,'LAB_SPACE_LIMIT','مساحة التجربة ممتلئة؛ لا نحذف أمثلة أو مسودات تلقائيًا.');
   if(JSON.stringify(before)===JSON.stringify(nextState))return {changed:false,workspace:project(id,saved,now())};
   const next={updatedAt:now(),state:nextState,version:(saved.version||0)+1,requests:[...(saved.requests||[]),{id:body.request_id,intent}].slice(-40)};return {changed:true,next,workspace:project(id,next,now())};
  });
 },
};}
