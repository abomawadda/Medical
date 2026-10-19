/* Administrator-only, read-only integrated directory. Its server gate is independent of the browser role. */
window.MedicalDirectoryPreview=(()=>{
 const featureId='directory_experience',revision='p1-directory-20261019-1';
 function mount({root,api,el,button,icon,avatar,allowed,notice,navigate,back,exit,review,initial={},detailId='',specialties=false,onChange}){
  const M=window.MedicalDirectoryModel;
  let disposed=false,loaded=false,data=null,model=null,feature=null,sequence=0,checking=false,reviewSequence=0;
  let nav={filters:M.emptyFilters(),branch:'',pane:'details',...structuredClone(initial)};nav.filters={...M.emptyFilters(),...nav.filters};
  let pendingScroll=Number.isFinite(initial.scroll)?initial.scroll:0;
  const valid=()=>!disposed&&root.isConnected&&allowed();
  const sym=k=>el('span',{class:'lab-icon','aria-hidden':'true'},icon(k));
  const act=(label,fn,k='',classes='button outline')=>{const b=button(label,fn,classes+(k?' lab-icon-button':''));if(k)b.prepend(sym(k));return b;};
  const row=(k,label)=>el('p',{class:'lab-icon-text'},sym(k),el('span',{},label));
  const change=()=>onChange?.(snapshot());
  function snapshot(){return {...structuredClone(nav),scroll:loaded?window.scrollY:pendingScroll};}
  function compatible(value){return value?.id===featureId&&value.previewRevision===revision&&value.audience==='admin'&&value.dataMode==='directory-readonly'&&value.memberEnabled===false;}
  function scaffold(){return el('div',{class:'lab-shell'},el('header',{class:'lab-intro'},el('div',{},el('span',{class:'eyebrow'},'P1 · معاينة مترابطة خاصة'),el('h1',{},'رعايتي · تجربة الدليل'),el('p',{},'جرّب التصميم بالجهات المنشورة. التقييمات للقراءة، وتجربة الأعضاء الحالية مستمرة.')),act('العودة إلى المعمل',exit)),el('div',{class:'lab-guarantees'},['للإدارة فقط','دليل منشور · قراءة فقط','التعميم للأعضاء معطّل'].map(s=>el('span',{},s))));}
  function fail(error){if(!valid())return;++sequence;++reviewSequence;loaded=false;data=null;model=null;feature=null;root.hidden=false;const shell=scaffold();shell.append(el('p',{class:'notice warning',role:'alert'},error.code==='LAB_NOT_FOUND'||error.code==='NOT_FOUND'?'تفعيل تجربة الدليل يحتاج تحديث خدمة Firebase؛ نماذج التصميم متاحة في المعمل.':error.message||'تعذر التحقق من تجربة الدليل.'),act('إعادة التحقق',load));root.replaceChildren(shell);}
  async function load(){
   if(!valid())return;const turn=++sequence;++reviewSequence;if(loaded)pendingScroll=window.scrollY;loaded=false;data=null;model=null;root.hidden=false;const shell=scaffold();shell.append(el('p',{role:'status'},'جارٍ التحقق وتحميل الدليل المنشور…'));root.replaceChildren(shell);
   try{const result=await api.labPreview(featureId);if(!valid()||turn!==sequence)return;if(!compatible(result.feature)||result.scene?.mode!=='directory-readonly')throw new Error('حدّث التطبيق والخدمة إلى نسخة متوافقة لتجربة الدليل.');feature=result.feature;data=result.scene;model=M.create(data,{facilities:window.MedicalFacilities,search:window.MedicalSearch,contacts:window.MedicalContacts,research:window.MedicalResearch});loaded=true;render();requestAnimationFrame(()=>requestAnimationFrame(()=>{if(valid()&&turn===sequence)window.scrollTo({top:pendingScroll,left:0,behavior:'instant'});}));}catch(e){if(turn===sequence)fail(e);}
  }
  function render(){
   if(!valid()||!model)return;++reviewSequence;
   const shell=scaffold(),toolbar=el('div',{class:'directory-preview-tools'},act('تحديث الدليل',load,'guidelines'),act('مراجعة هذه التجربة',()=>review(feature,load),'info'));
   shell.append(toolbar,el('p',{class:'directory-preview-snapshot muted'},'تعرض المعاينة بيانات الدليل عند تحميلها؛ استخدم «تحديث الدليل» لجلب التغييرات.'));
   const panel=el('section',{class:'lab-preview directory-preview','data-directory-ready':'true'});shell.append(panel);root.replaceChildren(shell);
   if(detailId){const p=model.byId.get(detailId);if(p)renderDetail(panel,p);else panel.append(el('p',{class:'empty'},'هذه الجهة غير متاحة في الدليل المنشور.'),act('العودة للنتائج',back,'arrow'));return;}
   if(specialties){renderSpecialties(panel);return;}
   renderList(panel);
  }
  function updateFilters(values,reset=false){nav.filters={...(reset?M.emptyFilters():nav.filters),...values,limit:24};nav.branch='';nav.pane='details';change();render();window.scrollTo({top:0,behavior:'instant'});}
  function renderList(panel){
   const f=nav.filters,search=el('input',{type:'search',value:f.query,maxlength:120,placeholder:'اسم الطبيب أو الجهة أو التخصص أو المنطقة…','aria-label':'البحث في الدليل التجريبي'});
   const form=el('form',{class:'lab-demo-search',role:'search'},search,el('button',{type:'submit',class:'button primary lab-icon-button'},sym('search'),el('span',{},'ابحث')));
   form.onsubmit=event=>{event.preventDefault();updateFilters({query:search.value.trim()});};
   panel.append(el('section',{class:'lab-home-hero'},el('div',{class:'lab-home-brand'},el('img',{class:'lab-hero-logo',src:'img/rayati-icon-512.webp',alt:'شعار تطبيق رعايتي',width:56,height:56}),el('span',{class:'eyebrow'},'شبكتك الطبية.. بين يديك')),el('h2',{},'رعاية أقرب.. لك ولأسرتك'),form));
   const networks=el('div',{class:'directory-networks',role:'group','aria-label':'شبكة المستفيدين في المعاينة'});
   for(const [value,label] of [['','كل الشبكات'],['employee','الموظفون'],['family','الأسر والمعاشات']]){const b=act(label,()=>updateFilters({network:value}),'users');b.setAttribute('aria-pressed',String(f.network===value));networks.append(b);}panel.append(networks);
   panel.append(el('nav',{class:'lab-shortcuts directory-sections','aria-label':'أقسام الدليل التجريبي'},[['all','كل الجهات','centers'],...M.kinds.map(k=>[k,M.labels[k],M.icons[k]])].map(([kind,label,i])=>{const b=act(label,()=>updateFilters({kind,network:f.network},true),i);b.setAttribute('aria-pressed',String(f.kind===kind));return b;})));
   const filters=el('div',{class:'directory-filters'});
   for(const [key,label,values] of [['markaz','المركز أو المدينة',model.cities],['specialty','التخصص في المعاينة',model.specialties]]){
    const select=el('select',{'aria-label':label},el('option',{value:''},key==='markaz'?'كل المراكز':'كل التخصصات'),values.map(v=>el('option',{value:v},v)));select.value=f[key];select.onchange=()=>updateFilters({[key]:select.value});filters.append(el('label',{class:'form-field'},label,select));
   }panel.append(filters);
   const active=[['query','البحث'],['markaz','المركز'],['specialty','التخصص']].filter(([key])=>f[key]);
   if(active.length||f.kind!=='all'||f.network)panel.append(el('div',{class:'directory-filter-chips','aria-label':'تصفية المعاينة الحالية'},active.map(([key,label])=>act(label+': '+f[key]+' ×',()=>updateFilters({[key]:''}),'','filter-chip')),act('مسح البحث والتصفية',()=>updateFilters({},true),'','text-button')));
   const results=model.find(f),heading=el('div',{class:'section-heading'},el('h2',{},f.query?'نتائج البحث':f.kind==='all'?'دليلك الطبي':M.labels[f.kind]),el('span',{class:'muted',role:'status'},results.length+' جهة'));
   const featured=(data.catalog.medical_guidelines||[]).filter(r=>r.document_type==='news'&&window.MedicalContent.visible(r)).sort((a,b)=>String(b.published_at||'').localeCompare(String(a.published_at||'')))[0];
   if(featured&&!f.query&&f.kind==='all')panel.append(el('article',{class:'lab-demo-news'},row('guidelines','خبر الشبكة'),el('h3',{},M.text(featured.title)),el('p',{},M.text(featured.summary)),Array.isArray(featured.steps)?el('ol',{},featured.steps.map(t=>el('li',{},M.text(t)))):null));
   panel.append(heading,el('div',{class:'directory-result-grid'},results.slice(0,f.limit).map(hit=>providerCard(hit))));
   if(!results.length)panel.append(el('div',{class:'empty'},el('p',{},'لا توجد نتائج مطابقة. جرّب اسمًا أقصر أو امسح أحد الفلاتر.'),act('عرض كل الجهات',()=>updateFilters({},true))));
   if(results.length>f.limit)panel.append(act('عرض المزيد من الجهات',()=>{const scroll=window.scrollY;nav.filters.limit+=24;change();render();window.scrollTo({top:scroll,behavior:'instant'});}));
   panel.append(act('كل التخصصات',()=>navigate('specialties',snapshot()),'doctors'));
  }
  function providerCard(hit){const p=hit.provider,{b,v}=hit,score=model.stat(p,b),open=()=>navigate(p.id,{...snapshot(),branch:b.id,pane:'details',scroll:0});
   return el('article',{class:'lab-provider-card directory-provider-card','data-directory-provider':p.id},el('div',{class:'lab-provider-top'},avatar(p.avatar,p.source==='records'?'doctor':p.source==='pharmacies'?'pharmacy':'clinic'),el('div',{},el('small',{},v.specialty),el('h3',{},p.name),el('p',{class:'muted'},v.city)),status(b,v)),row('districts',v.hospital||v.address||v.city||'المقر'),el('p',{class:'lab-network'},sym('users'),el('span',{},'المستفيدون · '+(M.networkText(v.network)||'حسب الشبكة المسجلة'))),el('div',{class:'lab-provider-facts'},el('span',{},p.branches.length>1?p.branches.length+' مقار · عرضت المطابقة لبحثك':'مقر واحد'),el('span',{},score?'★ '+score.average.toFixed(1)+' / 5 · '+score.count+' تقييم':'لا توجد تقييمات منشورة بعد')),hit.approximate?el('small',{class:'muted'},'نتيجة قريبة من بحثك'):null,act('عرض التفاصيل',open,'arrow','button primary'));
  }
  function status(b,v){return el('span',{class:'directory-service-state '+(v.raw.service_status==='suspended'||b.suspended?'suspended':'active')},v.raw.service_status==='suspended'||b.suspended?'موقوف مؤقتًا':'مدرج في الشبكة');}
  function renderSpecialties(panel){
   panel.append(act('العودة للدليل',back,'arrow'),el('h2',{},'كل التخصصات'),el('div',{class:'directory-specialty-grid'},model.specialties.map(s=>act(s,()=>navigate('',{filters:{...M.emptyFilters(),specialty:s,network:nav.filters.network},scroll:0}),'doctors'))));
  }
  function renderDetail(panel,p){
   let selected=model.select(p,nav.branch,nav.filters.network),{b,v}=selected;nav.branch=b.id;if(Number.isInteger(nav.networkView)&&b.views[nav.networkView])v=b.views[nav.networkView];
   const score=model.stat(p,b),tabs=el('div',{class:'lab-detail-tabs',role:'tablist','aria-label':'بيانات الجهة في المعاينة'}),content=el('section',{class:'lab-detail-content',id:'directory-detail-panel',role:'tabpanel',tabindex:'0'});
   panel.append(act('العودة للنتائج',back,'arrow'),el('header',{class:'lab-detail-header'},avatar(p.avatar,p.source==='records'?'doctor':p.source==='pharmacies'?'pharmacy':'clinic'),el('div',{},el('small',{},[v.specialty,v.city].filter(Boolean).join(' · ')),el('h2',{},p.name))),status(b,v),score?row('star',score.average.toFixed(1)+' / 5 · '+score.count+' تقييم منشور'):el('p',{class:'rating-empty'},'لا توجد تقييمات منشورة بعد'));
   if(p.branches.length>1)panel.append(el('div',{class:'directory-branch-picker','aria-label':'مقار الجهة'},p.branches.map(branch=>{const value=branch.views[0],label=value?.raw.branch_label||value?.hospital||value?.address||value?.city||'مقر مسجل';const btn=act(M.text(label),()=>{nav.branch=branch.id;nav.networkView=undefined;change();render();},'districts');btn.setAttribute('aria-pressed',String(branch.id===b.id));btn.dataset.directoryBranch=branch.id;return btn;})));
   if(b.views.length>1)panel.append(el('div',{class:'directory-networks','aria-label':'شبكات المقر'},b.views.map((entry,index)=>{const btn=act(M.networkText(entry.network)||'شبكة مسجلة',()=>{nav.networkView=index;change();render();},'users');const active=Number.isInteger(nav.networkView)?nav.networkView:b.views.indexOf(v);btn.setAttribute('aria-pressed',String(active===index));return btn;})));
   const draw=()=>{
    ++reviewSequence;for(const button of tabs.children){const active=button.dataset.pane===nav.pane;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active)content.setAttribute('aria-labelledby',button.id);}
    content.replaceChildren();if(nav.pane==='experiences'){void renderReviews(content,b.target);return;}
    if(nav.pane==='branches'){content.append(el('h3',{},'مقار الجهة'),el('p',{class:'muted'},'تظهر كل المقار المسجلة، وقد تختلف شبكة المستفيدين بينها.'),p.branches.map(branch=>{const value=branch.views[0];return el('article',{class:'directory-branch-summary'},el('strong',{},value?.hospital||value?.city||'مقر مسجل'),el('p',{},value?.address||''),el('p',{class:'lab-network'},M.networkText([...new Set(branch.views.flatMap(v=>v.network))])),act('اختيار هذا المقر',()=>{nav.branch=branch.id;nav.networkView=undefined;nav.pane='details';change();render();},'districts'));}));return;}
    if(v.hospital)content.append(row('hospitals',v.hospital));
    const parts=window.MedicalLocations.parts(v.address);if(parts.length)content.append(el('h3',{},parts.length>1?'عناوين المقر':'العنوان'),parts.map(part=>{const link=model.mapLink(p,{...v,maps:parts.length===1?v.maps:''},part.text);return el('div',{class:'directory-address'},row('districts',part.text),link?el('a',{class:'text-button',href:link.href,target:'_blank',rel:'noopener noreferrer'},link.label):null,part.phone?el('a',{class:'phone-chip',href:'tel:'+part.phone,dir:'ltr'},part.phone):null);}));
    if(v.hours)content.append(row('clock',v.hours));
    content.append(row('users','المستفيدون · '+(M.networkText(v.network)||'حسب الشبكة المسجلة')));
    if(v.contract)content.append(row('info',v.contract));
    let any=false;for(const [kind,label] of [['mobile','محمول'],['landline','أرضي'],['shortcode','مختصر']])if(v.phones[kind].length){any=true;content.append(el('section',{class:'directory-phone-group','data-contact-type':kind},el('h3',{},label+(v.reception?' · استقبال المستشفى':'')),el('div',{class:'phone-list'},v.phones[kind].map(number=>el('a',{class:'phone-chip',dir:'ltr',href:'tel:'+number},number)))));}
    if(!any)content.append(el('p',{class:'muted'},'لا يتوفر رقم تواصل لهذا المقر حاليًا.'));
   };
   for(const [key,label,k] of [['details','التفاصيل','info'],['branches','الفروع','districts'],['experiences','تجارب الأعضاء','star']]){const b=act(label,()=>{nav.pane=key;change();draw();},k);b.id='directory-tab-'+key;b.dataset.pane=key;b.setAttribute('role','tab');b.setAttribute('aria-controls','directory-detail-panel');tabs.append(b);}
   tabs.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const nodes=[...tabs.children],at=nodes.indexOf(document.activeElement),index=event.key==='Home'?0:event.key==='End'?nodes.length-1:(at+(event.key==='ArrowLeft'?1:-1)+nodes.length)%nodes.length;nodes[index].click();nodes[index].focus();};
   panel.append(tabs,content);
   const actions=el('div',{class:'lab-detail-actions directory-detail-actions'}),phone=['mobile','landline','shortcode'].flatMap(k=>v.phones[k])[0],parts=window.MedicalLocations.parts(v.address),map=parts.length===1?model.mapLink(p,v):null;
   if(phone)actions.append(el('a',{class:'button primary lab-icon-button',href:'tel:'+phone},sym('phone'),'اتصال'));else actions.append(el('span',{class:'muted'},'رقم التواصل غير متاح'));
   if(map)actions.append(el('a',{class:'button outline lab-icon-button',href:map.href,target:'_blank',rel:'noopener noreferrer'},sym('districts'),map.label));else if(parts.length>1)actions.append(act('اختيار العنوان',()=>{nav.pane='details';change();draw();content.scrollIntoView({block:'start'});},'districts'));else actions.append(el('span',{class:'muted'},'العنوان غير متاح'));
   panel.append(actions,el('p',{class:'directory-readonly-note muted'},'معاينة للقراءة فقط؛ لا ترسل تقييمًا أو طلبًا باسم عضو.'));draw();
  }
  async function renderReviews(holder,target,page=0){
   const turn=++reviewSequence;holder.replaceChildren(el('p',{role:'status'},'جارٍ تحميل التقييمات المنشورة…'));
   try{const result=await api.publicReviews(target,page);if(!valid()||turn!==reviewSequence||!holder.isConnected)return;const s=result.summary,criteria=window.MedicalReviewCriteria.items;
    holder.replaceChildren(el('h3',{},'التقييم الإجمالي'),el('strong',{},s.count?Number(s.average).toFixed(1)+' / 5':'لا توجد تقييمات منشورة بعد'),el('p',{class:'muted'},'تجارب أعضاء التطبيق؛ لا تمثل حكمًا على الكفاءة الطبية.'),el('div',{class:'public-review-criteria'},criteria.map(item=>{const value=s.criteria[item.id];return el('article',{},el('strong',{},item.label),el('span',{},value?.count?Number(value.average).toFixed(1)+' / 5':'لم يُقيّم بعد'));})),el('h3',{},'ملاحظات الأعضاء دون أسماء'));
    if(!result.comments.length)holder.append(el('p',{class:'muted'},'لا توجد ملاحظات منشورة اختار أصحابها مشاركتها بعد.'));
    for(const entry of result.comments)holder.append(el('article',{class:'anonymous-review'},el('strong',{},'تجربة عضو'),el('span',{},' · '+entry.rating+' / 5'),el('p',{},M.text(entry.comment)),el('dl',{class:'review-breakdown'},criteria.filter(item=>entry.criteria?.[item.id]).map(item=>el('div',{},el('dt',{},item.label),el('dd',{},entry.criteria[item.id]+' / 5'))))));
    const actions=el('div',{class:'actions-row'});if(result.page>0)actions.append(act('السابق',()=>renderReviews(holder,target,page-1)));if(result.hasMore)actions.append(act('التالي',()=>renderReviews(holder,target,page+1)));holder.append(actions);
   }catch(e){if(valid()&&turn===reviewSequence&&holder.isConnected)holder.replaceChildren(el('p',{class:'notice',role:'alert'},e.message),act('إعادة تحميل التقييمات',()=>renderReviews(holder,target,page)));}
  }
  async function verify(hide=false){
   if(!valid()||!loaded||checking||document.hidden)return;checking=true;const turn=sequence;if(hide)root.hidden=true;
   try{const result=await api.labPreview(featureId,true);if(!valid()||turn!==sequence)return;if(!compatible(result.feature))throw new Error('تغير إصدار تجربة الدليل؛ حدّث التطبيق والخدمة.');if(feature.version!==result.feature.version){notice('تغيرت مراجعة تجربة الدليل. أُعيد التحقق.');await load();}root.hidden=false;}catch(e){if(turn===sequence)fail(e);}finally{checking=false;}
  }
  const visibility=()=>{if(document.hidden){if(loaded)root.hidden=true;}else void verify(true);},offline=()=>{if(loaded)fail({message:'توقفت المعاينة لعدم الاتصال. أعد التحقق بعد عودة الإنترنت.'});};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('offline',offline);const timer=setInterval(()=>void verify(),20000);void load();
  return {navigation:snapshot,reload:load,dispose(){disposed=true;++sequence;++reviewSequence;data=null;model=null;feature=null;loaded=false;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('offline',offline);root.replaceChildren();}};
 }
 return Object.freeze({mount});
})();
