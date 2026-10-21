import {ApiError} from './core.mjs';
import workflow from './service-workflow.cjs';
import {roadmapPolicy} from './lab-roadmap-policy.mjs';
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const clean=(v,n)=>typeof v==='string'&&v.length<=n&&!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const key=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const https=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const draftKeys=['id','title','type','network','source_reference','source_url','source_date','authority','steps','responsible','status','valid_from','valid_until','review_by','documents','submission_channel','service_window'];
const list=(v,size,length)=>Array.isArray(v)&&v.length<=size&&new Set(v).size===v.length&&v.every(s=>clean(s,length)&&s.trim());
function transition(row,status,at,extra={}){row.status=status;row.history.push({status,at,...extra});row.history=row.history.slice(-20);}
function currentCase(state,p,keys){if(!exact(p,keys)||!key(p.id))fail(400,'INVALID_LAB_CASE','راجع معرف المثال وحقول الإجراء.');const c=state.cases.find(c=>c.id===p.id);if(!c)fail(404,'LAB_CASE_NOT_FOUND','المثال غير موجود في مساحة حسابك.');return c;}
export function planning(state,op,p,at){
 const today=workflow.day(at),cap=roadmapPolicy.limits;state.roles||=[];
 if(op==='save_draft'){
  if(!exact(p,draftKeys))fail(400,'INVALID_LAB_DRAFT','حقول المسودة غير صالحة.');p=workflow.normalize(p);
  if(!key(p.id)||!clean(p.title,160)||!p.title.trim()||!Object.hasOwn(roadmapPolicy.draftTypes,p.type)||!Object.hasOwn(roadmapPolicy.networks,p.network)||!['draft','ready','archived'].includes(p.status)||!clean(p.source_reference,500)||!clean(p.source_url,500)||p.source_url&&!https(p.source_url)||!clean(p.source_date,10)||p.source_date&&!workflow.date(p.source_date)||p.source_date>today||!clean(p.authority,160)||!clean(p.responsible,160)||!list(p.steps,10,300)||!list(p.documents,10,120)||!clean(p.submission_channel,240)||!clean(p.service_window,160))fail(400,'INVALID_LAB_DRAFT','راجع المسودة والمصدر والخطوات؛ دون بيانات أعضاء أو نسب مالية.');
  for(const k of ['valid_from','valid_until','review_by'])if(!clean(p[k],10)||p[k]&&!workflow.date(p[k]))fail(400,'INVALID_LAB_DRAFT','أدخل تواريخ سريان ومراجعة صحيحة.');
  if(p.valid_until&&(!p.valid_from||p.valid_until<p.valid_from)||p.review_by&&p.valid_from&&p.review_by<p.valid_from||p.review_by&&p.source_date&&p.review_by<p.source_date)fail(400,'INVALID_LAB_DRAFT','ترتيب تواريخ المصدر والسريان والمراجعة غير صحيح.');
  if(p.status==='ready'&&(!(p.source_reference.trim()||p.source_url.trim())||!workflow.date(p.source_date)||!p.authority.trim()||!p.responsible.trim()||!p.steps.length))fail(409,'LAB_SOURCE_REQUIRED','تجهيز المسودة للمراجعة يتطلب مصدرًا وتاريخه وجهة إصداره ومسؤولًا وخطوات.');
  if(p.status==='ready'&&(!workflow.date(p.valid_from)||!workflow.date(p.review_by)||!p.submission_channel.trim()))fail(409,'LAB_VALIDITY_REQUIRED','حدد بداية السريان وموعد مراجعة المصدر وقناة التقديم قبل تجهيز المسودة.');
  if(!state.drafts.some(d=>d.id===p.id)&&state.drafts.length>=cap.drafts)fail(409,'LAB_LIMIT','حد مسودات المعاينة 30.');
  const old=state.drafts.find(d=>d.id===p.id),oldNormalized=old&&workflow.normalize(old);
  if(old&&state.cases.some(c=>c.draft_id===p.id)&&draftKeys.some(k=>k!=='status'&&JSON.stringify(p[k])!==JSON.stringify(oldNormalized[k])))fail(409,'LAB_DRAFT_IN_USE','المسودة مرتبطة بأمثلة؛ انسخها لمراجعة جديدة بدل تغيير المرجع السابق.');
  if(old&&draftKeys.every(k=>JSON.stringify(oldNormalized[k])===JSON.stringify(p[k])))return state;
  state.drafts=state.drafts.filter(d=>d.id!==p.id);state.drafts.push({...p,previewOnly:true,updatedAt:at,revision:(old?.revision||0)+1});
 }else if(op==='save_role'){
  if(!exact(p,['id','label','channel'])||!key(p.id)||!clean(p.label,80)||!p.label.trim()||!clean(p.channel,240)||!p.channel.trim())fail(400,'INVALID_LAB_ROLE','اكتب اسم دور المتابعة وقناته من الإجراء المعتمد، دون بيانات أعضاء.');
  if(state.roles.some(r=>r.id!==p.id&&r.label.trim()===p.label.trim()))fail(409,'LAB_ROLE_DUPLICATE','هذا الدور موجود؛ استخدمه أو عدله.');
  if(!state.roles.some(r=>r.id===p.id)&&state.roles.length>=10)fail(409,'LAB_LIMIT','حد أدوار التجربة 10.');
  const old=state.roles.find(r=>r.id===p.id);if(old?.label===p.label&&old?.channel===p.channel)return state;
  state.roles=state.roles.filter(r=>r.id!==p.id);state.roles.push({...p,updatedAt:at});
 }else if(op==='remove_role'){
  if(!exact(p,['id'])||!key(p.id))fail(400,'INVALID_LAB_ROLE','راجع معرف الدور.');
  if(state.cases.some(c=>!workflow.terminal(c.status)&&c.assignment?.id===p.id))fail(409,'LAB_ROLE_IN_USE','أعد إسناد الأمثلة المفتوحة قبل إزالة دور المتابعة.');state.roles=state.roles.filter(r=>r.id!==p.id);
 }else if(op==='create_case'){
  if(!exact(p,['id','draft_id'])||!key(p.id)||!key(p.draft_id))fail(400,'INVALID_LAB_CASE','اختر مسودة جاهزة واختبر المسار دون بيانات شخص.');
  const old=state.cases.find(c=>c.id===p.id);if(old){if(old.draft_id!==p.draft_id)fail(409,'LAB_REQUEST_REUSED','معرف المثال مستخدم لمسودة مختلفة.');return state;}
  const d=state.drafts.find(d=>d.id===p.draft_id);if(!d||d.status!=='ready')fail(409,'LAB_DRAFT_NOT_READY','المسودة غير جاهزة للمراجعة.');
  const validity=workflow.validity(d,today);if(validity!=='current')fail(409,'LAB_PROCEDURE_NOT_CURRENT','لا تبدأ مثالًا بإجراء غير سارٍ أو مستحق المراجعة؛ انسخه لمراجعة صحيحة.');
  if(state.cases.length>=cap.cases)fail(409,'LAB_LIMIT','حد أمثلة الطلبات 50.');
  state.cases.push({id:p.id,draft_id:d.id,draft_revision:d.revision,type:d.type,network:d.network,status:'new',procedure:Object.fromEntries(draftKeys.filter(k=>!['id','status'].includes(k)).map(k=>[k,d[k]])),createdAt:at,history:[{status:'new',at}],syntheticOnly:true,bookingConfirmed:false,assignment:null,follow_up_at:'',missing:null});
 }else if(op==='assign_case'){
  const c=currentCase(state,p,['id','role_id','follow_up_at']);if(workflow.terminal(c.status))fail(409,'LAB_CASE_TRANSITION','المثال مغلق؛ لا تتغير مسؤوليته أو متابعته.');
  const role=state.roles.find(r=>r.id===p.role_id);if(!role||!workflow.date(p.follow_up_at)||p.follow_up_at<today)fail(400,'INVALID_LAB_ASSIGNMENT','اختر دور متابعة موجودًا وتاريخ متابعة غير سابق لليوم.');
  const assignment={id:role.id,label:role.label,channel:role.channel};if(JSON.stringify(c.assignment)===JSON.stringify(assignment)&&c.follow_up_at===p.follow_up_at)return state;
  c.assignment=assignment;c.follow_up_at=p.follow_up_at;transition(c,c.status,at,{action:'assigned',role_label:role.label,follow_up_at:p.follow_up_at});
 }else if(op==='case_status'){
  const c=currentCase(state,p,['id','status','reason','items']);if(!Object.hasOwn(workflow.caseStates,p.status))fail(400,'INVALID_LAB_CASE','لا تدعم المعاينة تأكيد حجز أو موافقة حقيقية.');
  if(p.status==='needs_info'){
   if(!Object.hasOwn(workflow.missingReasons,p.reason)||!Array.isArray(p.items)||new Set(p.items).size!==p.items.length||p.items.some(i=>!Number.isInteger(i)||i<0||i>=(c.procedure?.documents||[]).length)||p.reason==='documents'&&!p.items.length||p.reason!=='documents'&&p.items.length)fail(400,'INVALID_LAB_MISSING','حدد سبب الاستكمال والمتطلبات المسجلة فقط، دون ملفات أو بيانات صحية.');
  }else if(p.reason!==undefined||p.items!==undefined)fail(400,'INVALID_LAB_CASE','سبب الاستكمال خاص بمرحلة الاستكمال فقط.');
  if(c.status===p.status){if(p.status==='needs_info'&&JSON.stringify(c.missing)!==JSON.stringify({reason:p.reason,items:p.items}))fail(409,'LAB_CASE_TRANSITION','لا تستبدل طلب الاستكمال الحالي؛ استأنف الفحص أولًا.');return state;}
  const allowed={new:['review','rejected','cancelled'],review:['needs_info','completed','rejected','cancelled'],needs_info:['review','rejected','cancelled'],completed:[],rejected:[],cancelled:[]};
  if(!allowed[c.status].includes(p.status))fail(409,'LAB_CASE_TRANSITION','اتبع مراحل الفحص قبل إنهاء الاختبار.');
  if(['review','needs_info','completed'].includes(p.status)&&!c.assignment)fail(409,'LAB_ASSIGNMENT_REQUIRED','حدد دور المتابعة وتاريخه قبل فحص المثال.');
  c.missing=p.status==='needs_info'?{reason:p.reason,items:p.items}:null;
  transition(c,p.status,at,p.status==='needs_info'?{action:'missing',reason:p.reason,items:p.items}:{});
 }else fail(400,'INVALID_LAB_OPERATION','إجراء غير متاح في هذه المعاينة.');
 return state;
}
