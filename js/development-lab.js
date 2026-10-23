/* Private UI specimens. All data and review operations require the administrator API. */
window.MedicalDevelopmentLab=(()=>{
 const previewRevision='p1-20261019-1',featureIds=['compact_home','provider_card','provider_details','directory_experience','visit_workspace','care_companion','service_planning','catalog_staging','admin_inbox','review_insights'];
 function compatible(feature){if(!featureIds.includes(feature?.id)||feature.previewRevision!==(feature.id==='review_insights'?'review-insights-20261023-1':feature.id==='admin_inbox'?'admin-inbox-20261023-1':feature.id==='catalog_staging'?'catalog-staging-20261021-2':feature.id==='care_companion'?'p3-p6-20261021-1':feature.id==='service_planning'?'p4-p5-20261021-2':feature.id==='visit_workspace'?'p2-visit-20261021-1':feature.id==='directory_experience'?'p1-directory-20261023-2':previewRevision))throw new Error('تغيرت نسخة المعاينة؛ حدّث التطبيق قبل مراجعة التصميم.');}

 const isCompatible=f=>{try{compatible(f);return f.audience==='admin'&&f.memberEnabled===false;}catch{return false;}};
 const validateBoard=data=>{if(data.features.some(f=>f.audience!=='admin'||f.memberEnabled!==false))throw new Error('لم تؤكد الخدمة حصر المعاينات بالإدارة.');};
 function mount({root,api,el,button,replaceNodes,icon,notice,review,exit,directory,roadmap,imports,inbox,insights,readiness,list,initialFeature=null,allowed}){
  let disposed=false,board=null,active=null,busy=false,sequence=0;
  const valid=()=>!disposed&&root.isConnected&&allowed();
  const status=r=>({pending:'بانتظار مراجعتك',needs_changes:'يحتاج تعديلًا',approved:'معتمد كتصميم'}[r] || 'غير محدد');
  const stamp=value=>value&&Number.isFinite(new Date(value).getTime())?new Intl.DateTimeFormat('ar-EG',{timeZone:'Africa/Cairo',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'لم يُراجع بعد';
  const symbol=kind=>el('span',{class:'lab-icon','aria-hidden':'true'},icon(kind));
  const action=(text,fn,style='button outline',kind)=>{const b=button(text,fn,style);if(kind){b.classList.add('lab-icon-button');b.prepend(symbol(kind));}return b;};
  const iconText=(kind,text)=>el('span',{class:'lab-icon-text'},symbol(kind),el('span',{},text));
  const categoryIcons={'الأطباء':'doctors','المستشفيات':'hospitals','التحاليل':'labs','الأشعة':'radiology','الصيدليات':'pharmacies','المراكز':'centers'};
  function shell(){return el('div',{class:'lab-shell'},el('header',{class:'lab-intro'},el('div',{},el('span',{class:'eyebrow'},'P0 · مساحة مراجعة خاصة'),el('h1',{},'معمل التطوير'),el('p',{},'جرّب النسخة المقترحة، وسجّل رأيك قبل إتاحتها للأعضاء.')),action('العودة إلى الإدارة',exit)),el('div',{class:'lab-guarantees'},['للمدير فقط','تجارب معزولة','التعميم للأعضاء معطّل'].map(t=>el('span',{},t))));}
  function failed(error){if(!valid())return;++sequence;active=null;board=null;root.hidden=false;const wrap=shell();wrap.append(el('p',{class:'notice warning',role:'alert'},error.code==='NOT_FOUND'?'تفعيل معمل التطوير يحتاج نشر تحديث خدمة Firebase. تجربة الأعضاء الحالية مستمرة.':error.message || 'تعذر التحقق من المعاينة.'),action('إعادة التحقق',load));replaceNodes(root,wrap);}
  async function load(){
   if(!valid())return;root.hidden=false;const turn=++sequence;active=null;board=null;const wrap=shell();wrap.append(el('p',{role:'status'},'جارٍ التحقق من صلاحية المعاينة…'));replaceNodes(root,wrap);
   try{const data=await api.developmentLab();if(!valid()||turn!==sequence)return;if(data.audience!=='admin'||data.capability!=='development-lab-v1'||!Array.isArray(data.features))throw new Error('لم تؤكد الخدمة صلاحية المعمل.');validateBoard(data);board=data;if(initialFeature){const id=initialFeature;initialFeature=null;compatible(board.features.find(f=>f.id===id));await open(id);}else drawBoard();}catch(e){if(turn===sequence)failed(e);}
  }
  function drawBoard(){
   if(!valid()||!board)return;active=null;const wrap=shell();
   wrap.append(el('section',{class:'lab-start'},el('div',{},el('h2',{},'مراحل رعايتي · معاينة الإدارة'),el('p',{},'نماذج الشكل وتجربة متصلة بالدليل المنشور. اعتماد المراجعة لا يغيّر تجربة الأعضاء.')),el('span',{class:'lab-phase'},'P1–P6 — للإدارة')));
   wrap.append(action('جاهزية المراحل',readiness,'button primary','guidelines'));
   wrap.append(el('div',{class:'lab-feature-grid'},board.features.map(f=>el('article',{class:'lab-feature-card','data-lab-feature':f.id},el('div',{class:'lab-card-heading'},el('small',{},f.proposal),el('span',{class:'lab-state '+f.review},status(f.review))),el('h2',{},f.title),el('p',{},f.description),el('small',{class:'lab-data-mode'},['care-workspace','planning-workspace'].includes(f.dataMode)?'دليل منشور · مساحة إدارة خاصة':f.dataMode==='admin-inbox'?'أعداد تشغيل وملاحظات · متابعة خاصة':f.dataMode==='catalog-staging'?'فحص جهات · دفعات مراجعة خاصة':f.dataMode==='directory-sandbox'?'دليل منشور · بلاغات تجريبية منفصلة':f.dataMode==='directory-readonly'?'دليل فعلي منشور · قراءة فقط':'بيانات توضيحية'),el('p',{class:'muted'},f.previewEnabled?'المعاينة مفعلة للمدير':'المعاينة موقوفة'),!isCompatible(f)?el('p',{class:'notice warning'},'نسخة هذه المعاينة تحتاج تحديث الواجهة أو خدمة Firebase. بقية المعاينات المتوافقة متاحة.'):null,f.staleApproval?el('p',{class:'notice warning'},'تغير التصميم؛ يلزم قرار مراجعة جديد.'):null,f.note?el('blockquote',{},f.note):null,el('small',{class:'muted'},'آخر حفظ: '+stamp(f.updatedAt)),el('div',{class:'lab-feature-actions'},Object.assign(action('فتح المعاينة',()=>open(f.id),'button primary'),{disabled:!f.previewEnabled||!isCompatible(f)}),Object.assign(action('الملاحظات والقرار',()=>review(f,load)),{disabled:!isCompatible(f)})),el('details',{class:'lab-history'},el('summary',{},'سجل المراجعات ('+f.history.length+')'),f.history.length?el('ol',{},[...f.history].reverse().map(h=>el('li',{},el('strong',{},status(h.review)),el('small',{},stamp(h.at)),h.note?el('p',{},h.note):null,el('small',{},h.previewEnabled?'معاينة مفعلة':'معاينة موقوفة')))):el('p',{},'لا توجد قرارات محفوظة بعد.'))))));
   if(!board.features.some(f=>f.id==='directory_experience'))wrap.append(el('p',{class:'notice warning'},'تجربة الدليل المترابطة تحتاج تحديث خدمة Firebase؛ نماذج التصميم الحالية متاحة.'));
   if(!board.features.some(f=>f.id==='visit_workspace'))wrap.append(el('p',{class:'notice warning'},'تجربة الزيارة والبلاغات تحتاج تحديث خدمة Firebase.'));
   if(!board.features.some(f=>f.id==='care_companion'))wrap.append(el('p',{class:'notice warning'},'معاينات بقية الخارطة تحتاج تحديث خدمة Firebase.'));
   wrap.append(el('aside',{class:'notice'},'النشر للأعضاء غير متاح من هذه النسخة. سنجهز التفعيل لاحقًا بعد حكمك على المعاينات واكتمال وظائف المرحلة.'));
   replaceNodes(root,wrap);
  }
  function demoAction(){notice('إجراء توضيحي داخل المعمل؛ لا يُرسل طلبًا ولا يجري اتصالًا أو تعديلًا حقيقيًا.');}
  function sampleCard(scene,onDetails){const p=scene.provider;return el('article',{class:'lab-provider-card'},el('div',{class:'lab-provider-top'},el('span',{class:'lab-provider-symbol','aria-hidden':'true'},icon('doctors')),el('div',{},el('small',{},p.specialty),el('h3',{},p.name),el('p',{class:'muted'},p.city)),el('span',{class:'lab-available'},'متاح — مثال')),el('p',{class:'lab-network'},symbol('users'),el('span',{},'المستفيدون · '+p.network)),el('div',{class:'lab-provider-facts'},iconText('districts','مقران توضيحيان'),iconText('star','لا توجد تقييمات في النموذج')),action('عرض التفاصيل',onDetails,'button primary','arrow'));
  }
  function renderScene(holder,id,scene){
   if(id==='provider_details'){renderDetails(holder,scene);return;}
   if(id==='provider_card'){holder.append(el('div',{class:'lab-example-caption'},'البطاقة المقترحة — المعلومات الأساسية أولًا'),sampleCard(scene,()=>open('provider_details')));return;}
   const results=el('section',{class:'lab-sample-results'}),input=el('input',{type:'search',placeholder:'ابحث في النموذج التوضيحي…','aria-label':'البحث في نموذج المعمل'});
   const form=el('form',{class:'lab-demo-search'},input,el('button',{type:'submit',class:'button primary lab-icon-button'},symbol('search'),el('span',{},'ابحث')));
   const filter=value=>{const q=value.trim(),matches=!q||[scene.provider.name,scene.provider.specialty,scene.provider.city].some(v=>v.includes(q));replaceNodes(results,el('h3',{},q?'نتائج النموذج':'جهة في النموذج'),matches?sampleCard(scene,()=>open('provider_details')):el('p',{class:'empty'},'لا يوجد تطابق في البيانات التوضيحية. جرّب «الباطنة» أو «المنصورة».'));};
   form.onsubmit=event=>{event.preventDefault();filter(input.value);};
   holder.append(el('section',{class:'lab-home-hero'},el('div',{class:'lab-home-brand'},el('img',{class:'lab-hero-logo',src:'img/rayati-icon-512.webp',alt:'شعار تطبيق رعايتي',width:56,height:56,decoding:'async'}),el('span',{class:'eyebrow'},'رعايتي · نموذج تصميم')),el('h2',{},'رعاية أقرب.. لك ولأسرتك'),el('p',{},'خدمتك ووجهتك، في خطوات أوضح.'),form),el('div',{class:'lab-shortcuts'},scene.categories.map(t=>action(t,()=>notice('اختصار توضيحي: '+t),'button outline',categoryIcons[t] || 'centers'))),el('article',{class:'lab-demo-news'},el('small',{},symbol('guidelines'),el('span',{},'خبر مهم — نموذج')),el('h3',{},scene.news.title),el('p',{},scene.news.summary)),results,action('كل التخصصات',()=>notice('ستنتقل قائمة التخصصات إلى صفحة مستقلة عند تنفيذ المرحلة.'),'button outline','doctors'));filter('');
  }
  function renderDetails(holder,scene){
   const p=scene.provider,content=el('section',{class:'lab-detail-content',id:'lab-detail-content',role:'tabpanel',tabindex:'0'}),tabs=el('nav',{class:'lab-detail-tabs','aria-label':'أقسام الجهة التوضيحية'});let selected='details',branch=p.branches[0];
   const draw=()=>{
    for(const b of tabs.children){const chosen=b.dataset.tab===selected;b.setAttribute('aria-selected',String(chosen));b.tabIndex=chosen?0:-1;if(chosen)content.setAttribute('aria-labelledby',b.id);}
    if(selected==='experiences'){replaceNodes(content,el('h3',{},'تجارب الأعضاء'),el('p',{},'لا توجد تقييمات في هذا النموذج. التقييمات الحقيقية وخصوصيتها لا تتغير.'),action('نموذج تقييم',demoAction,'button outline','star'));return;}
    const picker=el('div',{class:'lab-demo-branches'},p.branches.map(b=>action(b.name,()=>{branch=b;draw();},'button '+(branch.id===b.id?'primary':'outline'))));
    replaceNodes(content,el('h3',{},selected==='branches'?'الفروع':'تفاصيل المقر'),picker,el('strong',{},branch.name),el('p',{class:'lab-icon-text'},symbol('districts'),el('span',{},branch.address)),el('p',{class:'muted lab-icon-text'},symbol('clock'),el('span',{},branch.hours)),el('p',{class:'lab-network'},symbol('users'),el('span',{},'المستفيدون · '+p.network)));
   };
   for(const [key,label] of [['details','التفاصيل'],['branches','الفروع'],['experiences','تجارب الأعضاء']]){const b=action(label,()=>{selected=key;draw();},'button outline',{details:'info',branches:'districts',experiences:'star'}[key]);b.dataset.tab=key;b.id='lab-tab-'+key;b.setAttribute('aria-controls','lab-detail-content');b.setAttribute('role','tab');tabs.append(b);}tabs.setAttribute('role','tablist');tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...tabs.children],at=buttons.indexOf(document.activeElement),index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowLeft'?1:-1)+buttons.length)%buttons.length;buttons[index].click();buttons[index].focus();});
   holder.append(el('header',{class:'lab-detail-header'},el('span',{class:'lab-provider-symbol','aria-hidden':'true'},icon('doctors')),el('div',{},el('small',{},p.specialty+' · '+p.city),el('h2',{},p.name))),tabs,content,el('div',{class:'lab-detail-actions'},action('اتصال',demoAction,'button primary','phone'),action('الخريطة',demoAction,'button outline','districts')));draw();
  }
  async function open(id){
   if(id==='review_insights'){insights();return;}
   if(id==='admin_inbox'){inbox();return;}
   if(id==='catalog_staging'){imports();return;}
   if(['care_companion','service_planning'].includes(id)){roadmap(id);return;}
   if(['directory_experience','visit_workspace'].includes(id)){directory(id==='visit_workspace');return;}
   if(!valid())return;root.hidden=false;const turn=++sequence,wrap=shell(),loading=el('p',{role:'status'},'جارٍ التحقق وفتح المعاينة…');wrap.append(loading);replaceNodes(root,wrap);active=null;
   try{const data=await api.labPreview(id);if(!valid()||turn!==sequence)return;loading.remove();compatible(data.feature);if(data.feature?.audience!=='admin'||data.feature?.syntheticOnly!==true)throw new Error('المعاينة غير مصرح بها.');const panel=el('div',{class:'lab-preview','data-lab-preview':id});
    wrap.append(el('div',{class:'lab-preview-heading'},el('div',{},el('h2',{},data.feature.title),el('small',{},data.scene.label+' · '+data.feature.previewRevision)),el('div',{class:'actions-row'},action('قائمة المعاينات',list||load),action('الملاحظات والقرار',()=>review(data.feature,load)))),panel);renderScene(panel,id,data.scene);active={id,version:data.feature.version,revision:data.feature.previewRevision,panel};replaceNodes(root,wrap);
   }catch(e){if(turn===sequence)failed(e);}
  }
  async function recheck(hide=false){
   if(!valid()||busy||document.hidden||(!active&&!board))return;
   busy=true;const shown=active,listed=board,turn=sequence;if(hide)root.hidden=true;
   try{
    const data=shown?await api.labPreview(shown.id):await api.developmentLab();
    if(!valid()||turn!==sequence)return;
    if(shown){
     compatible(data.feature);if(data.feature?.audience!=='admin'||data.feature?.syntheticOnly!==true)throw new Error('تعذر تأكيد صلاحية المعاينة.');
     if(data.feature.previewRevision!==shown.revision||data.feature.version!==shown.version){notice('تغيرت حالة المعاينة؛ حُدّثت قائمة المراجعة.');await load();}
    }else{
     if(data.audience!=='admin'||data.capability!=='development-lab-v1')throw new Error('تعذر تأكيد صلاحية المعمل.');
     validateBoard(data);if(JSON.stringify(data)!==JSON.stringify(listed)){board=data;drawBoard();}
    }
    root.hidden=false;
   }catch(e){if(turn===sequence)failed(e);}finally{busy=false;}
  }
  const visible=()=>{if(document.hidden){if(active||board)root.hidden=true;}else void recheck(true);};
  const offline=()=>{if(active||board)failed({message:'توقفت المعاينة لعدم الاتصال. أعد التحقق بعد عودة الإنترنت.'});};
  document.addEventListener('visibilitychange',visible);window.addEventListener('offline',offline);const timer=setInterval(()=>void recheck(),20000);void load();
  return {reload:load,dispose(){disposed=true;board=null;active=null;clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('offline',offline);root.replaceChildren();}};
 }
 return Object.freeze({mount});
})();
