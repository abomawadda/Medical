import {ApiError} from './core.mjs';
import facilities from './facility-directory.cjs';
export const visitRevision='p2-visit-20261021-1',visitId='visit_workspace';
export const visitIssues=Object.freeze({phone:'رقم لا يعمل — مثال تجريبي',address:'عنوان تغير — مثال تجريبي',hours:'مواعيد تحتاج مراجعة — مثال تجريبي',contract:'استفسار تعاقد — مثال تجريبي',name:'اسم أو تخصص — مثال تجريبي'});
export const visitStates=Object.freeze({new:'تجربة جديدة',in_review:'قيد الفحص التجريبي',resolved:'اكتملت التجربة',dismissed:'استُبعدت التجربة'});
export const visitOutcomes=Object.freeze({checked:'اكتمل اختبار الفحص',needs_confirmation:'مثال يتطلب الرجوع للمصدر',not_reproduced:'لم تتكرر المشكلة في المثال'});
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const keys=(body,allowed)=>body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(k=>allowed.includes(k));
export function assertVisit(saved={},revision){
 if(revision!==visitRevision)fail(409,'LAB_REVISION_CHANGED','تغير إصدار تجربة الزيارة؛ حدّث المعاينة.');
 if(saved.previewEnabled===false)fail(409,'LAB_PAUSED','هذه المعاينة موقوفة؛ يمكن استئنافها من المعمل.');
}
function targetExists(catalog,body){
 const {target_id:target,branch_id:branch,network}=body;
 if(typeof target!=='string'||target.length>200||typeof branch!=='string'||branch.length>128||!['employee','family','retiree'].includes(network))return false;
 if(target.startsWith('doctor:'))return (catalog.records||[]).some(r=>'doctor:'+r.provider_id===target&&String(r.id)===branch&&r.network_members?.includes(network));
 const kind=target.split(':')[0];if(!['hospitals','labs','radiology','pharmacies','specialized_centers'].includes(kind))return false;
 return facilities.organizations(kind,catalog[kind]||[]).some(org=>org.branches.some(b=>String(b.id)===branch&&target===kind+':'+b.id&&b.entries.some(r=>r.network_members?.includes(network))));
}
const publicRow=row=>{const {actor,...rest}=row;return {...rest,history:row.history.map(({actor,...entry})=>entry)};};
export function visitLabService({store,authorize,now,readDirectory}){return {
 async labVisitReports(token){await authorize(token,'admin');assertVisit(await store.labRead(visitId),visitRevision);const saved=await store.labScenarioRead(visitId);return {previewRevision:visitRevision,syntheticOnly:true,memberEnabled:false,reports:(saved.rows||[]).map(publicRow)};},
 async createLabVisitReport(token,body){
  const session=await authorize(token,'admin');assertVisit(await store.labRead(visitId),body?.previewRevision);
  if(!keys(body,['request_id','previewRevision','target_id','branch_id','network','issue'])||!/^[a-f0-9]{32}$/.test(body.request_id)||!Object.hasOwn(visitIssues,body.issue))fail(400,'INVALID_LAB_REPORT','اختر نوع التجربة والجهة والمقر والشبكة. لا ترسل نصوصًا أو بيانات أعضاء.');
  const directory=await readDirectory();if(!targetExists(directory.catalog,body))fail(404,'LAB_TARGET_UNAVAILABLE','هذا المقر أو شبكته غير متاحين في الدليل المنشور؛ حدّث المعاينة.');
  return store.labScenarioTransact(visitId,(saved,feature)=>{
   assertVisit(feature,body.previewRevision);const rows=saved.rows||[],id=body.request_id,prior=rows.find(r=>r.id===id),intent={target_id:body.target_id,branch_id:body.branch_id,network:body.network,issue:body.issue};
   if(prior){if(prior.previewRevision!==visitRevision||Object.entries(intent).some(([k,v])=>prior[k]!==v))fail(409,'LAB_REQUEST_REUSED','معرف التجربة مستخدم لبيانات مختلفة.');return {changed:false,report:publicRow(prior)};}
   const duplicate=rows.find(r=>r.previewRevision===visitRevision&&['new','in_review'].includes(r.status)&&Object.entries(intent).every(([k,v])=>r[k]===v));if(duplicate)return {changed:false,report:publicRow(duplicate)};
   // Never evict an open case; terminal examples may age out after the documented limit.
   const retained=[...rows];if(retained.length>=100){const at=retained.findIndex(r=>['resolved','dismissed'].includes(r.status));if(at<0)fail(409,'LAB_REPORT_LIMIT','يوجد 100 مثال مفتوح؛ أغلق بعض التجارب قبل إضافة أخرى.');retained.splice(at,1);}
   const at=now(),row={id,tracking:'LAB-'+id.toUpperCase(),...intent,syntheticOnly:true,previewRevision:visitRevision,status:'new',outcome:'',version:1,createdAt:at,updatedAt:at,actor:session.sourceId,history:[{status:'new',at,actor:session.sourceId}]};
   return {changed:true,next:{rows:[...retained,row]},report:publicRow(row)};
  });
 },
 async decideLabVisitReport(token,id,body){
  const session=await authorize(token,'admin');assertVisit(await store.labRead(visitId),body?.previewRevision);
  if(!/^[a-f0-9]{32}$/.test(id)||!keys(body,['expected_version','previewRevision','status','outcome'])||!Number.isSafeInteger(body.expected_version)||body.expected_version<1||!['in_review','resolved','dismissed'].includes(body.status)||typeof body.outcome!=='string'||(body.status==='resolved'?!Object.hasOwn(visitOutcomes,body.outcome):body.outcome!==''))fail(400,'INVALID_LAB_REPORT','راجع حالة التجربة ونتيجة الفحص.');
  return store.labScenarioTransact(visitId,(saved,feature)=>{
   assertVisit(feature,body.previewRevision);const rows=saved.rows||[],row=rows.find(r=>r.id===id);if(!row)fail(404,'LAB_REPORT_NOT_FOUND','هذه التجربة غير موجودة.');
   if(row.previewRevision!==visitRevision)fail(409,'LAB_REVISION_CHANGED','هذه تجربة من إصدار سابق؛ أنشئ مثالًا جديدًا.');
   if(row.status===body.status&&row.outcome===body.outcome)return {changed:false,report:publicRow(row)};
   if(row.version!==body.expected_version)fail(409,'LAB_REPORT_CONFLICT','حُفظ قرار أحدث؛ حدّث المركز قبل المتابعة.');
   const allowed=row.status==='new'?['in_review','dismissed']:row.status==='in_review'?['resolved','dismissed']:[];
   if(!allowed.includes(body.status))fail(409,'LAB_REPORT_TRANSITION','ابدأ الفحص قبل الإغلاق؛ التجربة المغلقة لا يُعاد تعديلها.');
   const at=now(),nextRow={...row,status:body.status,outcome:body.outcome,version:row.version+1,updatedAt:at,actor:session.sourceId,history:[...row.history,{status:body.status,outcome:body.outcome,at,actor:session.sourceId}].slice(-8)};
   return {changed:true,next:{rows:rows.map(r=>r.id===id?nextRow:r)},report:publicRow(nextRow)};
  });
 },
};}
