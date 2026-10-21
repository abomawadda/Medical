/* Shared, deterministic planning rules. No entitlement or booking decision is inferred. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MedicalServiceWorkflow=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const validityLabels={draft:'مسودة',archived:'مؤرشفة',incomplete:'السريان يحتاج استكمالًا',future:'لم يبدأ السريان',expired:'انتهى السريان',review_due:'حان موعد مراجعة المصدر',current:'سارية للتجربة الخاصة'};
 const caseStates={new:'طلب تجريبي جديد',review:'قيد الفحص التجريبي',needs_info:'بانتظار استكمال المثال',completed:'انتهى الاختبار',rejected:'استُبعد المثال',cancelled:'أُلغي المثال'};
 const missingReasons={documents:'استكمال قائمة المتطلبات',source:'مراجعة مصدر الإجراء',channel:'تأكيد قناة التقديم',provider:'انتظار رد الجهة — محاكاة'};
 const terminal=status=>['completed','rejected','cancelled'].includes(status);
 const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(at);
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const normalize=d=>({valid_from:'',valid_until:'',review_by:'',documents:[],submission_channel:'',service_window:'',...d});
 function validity(d,today){
  if(d.status==='archived')return 'archived';if(d.status!=='ready')return 'draft';
  if(!date(d.valid_from)||!date(d.review_by)||d.valid_until&&(!date(d.valid_until)||d.valid_until<d.valid_from)||d.review_by<d.valid_from||!date(d.source_date)||d.source_date>today||d.review_by<d.source_date||!d.submission_channel?.trim()||!(d.source_reference?.trim()||d.source_url?.trim())||!d.authority?.trim()||!d.responsible?.trim()||!d.steps?.length)return 'incomplete';
  if(d.valid_until&&d.valid_until<today)return 'expired';if(d.review_by<today)return 'review_due';if(d.valid_from>today)return 'future';return 'current';
 }
 function caseView(c,today){return {...c,terminal:terminal(c.status),overdue:!terminal(c.status)&&!!c.follow_up_at&&c.follow_up_at<today};}
 function summary(state,today){
  const drafts=state.drafts||[],cases=(state.cases||[]).map(c=>caseView(c,today)),counts=Object.fromEntries(Object.keys(validityLabels).map(k=>[k,0]));
  drafts.forEach(d=>counts[validity(d,today)]++);
  return {drafts:counts,totalCases:cases.length,open:cases.filter(c=>!c.terminal).length,unassigned:cases.filter(c=>!c.terminal&&!c.assignment).length,overdue:cases.filter(c=>c.overdue).length,needsInfo:cases.filter(c=>c.status==='needs_info').length,cancelled:cases.filter(c=>c.status==='cancelled').length,completed:cases.filter(c=>c.status==='completed').length};
 }
 return Object.freeze({validityLabels,caseStates,missingReasons,terminal,day,date,normalize,validity,caseView,summary});
});
