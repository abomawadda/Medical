/* Procedure and request operations remain inside the server-authorized administrator sandbox. */
window.MedicalServiceWorkspace=(()=>{
 const W=window.MedicalServiceWorkflow,keys=['id','title','type','network','source_reference','source_url','source_date','authority','steps','responsible','status','valid_from','valid_until','review_by','documents','submission_channel','service_window'];
 const uid=()=>crypto.randomUUID().replaceAll('-','');
 function render(ctx){
  const {panel,workspace,scene,memory,el,act,save,select,stamp,draw,notice}=ctx,state=workspace.state,today=workspace.today,policy=scene.policy,network=n=>window.MedicalDirectoryModel.networkText([n]);
  const label=(text,control,className='')=>el('label',{class:className},text,control);
  const text=(name,title,value,type='text',max=160)=>el('input',{type,value,maxlength:max,'aria-label':title});
  const cleanDraft=d=>Object.fromEntries(keys.map(k=>[k,W.normalize(d)[k]]));
  function edit(d,copy=false){memory.form=cleanDraft(d);if(copy){memory.form.id=uid();memory.form.status='draft';}memory.formBaseRevision=copy?0:d.revision;draw();}
  function source(d){return el('div',{class:'service-source'},el('strong',{},'مرجع الإجراء'),el('p',{},[d.authority,d.source_reference].filter(Boolean).join(' · ')),d.source_url?el('a',{href:d.source_url,target:'_blank',rel:'noopener noreferrer'},'فتح المصدر'):null,el('small',{},'مراجعة المصدر: '+(d.source_date||'غير محددة')+' · بداية السريان: '+(d.valid_from||'غير محددة')+' · حتى: '+(d.valid_until||'لم يحدد المصدر نهاية')),el('small',{},'المراجعة التالية: '+(d.review_by||'غير محددة')),el('p',{},'قناة التقديم: '+(d.submission_channel||'غير محددة')),el('p',{},'زمن الخدمة من المصدر: '+(d.service_window||'لم يحدد المصدر مهلة')));}
  function draftForm(){
   if(!memory.form){memory.form=W.normalize({id:uid(),title:'',type:'instruction',network:'employee',source_reference:'',source_url:'',source_date:'',authority:'',responsible:'',steps:[],status:'draft'});memory.formBaseRevision=0;}
   const f=memory.form,form=el('form',{class:'form-stack roadmap-draft-form'},el('h3',{},'مسودة إجراء خاصة'),el('p',{class:'notice'},'السريان والمصدر وقناة التقديم من قواعد الشركة التي تدخلها أنت؛ لا تنشر هذه المسودة للأعضاء. لا تُدخل ملفات أو بيانات أشخاص.'));
   for(const [k,title,type,max]of [['title','اسم المسودة','text',160],['source_reference','مرجع المصدر','text',500],['source_url','رابط المصدر','url',500],['source_date','تاريخ مراجعة المصدر','date',10],['authority','الجهة المصدرة','text',160],['responsible','مسؤول المتابعة المقترح','text',160],['valid_from','بداية السريان','date',10],['valid_until','نهاية السريان إن حددها المصدر','date',10],['review_by','موعد مراجعة المصدر','date',10],['submission_channel','قناة تقديم الطلب من المصدر','text',240],['service_window','زمن الخدمة من المصدر إن وجد','text',160]]){const input=text(k,title,f[k],type,max);input.required=k==='title';input.oninput=()=>{f[k]=input.value;};form.append(label(title,input));}
   for(const [k,title,values]of [['type','نوع المسودة',policy.draftTypes],['network','شبكة المسودة',policy.networks],['status','حالة المسودة',{draft:'مسودة',ready:'جاهزة للمراجعة الخاصة',archived:'مؤرشفة'}]]){const input=select(title,values,f[k]);input.onchange=()=>{f[k]=input.value;};form.append(label(title,input));}
   for(const [k,title,max]of [['steps','خطوات المسودة',3000],['documents','المتطلبات من المصدر دون رفع ملفات',1200]]){const input=el('textarea',{'aria-label':title,rows:k==='steps'?4:3,maxlength:max},f[k].join('\n'));input.oninput=()=>{f[k]=input.value.split('\n').map(s=>s.trim()).filter(Boolean);};form.append(label(title+' · سطر لكل عنصر',input,'roadmap-steps-label'));}
   form.append(el('button',{type:'submit',class:'button primary'},'حفظ المسودة الخاصة'),act('نسخ النموذج إلى مسودة جديدة',()=>{memory.form={...memory.form,id:uid(),status:'draft'};memory.formBaseRevision=0;draw();}),act('إفراغ النموذج',()=>{memory.form=null;draw();}));
   form.onsubmit=e=>{e.preventDefault();const saved=state.drafts.find(d=>d.id===f.id);if((saved?.revision||0)!==memory.formBaseRevision){notice('تغيرت هذه المسودة منذ فتحها؛ احتفظ بنصك وانسخه لمراجعة جديدة أو افتح النسخة الحالية.');return;}void save('save_draft',{...f},()=>{memory.form=null;});};
   panel.append(form);
  }
  function drafts(){
   panel.append(el('h2',{},'مسودات إجراءات الشركة'),el('p',{class:'notice'},'«جاهزة للمراجعة» ليست موافقة شركة. لا تبدأ تجربة بإجراء منتهي أو لم يبدأ أو حان موعد مراجعته. المسودة المستخدمة تُنسخ لمراجعة جديدة.'));draftForm();
   for(const d of [...state.drafts].reverse()){const validity=W.validity(d,today),used=state.cases.some(c=>c.draft_id===d.id);panel.append(el('article',{class:'roadmap-provider','data-planning-draft':d.id},el('span',{class:'service-validity '+validity},W.validityLabels[validity]),el('h3',{},d.title),el('p',{},policy.draftTypes[d.type]+' · '+network(d.network)+' · مراجعة '+d.revision),source(d),el('ol',{},d.steps.map(s=>el('li',{},s))),(d.documents||[]).length?el('div',{},el('strong',{},'متطلبات الإجراء من المصدر'),el('ul',{},d.documents.map(s=>el('li',{},s)))):null,el('div',{class:'roadmap-actions'},!used?act('تحرير المسودة',()=>edit(d)):el('small',{},'مرجع مستخدم؛ انسخه لتغيير المحتوى.'),act('نسخ لمراجعة جديدة',()=>edit(d,true)),d.status!=='archived'?act('أرشفة خاصة',()=>save('save_draft',{...cleanDraft(d),status:'archived'})):null)));}
  }
  function roles(){
   panel.append(el('h2',{},'أدوار المتابعة في التجربة'),el('p',{class:'notice'},'تحددها أنت من نظام الشركة. هذه أدوار داخل مساحتك فقط، ولا تنشئ حسابات أو تمنح أحدًا صلاحيات أو ترسل له رسالة.'));
   memory.roleForm||={id:uid(),label:'',channel:''};const f=memory.roleForm,name=text('label','اسم دور المتابعة',f.label,'text',80),channel=text('channel','قناة متابعة الدور',f.channel,'text',240),form=el('form',{class:'form-stack service-role-form'},label('اسم دور المتابعة',name),label('قناة متابعة الدور',channel),el('button',{type:'submit',class:'button primary'},'حفظ دور المتابعة'),act('دور جديد',()=>{memory.roleForm=null;draw();}));name.required=channel.required=true;name.oninput=()=>{f.label=name.value;};channel.oninput=()=>{f.channel=channel.value;};form.onsubmit=e=>{e.preventDefault();void save('save_role',{...f},()=>{memory.roleForm=null;});};panel.append(form);
   if(!state.roles.length)panel.append(el('p',{class:'empty'},'لم تسجل أدوار متابعة بعد.'));
   for(const role of state.roles)panel.append(el('article',{class:'roadmap-provider','data-service-role':role.id},el('h3',{},role.label),el('p',{},role.channel),el('div',{class:'roadmap-actions'},act('تحرير الدور',()=>{memory.roleForm={id:role.id,label:role.label,channel:role.channel};draw();}),act('إزالة الدور',()=>save('remove_role',{id:role.id})))));
  }
  function caseFilters(){
   memory.caseFilters||={status:'',type:'',network:'',role:'',follow:''};const f=memory.caseFilters,box=el('div',{class:'service-case-filters'});
   for(const [k,title,values]of [['status','تصفية بحالة الطلب',{'':'كل الحالات',...policy.caseStates}],['type','تصفية بنوع الطلب',{'':'كل الأنواع',...policy.draftTypes}],['network','تصفية بشبكة الطلب',{'':'كل الشبكات',...policy.networks}],['role','تصفية بدور المتابعة',{'':'كل الأدوار',none:'بلا إسناد',...Object.fromEntries(state.roles.map(r=>[r.id,r.label]))}],['follow','تصفية بموعد المتابعة',{'':'كل المواعيد',overdue:'تجاوز تاريخ المتابعة',today:'متابعة اليوم'}]]){const input=select(title,values,f[k]);input.onchange=()=>{f[k]=input.value;draw();};box.append(label(title,input));}
   panel.append(box,act('مسح تصفية الطلبات',()=>{memory.caseFilters=null;draw();}));
   return state.cases.map(c=>W.caseView(c,today)).filter(c=>(!f.status||c.status===f.status)&&(!f.type||c.type===f.type)&&(!f.network||c.network===f.network)&&(!f.role||(f.role==='none'?!c.assignment:c.assignment?.id===f.role))&&(!f.follow||(f.follow==='overdue'?c.overdue:!c.terminal&&c.follow_up_at===today)));
  }
  function assignment(c,box){
   if(c.terminal)return;
   if(!state.roles.length){box.append(el('p',{class:'notice warning'},'أضف دور متابعة من تبويب «أدوار المتابعة» قبل بدء الفحص.'));return;}
   const role=select('دور متابعة المثال',Object.fromEntries(state.roles.map(r=>[r.id,r.label])),c.assignment?.id||state.roles[0].id),date=text('follow_up_at','تاريخ متابعة المثال',c.follow_up_at||today,'date',10);date.required=true;
   const form=el('form',{class:'service-assignment'},label('دور متابعة المثال',role),label('تاريخ متابعة المثال',date),el('button',{type:'submit',class:'button outline'},'حفظ إسناد المثال'));form.onsubmit=e=>{e.preventDefault();void save('assign_case',{id:c.id,role_id:role.value,follow_up_at:date.value});};box.append(form);
  }
  function actions(c,box){
   const actions=el('div',{class:'roadmap-actions'});
   const moves={new:[['review','بدء الفحص'],['rejected','استبعاد المثال']],review:[['completed','إنهاء الاختبار'],['rejected','استبعاد المثال']],needs_info:[['review','استئناف الفحص'],['rejected','استبعاد المثال']],completed:[],rejected:[],cancelled:[]};
   for(const [status,title]of moves[c.status])actions.append(act(title,()=>save('case_status',{id:c.id,status})));
   if(!c.terminal)actions.append(act(c.type==='appointment'?'إلغاء طلب الموعد التجريبي':'إلغاء المثال',()=>save('case_status',{id:c.id,status:'cancelled'})));
   box.append(actions);
   if(c.status==='review'){
    const reason=select('سبب استكمال المثال',policy.missingReasons,'source'),items=el('fieldset',{class:'service-missing-items'},el('legend',{},'متطلبات من مصدر الإجراء فقط'));
    const checkboxes=(c.procedure?.documents||[]).map((name,index)=>{const input=el('input',{type:'checkbox',value:index});items.append(label(name,input));return input;});
    const form=el('form',{class:'form-stack service-missing-form'},label('سبب استكمال المثال',reason),items,el('button',{type:'submit',class:'button outline'},'طلب استكمال المثال'));
    const toggle=()=>{items.hidden=reason.value!=='documents';if(items.hidden)checkboxes.forEach(i=>{i.checked=false;});};reason.onchange=toggle;toggle();
    form.onsubmit=e=>{e.preventDefault();void save('case_status',{id:c.id,status:'needs_info',reason:reason.value,items:checkboxes.filter(i=>i.checked).map(i=>Number(i.value))});};box.append(form);
   }
  }
  function caseCard(c){
   const d=c.procedure||state.drafts.find(d=>d.id===c.draft_id)||{},box=el('article',{class:'roadmap-provider','data-planning-case':c.id},el('div',{class:'service-case-heading'},el('span',{class:'lab-state'},policy.caseStates[c.status]),c.overdue?el('span',{class:'service-overdue'},'تجاوز تاريخ المتابعة'):null),el('h3',{},d.title||'مسودة سابقة'),el('code',{class:'visit-tracking'},'تجربة '+c.id.slice(0,8)),el('p',{},policy.draftTypes[c.type]+' · '+network(c.network)),el('small',{},'مرجع المثال: مراجعة '+c.draft_revision+' · '+stamp(c.createdAt)),c.type==='appointment'?el('p',{class:'notice warning'},'طلب موعد توضيحي — الربط غير متاح ولا يوجد حجز مؤكد.'):null);
   if(c.assignment)box.append(el('div',{class:'service-assignee'},el('strong',{},'دور المتابعة: '+c.assignment.label),el('p',{},c.assignment.channel),el('small',{},'تاريخ المتابعة الذي حددته: '+c.follow_up_at)));
   if(c.missing)box.append(el('div',{class:'notice warning'},el('strong',{},'سبب الاستكمال: '+policy.missingReasons[c.missing.reason]),el('ul',{},c.missing.items.map(i=>el('li',{},d.documents?.[i]||'متطلب من المرجع السابق'))),el('small',{},'محاكاة فقط؛ لا رفع ملفات أو إرسال للجهات.')));
   assignment(c,box);actions(c,box);
   const history=c.history.map(h=>el('li',{},h.action==='assigned'?'إسناد إلى '+h.role_label+' · متابعة '+h.follow_up_at:policy.caseStates[h.status]+(h.reason?' · '+policy.missingReasons[h.reason]:''),el('small',{},stamp(h.at))));
   box.append(el('details',{},el('summary',{},'المصدر والخطوات المحفوظة مع المثال'),source(d),el('ol',{},(d.steps||[]).map(s=>el('li',{},s)))),el('details',{},el('summary',{},'سجل المسار ('+c.history.length+')'),el('ol',{},history)));
   return box;
  }
  function cases(){
   panel.append(el('h2',{},'الطلبات والمواعيد التجريبية'),el('p',{class:'notice'},'أمثلة دون أشخاص أو تشخيصات أو ملفات. الموعد الذي تحدده للمتابعة يخص الإدارة؛ لا يساوي موعد كشف أو مهلة مضمونة من الشركة.'));
   const ready=state.drafts.filter(d=>W.validity(d,today)==='current');
   if(ready.length){const input=select('مسودة الطلب التجريبي',Object.fromEntries(ready.map(d=>[d.id,d.title+' · '+policy.draftTypes[d.type]])),ready[0].id);panel.append(label('المسودة السارية للتجربة',input),act('إنشاء طلب تجريبي',()=>save('create_case',{id:uid(),draft_id:input.value}),'guidelines','button primary'));}
   else panel.append(el('p',{class:'empty'},'لا توجد مسودة سارية للتجربة؛ أكمل المصدر والسريان والمراجعة وقناة التقديم أولًا.'));
   const cases=caseFilters();panel.append(el('p',{role:'status'},'أمثلة مطابقة: '+cases.length),el('div',{class:'service-case-grid'},[...cases].reverse().map(caseCard)));
  }
  function guide(){
   panel.append(el('h2',{},'دليل الإجراءات الموثقة في المعاينة'),el('p',{class:'notice'},'يعرض نصوصك السارية فقط مع مصادرها؛ لا يولد إجابات أو تغطية أو نسب تحمل. هذا دليل خاص للتجربة قبل اعتماد إجراءات الشركة للأعضاء.'));
   memory.guideFilters||={network:'employee',type:'',query:''};const f=memory.guideFilters,net=select('شبكة دليل الإجراءات',policy.networks,f.network),type=select('نوع دليل الإجراءات',{'':'كل الأنواع',...policy.draftTypes},f.type),query=el('input',{type:'search',value:f.query,maxlength:120,'aria-label':'البحث في الإجراءات السارية',placeholder:'اسم الإجراء أو خطوة منه'}),form=el('form',{class:'roadmap-search'},query,el('button',{type:'submit',class:'button primary'},'ابحث في الإجراءات'));
   net.onchange=()=>{f.network=net.value;draw();};type.onchange=()=>{f.type=type.value;draw();};form.onsubmit=e=>{e.preventDefault();f.query=query.value.trim();draw();};panel.append(el('div',{class:'directory-filters'},label('الشبكة',net),label('نوع الإجراء',type)),form);
   const normalize=s=>window.MedicalSearch.normalize(s),q=normalize(f.query),list=state.drafts.filter(d=>W.validity(d,today)==='current'&&d.network===f.network&&(!f.type||d.type===f.type)&&(!q||normalize([d.title,...d.steps].join(' ')).includes(q)));
   if(!list.length)panel.append(el('p',{class:'empty'},'لا يوجد إجراء سارٍ مطابق في مسوداتك. لن نفترض إجابة من خارج المصادر.'));
   for(const d of list)panel.append(el('article',{class:'roadmap-provider'},el('h3',{},d.title),el('ol',{},d.steps.map(s=>el('li',{},s))),source(d)));
  }
  function report(){
   panel.append(el('h2',{},'ملخص التشغيل التجريبي'),el('p',{class:'notice'},'إحصاءات أمثلة حساب الإدارة، وليست استخدام الأعضاء أو نتائج طبية أو حجوزات. التقرير المنزّل أعداد فقط، دون نصوص الإجراءات أو أسماء أدوارها أو بيانات أشخاص.'));
   const stats=W.summary(state,today);panel.append(el('div',{class:'visit-counters'},[[stats.open,'أمثلة مفتوحة'],[stats.unassigned,'بلا إسناد'],[stats.overdue,'تجاوزت تاريخ المتابعة'],[stats.needsInfo,'بانتظار الاستكمال'],[stats.cancelled,'أمثلة ملغاة'],[stats.completed,'انتهى اختبارها']].map(([count,title])=>el('div',{},el('strong',{},count),el('span',{},title)))));
   const report={scope:'admin-sandbox-counts',asOf:today,memberEnabled:false,bookingConnected:false,...stats};
   panel.append(act('تنزيل ملخص الأعداد فقط',()=>{const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:'rayati-admin-preview-'+today+'.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},'guidelines'));
  }
  function readiness(){
   panel.append(el('h2',{},'جاهزية التشغيل'),el('p',{class:'notice'},'أكمل مصادر الشركة وأدوارها ثم راجع رحلة الأمثلة. لا يفعّل اكتمال هذه الحقول خدمات الأعضاء أو الربط الخارجي.'));
   const stats=W.summary(state,today);for(const [title,count]of [['إجراءات سارية للتجربة',stats.drafts.current],['إجراءات تحتاج سريانًا أو قناة تقديم',stats.drafts.incomplete],['إجراءات انتهت أو حان موعد مراجعتها',stats.drafts.expired+stats.drafts.review_due],['أدوار متابعة سجلتها',state.roles.length]])panel.append(el('div',{class:'service-readiness-item'},el('strong',{},title),el('span',{},count)));
   panel.append(el('p',{class:'notice warning'},'الحجز الفعلي غير مربوط. اعتماد اللوائح وسلطات الموافقات والتحويلات وسياسات الخصوصية والاحتفاظ وزمن الخدمة تحتاج مصادر الشركة واتفاقاتها.'));
  }
  ({drafts,cases,roles,guide,report,readiness}[memory.pane]||drafts)();
 }
 return Object.freeze({render});
})();
