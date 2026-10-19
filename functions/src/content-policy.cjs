(function(root,factory){const api=factory();if(typeof module==='object' && module.exports)module.exports=api;else root.MedicalContent=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const types={instruction:'تعليمات الخدمة',news:'خبر الشبكة',bulletin:'نشرة طبية'};
  const labels={draft:'مسودة',scheduled:'مجدول',published:'منشور',expired:'انتهى عرضه',archived:'مؤرشف',incomplete:'مرجع غير مكتمل',hidden:'مخفي'};
  const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
  function status(r,at=Date.now()){
    if(r.publication_status==='archived')return 'archived';
    if(r.publication_status!=='published')return 'draft';
    if(r.directory_visibility==='hidden')return 'hidden';
    if(!r.issuing_authority || !(r.source_reference || r.source_url) || !r.verified_at)return 'incomplete';
    const today=day(at);
    if((r.expires_at && r.expires_at<today) || (r.display_until && Date.parse(r.display_until)<=at))return 'expired';
    if((r.effective_from && r.effective_from>today) || (r.display_from && Date.parse(r.display_from)>at))return 'scheduled';
    return 'published';
  }
  const visible=(r,at)=>status(r,at)==='published';
  const announcement=r=>['news','bulletin'].includes(r.document_type);
  // Editing spelling or source details does not create another notification.
  const key=r=>String(r.id)+':publication:'+String(r.publication_revision || r.published_at || 'legacy');
  const order=r=>r.display_from || r.published_at || r.directory_update?.at || r.verified_at || '';
  // Form controls always describe Cairo wall time, independent of device timezone.
  function cairoInput(iso){
    if(!iso)return '';
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }
  function cairoISO(value){
    if(!value)return '';
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('راجع موعد العرض.');
    const wall=Date.parse(value+'Z');
    // Find the Cairo offset using the actual timezone database (including DST).
    for(const offset of [2,3]){const instant=wall-offset*3600000;if(cairoInput(instant)===value)return new Date(instant).toISOString();}
    throw new Error('هذا التوقيت غير متاح في القاهرة بسبب تغيير الساعة؛ اختر موعدًا آخر.');
  }
  return Object.freeze({types,labels,day,status,visible,announcement,key,order,cairoInput,cairoISO});
});
