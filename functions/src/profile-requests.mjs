import {ApiError,digits,phone} from './core.mjs';
import P from './member-profile.cjs';
export const effectiveProfile=(source,overrides={})=>{
 const values=P.project(source),overridden=[],conflicts=[];
 for(const field of P.fields){const entry=overrides[field.key];if(!entry)continue;if(values[field.key]===entry.sourceBefore){values[field.key]=entry.value;overridden.push(field.key);}else if(values[field.key]!==entry.value)conflicts.push(field.key);}
 return {values,overridden,conflicts};
};
export function proposedChanges(input,current,source){
 if(!input || Array.isArray(input) || typeof input!=='object' || Object.keys(input).some(k=>!P.fields.some(f=>f.key===k)))throw new ApiError(400,'INVALID_PROFILE','حقول الطلب غير صالحة.');
 const changes={};
 for(const [key,raw] of Object.entries(input)){
  const f=P.fields.find(f=>f.key===key);if(raw===current[key])continue;if(typeof raw!=='string'||raw.length>f.max||/[\u0000-\u001f<>]/.test(raw))throw new ApiError(400,'INVALID_PROFILE','راجع قيمة '+f.label+'.');
  let value=raw.trim();
  if(['phone','phone2'].includes(key) && value){value=phone(value);if(!value)throw new ApiError(400,'INVALID_PROFILE','أدخل رقم موبايل مصري كاملًا.');}
  if(key==='jobId'){value=digits(value);if(!/^[\p{L}\p{N}_-]{1,40}$/u.test(value))throw new ApiError(400,'INVALID_PROFILE','راجع كود الموظف.');}
  if(key==='email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new ApiError(400,'INVALID_PROFILE','راجع البريد الإلكتروني.');
  if((/Date$/.test(key)||['membershipExpiry','unionJoinDate'].includes(key)) && value && !P.date(value))throw new ApiError(400,'INVALID_PROFILE','راجع التاريخ واستخدم يوم/شهر/سنة أو YYYY-MM-DD.');
  if(['name','phone','jobId'].includes(key) && !value)throw new ApiError(400,'INVALID_PROFILE','لا يمكن ترك '+f.label+' فارغًا.');
  if(value!==current[key])changes[key]={before:current[key] || '',value,sourceBefore:source[key] || ''};
 }
 if(!Object.keys(changes).length)throw new ApiError(400,'NO_CHANGES','لم تغيّر أي بيانات.');
 return changes;
}
export function requireVersion(request,version){if(!request)throw new ApiError(404,'NOT_FOUND','الطلب غير موجود.');if(request.version!==version)throw new ApiError(409,'REQUEST_CHANGED','تغير الطلب؛ حدّث القائمة قبل اتخاذ القرار.');}
export function decisionFields(request,fields){
 if(!Array.isArray(fields)||new Set(fields).size!==fields.length||fields.some(k=>!Object.hasOwn(request.changes,k)))throw new ApiError(400,'INVALID_DECISION','اختر الحقول من الطلب الحالي فقط.');
 return [...fields].sort();
}
export function completeDecision(state,{fields,destination,note,actor,at,decisionHash}){
 const request=state.request,values={...state.overrides};
 for(const key of fields){if(destination==='app')values[key]={value:request.changes[key].value,sourceBefore:request.changes[key].sourceBefore,requestId:request.id,at};else delete values[key];}
 const status=!fields.length?'rejected':fields.length===Object.keys(request.changes).length?'approved':'partially_approved';
 const next={...request,status,approvedFields:fields,destination,note,decidedBy:actor,decidedAt:at,updated_at:at,version:request.version+1,decisionHash};
 const id=request.id+'_decision',message=status==='rejected'?'لم يُعتمد طلب تعديل بياناتك.':(status==='approved'?'تمت الموافقة على طلب تعديل بياناتك':'تمت الموافقة جزئيًا على طلب تعديل بياناتك')+(destination==='app'?' وتحديث البيانات في رعايتي فقط؛ سجل النقابة لم يتغير.':' وتأكيد تحديث الحقول المعتمدة في سجل النقابة الأصلي.');
 const notification={id,owner:request.owner,requestId:request.id,message,createdAt:at,readAt:null};
 return {request:next,overrides:values,ledger:{...state.ledger,pendingId:null,notificationVersion:(state.ledger.notificationVersion || 0)+1,notificationIds:[id,...(state.ledger.notificationIds || []).filter(v=>v!==id)].slice(0,50)},notification,result:{success:true,changed:true,status,destination}};
}
