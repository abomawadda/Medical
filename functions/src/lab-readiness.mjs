import {createHash} from 'node:crypto';
import workflow from './service-workflow.cjs';
import {labFeatures,labProjection} from './development-lab.mjs';
import {roadmapTarget} from './lab-roadmap.mjs';
export const readinessRevision='p0-readiness-20261021-1';
const metadata=rows=>labFeatures.map(f=>{const p=labProjection(f,rows[f.id]);return {id:p.id,title:p.title,previewRevision:p.previewRevision,previewEnabled:p.previewEnabled,review:p.review,staleApproval:p.staleApproval,version:p.version};});
const guardVersion=features=>createHash('sha256').update(JSON.stringify(features)).digest('hex');
export function readinessService({store,authorize,now,readDirectory}){return {
 async labReadiness(token,statusOnly=false){
  const actor=await authorize(token,'admin'),features=metadata(await store.labReadAll()),base={audience:'admin',memberEnabled:false,releaseSupported:false,revision:readinessRevision,guardVersion:guardVersion(features)};
  if(statusOnly)return base;
  const enabled=id=>features.find(f=>f.id===id)?.previewEnabled===true;
  const [careSaved,planningSaved,visitsSaved,data]=await Promise.all([enabled('care_companion')?store.labWorkspaceRead('care_companion',actor.sourceId):{},enabled('service_planning')?store.labWorkspaceRead('service_planning',actor.sourceId):{},enabled('visit_workspace')?store.labScenarioRead('visit_workspace'):{},readDirectory()]);
  const at=now(),today=workflow.day(at),care=careSaved.state||{},planning=planningSaved.state||{},visits=visitsSaved.rows||[],stats=workflow.summary(planning,today),catalog=data.catalog;
  const pins=(care.pins||[]).filter(p=>p.previewOnly===true&&roadmapTarget(catalog,p.ref));
  const phase=(id,title,ids,counts,blockers)=>{const picked=features.filter(f=>ids.includes(f.id));return {id,title,features:picked,previewStatus:picked.every(f=>f.previewEnabled)?picked.every(f=>f.review==='approved')?'reviewed':'awaiting_review':'paused',evidence:picked.some(f=>!f.previewEnabled)?[]:counts,blockers,memberEnabled:false};};
  const phases=[
   phase('P0','المعاينة والعزل',['compact_home','provider_card','provider_details'],[],['تعميم الميزات للأعضاء غير مدعوم في هذه النسخة.','إثبات النسخ الاحتياطي والاستعادة ومراقبة التكلفة من حساب Google المخول.']),
   phase('P1','التصميم والوصول',['directory_experience'],[],['إتمام قبول الرحلة مع المستخدمين وقرار تفعيل مستقل.','شاشة الدليل المقترحة للقراءة؛ كتابة التقييم تظل في واجهة العضو الحالية.']),
   phase('P2','الزيارة وصحة المعلومات',['visit_workspace'],[{label:'أمثلة بلاغات محفوظة في المعمل',count:visits.length},{label:'أمثلة مفتوحة',count:visits.filter(r=>['new','in_review'].includes(r.status)).length},{label:'أمثلة اكتمل مسارها',count:visits.filter(r=>r.status==='resolved').length}],['ربط استقبال بلاغات الأعضاء ومسؤول الفحص والرد وسياسة الاحتفاظ قبل تشغيلها لهم.']),
   phase('P3','رعاية أقرب وتحديثات شخصية',['care_companion'],[{label:'مقار يتابعها حساب الإدارة الحالي',count:(care.follows||[]).length},{label:'دبابيس معاينة لمقار منشورة',count:pins.length}],['اعتماد المواقع لخدمة الأعضاء وسياسة المتابعة وإشعاراتها.','متابعة الإدارة تُفحص عند الطلب، وليست تحديثًا لحظيًا للأعضاء.']),
   phase('P4','إجراءات الشركة والطلبات',['service_planning'],[{label:'مسودات سارية للتجربة',count:stats.drafts.current},{label:'أدوار متابعة أدخلها المدير',count:(planning.roles||[]).length},{label:'أمثلة بلا إسناد',count:stats.unassigned},{label:'أمثلة تجاوزت تاريخ المتابعة',count:stats.overdue}],[...(stats.drafts.current?[]:['إضافة إجراء بمصدر وسريان ومراجعة وقناة تقديم.']),...((planning.roles||[]).length?[]:['تحديد أدوار المتابعة وقنواتها من نظام الشركة.']),'اعتماد قواعد الشركة وسلطات القرار وزمن الخدمة والخصوصية قبل طلبات الأعضاء.']),
   phase('P5','المواعيد',['service_planning'],[{label:'أمثلة طلب موعد فقط',count:(planning.cases||[]).filter(c=>c.type==='appointment').length},{label:'حجوزات مؤكدة',count:0}],['لا يوجد اتفاق أو ربط فعلي للحجز؛ لا تؤكد المعاينة موعدًا.','يلزم مصدر المواعيد وقناة رد الجهة وسياسة الإلغاء.']),
   phase('P6','المشوار والتغذية الراجعة',['care_companion'],[{label:'محطات مشوار الإدارة',count:(care.journey||[]).length},{label:'فروق مرصودة محفوظة — غير المحاكاة',count:(care.events||[]).filter(e=>!e.simulated).length},{label:'أمثلة ملاحظات الوصول',count:(care.feedback||[]).length}],['تعريف مقاييس تجميع فعلية وسياسة خصوصية قبل تقارير الأعضاء.','أعداد المعمل لا تمثل استخدام الأعضاء أو نتائج علاجية.']),
  ];
  return {...base,checkedAt:at,today,scope:'admin-sandbox',bookingConnected:false,phases};
 },
};}
