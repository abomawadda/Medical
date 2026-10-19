import {ApiError} from './core.mjs';
import P from './member-profile.cjs';
import {effectiveProfile,proposedChanges,requireVersion,decisionFields,completeDecision} from './profile-requests.mjs';
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const ownView=({owner,sourceId,decidedBy,sourceFingerprint,intent,decisionHash,submissionHash,...r})=>r;
export function profileService({source,store,sourceWriter,authorize,digest,rate,now}){
 const read=async s=>{const original=await source.getMemberProfile(s.sourceId);if(!original)fail(401,'SESSION_EXPIRED','يرجى تسجيل الدخول مجددًا.');const overrides=await store.getProfileOverrides(s.subject);return {original,sourceValues:P.project(original),...effectiveProfile(original,overrides)};};
 const signature=(s,values)=>digest(JSON.stringify([s.subject,values]));
 return {
  async memberProfile(token){const s=await authorize(token,'member'),data=await read(s),v=data.values,activity=await store.getMemberActivity(s.subject);return {profile:{name:v.name,employeeCode:v.jobId,membershipCode:v.membershipId,jobTitle:v.jobTitle,workplace:v.workplace,phone:v.phone,email:v.email,memberState:v.memberState,membershipType:v.membershipStatus,workState:P.workState(v,now()),fields:v,overriddenFields:data.overridden,conflictingOverrides:data.conflicts,profileRequests:true,lastLoginAt:activity.lastLoginAt || null,previousLoginAt:activity.previousLoginAt || null}};},
  async profileEdit(token){const s=await authorize(token,'member'),data=await read(s);return {values:data.values,snapshot:signature(s,{source:data.sourceValues,current:data.values}),fields:P.fields};},
  async submitProfileRequest(token,body){
   const s=await authorize(token,'member');if(!/^[a-f0-9]{32}$/.test(body.request_id || ''))fail(400,'INVALID_REQUEST','معرف طلب غير صالح.');
   const id=digest(s.subject+'|'+body.request_id),submissionHash=digest(JSON.stringify([body.snapshot,body.values]));
   const existing=await store.profileRead(id);if(existing){if(existing.owner!==s.subject||existing.submissionHash!==submissionHash)fail(409,'REQUEST_CHANGED','معرف الطلب مستخدم لمحتوى آخر.');return {success:true,changed:false,id};}
   await rate('','profile-request',10,s.subject);
   const data=await read(s);if(body.snapshot!==signature(s,{source:data.sourceValues,current:data.values}))fail(409,'SOURCE_CHANGED','تغيرت بياناتك منذ فتح النموذج؛ أعد تحميلها قبل إرسال الطلب.');
   const changes=proposedChanges(body.values,data.values,data.sourceValues),at=now();
   return store.profileTransact(s.subject,id,state=>{
    if(state.request){if(state.request.submissionHash!==submissionHash)fail(409,'REQUEST_CHANGED','معرف الطلب مستخدم.');return {result:{success:true,changed:false,id}};}
    if(state.ledger.pendingId)fail(409,'REQUEST_PENDING','لديك طلب لم يُحسم بعد؛ تابعه أو ألغِه قبل إنشاء طلب جديد.');
    const request={id,owner:s.subject,sourceId:s.sourceId,memberName:data.sourceValues.name,employeeCode:data.sourceValues.jobId,changes,status:'pending',version:1,createdAt:at,updated_at:at,submissionHash};
    return {request,ledger:{...state.ledger,pendingId:id,requestIds:[id,...(state.ledger.requestIds || [])].slice(0,50)},result:{success:true,changed:true,id}};
   },s.sourceId,at);
  },
  async ownProfileRequests(token){const s=await authorize(token,'member');return {requests:(await store.profileOwn(s.subject)).map(ownView)};},
  async cancelProfileRequest(token,id,body){const s=await authorize(token,'member'),at=now();return store.profileTransact(s.subject,id,state=>{if(state.request?.owner!==s.subject)fail(404,'NOT_FOUND','الطلب غير موجود.');if(state.request.status==='cancelled')return {result:{success:true,changed:false}};requireVersion(state.request,body.version);if(state.request.status!=='pending')fail(409,'REQUEST_CHANGED','لا يمكن إلغاء طلب جرى البت فيه أو بدأ تطبيقه.');return {request:{...state.request,status:'cancelled',version:state.request.version+1,updated_at:at},ledger:{...state.ledger,pendingId:null},result:{success:true,changed:true}};},s.sourceId,at);},
  async adminProfileRequests(token){await authorize(token,'admin');return {requests:await store.profileAdmin(),sourceWriterConfigured:!!sourceWriter};},
  async decideProfileRequest(token,id,body){
   const s=await authorize(token,'admin');const request=await store.profileRead(id);if(!request)fail(404,'NOT_FOUND','الطلب غير موجود.');
   const fields=decisionFields(request,body.fields);if(!['app','source'].includes(body.destination))fail(400,'INVALID_DECISION','اختر وجهة التحديث.');
   const note=typeof body.note==='string'?body.note.trim():'';if(note.length>500)fail(400,'INVALID_DECISION','ملاحظة القرار طويلة.');
   const decisionHash=digest(JSON.stringify([fields,body.destination,note]));
   if(['approved','partially_approved','rejected'].includes(request.status)){if(request.decisionHash===decisionHash)return {success:true,changed:false,status:request.status,destination:request.destination};fail(409,'REQUEST_CHANGED','تم حسم الطلب بالفعل.');}
   if(body.destination==='source' && fields.length && !sourceWriter)fail(409,'SOURCE_WRITER_UNAVAILABLE','تحديث المصدر غير مربوط بهوية كتابة منفصلة؛ اختر التطبيق فقط أو أكمل الربط أولًا.');
   const currentSource=await source.getMemberProfile(request.sourceId);if(!currentSource)fail(409,'SOURCE_CHANGED','لم يعد سجل العضو موجودًا.');
   const current=P.project(currentSource),overrides=await store.getProfileOverrides(request.owner),effective=effectiveProfile(currentSource,overrides).values;
   for(const key of fields){const change=request.changes[key],before=body.destination==='source'?change.sourceBefore:change.before,actual=body.destination==='source'?current[key]:effective[key];if(actual!==before && actual!==change.value)fail(409,'SOURCE_CHANGED','تغير أحد الحقول المطلوبة؛ راجع البيانات الحالية قبل الاعتماد.');}
   const at=now();
   if(body.destination==='source' && fields.length){
    await store.profileTransact(request.owner,id,state=>{if(state.request.status==='applying'&&state.request.intent?.hash===decisionHash)return {result:{success:true}};requireVersion(state.request,body.version);if(state.request.status!=='pending')fail(409,'REQUEST_CHANGED','تغيرت حالة الطلب.');return {request:{...state.request,status:'applying',version:state.request.version+1,updated_at:at,intent:{hash:decisionHash,fields,destination:body.destination,note}},result:{success:true}};},s.sourceId,at);
    try{await sourceWriter.updateProfile(request.sourceId,Object.fromEntries(fields.map(key=>[key,request.changes[key]])));}catch(e){if(e instanceof ApiError)throw e;fail(503,'SOURCE_UPDATE_FAILED','تعذر تأكيد تحديث المصدر. يبقى الطلب قيد التطبيق؛ أعد المحاولة بنفس الاختيارات، ولن يُعتمد تحديث وهمي.');}
   }
   return store.profileTransact(request.owner,id,state=>{
    if(state.request.decisionHash===decisionHash)return {result:{success:true,changed:false,status:state.request.status}};
    if(body.destination==='source'&&fields.length){if(state.request.status!=='applying'||state.request.intent?.hash!==decisionHash)fail(409,'REQUEST_CHANGED','تغيرت عملية التطبيق.');}
    else {requireVersion(state.request,body.version);if(state.request.status!=='pending')fail(409,'REQUEST_CHANGED','تغيرت حالة الطلب.');}
    return completeDecision(state,{fields,destination:body.destination,note,actor:s.sourceId,at:now(),decisionHash});
   },s.sourceId,now());
  },
  async profileNotifications(token,version){const s=await authorize(token,'member');if(version!==undefined && (!Number.isSafeInteger(version)||version<0))fail(400,'INVALID_REQUEST','نسخة الإشعارات غير صالحة.');const result=await store.profileNotifications(s.subject,version);return result.notModified?result:{version:result.version,notifications:result.notifications.map(({owner,...r})=>r)};},
  async readProfileNotification(token,id){const s=await authorize(token,'member');return store.profileMarkRead(s.subject,id,now());}
 };
}
