/* P2 tools run only inside the server-authorized administrator workspace. */
window.MedicalVisitWorkspace=(()=>{
 const revision='p2-visit-20261021-1';
 function mount({api,el,act,row,valid,notice,model,data,onFatal}){
  const M=window.MedicalDirectoryModel;let disposed=false,sequence=0,busy=false,filter='';
  const alive=holder=>!disposed&&valid()&&holder.isConnected;
  const stamp=at=>new Intl.DateTimeFormat('ar-EG',{timeZone:'Africa/Cairo',dateStyle:'medium',timeStyle:'short'}).format(new Date(at));
  function options(label,entries,value=''){const select=el('select',{'aria-label':label},Object.entries(entries).map(([key,text])=>el('option',{value:key},text)));select.value=value||Object.keys(entries)[0];return select;}
  function createForm(holder,p,b,v,done,preferred=''){
   const issue=options('نوع البلاغ التجريبي',data.issues),networks=Object.fromEntries(v.network.map(n=>[n,M.networkText([n])])),network=options('شبكة البلاغ التجريبي',networks,Object.hasOwn(networks,preferred)?preferred:preferred==='family'&&Object.hasOwn(networks,'retiree')?'retiree':'');
   const form=el('form',{class:'form-stack visit-report-form'},el('h3',{},'اختبار بلاغ عن هذا المقر'),el('p',{class:'notice'},'أمثلة جاهزة لاختبار المسار فقط. لا تُرسل بلاغًا حقيقيًا أو بيانات عضو؛ لن يتغير الدليل.'),el('label',{},'نوع المثال',issue),el('label',{},'شبكة المستفيد',network));
   const submit=el('button',{type:'submit',class:'button primary'},'إنشاء بلاغ تجريبي');submit.disabled=!v.network.length;form.append(submit);holder.append(form);
   let requestId=crypto.randomUUID().replaceAll('-','');
   form.onsubmit=async event=>{event.preventDefault();if(busy||!alive(holder))return;busy=true;submit.disabled=true;try{const result=await api.createLabVisitReport({request_id:requestId,previewRevision:revision,target_id:b.target,branch_id:b.id,network:network.value,issue:issue.value});if(!alive(holder))return;notice(result.changed?'حُفظ المثال في مساحة التجارب فقط.':'هذا المثال مفتوح بالفعل؛ عُرض دون تكرار.');requestId=crypto.randomUUID().replaceAll('-','');done();}catch(e){if(alive(holder)){if([401,403].includes(e.status)||e.code==='LAB_PAUSED')onFatal(e);else notice(e.message);}}finally{busy=false;if(alive(holder))submit.disabled=!v.network.length;}};
  }
  function prepare(holder,p,b,v,{checked={},selectedNetwork='',change,showReports}){
   holder.append(el('div',{class:'visit-summary'},el('span',{class:'eyebrow'},'ملخص الزيارة · معاينة خاصة'),el('h3',{},p.name),row('districts',[v.city,v.hospital,v.address].filter(Boolean).join(' · ')||'العنوان غير متاح'),row('clock',v.hours||'لم تُسجل مواعيد لهذا المقر'),row('users',M.networkText(v.network)||'شبكة غير محددة'),el('p',{class:'directory-service-state '+(b.suspended||v.raw.service_status==='suspended'?'suspended':'active')},b.suspended||v.raw.service_status==='suspended'?'موقوف مؤقتًا؛ راجع حالة الجهة قبل التحرك':'مدرج في الدليل المنشور')));
   const phoneGroups=el('div',{class:'visit-phone-groups'});for(const [key,label]of [['mobile','محمول'],['landline','أرضي'],['shortcode','مختصر']])if(v.phones[key].length)phoneGroups.append(el('section',{},el('h4',{},label+(v.reception?' · استقبال المستشفى':'')),v.phones[key].map(n=>el('a',{href:'tel:'+n,class:'phone-chip',dir:'ltr'},n))));holder.append(phoneGroups);
   const parts=window.MedicalLocations.parts(v.address);for(const part of parts){const map=model.mapLink(p,{...v,maps:parts.length===1?v.maps:''},part.text);if(map)holder.append(el('a',{class:'button outline',href:map.href,target:'_blank',rel:'noopener noreferrer'},map.label+' · '+part.text));}
   holder.append(el('p',{class:'notice'},'ملخص معلومات للزيارة، وليس حجزًا أو موافقة تغطية. لا توجد شروط تحمل أو مستندات أو تحضيرات مفترضة.'));
   const list=el('fieldset',{class:'visit-checklist'},el('legend',{},'قبل أن تتحرك'),el('p',{class:'muted'},'اختياراتك داخل هذه المعاينة فقط؛ لا تؤكد الخدمة أو تحدّث بياناتها.'));
   for(const [id,label]of [['address','راجعت عنوان المقر المختار'],['hours','راجعت المواعيد المسجلة'],['contact','اتصلت بالجهة للتأكد من المعلومات']]){const input=el('input',{type:'checkbox',checked:checked[id]===true});input.onchange=()=>change(id,input.checked);list.append(el('label',{},input,label));}holder.append(list);
   const docs=(data.catalog.medical_guidelines||[]).filter(r=>r.document_type!=='news'&&window.MedicalContent.visible(r)&&(!Array.isArray(r.network_members)||!r.network_members.length||r.network_members.some(n=>v.network.includes(n))));
   holder.append(el('h3',{},'تعليمات منشورة بالدليل'),el('p',{class:'muted'},'تعليمات عامة منشورة؛ لا تُنسب لهذه الجهة دون ربط صريح من مصدرها.'));
   if(!docs.length)holder.append(el('p',{class:'empty'},'لا توجد تعليمات منشورة متاحة لهذه الشبكة حاليًا.'));
   for(const doc of docs.slice(0,5))holder.append(el('details',{class:'visit-guideline'},el('summary',{},M.text(doc.title)),el('p',{},M.text(doc.summary)),el('ol',{},(doc.steps||[]).map(step=>el('li',{},M.text(step)))),el('small',{class:'muted'},[doc.issuing_authority,doc.source_reference,doc.verified_at].map(M.text).filter(Boolean).join(' · '))));
   holder.append(act('فتح مركز البلاغات التجريبية',showReports,'guidelines'));createForm(holder,p,b,v,showReports,selectedNetwork);
  }
  async function reports(holder,back){
   if(!alive(holder))return;const turn=++sequence;holder.replaceChildren(act('العودة إلى المعاينة',back,'arrow'),el('h2',{},'مركز البلاغات التجريبية'),el('p',{class:'notice'},'بلاغات مصطنعة للمدير فقط، محفوظة في مساحة منفصلة. إكمال التجربة لا يصحح سجلًا ولا ينشئ إشعارًا للأعضاء.'),el('p',{role:'status'},'جارٍ التحقق وتحميل التجارب…'));
   try{const result=await api.labVisitReports();if(!alive(holder)||turn!==sequence)return;if(result.previewRevision!==revision||result.syntheticOnly!==true||result.memberEnabled!==false)throw new Error('لم تؤكد الخدمة عزل البلاغات التجريبية.');
    const select=options('تصفية حالة البلاغات التجريبية',{'':'كل الحالات',...data.states},filter);select.value=filter;select.onchange=()=>{filter=select.value;void reports(holder,back);};const table=el('div',{class:'visit-report-list'});
    holder.replaceChildren(act('العودة إلى المعاينة',back,'arrow'),el('h2',{},'مركز البلاغات التجريبية'),el('p',{class:'notice'},'مساحة اختبار فقط؛ لا تعديل للدليل ولا إشعارات للأعضاء.'),el('div',{class:'visit-counters'},Object.entries(data.states).map(([key,label])=>el('div',{},el('strong',{},result.reports.filter(r=>r.status===key).length),el('span',{},label)))),el('label',{class:'form-field'},'الحالة',select),table);
    const shown=result.reports.filter(r=>!filter||r.status===filter).sort((a,b)=>b.updatedAt-a.updatedAt);if(!shown.length)table.append(el('p',{class:'empty'},'لا توجد تجارب بهذه الحالة. افتح جهة واختر «جهّز زيارتي» لإنشاء مثال.'));
    for(const report of shown){const p=model.providers.find(p=>p.branches.some(b=>b.target===report.target_id&&b.id===report.branch_id)),branch=p?.branches.find(b=>b.id===report.branch_id),v=branch?.views.find(v=>v.network.includes(report.network));
     const article=el('article',{class:'visit-report-card','data-visit-report':report.id},el('div',{class:'section-heading'},el('h3',{},data.issues[report.issue]),el('span',{class:'lab-state '+report.status},data.states[report.status])),el('strong',{},p?.name||'جهة غير متاحة في اللقطة الحالية'),el('p',{},[v?.city,v?.address,M.networkText([report.network])].filter(Boolean).join(' · ')),el('code',{dir:'ltr',class:'visit-tracking'},report.tracking),el('small',{class:'muted'},stamp(report.updatedAt)),el('p',{class:'muted'},report.outcome?data.outcomes[report.outcome]:'لم تكتمل التجربة بعد'));
     const run=async(status,outcome='')=>{if(busy||!alive(article))return;busy=true;const controls=[...article.querySelectorAll('button,select')];controls.forEach(n=>n.disabled=true);try{await api.decideLabVisitReport(report.id,{expected_version:report.version,previewRevision:revision,status,outcome});if(alive(holder))await reports(holder,back);}catch(e){if(alive(holder)){if(e.code==='LAB_PAUSED')onFatal(e);else{notice(e.message);await reports(holder,back);}}}finally{busy=false;if(alive(article))controls.forEach(n=>n.disabled=false);}};
     if(report.previewRevision===revision){const actions=el('div',{class:'visit-report-actions'});if(report.status==='new')actions.append(act('بدء الفحص',()=>run('in_review'),'search','button primary'));if(report.status==='in_review'){const outcome=options('نتيجة الفحص التجريبي',data.outcomes);actions.append(outcome,act('إكمال التجربة',()=>run('resolved',outcome.value),'info','button primary'));}if(['new','in_review'].includes(report.status))actions.append(act('استبعاد التجربة',()=>run('dismissed')));article.append(actions);}
     article.append(el('details',{},el('summary',{},'سجل التجربة ('+report.history.length+')'),el('ol',{},report.history.map(h=>el('li',{},data.states[h.status]+' · '+stamp(h.at))))));table.append(article);
    }
   }catch(e){if(alive(holder)&&turn===sequence){if(e.code==='LAB_PAUSED')onFatal(e);else holder.append(el('p',{class:'notice warning',role:'alert'},e.message),act('إعادة المحاولة',()=>reports(holder,back)));}}
  }
  return {prepare,reports,dispose(){disposed=true;++sequence;model=null;data=null;}};
 }
 return Object.freeze({mount});
})();
