/* Medical v4: public directory, server-verified member reviews, separate administration. */
(() => {
  "use strict";
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  let scrollFrame;
  function startOfPage() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => window.scrollTo({top:0,left:0,behavior:"instant"}));
  }
  const isAdmin = () => session()?.role === "admin";
  const companionPreview = new URL(location.href).searchParams.get("experience") === "companion";
  document.documentElement.classList.toggle("companion-preview", companionPreview);
  const API = window.MedicalAPI,
    prefs = window.MedicalStorage;
  const SEARCH = window.MedicalSearch;
  const FACILITIES = window.MedicalFacilities;
  const CRITERIA = window.MedicalReviewCriteria;
  let waitingUpdate = null;
  document.querySelector("#app-version").textContent = "الإصدار " + window.MedicalRelease.version;
  const CONTACTS = window.MedicalContacts;
  const RESEARCH = window.MedicalResearch;
  const dakahliaCenters = ["المنصورة","طلخا","ميت غمر","السنبلاوين","بلقاس","دكرنس","شربين","أجا","المنزلة","منية النصر","ميت سلسيل","بني عبيد","نبروه","الجمالية","تمي الأمديد","محلة دمنة","المطرية"];
  const kinds = [
    "records",
    "hospitals",
    "labs",
    "radiology",
    "pharmacies",
    "specialized_centers",
    "medical_guidelines",
    "emergency_services",
  ];
  const labels = {
    records: "الأطباء والعيادات",
    hospitals: "المستشفيات",
    labs: "معامل التحاليل",
    radiology: "مراكز الأشعة",
    pharmacies: "الصيدليات",
    specialized_centers: "المراكز المتخصصة",
    medical_guidelines: "التعليمات والأخبار والنشرات",
    emergency_services: "الطوارئ",
  };
  const nav = [
    ["home", "⌂", "الرئيسية"],
    ["doctors", "♧", "الأطباء"],
    ["services", "✚", "الخدمات"],
    ["districts", "⌖", "المراكز"],
    ["guidelines", "≡", "التعليمات"],
    ["emergency", "✦", "الطوارئ"],
  ];
  const state = {
    catalog: Object.fromEntries(kinds.map((k) => [k, []])),
    restoring: true,
    stats: {},
    tab: "home",
    query: "",
    markaz: "",
    specialty: "",
    hospital: "",
    coverage: "",
    network: "",
    contractType: "",
    serviceKind: "",
    limit: 24,
    adminKind: "all",
    adminState: "",
    adminWorklist:"pending",
    adminSpecialty:"",adminCategory:"",adminMarkaz:"",adminNetwork:"",adminContract:"",
    options:{},
    greetingName:"",
    identityEpoch:0,
    remote: false,
  };
  const $ = (s) => document.querySelector(s);
  const normalize = (x) =>
    String(x ?? "")
      .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
      .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
      .replace(/[إأآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[\u064B-\u065F]/g, "")
      .trim()
      .toLowerCase();
  const display = (value) => value == null || /^(null|undefined|nan|none|n\/a)$/i.test(String(value).trim()) ? "" : value;
  function cleanDisplay(value) {
    if (typeof value === "string") return display(value);
    if (Array.isArray(value)) return value.map(cleanDisplay);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,cleanDisplay(v)]));
    return value;
  }
  const statusBadge = (r) => r.service_status === "suspended" ? el("span", {class:"service-status suspended"}, "موقوف مؤقتًا") : null;
  const isDental = (r) => /اسنان|اسن|لثه|تقويم|فكين/.test(normalize([r.name,r.specialty,r.subspecialty,r.category,(r.services || []).join?.(" ")].join(" ")));
  // Every data value becomes a text node or a checked URL. No data is inserted as HTML.
  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const c of children.flat(Infinity)) {
      if (c !== null && c !== undefined && c !== false)
        n.append(c instanceof Node ? c : document.createTextNode(String(display(c))));
    }
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "class") n.className = v;
      else if (k === "value") n.value = v;
      else if (k === "checked" || k === "disabled" || k === "required")
        n[k] = !!v;
      else n.setAttribute(k, String(v));
    }
    return n;
  }
  const button = (text, action, classes = "button") =>
    el("button", { type: "button", class: classes, onClick: action }, text);
  const previewNotice = el("aside", {class:"preview-notice"},
    el("span", {}, "معاينة تجربة رفيق الموظف"));
  if (companionPreview) {
    const current = new URL(location.href);
    current.searchParams.delete("experience");
    previewNotice.append(el("a", {href:current.href}, "العودة للتصميم الحالي"));
    previewNotice.hidden = true;
    document.querySelector("#connection-status").after(previewNotice);
  }
  const empty = (text) => el("div", { class: "empty" }, text);
  const detail = (symbol, text) =>
    display(text)
      ? el(
          "p",
          { class: "detail" },
          el("span", { "aria-hidden": "true" }, symbol),
          el("span", {}, text),
        )
      : null;
  function replaceNodes(node,...children) {
    node.replaceChildren(...children.flat(Infinity).filter(child=>child instanceof Node));
  }
  const usable = value => {
    const text=String(display(value) || "").trim();
    return text && !/تحتاج? (?:إلى )?تأكيد|تحتاج? مراجعة|غير مسجل|غير متاح|اتصل لمعرفة|راجع حداثة|راجع جهة|تأكد من العنوان/.test(text) ? text : "";
  };
  function publicBranch(branch,kind) {
    let result={...branch};
    if (["family","retiree"].includes(state.network)) {
      const rel=(branch.contract_relationships || []).find(r=>r.route === "family_network" && r.network_members?.includes(state.network));
      if(rel) {
        const groups=rel.contact_groups || {};
        const phone=["mobile","landline","shortcode"].flatMap(k=>groups[k] || []).join(" - ");
        result={...result,address:rel.address || result.address,phone,raw_phone:phone,phone_digits:"",hotline:"",contact_groups:groups,network_members:rel.network_members,contract_type:"family_network",contract_entity:"شبكة الأسر والمعاشات"};
      }
    }
    const facts=kind === "hospitals" ? RESEARCH.hospital(result) : null;
    if (facts?.address && result.address === facts.originalAddress && !result._version) result.address=facts.address;
    if (kind === "records" && /^(?:مقر )?مستشفي/.test(normalize(result.address))) {
      const h=state.catalog.hospitals.find(h=>h.id === result.contract_entity_id || [h.name,h.short_name].includes(result.hospital));
      const address=normalize(result.address).replace(/^مقر /,"").replace(/ بالمنصوره$/,"");
      if (h && [h.name,h.short_name].filter(Boolean).some(name=>normalize(name)===address)) {const parent=publicBranch(h,"hospitals");result.address=parent.address;result.maps_url=parent.maps_url;}
    }
    if (facts?.originalMap === result.maps_url && ["conflict","unresolved"].includes(facts?.mapStatus)) result.maps_url="";
    return result;
  }
  function toast(text) {
    $("#toast").textContent = text;
    $("#toast").hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($("#toast").hidden = true), 4500);
  }
  function safeUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }
  function link(text, url, classes = "button outline") {
    const href = safeUrl(url);
    return href
      ? el(
          "a",
          {
            href,
            class: classes,
            target: "_blank",
            rel: "noopener noreferrer",
          },
          text,
        )
      : null;
  }
  function telephone(value) {
    const p = String(value || "").replace(/[^\d+]/g, "");
    return /^\+?\d{3,15}$/.test(p) ? p : "";
  }
  function dialog(title, content) {
    $("#dialog-title").textContent = title;
    $("#dialog-content").replaceChildren(content);
    if (!$("#app-dialog").open) $("#app-dialog").showModal();
  }
  const editorValues=form=>JSON.stringify([...new FormData(form)].filter(([key])=>key!=="entity_kind"));
  function editorDirty() {
    const form=$("#dialog-content .entity-editor");
    return form && form.initialValues !== editorValues(form);
  }
  function closeDialog(force=false) {
    if(force !== true && editorDirty() && !window.confirm("لديك تعديلات لم تُحفظ. هل تريد إغلاق النموذج وفقدها؟"))return;
    $("#app-dialog").close();
  }
  $("#app-dialog").addEventListener("cancel",event=>{event.preventDefault();closeDialog();});
  window.addEventListener("beforeunload",event=>{if($("#app-dialog").open && editorDirty()){event.preventDefault();event.returnValue="";}});
  function field(label, name, type = "text", value = "", options = {}) {
    const input = el(type === "textarea" ? "textarea" : "input", {
      id: name,
      name,
      ...(type === "textarea" ? { rows: 4 } : { type }),
      value,
      ...options,
    });
    return el("label", { class: "form-field", for: name }, label, input);
  }
  function selectField(label, name, options, value) {
    return el(
      "div",
      { class: "form-field" },
      el("label", { for: name }, label),
      el(
        "select",
        { id: name, name, value },
        options.map(([v, t]) => el("option", { value: v }, t)),
      ),
    );
  }
  function formAction(form, submit) {
    const error = el("p", { class: "form-error", role: "alert" });
    const submitButton = el(
      "button",
      { type: "submit", class: "button primary" },
      submit,
    );
    form.append(error, submitButton);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitButton.disabled || !form.reportValidity()) return;
      submitButton.disabled = true;submitButton.textContent="جارٍ المعالجة…";form.setAttribute("aria-busy","true");
      error.textContent = "";
      try {
        await form.save(Object.fromEntries(new FormData(form)));
      } catch (e) {
        error.textContent = e.message;
        updateHeader();
      } finally {
        submitButton.disabled = false;submitButton.textContent=submit;form.removeAttribute("aria-busy");
      }
    });
    return form;
  }
  function session() {
    const user = API.session();
    return user ? {...user, name: state.greetingName || window.MedicalNames.greeting(display(user.name)) || (user.role === "admin" ? "مدير المنظومة" : "عضو النقابة")} : null;
  }
  function updateHeader() {
    connection();
    const u = session();
    $(".admin-link").hidden = u?.role === "member";
    updateNotifications();
    $("#filter-panel > small").hidden = !isAdmin();
    const greeting=u ? window.MedicalNames.parts(u.name).flatMap((part,index)=>[index ? " " : "",el("span",{class:"greeting-name-part"},part)]) : [];
    $("#member-button").replaceChildren(...(u ? [u.role === "member" ? "مرحبًا، " : "",...greeting] : ["تسجيل الدخول"]).map(value=>typeof value === "string" ? document.createTextNode(value) : value));
  }
  function connection() {
    const n = $("#connection-status");
    n.hidden = !isAdmin();
    if (!isAdmin()) { n.textContent = ""; return; }
    n.classList.toggle("offline", !navigator.onLine);
    n.textContent = !navigator.onLine
      ? "أنت دون اتصال · تأكيد الدخول والتقييم يحتاجان الإنترنت."
      : !API.configured
        ? "خدمة تسجيل الدخول قيد التجهيز."
        : state.remote
          ? "متصل · بيانات الدليل والتقييمات من الخدمة المركزية."
          : "سجّل الدخول للاطلاع على الدليل الطبي.";
  }
  async function refresh() {
    if (!API.configured || !session()) {
      connection();
      return;
    }
    const epoch=state.identityEpoch;
    const result = await API.catalog();
    if (
      !result.catalog ||
      !kinds.every((k) => Array.isArray(result.catalog[k]))
    )
      throw new Error("تعذر قراءة بيانات الدليل.");
    state.catalog = window.MedicalArabic.entity(cleanDisplay(result.catalog));
    state.profileManagement=result.profileManagement===true;
    state.reviewCriteria = result.reviewCriteria === true;
    state.publicReviewDetails = result.publicReviewDetails === true;
    state.recommendations=result.recommendations?.version===1 && Array.isArray(result.recommendations.items)?result.recommendations.items:[];
    state.facilityBranches = result.facilityBranches === true;
    state.facilityStats = result.facilityStats || {};
    state.directoryState = result.directoryState === true;
    state.familyDirectory = result.familyDirectory === true;
    state.contractDirectory = result.contractDirectory === true;
    state.adminWorkspace = result.adminWorkspace === true;
    state.adminBatch = result.adminBatch === true;
    state.adminBatchData = result.adminBatchData === true;
    state.structuredBranches = result.structuredBranches === true;
    state.contentLifecycle = result.contentLifecycle === true;
    if(isAdmin() && state.adminWorkspace)state.options=(await API.adminOptions()).options || {};
    if(!state.greetingName && (!isAdmin() || state.adminWorkspace)) {
      try {
        const response=isAdmin() ? await API.adminProfile() : await API.profile();
        if(epoch === state.identityEpoch && session()) {
          state.greetingName=window.MedicalNames.greeting(display(response.profile?.name));
          updateHeader();
        }
      } catch { /* Profile availability must not prevent directory access. */ }
    }
    state.stats = result.stats || {};
    state.remote = true;
    contentVisibility=state.catalog.medical_guidelines.map(r=>r.id+':'+window.MedicalContent.status(r)).join('|');
    if(state.profileManagement && !isAdmin()){try{const notifications=await API.profileNotifications();state.privateNotifications=notifications.notifications || [];state.privateNotificationVersion=notifications.version;}catch{}}
    updateNotifications();
    connection();
    renderFilters();
    if (location.hash.startsWith("#entity=")) route();
    else renderMain();
  }
  function providers() {
    const map = new Map();
    for (const r of state.catalog.records) {
      if (!r.provider_id) continue;
      if (!map.has(r.provider_id))
        map.set(r.provider_id, {
          id: r.provider_id,
          name: r.display_name || r.name,
          specialty: r.specialty,
          is_department: r.is_department,
          image_url: r.image_url,
          image_source_url: r.image_source_url,
          image_verified: r.image_verified,
          image_kind: r.image_kind,
          avatar_type: r.avatar_type,
          branches: [],
        });
      map.get(r.provider_id).branches.push(r);
    }
    return [...map.values()];
  }
  function matchesBranch(b) {
    return (
      (!state.markaz || (b.markaz || b.city) === state.markaz) &&
      (!state.hospital || b.hospital === state.hospital) &&
      (!state.network || (b.network_members || []).includes(state.network)) &&
      (!state.contractType || (publicBranch(b,"records").contract_type || (b.contract_entity_id === "direct_we" ? "direct_we" : "hospital")) === state.contractType) &&
      (!state.coverage ||
        (b.coverage_verified === true &&
          (b.coverage_scope === "both" || b.coverage_scope === state.coverage)))
    );
  }
  function matchesText(values) {
    if(!state.query) return true;
    if(isAdmin() && state.tab === "admin") return normalize(values.join(" ")).includes(normalize(state.query));
    return SEARCH.match(state.query,values).score > 0;
  }
  function renderSearch(main) {
    const found=[];
    for(const p of providers()) {
      const matched=p.branches.filter(b=>matchesBranch(b) && (!state.specialty || p.specialty === state.specialty));
      if(!matched.length)continue;
      const scored=matched.map(b=>({branch:b,...SEARCH.match(state.query,{name:p.name,tags:[p.specialty,"طبيب عيادة"],details:[b.hospital,b.address,b.markaz,b.raw_phone]})})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
      if(scored.length)found.push({...scored[0],name:p.name,key:"doctor:"+p.id,render:()=>doctorCard({...p,matched:scored.map(r=>r.branch)})});
    }
    for(const kind of ["hospitals","labs","radiology","pharmacies","specialized_centers"])for(const org of facilityGroups(kind)) {
      const scored=org.branches.flatMap(b=>b.entries).filter(matchesBranch).map(r=>({row:r,...SEARCH.match(state.query,{name:r.name,tags:[org.name,labels[kind],r.category,r.services],details:[r.address,r.markaz,r.phone]})})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
      if(scored.length){const matched=facilityGroups(kind,scored.map(s=>s.row))[0];found.push({...scored[0],name:org.name,key:org.key,render:()=>facilityOrganizationCard(kind,matched,scored[0].row.id)});}
    }
    for(const r of state.catalog.emergency_services) {
      if(state.markaz && r.markaz !== state.markaz)continue;
      const result=SEARCH.match(state.query,{name:r.name,tags:["الطوارئ",r.service_type],details:[r.address,r.markaz,r.number]});
      if(result.score>0)found.push({...result,name:r.name,key:"emergency:"+r.id,render:()=>el("article",{class:"card","data-target":"emergency:"+r.id},el("span",{class:"card-eyebrow"},"الطوارئ"),el("h3",{},r.name),detail("⌖",r.address || r.markaz),button("عرض خدمة الطوارئ",()=>go("emergency",{query:r.name}),"button outline"))});
    }
    found.sort((a,b)=>Number(a.approximate)-Number(b.approximate) || b.score-a.score || a.name.localeCompare(b.name,"ar") || a.key.localeCompare(b.key));
    main.append(heading("نتائج البحث في الدليل",`${found.length} نتيجة · الأطباء وجميع الجهات والخدمات`));
    if(found.length && found.every(r=>r.approximate))main.append(el("section",{class:"notice search-suggestions","aria-label":"اقتراحات البحث"},el("strong",{},"قد تقصد"),...found.slice(0,3).map(r=>button(r.name,()=>go("search",{query:r.name}),"text-button"))));
    main.append(gridCards(found.slice(0,state.limit).map(r=>{
      const card=r.render();
      if(r.approximate)card.prepend(el("span",{class:"card-eyebrow"},"نتيجة قريبة من بحثك"));
      return card;
    })));
    if(!found.length && state.network)main.append(button("البحث في كل الشبكات",()=>{state.network="";renderFilters();renderMain();},"button outline"));
    if(found.length>state.limit)main.append(button("عرض المزيد",()=>{state.limit+=24;renderMain();},"button outline load-more"));
  }
  function doctorResults() {
    return providers()
      .map((p) => ({
        ...p,
        matched: p.branches.filter(
          (b) =>
            matchesBranch(b) &&
            matchesText([
              p.name,
              "الأطباء والعيادات",
              p.specialty,
              b.hospital,
              b.address,
              b.markaz,
              b.raw_phone,
            ]),
        ),
      }))
      .filter(
        (p) =>
          p.matched.length &&
          (!state.specialty || p.specialty === state.specialty),
      );
  }
  function rating(target,override) {
    const stats = override || state.stats[target];
    const count = Number(stats?.count);
    const average = stats?.average == null || stats.average === "" ? NaN : Number(stats.average);
    if (Number.isInteger(count) && count > 0 && Number.isFinite(average) && average >= 1 && average <= 5)
      return el("div", {class:"rating"}, el("strong",{},"★ " + average.toFixed(1)), el("span",{class:"muted"},`${count} تقييم منشور`),state.publicReviewDetails ? button("تفاصيل التقييم وآراء الأعضاء",()=>publicReviewsDialog(target),"text-button review-details-button") : null);
    return el("div",{class:"rating-empty"},el("p",{},"لا يوجد تقييم متاح بعد · شارك تجربتك"),state.publicReviewDetails ? button("تفاصيل التقييم وآراء الأعضاء",()=>publicReviewsDialog(target),"text-button review-details-button") : null);
  }
  function publicReviewsDialog(target){
    if(!session())return;
    const epoch=state.identityEpoch,box=el('section',{class:'public-reviews-panel'});
    const load=async(page=0)=>{
      replaceNodes(box,el('p',{role:'status'},'جارٍ تحميل تقييمات الأعضاء…'));
      try{
        const data=await API.publicReviews(target,page);
        if(!session() || epoch!==state.identityEpoch || !box.isConnected)return;
        const summary=data.summary;
        replaceNodes(box,el('section',{class:'public-review-total'},el('span',{class:'eyebrow'},'التقييم الإجمالي'),el('strong',{dir:summary.count?'ltr':'rtl'},summary.count?Number(summary.average).toFixed(1)+' / 5':'لا توجد تقييمات منشورة بعد'),el('span',{},summary.count+' تقييم منشور')),
          el('h3',{},'تفاصيل تجربة الخدمة'),el('p',{class:'muted'},'متوسط كل عنصر من التقييمات المنشورة لمن جرّبوه؛ هذه الدرجات لا تقيس الكفاءة الطبية.'),
          el('div',{class:'public-review-criteria'},CRITERIA.items.map(item=>{const value=summary.criteria[item.id];return el('article',{},el('div',{},el('strong',{},item.label),el('span',{dir:value.count?'ltr':'rtl'},value.count?Number(value.average).toFixed(1)+' / 5':'لم يُقيّم بعد')),value.count?el('meter',{min:0,max:5,value:value.average,'aria-label':item.label}):null,el('small',{class:'muted'},value.count+' تقييم لهذا العنصر'));})),
          el('div',{class:'section-heading'},el('h3',{},'تجارب الأعضاء'),el('span',{class:'muted'},data.commentCount+' ملاحظة منشورة دون اسم')));
        if(!data.comments.length)box.append(empty('لا توجد ملاحظات اختار أصحابها مشاركتها واعتمدتها الإدارة بعد.'));
        for(const r of data.comments)box.append(el('article',{class:'anonymous-review'},el('div',{class:'anonymous-review-heading'},el('strong',{},'تجربة عضو'),el('span',{dir:'ltr'},'★ '+r.rating+' / 5')),el('p',{},r.comment),el('dl',{class:'review-breakdown'},CRITERIA.items.filter(i=>r.criteria[i.id]).map(i=>el('div',{},el('dt',{},i.label),el('dd',{},r.criteria[i.id]+' / 5'))))));
        const pages=el('div',{class:'actions-row'});
        if(data.page>0)pages.append(button('السابق',()=>load(data.page-1),'button outline'));
        if(data.hasMore)pages.append(button('التالي',()=>load(data.page+1),'button outline'));
        box.append(pages,button('تحديث التقييمات',()=>load(data.page),'text-button'));
      }catch(e){if(box.isConnected && session())replaceNodes(box,el('p',{class:'notice',role:'alert'},e.message),button('إعادة المحاولة',()=>load(page),'button outline'));}
    };
    dialog('تقييم الخدمة وتجارب الأعضاء',box);void load();
  }
  function favorite(target,aliases=[]) {
    const keys=[...new Set([target,...aliases])];
    const saved=()=>keys.some(key=>prefs.getFavorites().includes(key));
    const b = button(
      saved() ? "♥" : "♡",
      () => {
        try {
          const active=!saved();
          if(active)prefs.toggleFavorite(target);
          else for(const key of keys)if(prefs.getFavorites().includes(key))prefs.toggleFavorite(key);
          b.textContent = active ? "♥" : "♡";
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", String(active));
          if (state.tab === "favorites") renderMain();
        } catch (e) {
          toast(e.message);
        }
      },
      "favorite",
    );
    b.classList.toggle("active", saved());
    b.setAttribute("aria-label", "حفظ في المفضلة على هذا الجهاز");
    b.setAttribute(
      "aria-pressed",
      String(saved()),
    );
    return b;
  }
  function coverage(entity) {
    const networks = entity.network_members || [];
    const names = {employee:"الموظفون",family:"الأسر",retiree:"المعاشات"};
    let label = networks.filter((n) => names[n]).map((n) => names[n]).join(" · ");
    if (!label && entity.source_ref === "staff-20261018") label = "شبكة الموظفين";
    if (!label && entity.coverage_verified === true) label = {both:"الموظفون والأسر",employee_only:"الموظفون",family_globemed:"الأسر"}[entity.coverage_scope];
    if (!label && isAdmin()) label = "تصنيف الشبكة يحتاج مراجعة الإدارة";
    return label ? el("div",{class:"network-badge"},el("span",{"aria-hidden":"true",class:"beneficiary-icon"},"♧"),el("strong",{},"المستفيدون"),el("span",{},label)) : null;
  }
  function providerAvatar(entity, type) {
    const defaultType = type === "doctor" ? window.MedicalAvatarHints.doctor(entity.name) : type === "pharmacy" ? "pharmacy" : "clinic";
    const illustration = ["doctor_male","doctor_female","clinic","pharmacy"].includes(entity.avatar_type) ? entity.avatar_type : defaultType;
    const placeholder = el("span", {class:"anime-avatar anime-" + illustration,role:"img","aria-label":"رسم تعبيري " + ({doctor_male:"لطبيب",doctor_female:"لطبيبة",clinic:"لمركز طبي",pharmacy:"لصيدلية"}[illustration]),title:"رسم تعبيري، وليس صورة شخصية"});
    const avatar = el("div", {class:"provider-avatar" + (entity.image_kind === "logo" ? " provider-logo" : "") + (String(entity.image_url || "").includes("el-ezaby.png") ? " provider-logo-light" : "")}, placeholder);
    const url = !entity.avatar_type && entity.image_verified === true && entity.image_kind !== "logo" && safeUrl(entity.image_url);
    if (url && safeUrl(entity.image_source_url)) {
      const img = el("img", {src:url, alt:(entity.image_kind === "logo" ? "شعار " : "صورة ") + (entity.display_name || entity.name), loading:"lazy", decoding:"async", referrerpolicy:"no-referrer", onError:() => { img.remove(); placeholder.hidden = false; }});
      placeholder.hidden = true;
      avatar.append(img);
    }
    return avatar;
  }
  function contactGroups(branch, fallback = false) {
    let groups = CONTACTS.forEntity(branch);
    let reception = false;
    if (!["mobile","landline","shortcode"].some((k) => groups[k].length) && fallback && branch.hospital) {
      const hospital = state.catalog.hospitals.find((h) => h.id === branch.contract_entity_id || h.short_name === branch.hospital || h.name === branch.hospital);
      if (hospital) { groups = CONTACTS.forEntity(hospital); reception = true; }
    }
    const rows = ["mobile","landline","shortcode"].filter((k) => groups[k].length).map((kind) => el("div", {class:"contact-category", "data-contact-type":kind},
      el("span", {class:"contact-label"}, {mobile:"محمول",landline:"أرضي",shortcode:"مختصر"}[kind] + (reception ? " · استقبال المستشفى" : "")),
      el("div", {class:"phone-list"}, groups[kind].map((n) => {
        const evidence = (branch.contact_evidence || []).find((e) => e.number === n);
        return el("span", {class:"phone-entry"}, el("a", {class:"phone-chip",href:"tel:" + n,dir:"ltr","aria-label":`${kind === "mobile" ? "محمول" : kind === "landline" ? "أرضي" : "رقم مختصر"} ${n}`}, n), isAdmin() && evidence ? link("المصدر",evidence.source_url,"phone-source") : null);
      }))));
    return el("div", {class:"contact-groups"}, rows.length ? rows : isAdmin() ? el("p", {class:"muted"}, "رقم الاتصال غير متاح") : null,
      isAdmin() && (branch.contact_review_required || groups.invalid.length) ? el("small", {class:"muted"}, "بعض الأرقام تحتاج مراجعة؛ أُخفيت الأرقام غير سليمة الصيغة.") : null);
  }
  function locationDetails(branch) {
    const parts=window.MedicalLocations.parts(usable(branch.address));
    if(parts.length<2)return detail("⌖",usable(branch.address));
    return el("section",{class:"location-list","aria-label":"عناوين المقر"},el("strong",{},"أماكن تقديم الخدمة"),parts.map((part,index)=>el("div",{class:"location-row"},el("span",{class:"location-number","aria-hidden":"true"},index+1),el("div",{},el("p",{},part.text),part.mappable ? link("البحث عن هذا العنوان","https://www.google.com/maps/search/?api=1&query="+encodeURIComponent([branch.name,part.text,"الدقهلية مصر"].join(" ")),"text-button") : part.phone ? el("a",{href:"tel:"+part.phone,dir:"ltr",class:"phone-chip"},part.phone) : null))));
  }
  function actionLinks(branch) {
    const query=[branch.name,branch.address,branch.markaz || branch.city,"الدقهلية","مصر"].map(display).filter(Boolean).join(" ");
    const original=safeUrl(branch.maps_url);
    const exact=original && !/\/maps\/search|[?&](q|query)=/.test(original);
    return [contactGroups(branch,true),window.MedicalLocations.parts(branch.address).length>1 ? null : link(exact ? "الموقع على الخريطة" : "البحث عن العنوان", exact ? original : "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(query))];
  }
  function share(target, name) {
    const url = new URL(location.href);
    url.hash = "entity=" + encodeURIComponent(target);
    if (navigator.share)
      navigator.share({ title: name, url: url.href }).catch(() => {});
    else if (navigator.clipboard)
      navigator.clipboard
        .writeText(url.href)
        .then(() => toast("تم نسخ رابط الجهة."))
        .catch(() => toast("تعذر نسخ الرابط."));
    else dialog("رابط الجهة", el("p", {}, url.href));
  }
  function beforeVisit(branch) {
    return el("details", {class:"before-visit"},
      el("summary", {}, "قبل ما تتحرك"),
      isAdmin() ? el("p", {class:"muted"}, "راجع تفاصيل هذا المقر قبل الزيارة.") : null,
      el("dl", {class:"visit-checklist"},
        usable(branch.address) || isAdmin() ? el("div", {}, el("dt", {}, "العنوان"), el("dd", {}, usable(branch.address) || "العنوان يحتاج استكمالًا")) : null,
        usable(branch.schedule || branch.working_hours) || isAdmin() ? el("div", {}, el("dt", {}, "المواعيد"), el("dd", {}, usable(branch.schedule || branch.working_hours) || "المواعيد تحتاج استكمالًا")) : null,
        coverage(branch) || isAdmin() ? el("div", {}, el("dt", {}, "الشبكة"), el("dd", {}, coverage(branch) || "تصنيف الشبكة يحتاج مراجعة")) : null,
        isAdmin() ? el("div", {}, el("dt", {}, "تاريخ التحقق"), el("dd", {}, branch.verified_at || "غير مسجل في الدليل")) : null),
      isAdmin() && branch.source_url ? link("مصدر المعلومة", branch.source_url, "text-button") : null,
      isAdmin() ? el("p", {class:"notice"}, "اتصل بالمقر لمعرفة المواعيد وإجراء الزيارة.") : null);
  }
  function doctorCard(p,full = false) {
    const target = "doctor:" + p.id;
    let branch = p.matched[0];
    const details = el("div",{class:"branch-details"});
    const actions = el("div",{class:"card-actions"});
    const options = el("div",{class:"branch-options",role:"group","aria-label":"مقار وتعاقدات " + p.name});
    const buttons = [];
    const renderBranch = () => {
      for (const [b, button] of buttons) {
        const active = String(b.id) === String(branch.id);
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed",String(active));
      }
      const shown=publicBranch(branch,"records");
      replaceNodes(details,
        el("p",{class:"branch-hospital"},branch.hospital || "العيادة"),
        statusBadge(branch),
        locationDetails(shown),
        detail("◷",usable(branch.schedule) || (isAdmin() ? "المواعيد تحتاج استكمالًا" : "")),
        coverage(shown),
        companionPreview ? beforeVisit(publicBranch(branch,"records")) : null);
      replaceNodes(actions,...actionLinks(shown), button("قيّم الزيارة",()=>reviewDialog(target,p.name,String(branch.id)),"button primary"));
    };
    const card = el("article",{class:"card doctor-card"+(full ? " provider-profile" : ""),"data-target":target},
      el("div",{class:"card-top"},providerAvatar(p,p.is_department ? "clinic" : "doctor"),
        el("div",{class:"card-info"},el("span",{class:"card-eyebrow"},p.is_department ? "قسم طبي" : "رعاية متخصصة"),el(full ? "h1" : "h3",{},full ? p.name : el("a",{href:"#entity="+encodeURIComponent(target),class:"provider-title-link"},p.name)),el("p",{class:"card-specialty"},p.specialty),
          isAdmin() && p.image_verified ? link("مصدر الصورة",p.image_source_url,"image-source") : null),favorite(target)));
    if (p.branches.length > 1 || window.MedicalLocations.parts(publicBranch(branch,"records").address).length>1) card.append(el("p",{class:"multi-location"},`أماكن الزيارة: ${new Set(p.branches.flatMap(b=>window.MedicalLocations.parts(publicBranch(b,"records").address).map(p=>p.text))).size || p.branches.length} · اختر المكان المناسب`));
    if (p.matched.length > 1) {
      card.append(el("h4",{class:"branch-heading"},"اختر مكان الزيارة"));
      if(isAdmin()) card.append(el("p",{class:"branch-instruction"},"اختر المستشفى أو العيادة لعرض تفاصيلها"));
      for (const b of p.matched) {
        const option = button("",()=>{branch=b;renderBranch();},"branch-option");
        option.dataset.branch = String(b.id);
        replaceNodes(option,el("strong",{},b.branch_label || b.hospital || "العيادة"),el("small",{},[b.clinic_type,b.markaz || b.city].filter(Boolean).join(" · ")),el("span",{class:"branch-address"},usable(publicBranch(b,"records").address)),statusBadge(b));
        buttons.push([b,option]);
        options.append(option);
      }
      card.append(options);
    }
    if (p.branches.length > p.matched.length) card.append(button(`عرض كل المقار (${p.branches.length})`,()=>{location.hash="entity="+encodeURIComponent(target);},"text-button"));
    card.append(...[details,full ? null : rating(target),actions,button("مشاركة الجهة",()=>share(target,p.name),"text-button card-share")].filter(n=>n instanceof Node));
    if (!full) {
      card.append(el("a",{class:"profile-open",href:"#entity="+encodeURIComponent(target)},p.is_department ? "ملف القسم الطبي" : "ملف الطبيب والتفاصيل",el("span",{"aria-hidden":"true"},"←")));
      card.addEventListener("click",event=>{if(!event.target.closest("a,button,input,details,summary,select,textarea")) location.hash="entity="+encodeURIComponent(target);});
    }
    renderBranch();
    return card;
  }
  function facilityCard(kind, original, context=null) {
    const r=publicBranch(original,kind);
    if(context)r.network_members=context.branch.network_members;
    const facts=kind === "hospitals" ? RESEARCH.hospital(original) : null;
    const target = entityTarget(kind,r);
    return el(
      "article",
      { class: "card facility-card", "data-target": target },
      el(
        "div",
        { class: "card-top" },
        providerAvatar(r, kind === "pharmacies" ? "pharmacy" : "clinic"),
        el(
          "div",
          { class: "card-info" },
          el("span",{class:"card-eyebrow"},labels[kind]),
          el("h3", {}, r.name),
          el("p", {}, (r.category && /[\u0600-\u06ff]/.test(r.category) ? r.category : labels[kind]) + " · " + (r.markaz || r.city || "")),
          isAdmin() && r.image_verified ? link(r.image_kind === "logo" ? "شعار الجهة · المصدر" : "مصدر الصورة",r.image_source_url,"image-source") : null,
        ),
        favorite(target,context ? context.branch.entries.map(r=>entityTarget(kind,r)) : []),
      ),
      statusBadge(r),
      locationDetails(r),
      detail("↔",r.contract_type === "direct_we" || r.contract_entity_id === "direct_we" ? "تعاقد مباشر مع الشركة" : usable(r.contract_entity)),
      isAdmin() && r.data_notes ? el("p", {class:"data-note"}, r.data_notes) : null,
      detail("◷",facts?.hours || usable(r.working_hours)),
      facts?.hoursSource ? link("مصدر ساعات العمل",facts.hoursSource,"fact-source") : null,
      facts?.scheduleSource ? link("جدول الاستقبال والعيادات",facts.scheduleSource,"fact-source") : null,
      isAdmin() && facts?.note ? el("p",{class:"data-note"},facts.note) : null,
      isAdmin() && !usable(r.working_hours) && !facts?.hours ? el("p",{class:"data-note"},"مواعيد استقبال موثقة مطلوبة") : null,
      coverage(r),
      companionPreview ? beforeVisit(r) : null,
      rating(target,context && state.facilityBranches ? state.facilityStats[kind+":"+context.branch.id] : undefined),
      el(
        "div",
        { class: "card-actions" },
        actionLinks(r),
        button(
          "قيّم الزيارة",
          () => reviewDialog(target, r.name, String(r.id)),
          "button outline",
        ),
      ),
      button("مشاركة الجهة", () => share(target, r.name), "text-button"),
    );
  }
  // Classification changes the section, never the canonical storage/review identity.
  function facilitySection(source,r){
    if(!["hospitals","specialized_centers"].includes(source))return source;
    if(/^مركز متخصص(?:$| · )/.test(String(r.category || "")))return "specialized_centers";
    if(/^مستشفى(?:$| )/.test(String(r.category || "")))return "hospitals";
    return source;
  }
  function facilityEntries(section){
    if(!["hospitals","specialized_centers"].includes(section))return state.catalog[section] || [];
    return ["hospitals","specialized_centers"].flatMap(source=>state.catalog[source].filter(r=>facilitySection(source,r)===section).map(r=>({...r,_source_kind:source})));
  }
  const entityTarget=(kind,r)=>(r._source_kind || kind)+":"+r.id;
  function sectionCategory(section,source,value){
    const category=String(value || "").replace(/^(?:مركز متخصص|مستشفى) · /,"");
    if(section===source)return category || (section==="hospitals"?"مستشفى استثماري":"مركز متخصص");
    const prefix=section==="hospitals"?"مستشفى":"مركز متخصص";
    return category===prefix || (section==="hospitals" && /^مستشفى /.test(category)) ? category : prefix+" · "+category;
  }
  function facilityGroups(kind,rows=facilityEntries(kind)) {
    return FACILITIES.organizations(kind,rows);
  }
  function facilityOrganizationCard(kind,org,initialId="") {
    if(org.branches.length===1 && org.branches[0].entries.length===1)return facilityCard(kind,org.branches[0].entries[0]);
    let branch=org.branches.find(b=>b.entries.some(r=>String(r.id)===String(initialId))) || org.branches[0];
    let entry=branch.entries.find(r=>String(r.id)===String(initialId)) || branch.entries.find(r=>r.id===branch.id) || branch.entries[0];
    const content=el("div",{class:"facility-group-details"}),networks=el("div",{class:"branch-network-options",role:"group","aria-label":"تفاصيل شبكات الفرع"});
    const choices=el("div",{class:"branch-options facility-branches",role:"group","aria-label":"فروع "+org.name});
    const buttons=[];
    const renderEntry=()=>{
      for(const [b,n] of buttons)n.setAttribute("aria-pressed",String(b===branch));
      for(const [b,n] of buttons)n.classList.toggle("active",b===branch);
      const byNetwork=new Map();for(const r of branch.entries){const key=(r.network_members || []).join(","),old=byNetwork.get(key);if(!old || r.service_status==='suspended')byNetwork.set(key,r);}
      const sourceNetworks=[...byNetwork.values()];
      const selected=byNetwork.get((entry.network_members || []).join(","));if(selected?.service_status==='suspended')entry=selected;
      replaceNodes(networks,sourceNetworks.length>1 ? sourceNetworks.map(r=>{
        const b=button((r.network_members || []).includes("employee") ? (r.network_members.length>1?"كل المستفيدين":"الموظفون") : "الأسر والمعاشات",()=>{entry=r;renderEntry();},"button outline");
        if(r.service_status==='suspended')b.append(statusBadge(r));
        b.setAttribute("aria-pressed",String(r===entry || (r.network_members || []).join(",")===(entry.network_members || []).join(",")));return b;
      }) : []);
      replaceNodes(content,facilityCard(kind,entry,{branch}));
    };
    for(const b of org.branches){const r=b.entries.find(r=>r.id===b.id)||b.entries[0];const control=button("",()=>{branch=b;entry=b.entries.find(r=>r.network_members?.includes(state.network)) || b.entries.find(r=>r.id===b.id)||b.entries[0];renderEntry();},"branch-option");
      control.dataset.facilityBranch=b.id;
      control.append(...[el("strong",{},r.branch_label || r.markaz || r.city || "الفرع"),el("span",{class:"branch-address"},usable(publicBranch(r,kind).address)),coverage({network_members:b.network_members}),b.entries.every(r=>r.service_status==='suspended') ? statusBadge({service_status:'suspended'}) : b.entries.some(r=>r.service_status==='suspended') ? el("small",{class:"muted"},"توقف مؤقت لبعض خيارات الخدمة") : null].filter(n=>n instanceof Node));buttons.push([b,control]);choices.append(control);}
    const card=el("article",{class:"card facility-group-card","data-organization":org.key},el("div",{class:"facility-group-heading"},providerAvatar(entry,kind==='pharmacies'?'pharmacy':'clinic'),el("div",{},el("span",{class:"card-eyebrow"},labels[kind]),el("h3",{},org.name),el("p",{class:"muted"},org.branches.length===1?"تفاصيل الفرع وشبكات الاستفادة":"الفروع المتاحة: "+org.branches.length))),org.branches.length>1 ? el("details",{class:"facility-branch-picker",open:initialId?null:""},el("summary",{},"اختر الفرع المناسب"),choices) : null,networks,content);
    // A hidden/filtered source is never borrowed to enrich a visible branch.
    const all=facilityGroups(kind).find(g=>g.key===org.key);
    if(all && all.branches.length>org.branches.length)card.append(el("a",{class:"text-button",href:"#entity="+encodeURIComponent(kind+":"+entry.id)},"عرض جميع الفروع ("+all.branches.length+")"));
    renderEntry();return card;
  }
  function heading(title, subtitle) {
    return el(
      "div",
      { class: "section-heading" },
      el(
        "div",
        {},
        el("h1", {}, title),
        subtitle ? el("p", {}, subtitle) : null,
      ),
    );
  }
  function gridCards(cards) {
    return cards.length
      ? el("div", { class: "grid" }, cards)
      : empty("لا توجد نتائج مطابقة. جرّب تغيير البحث أو الفلاتر.");
  }
  function renderFilters() {
    const container = $("#filters");
    container.replaceChildren();
    $("#filter-panel").hidden = ["home", "admin", "account", "guidelines", "districts", "profile"].includes(state.tab);
    if (["home", "admin", "account", "guidelines", "districts", "profile"].includes(state.tab)) return;
    const areas = [
      ...new Set([...dakahliaCenters,
        kinds
          .flatMap((k) => state.catalog[k])
          .map((r) => r.markaz || r.city)
          .filter(Boolean),
      ].flat()),
    ].sort((a, b) => a.localeCompare(b, "ar"));
    const make = (title, key, values) => {
      const select = el(
        "select",
        {
          "aria-label": title,
          value: state[key],
          onChange: (e) => {
            state[key] = e.target.value;
            state.limit = 24;
            renderMain();
          },
        },
        el("option", { value: "" }, "الكل"),
        values.map((v) => el("option", { value: v }, v)),
      );
      container.append(el("label", {}, title, select));
    };
    make("المركز / المدينة", "markaz", areas);
    if (["doctors", "favorites", "dental", "district-network"].includes(state.tab)) {
      make(
        "التخصص",
        "specialty",
        [...new Set(state.catalog.records.map((r) => r.specialty))].filter(
          Boolean,
        ),
      );
      make(
        "المستشفى",
        "hospital",
        [...new Set(state.catalog.records.map((r) => r.hospital))].filter(
          Boolean,
        ),
      );
    }
    if (["doctors", "services", "hospitals", "dental", "district-network"].includes(state.tab)) {
      for (const [title,key,options] of [
        ["الشبكة","network",[["","كل الشبكات"],["employee","الموظفون"],["family","الأسر"],["retiree","المعاشات"]]],
        ["مسار التعاقد","contractType",[["","كل المسارات"],["direct_we","تعاقد مباشر من الشركة"],["hospital","عبر مستشفى"],["family_network","شبكة الأسر والمعاشات"]]],
      ]) {
        const filter = selectField(title,"filter-" + key,options,state[key]);
        filter.querySelector("select").addEventListener("change",(e)=>{state[key]=e.target.value;state.limit=24;renderMain();});
        container.append(filter);
      }
      const select = el(
        "select",
        {
          "aria-label": "التغطية المؤكدة",
          value: state.coverage,
          onChange: (e) => {
            state.coverage = e.target.value;
            renderMain();
          },
        },
        el("option", { value: "" }, "كل الجهات"),
        el("option", { value: "employee_only" }, "تغطية العاملين المؤكدة"),
        el("option", { value: "family_globemed" }, "تغطية الأسر المؤكدة"),
      );
      if (isAdmin()) container.append(el("label", {}, "التغطية المؤكدة", select));
    }
    container.append(
      button(
        "مسح الفلاتر",
        () => {
          state.markaz = "";
          state.specialty = "";
          state.hospital = "";
          state.coverage = "";
          state.network = "";
          state.contractType = "";
          state.query = "";
          state.serviceKind = "";
          $("#search-input").value = "";
          renderFilters();
          renderMain();
        },
        "text-button",
      ),
    );
  }
  function renderCompanionHome(main) {
    const user = session();
    const find = (tab) => {
      state.query = "";
      $("#search-input").value = "";
      go(tab);
    };
    const search = el("form", {class:"companion-search",role:"search"},
      el("label", {for:"companion-query"}, "ابحث عن طبيب أو جهة أو تخصص"),
      el("div", {},
        el("input", {id:"companion-query",name:"query",type:"search",maxlength:120,placeholder:"اسم الطبيب، التخصص أو المنطقة…",value:state.query}),
        el("button", {type:"submit",class:"button primary"}, "ابحث الآن")));
    search.addEventListener("submit", (event) => {
      event.preventDefault();
      state.query = search.querySelector("input").value.trim();
      $("#search-input").value = state.query;
      go("search",{query:state.query});
    });
    main.append(el("section", {class:"companion-welcome"},
      el("div", {class:"eyebrow"}, "تطبيق رعايتي · معك خطوة بخطوة"),
      el("h1", {}, "مرحبًا، " + user.name),
      el("p", {}, "معلومة واضحة، وجهة مناسبة، وخطوة تالية أسهل."), search,
      el("div", {class:"companion-hero-footer"},
        el("span", {}, "الجهات والتقييمات من الدليل النقابي"),
        el("a", {href:"tel:123",class:"emergency-shortcut"}, "الإسعاف 123"))));
    const shortcuts = [
      ["الخدمات الطبية", "تحاليل وأشعة وصيدليات ومراكز", "✚", () => find("services")],
      ["جهاتي المفضلة", "الجهات التي حفظتها على جهازك", "♡", () => find("favorites")],
      [user.role === "member" ? "بطاقتي وتقييماتي" : "إدارة الدليل", "بياناتك وإجراءاتك في مكان واحد", "◎", () => go(user.role === "member" ? "account" : "admin")],
      ["التعليمات والإجراءات", "راجع الخطوات مع مسؤول الرعاية", "≡", () => find("guidelines")],
    ];
    main.append(el("section", {class:"companion-shortcuts","aria-label":"اختصارات خدمتك"},
      ...shortcuts.map(([name,description,symbol,action]) => el("button", {type:"button",class:"companion-shortcut",onClick:action},
        el("span", {class:"shortcut-symbol","aria-hidden":"true"}, symbol),
        el("span", {}, el("strong", {}, name), el("small", {}, description)),
        el("span", {"aria-hidden":"true"}, "←")))));
    main.append(el("section", {class:"companion-next"},
      el("div", {}, el("p", {class:"eyebrow"}, "زيارتك تبدأ قبل الوصول"), el("h2", {}, "قبل ما تتحرك"),
        el("p", {class:"muted"}, "اختر المقر، راجع العنوان والمواعيد، وتأكد من التغطية مباشرةً. ستجد ملخص التجهيز داخل بطاقة الجهة.")),
      button("استعرض الجهات الطبية", () => find("doctors"), "button primary")));
    main.append(el("section", {class:"companion-guide"}, el("h2", {}, "ثلاث خطوات لزيارة أوضح"),
      el("ol", {},
        el("li", {}, el("strong", {}, "اختر الجهة والمقر"), el("p", {}, "ابحث حسب حاجتك وموقع الجهة، ثم اختر مقر الخدمة المناسب.")),
        el("li", {}, el("strong", {}, "تأكد قبل الزيارة"), el("p", {}, "اتصل للتأكد من المواعيد والخدمة والتغطية والإجراءات.")),
        el("li", {}, el("strong", {}, "شارك تجربتك بعد الزيارة"), el("p", {}, "قيّم التجربة، وتابع حالتها من صفحتك. يمكنك اختيار مشاركة ملاحظتك دون اسم بعد مراجعتها.")))));
  }
  function networkTabs() {
    const nav=el("nav",{class:"network-tabs","aria-label":"شبكات الرعاية الطبية"});
    for(const [value,label,icon] of [["","كل الشبكات","⊞"],["employee","الموظفون","♧"],["family","الأسر والمعاشات","♡"]]) {
      const active=value === "family" ? ["family","retiree"].includes(state.network) : state.network === value;
      const b=button("",()=>{state.network=value;state.contractType="";state.limit=24;renderFilters();renderMain();startOfPage();},"network-tab"+(active ? " active" : ""));
      b.setAttribute("aria-pressed",String(active));b.append(el("span",{"aria-hidden":"true"},icon),el("span",{},label));nav.append(b);
    }
    return nav;
  }
  function publishedContent(r) {
    return window.MedicalContent.visible(r);
  }
  function contentCard(r) {
    return el("details",{class:"card instruction-card","data-document":r.id},
      el("summary",{},el("span",{class:"card-eyebrow"},window.MedicalContent.types[r.document_type] || "تعليمات الخدمة"),el("strong",{},r.title)),
      el("p",{},r.summary),el("ol",{},(r.steps || []).map(t=>el("li",{},t))),
      el("p",{class:"muted"},[r.issuing_authority,r.source_reference,r.verified_at ? "مراجعة: "+r.verified_at : ""].filter(Boolean).join(" · ")),
      r.effective_from || r.expires_at ? el("p",{class:"muted"},[r.effective_from ? "ساري من "+r.effective_from : "",r.expires_at ? "حتى "+r.expires_at : ""].filter(Boolean).join(" · ")) : null,
      r.source_url ? link("المصدر",r.source_url,"text-button") : null,
      isAdmin() ? button("تحرير المحتوى",()=>editDialog("medical_guidelines",r),"text-button") : null);
  }
  // Only explicit publications become notifications. Routine directory edits stay silent.
  const notificationKey="medical_read_announcements_v1";
  function announcementKey(r) {
    return window.MedicalContent.key(r);
  }
  function announcements() {
    return state.catalog.medical_guidelines.filter(r=>window.MedicalContent.announcement(r) && publishedContent(r)).sort((a,b)=>window.MedicalContent.order(b).localeCompare(window.MedicalContent.order(a)));
  }
  function readAnnouncements() {try {const value=JSON.parse(localStorage.getItem(notificationKey));return new Set(Array.isArray(value)?value.filter(v=>typeof v === "string"):[]);}catch{return new Set();}}
  function markAnnouncements(rows) {
    const keys=readAnnouncements();for(const row of rows)keys.add(announcementKey(row));
    try{localStorage.setItem(notificationKey,JSON.stringify([...keys].slice(-200)));}catch{toast("تعذر حفظ حالة القراءة على هذا الجهاز.");}
    updateNotifications();
  }
  function updateNotifications() {
    const b=$("#notifications-button");if(!b)return;
    b.hidden=!session();
    const seen=readAnnouncements(),unread=announcements().filter(r=>!seen.has(announcementKey(r))).length+(state.privateNotifications || []).filter(n=>!n.readAt).length+Number(!!waitingUpdate);
    b.querySelector("span").textContent=String(unread);b.querySelector("span").hidden=!unread;
    b.setAttribute("aria-label",unread ? `الإشعارات · ${unread} غير مقروءة` : "الإشعارات");
  }
  function showNotifications() {
    if(!session())return;
    const rows=announcements(),seen=readAnnouncements();
    const box=el("div",{class:"notification-list"},el("p",{class:"muted"},"إعلانات الشبكة وتحديث التطبيق"));
    if(waitingUpdate)box.append(el("article",{class:"notification-item unread"},el("strong",{},"تحديث جديد للتطبيق جاهز"),el("p",{},"تفعيل التحديث سيعيد فتح الصفحة. احفظ أي نموذج مفتوح أولًا."),button("تحديث التطبيق الآن",()=>waitingUpdate?.(),"button primary")));
    for(const r of rows)box.append(el("article",{class:"notification-item"+(!seen.has(announcementKey(r))?" unread":"")},el("strong",{},r.title),el("p",{},r.summary),button("قراءة الإعلان",()=>{markAnnouncements([r]);dialog(r.title,contentCard(r));},"text-button")));
    for(const n of state.privateNotifications || [])box.append(el('article',{class:'notification-item'+(!n.readAt?' unread':'')},el('strong',{},'إشعار خاص بك'),el('p',{},n.message),button('عرض طلبي',async()=>{try{await API.readProfileNotification(n.id);n.readAt=Date.now();updateNotifications();closeDialog();go('account');}catch(e){toast(e.message);}},'text-button')));
    if(!rows.length && !waitingUpdate && !(state.privateNotifications || []).length)box.append(empty("لا توجد إشعارات جديدة حاليًا."));
    box.append(button("تحديث الإشعارات",async()=>{try{await refresh();if(session())showNotifications();}catch(e){toast(e.message);}},"text-button"));
    if(rows.length)box.append(button("تحديد الإعلانات كمقروءة",()=>{markAnnouncements(rows);showNotifications();},"button outline"));
    dialog("الإشعارات",box);
  }
  $("#notifications-button").onclick=showNotifications;
  window.addEventListener("storage",e=>{if(e.key===notificationKey)updateNotifications();});
  function recentUpdates(main) {
    const rows=[];
    for(const r of state.catalog.medical_guidelines.filter(r=>window.MedicalContent.announcement(r) && publishedContent(r))) rows.push({id:r.id,title:r.title,at:window.MedicalContent.order(r),type:r.document_type,document:r,subtitle:r.summary});
    const recent=rows.filter(r=>Number.isFinite(Date.parse(r.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,6);
    main.append(el("section",{class:"recent-updates","aria-label":"آخر تحديثات الشبكة"},
      el("div",{class:"section-heading"},el("h2",{},"آخر تحديثات الشبكة"),button("تعليمات الخدمة",()=>go("guidelines"),"text-button")),
      recent.length ? el("div",{class:"updates-grid"},recent.map(r=>el("article",{class:"update-card","data-update":r.id},
        el("span",{class:"update-label "+r.type},{added:"إضافة جديدة",updated:"تحديث بيانات",suspended:"موقوف مؤقتًا",resumed:"استئناف الخدمة",news:"خبر الشبكة",bulletin:"نشرة طبية"}[r.type] || "تحديث الشبكة"),
        el("h3",{},r.title),el("p",{class:"muted"},r.subtitle),el("time",{datetime:r.at},new Intl.DateTimeFormat("ar-EG",{timeZone:"Africa/Cairo",dateStyle:"medium"}).format(new Date(r.at))),
        button(r.document ? "قراءة الإعلان" : "عرض التفاصيل",()=>r.document ? dialog(r.title,contentCard(r.document)) : (location.hash="entity="+encodeURIComponent(r.target)),"text-button"))))
      : el("p",{class:"updates-empty"},"ستظهر هنا الأخبار والإعلانات التي تنشرها النقابة.")));
  }
  function careIcon(kind) {
    const paths = {
      doctors:["M6 3v6a6 6 0 0 0 12 0V3M3 3h6m6 0h6M12 15v2a4 4 0 0 0 8 0v-2","M20 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4"],
      hospitals:["M4 21V7h16v14M2 21h20M9 21v-5h6v5M9 3h6m-3-3v6M7 11h2m6 0h2"],
      labs:["M9 2h6m-5 0v7L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L14 9V2M7 15h10"],
      radiology:["M5 2h14v20H5ZM9 7l3 2 3-2M8 11l4 2 4-2M8 15l4 2 4-2M12 5v14"],
      pharmacies:["M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"],
      centers:["M3 21V6h18v15M1 21h22M9 21v-5h6v5M7 10h2m6 0h2M7 13h2m6 0h2M9 2h6"],
      districts:["M12 22s8-8 8-13a8 8 0 0 0-16 0c0 5 8 13 8 13Z","M12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6"],
      dental:["M12 4C5-1 1 5 4 12c1 2 1 9 4 10 2 0 1-7 4-7s2 7 4 7c3-1 3-8 4-10 3-7-1-13-8-8Z"],
      guidelines:["M6 3h13v18H5V4M8 8h8M8 12h8M8 16h5"],
      emergency:["M12 21 3 12C-3 5 6-1 12 6c6-7 15-1 9 6Z","M5 11h4l2-4 3 9 2-5h4"],
    };
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    for(const [key,value] of Object.entries({viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"1.6","stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"}))svg.setAttribute(key,value);
    for(const d of paths[kind] || paths.emergency){const path=document.createElementNS(svg.namespaceURI,"path");path.setAttribute("d",d);svg.append(path);}
    return svg;
  }
  function showAbout() {
    dialog("عن تطبيق رعايتي والخصوصية",el("section",{class:"about-care"},
      el("p",{class:"about-intro"},"شبكتك الطبية.. بين يديك"),
      el("p",{},"دليل للخدمات الطبية للموظفين والأُسَر والمعاشات بالدقهلية، مقدم من النقابة العامة بالدقهلية، بتنفيذ محمود العراقي."),
      el("h3",{},"بيانات الدخول"),
      el("p",{},"نستخدم كود العامل ورقم الموبايل المسجل وآخر أربعة أرقام من الرقم القومي للتحقق من العضوية. لا يحفظ التطبيق هذه المدخلات في تخزين المتصفح."),
      el("p",{},"عند اختيار تذكّر الدخول، تبقى جلسة دخولك على الجهاز لمدة تصل إلى 30 يومًا. يمكنك إنهاؤها من زر تسجيل الخروج."),
      el("h3",{},"تقييمك وملاحظاتك"),
      el("p",{},"تظهر درجات التقييم الإجمالية وعناصر الخدمة بعد اعتماد الإدارة. ملاحظاتك خاصة ما لم تختر مشاركتها دون اسم؛ حينها تُعرض للأعضاء بعد المراجعة، ويظل اسمك ظاهرًا للإدارة فقط. الملاحظات القديمة لا تُشارك تلقائيًا. يمكنك تعديل التقييم أو إلغاء المشاركة من حسابك؛ يعاد التعديل للمراجعة وتُسحب النسخة المنشورة."),
      el("h3",{},"طبيعة الخدمة"),
      el("p",{},"التطبيق دليل للبحث والتواصل، ولا يقدم تشخيصًا أو حجز مواعيد، ولا يغيّر شروط التغطية الطبية المعتمدة من جهة العمل."),
      el("a",{class:"button outline",href:"https://wa.me/201550100025?text="+encodeURIComponent("لدي استفسار عن تطبيق رعايتي والخصوصية."),target:"_blank",rel:"noopener noreferrer"},"تواصل للاستفسار أو ملاحظات الخصوصية")));
  }
  document.querySelector("#about-app").onclick=showAbout;
  function recommendationSection(home){
    if(isAdmin() || !session() || !state.remote || !window.MedicalRecommendations)return null;
    if(!home && !['doctors','hospitals','services','dental','district-network'].includes(state.tab))return null;
    const choices=[],specialties=new Map(providers().map(p=>["doctor:"+p.id,p.specialty]));
    for(const item of state.recommendations || []){
      const specialty=specialties.get(item.target) || item.specialty;
      let rows=(state.catalog[item.kind] || []).filter(r=>item.ids.includes(String(r.id)) && r.service_status!=='suspended' && r.directory_visibility!=='hidden' && r.contract_listing!==false && matchesBranch(r));
      if(item.kind==='records'){
        if(state.specialty && specialty!==state.specialty)continue;
        rows=rows.filter(r=>matchesText([r.display_name || r.name,'الأطباء والعيادات',specialty,r.hospital,r.address,r.markaz,r.raw_phone]));
      }else{
        if(state.specialty)continue;
        rows=rows.filter(r=>matchesText([r.name,labels[facilitySection(item.kind,r)],r.category,...[r.services].flat().filter(Boolean),r.address,r.markaz,r.phone]));
      }
      rows=rows.filter(r=>{
        const kind=item.kind==='records'?'records':facilitySection(item.kind,r);
        if(home)return true;
        if(state.tab==='doctors')return kind==='records';
        if(state.tab==='hospitals')return kind==='hospitals';
        if(state.tab==='services')return ['labs','radiology','pharmacies','specialized_centers'].includes(kind) && (!state.serviceKind || state.serviceKind===kind);
        if(state.tab==='dental')return isDental(r);
        return true;
      });
      if(!rows.length)continue;
      const row=rows[0];
      choices.push({...item,label:item.kind==='records'?(specialty || item.label):(usable(row.category) || item.label),row,name:row.display_name || row.name,selectedTarget:item.kind==='records'?item.target:entityTarget(item.kind,row),location:row.markaz || row.city || ''});
    }
    const selected=window.MedicalRecommendations.select(choices,{limit:home?3:1,diverse:home});
    if(!selected.length)return null;
    const explain=item=>dialog('لماذا ظهر هذا الترشيح؟',el('section',{class:'form-stack'},el('h3',{},item.name),el('p',{},'ضمن '+item.label+'، وله '+item.count+' تقييمًا منشورًا بمتوسط '+item.average.toFixed(1)+' من 5.'),item.kind==='records'?el('p',{},'درجة الطبيب مجمعة عبر مقاره؛ نعرض المقر المطابق لخياراتك.'):el('p',{},'تخص الدرجة الفرع المعروض.'),el('p',{},'يطابق الفلاتر الحالية. نراعي الدرجة وعدد الآراء معًا؛ ولا يكفي تقييم واحد للتصدر.'),el('p',{},'لا نعرض ترشيحًا بأقل من 5 تقييمات أو متوسط أقل من 4 من 5. تقييم التجربة لا يقيس الكفاءة الطبية ولا يؤكد شروط التغطية.'),el('p',{class:'notice'},'وفق تجارب الأعضاء، وليست توصية طبية؛ اختيار الجهة يعود إليك.')));
    return el('section',{class:'recommendation-section'+(home?' recommendation-home':' recommendation-inline'),'aria-label':home?'اختيارات تساعدك':'قد يناسب بحثك'},
      el('div',{class:'recommendation-heading'},el('strong',{},home?'✦ اختيارات تساعدك':'✦ قد يناسب بحثك'),el('small',{class:'muted'},'حسب تقييمات الأعضاء')),
      el('div',{class:'recommendation-strip'},selected.map(item=>el('article',{class:'recommendation-card','data-recommendation':item.target},
        el('div',{class:'recommendation-category'},el('span',{},'مرشح في '+item.label),el('small',{},item.location)),el('strong',{class:'recommendation-name'},item.name),
        el('div',{class:'recommendation-score'},el('strong',{dir:'ltr'},'★ '+item.average.toFixed(1)+' / 5'),el('span',{},item.count+' تقييمًا منشورًا')),
        el('div',{class:'recommendation-actions'},button('عرض التفاصيل',()=>{location.hash='entity='+encodeURIComponent(item.selectedTarget);},'text-button'),button('لماذا ظهر؟',()=>explain(item),'text-button'))))),
      el('small',{class:'recommendation-disclaimer'},'وفق تجارب الأعضاء، وليست توصية طبية؛ اختيار الجهة يعود إليك.'));
  }
  function renderRecommendations(main,home){const section=recommendationSection(home);if(section)main.append(section);}
  function renderHome(main) {
    if (companionPreview) {renderCompanionHome(main);renderRecommendations(main,true);recentUpdates(main);return;}
    const networkRecords=state.catalog.records.filter(r=>!state.network || (r.network_members || []).includes(state.network));
    const networkProviders=providers().filter(p=>p.branches.some(r=>!state.network || (r.network_members || []).includes(state.network)));
    const search=el("form",{class:"care-home-search",role:"search"},
      el("label",{for:"care-home-query",class:"sr-only"},"ابحث عن طبيب أو جهة أو تخصص"),
      el("input",{id:"care-home-query",name:"query",type:"search",maxlength:120,placeholder:"اسم الطبيب، الجهة أو التخصص…",value:state.query}),
      el("button",{type:"submit",class:"button primary"},"ابحث"));
    search.onsubmit=event=>{event.preventDefault();const query=search.querySelector("input").value.trim();$("#search-input").value=query;go("search",{query});};
    main.append(el("section",{class:"hero care-home","aria-label":"دليلك الشخصي للرعاية"},
      el("div",{class:"care-home-content"},
        el("div",{class:"care-brandline"},el("img",{src:"img/rayati-icon-512.webp",alt:"",width:38,height:38}),el("span",{},"رعايتي · رعاية تجمعنا")),
        el("p",{class:"care-greeting"},"مرحبًا، "+session().name),
        el("h1",{},"رعايتك أقرب،",el("br"),"لك ولأسرتك"),
        el("p",{class:"care-home-description"},"طبيب، مستشفى أو خدمة طبية.. اختر وجهتك وتواصل بسهولة."),search,
        el("div",{class:"care-districts","aria-label":"وصول سريع إلى شبكة المركز"},el("span",{},"شبكتك في:"),
          ["المنصورة","طلخا","ميت غمر","السنبلاوين"].map(markaz=>button(markaz,()=>go("district-network",{markaz}),"care-district")))),
      el("div",{class:"care-home-visual","aria-hidden":"true"},
        el("div",{class:"care-orbit"},el("img",{src:"img/rayati-icon-512.webp",alt:"",width:180,height:180})),
        el("span",{class:"care-orbit-label"},"الموظفون · الأُسَر والمعاشات"),el("small",{},"شبكتك الطبية.. بين يديك"))));
    main.append(el("section",{class:"care-metrics","aria-label":"ملخص الجهات الظاهرة في الشبكة"},
      [[networkProviders.length,"طبيب وقسم", "doctors"], [new Set(networkRecords.map(r=>r.specialty)).size,"تخصصًا", "guidelines"], [facilityEntries("hospitals").filter(r=>!state.network || r.network_members?.includes(state.network)).length,"مستشفيات", "hospitals"]].map(([count,label,icon])=>el("div",{},careIcon(icon),el("span",{},el("strong",{},count),el("small",{},label))))));
    renderRecommendations(main,true);
    main.append(el("div",{class:"section-heading care-section-heading"},el("div",{},el("p",{class:"eyebrow"},"ابدأ من هنا"),el("h2",{},"ما الخدمة التي تبحث عنها؟")),button("مراكز الدقهلية",()=>go("districts"),"text-button")));
    const categories=[
      ["الأطباء والعيادات","doctors","التخصصات ومقار الكشف",()=>go("doctors")],
      ["المستشفيات","hospitals","جهات الرعاية والتعاقد",()=>go("hospitals")],
      ["معامل التحاليل","labs","التحاليل والفحوص المعملية",()=>go("services",{serviceKind:"labs"})],
      ["الأشعة","radiology","مراكز الأشعة والفحوص",()=>go("services",{serviceKind:"radiology"})],
      ["الصيدليات","pharmacies","الفروع وأرقام التواصل",()=>go("services",{serviceKind:"pharmacies"})],
      ["المراكز المتخصصة","centers","خدمات طبية متكاملة",()=>go("services",{serviceKind:"specialized_centers"})],
      ["مراكز الدقهلية","districts","شبكتك حسب المركز",()=>go("districts")],
      ["الأسنان","dental","العيادات والمراكز",()=>go("dental")],
      ["التعليمات","guidelines","إجراءات الحصول على الخدمة",()=>go("guidelines")],
      ["الطوارئ","emergency","خطوط الرعاية والإسعاف",()=>go("emergency")],
    ];
    main.append(el("div",{class:"category-grid care-services"},categories.map(([name,icon,description,action])=>el("button",{type:"button",class:"category service-tile",onClick:action},el("span",{class:"service-symbol"},careIcon(icon)),el("strong",{},name),el("small",{},description),el("span",{class:"service-arrow","aria-hidden":"true"},"←")))));
    recentUpdates(main);
    main.append(el("div",{class:"section-heading"},el("h2",{},"التخصصات الطبية")));
    main.append(el("div",{class:"category-grid care-specialties"},[...new Set(networkRecords.map(r=>r.specialty))].map(s=>el("button",{type:"button",class:"category specialty-tile",onClick:()=>go("doctors",{specialty:s})},el("strong",{},s),el("small",{},networkProviders.filter(p=>p.specialty === s).length+" طبيب وقسم")))));
    main.append(el("section",{class:"care-support-panel"},
      el("div",{},el("span",{class:"eyebrow"},"للتواصل مع الرعاية"),el("h2",{},"رقمك أقرب مما تتوقع")),
      el("a",{href:"tel:16133"},el("span",{},"الموظفون"),el("strong",{dir:"ltr"},"16133")),
      el("a",{href:"tel:19104"},el("span",{},"الأُسَر والمعاشات"),el("strong",{dir:"ltr"},"19104"))));
  }
  function renderMain() {
    updateHeader();
    const main = $("#main");
    main.dataset.catalogReady = String(!!session() && state.remote);
    main.replaceChildren();
    const signedIn = !!session();
    document.documentElement.classList.toggle("workspace-view",signedIn);
    document.documentElement.classList.toggle("admin-view",signedIn && state.tab === "admin");
    const desktopAdmin=$(".desktop-admin-link");if(desktopAdmin)desktopAdmin.hidden=!isAdmin();
    previewNotice.hidden = !isAdmin();
    $(".search-panel").hidden = !signedIn || state.tab === "home" || (companionPreview && state.tab === "account");
    $("#main-nav").hidden = !signedIn;
    if (!signedIn) {
      document.documentElement.classList.add("login-view");
      return renderLogin(main);
    }
    document.documentElement.classList.remove("login-view");
    if (!state.remote) {
      main.append(
        heading("تحميل الدليل الطبي"),
        el("p", { class: "muted" }, "لحظات ونجهز لك الدليل…"),
        button(
          "إعادة المحاولة",
          () => refresh().catch((e) => toast(e.message)),
          "button outline",
        ),
      );
      return;
    }
    if (location.hash.startsWith("#entity=")) {
      try {return openDeepLink(decodeURIComponent(location.hash.slice(8)));}
      catch {return main.append(empty("تعذر عرض بيانات الجهة."));}
    }
    if (!["admin","account","guidelines","emergency","profile"].includes(state.tab)) main.append(networkTabs());
    const activeFilters=[["البحث",state.query],["المركز",state.markaz],["التخصص",state.specialty],["المستشفى",state.hospital],["الخدمة",labels[state.serviceKind]],["مسار التعاقد",state.contractType ? {direct_we:"مباشر",hospital:"عبر مستشفى",family_network:"الأسر والمعاشات"}[state.contractType] : ""]].filter(([,v])=>v);
    if(activeFilters.length) main.append(el("section",{class:"active-filters","aria-label":"البحث والتصفية النشطة"},activeFilters.map(([k,v])=>el("span",{class:"filter-chip"},k+": "+v)),button("مسح البحث والتصفية",()=>{resetSearch();renderFilters();renderMain();},"text-button")));
    if (state.tab === "home") return renderHome(main);
    if (state.tab === "search") return renderSearch(main);
    if (state.tab === "admin") return renderAdmin(main);
    if (state.tab === "account") return renderAccount(main);
    if (state.tab === "districts") {
      main.append(heading("شبكتك في مراكز الدقهلية", "اختر المركز لاستعراض الأطباء والمستشفيات والخدمات المرتبطة به."));
      main.append(el("div",{class:"district-grid"}, dakahliaCenters.map(name => {
        const records = state.catalog.records.filter(r => (r.markaz || r.city) === name && (!state.network || r.network_members?.includes(state.network)));
        const facilities = ["hospitals","labs","radiology","pharmacies","specialized_centers"].flatMap(k => FACILITIES.branches(k,state.catalog[k].filter(r => (r.markaz || r.city) === name && (!state.network || r.network_members?.includes(state.network)))));
        const b = button("", () => {
          state.markaz=name; state.hospital=""; state.specialty=""; state.contractType=""; state.coverage=""; state.query="";
          $("#search-input").value=""; go("district-network",{markaz:name});
        }, "district-card");
        b.append(el("span",{class:"district-icon","aria-hidden":"true"},"⌖"), el("strong",{},name),
          el("small",{},`${new Set(records.map(r=>r.provider_id)).size} طبيب وقسم · ${facilities.length} جهة`));
        return b;
      })));
      return;
    }
    if (state.tab === "guidelines") {
      main.append(heading("تعليمات الحصول على الخدمة","تعليمات الشركة والنشرات الطبية المنشورة"),button("تحديث التعليمات والنشرات",async()=>{try{await refresh();}catch(e){toast(e.message);}},"text-button"));
      const docs=state.catalog.medical_guidelines.filter(r=>r.document_type !== "news" && publishedContent(r) && matchesText([r.title,r.summary,...(r.steps || [])]));
      if(docs.length) main.append(el("div",{class:"instructions-list"},docs.map(contentCard)));
      else main.append(empty("لا توجد تعليمات منشورة مطابقة حاليًا."));
      if(isAdmin()) main.append(el("p",{class:"notice"},"المحتوى القديم غير المعتمد والمسودات تظهر في إدارة التعليمات فقط حتى استكمال المصدر والنشر."),button("إدارة التعليمات",()=>{state.adminKind="medical_guidelines";go("admin");},"button outline"));
      return;
    }
    if (state.tab === "emergency") {
      main.append(heading("الرعاية الطبية والطوارئ",isAdmin() ? "بيانات التشغيل غير المؤكدة ظاهرة للإدارة فقط." : "أرقام الرعاية الطبية وخدمات الاتصال العاجل"));
      const rows=[...[
        {id:"em_we_employee",name:"الخط الساخن للرعاية الطبية · موظفون",number:"16133",tel:"16133"},
        {id:"em_we_family",name:"الخط الساخن للرعاية الطبية · أسر ومعاشات",number:"19104",tel:"19104"},
      ].filter(r=>!state.directoryState && !state.catalog.emergency_services.some(e=>e.id===r.id)),...state.catalog.emergency_services]
        .filter(r=>r.id !== "em_we_coord" && !/مسؤول الرعاية الطبية/.test(r.name));
      const care=rows.filter(r=>["em_we_employee","em_we_family"].includes(r.id)).sort((a,b)=>a.id === "em_we_employee" ? -1 : b.id === "em_we_employee" ? 1 : 0);
      main.append(el("section",{class:"care-hotlines","aria-label":"خطوط الرعاية الطبية"},care.map(r=>
        el("a",{class:"care-hotline",href:"tel:"+telephone(r.tel || r.number)},el("span",{class:"care-icon","aria-hidden":"true"},"✚"),el("span",{class:"care-caption"},"الخط الساخن للرعاية الطبية"),el("h2",{},r.id === "em_we_employee" ? "الموظفون" : "الأسر والمعاشات"),el("strong",{dir:"ltr"},r.number || r.tel)))));
      main.append(el("section",{class:"ambulance-call"},el("div",{},el("span",{class:"card-eyebrow"},"الاتصال العاجل"),el("h2",{},"الإسعاف المصري")),el("a",{href:"tel:123",class:"button danger",dir:"ltr"},"123")));
      const selected=rows.filter(r=>!["em_we_employee","em_we_family","em_1"].includes(r.id) && (!state.markaz || r.markaz === state.markaz) && matchesText([r.name,r.markaz,r.description]));
      const emergencyCard=r=>{
        const facts=RESEARCH.urgent(r);
        return el("article",{class:"card emergency-card","data-emergency":r.id},
          el("div",{class:"emergency-card-title"},el("span",{"aria-hidden":"true",class:"emergency-icon"},"✚"),el("h3",{},r.name)),
          r.emergency_group === "public_state" ? el("span",{class:"card-eyebrow"},"جهة حكومية") : null,
          statusBadge(r),
          detail("⌖",usable(r.address) || usable(r.markaz)),
          detail("◷",facts?.hours),
          facts?.hoursSource ? link("مصدر ساعات العمل",facts.hoursSource,"fact-source") : null,
          facts?.scheduleSource ? link("جدول الاستقبال",facts.scheduleSource,"fact-source") : null,
          isAdmin() ? el("p",{class:"data-note"},facts?.note || (!facts?.hours ? "لم يُعثر على مواعيد استقبال حديثة موثقة؛ ساعات الملف السابقة: "+(usable(r.hours)||"غير مسجلة") : "رُوجع المصدر في 18 أكتوبر 2026")) : null,
          isAdmin() ? el("p",{class:"coverage unknown"},r.verified && r.source_url ? "آخر تحقق: "+(display(r.verification_date)||"غير مسجل") : "رقم منشور بالدليل · راجع حداثة البيانات") : null,
          el("div",{class:"card-actions"},telephone(r.tel || r.number) ? el("a",{class:"button danger",href:"tel:"+telephone(r.tel || r.number)},"اتصال "+(r.number || r.tel)) : null,
            link("الخريطة","https://www.google.com/maps/search/?api=1&query="+encodeURIComponent([r.name,r.address,r.markaz,"الدقهلية","مصر"].map(display).filter(Boolean).join(" ")))));
      };
      const publicState=r=>r.emergency_group ? r.emergency_group === "public_state" : ["جامعة المنصورة","أمانة المراكز الطبية المتخصصة","وزارة الصحة","مراكز خدمات نقل الدم القومية"].includes(r.affiliation);
      const contracted=selected.filter(r=>r.emergency_group ? r.emergency_group === "contracted" : !!r.contract_parent_id || /خاص متعاقد/.test(r.affiliation || ""));
      const publicRows=selected.filter(r=>publicState(r) || r.id === "em_moh_icu");
      if(contracted.length) main.append(heading("استقبال المستشفيات المتعاقدة"),gridCards(contracted.map(emergencyCard)));
      main.append(el("section",{class:"public-emergency","aria-label":"الطوارئ العامة بالدولة"},
        heading("الطوارئ العامة بالدولة","المستشفيات والمراكز الحكومية داخل محافظة الدقهلية"),
        publicRows.length ? gridCards(publicRows.map(emergencyCard)) : empty("لا توجد جهات حكومية مطابقة للبحث الحالي.")));
      const other=selected.filter(r=>!contracted.includes(r) && !publicRows.includes(r));
      const publicOther=other.filter(r=>r.emergency_group === "public_hotline");
      if(publicOther.length)main.append(heading("خطوط مساندة"),gridCards(publicOther.map(emergencyCard)));
      if(isAdmin() && other.some(r=>!publicOther.includes(r))) main.append(heading("سجلات أخرى للمراجعة"),gridCards(other.filter(r=>!publicOther.includes(r)).map(emergencyCard)));
      return;
    }
    if (["services","dental"].includes(state.tab))
      main.append(
        el(
          "div",
          { class: "actions-row" },
          [
            ["", "كل الخدمات"],
            ["dental", "الأسنان"],
            ["hospitals", "المستشفيات"],
            ...["labs", "radiology", "pharmacies", "specialized_centers"].map(
              (k) => [k, labels[k]],
            ),
          ].map(([k, t]) =>
            button(
              t,
              () => {
                if (["dental","hospitals"].includes(k)) return go(k);
                go("services",{serviceKind:k});
              },
              "button " + ((state.tab === "dental" ? k === "dental" : state.serviceKind === k) ? "primary" : "outline"),
            ),
          ),
        ),
      );
    const favs = prefs.getFavorites();
    let cards = [];
    if (["doctors", "favorites", "dental", "district-network"].includes(state.tab))
      cards.push(
        ...doctorResults()
          .filter(p => state.tab !== "dental" || p.branches.some(isDental))
          .filter(
            (p) => state.tab !== "favorites" || favs.includes("doctor:" + p.id),
          )
          .map(p=>doctorCard(p)),
      );
    const facilityKinds =
      state.tab === "hospitals"
        ? ["hospitals"]
        : state.tab === "services"
          ? ["labs", "radiology", "pharmacies", "specialized_centers"].filter(
              (k) => !state.serviceKind || state.serviceKind === k,
            )
          : ["favorites","dental","district-network"].includes(state.tab)
            ? [
                "hospitals",
                "labs",
                "radiology",
                "pharmacies",
                "specialized_centers",
              ]
            : [];
    for (const kind of facilityKinds)
      cards.push(
        ...facilityGroups(kind,facilityEntries(kind)
          .filter(
            (r) =>
              matchesBranch(r) &&
              (state.tab !== "dental" || isDental(r)) &&
              matchesText([r.name,labels[kind],r.category,...[r.services].flat().filter(Boolean),r.address,r.markaz,r.phone]) &&
              (state.tab !== "favorites" || favs.includes(entityTarget(kind,r)) || FACILITIES.branches(kind,facilityEntries(kind)).some(b=>b.entries.some(e=>e.id===r.id) && b.entries.some(e=>favs.includes(entityTarget(kind,e))))),
          ))
          .map(org => facilityOrganizationCard(kind,org)),
      );
    main.append(
      heading(
        {
          dental: "شبكة رعاية الأسنان",
          "district-network": "الشبكة الطبية · " + state.markaz,
          doctors: "الأطباء والعيادات",
          services: "الخدمات الطبية",
          hospitals: "المستشفيات",
          favorites: "المفضلة على هذا الجهاز",
        }[state.tab] || "الدليل",
        `${cards.length} نتيجة`,
      ),
      ...[recommendationSection(false)].filter(node=>node instanceof Node),
      gridCards(cards.slice(0, state.limit)),
    );
    if (cards.length > state.limit)
      main.append(
        button(
          "عرض المزيد",
          () => {
            state.limit += 24;
            renderMain();
          },
          "button outline load-more",
        ),
      );
  }
  const viewHistory=new Map();
  const viewFields=["tab","query","markaz","specialty","hospital","coverage","network","contractType","serviceKind","limit","adminKind","adminState","adminWorklist","adminSpecialty","adminCategory","adminMarkaz","adminNetwork","adminContract"];
  let activeViewKey=null,activeViewHash="";
  function rememberView(){
    if(activeViewKey && session() && state.tab!=="profile") {
      viewHistory.set(activeViewKey,{hash:activeViewHash,state:Object.fromEntries(viewFields.map(k=>[k,state[k]])),scroll:window.scrollY});
      if(viewHistory.size>40)viewHistory.delete(viewHistory.keys().next().value);
    }
  }
  window.addEventListener("scroll",rememberView,{passive:true});
  function backToResults(fallback){
    const entries=[...viewHistory.keys()];
    if(entries.some(key=>key!==activeViewKey))history.back();else go(fallback);
  }
  let pendingNavigation=null;
  function resetSearch() {
    for(const key of ["query","markaz","specialty","hospital","coverage","contractType","serviceKind","adminState"]) state[key]="";
    state.limit=24;
    $("#search-input").value="";
  }
  function go(tab,filters={}) {
    pendingNavigation={tab,filters};
    if(location.hash === "#"+tab) route();
    else location.hash=tab;
  }
  function route(event) {
    if(event?.newURL && new URL(event.newURL).hash!==location.hash)return;
    rememberView();
    let entryKey=history.state?.medicalViewKey;
    if(!entryKey || (entryKey===activeViewKey && activeViewHash!==location.hash))entryKey=crypto.randomUUID();
    const previous=viewHistory.get(entryKey);
    const returning=entryKey!==activeViewKey && previous?.hash===location.hash;
    history.replaceState({...history.state,medicalViewKey:entryKey},"");
    activeViewKey=entryKey;activeViewHash=location.hash;
    if (!session()) {renderMain();return;}
    if(returning && !pendingNavigation) {
      Object.assign(state,previous.state);
      $("#search-input").value=state.query;
      renderFilters();renderMain();
      for(const link of $("#main-nav").querySelectorAll("a")){const active=link.getAttribute("href")==="#"+({"dental":"services","hospitals":"services","district-network":"districts"}[state.tab] || state.tab);link.classList.toggle("active",active);if(active)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");}
      requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:previous.scroll,left:0,behavior:"instant"})));
      return;
    }
    startOfPage();
    const hash = location.hash.slice(1);
    if (hash.startsWith("entity=")) {
      try {
        openDeepLink(decodeURIComponent(hash.slice(7)));
        return;
      } catch {
        go("home");
        return;
      }
    }
    const previousTab=state.tab;
    state.tab = [
      ...nav.map((n) => n[0]),
      "district-network",
      "search",
      "dental",
      "hospitals",
      "admin",
      "guidelines",
      "account",
      "favorites",
    ].includes(hash)
      ? hash
      : "home";
    if(state.tab !== previousTab || pendingNavigation?.tab === state.tab) {resetSearch();$("#filter-panel").open=false;}
    if(pendingNavigation?.tab === state.tab) Object.assign(state,pendingNavigation.filters);
    pendingNavigation=null;
    $("#search-input").value=state.query;
    state.limit = 24;
    $("#main-nav")
      .querySelectorAll("a")
      .forEach((a) => {
        const active = a.getAttribute("href") === "#" + ({"dental":"services","hospitals":"services","district-network":"districts"}[state.tab] || state.tab);
        a.classList.toggle("active", active);
        if (active) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    renderFilters();
    renderMain();
  }
  function openDeepLink(target) {
    if (!session() || !state.remote) {
      renderMain();
      return;
    }
    const main = $("#main");
    main.dataset.catalogReady = "true";
    state.tab = "profile";
    renderFilters();
    const navTarget=target.startsWith("doctor:") ? "#doctors" : "#services";
  $("#main-nav").querySelectorAll("a").forEach(a=>{const active=a.getAttribute("href") === navTarget;a.classList.toggle("active",active);if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");});
    main.replaceChildren();
    if (target.startsWith("doctor:")) {
      const p = providers().find((p) => "doctor:" + p.id === target);
      main.append(
        p
          ? doctorProfile(p)
          : empty("الجهة لم تعد متاحة."),
      );
    } else {
      const at = target.indexOf(":"),requested=target.slice(0,at),id=target.slice(at+1);
      let source=requested,r=state.catalog[requested]?.find(r=>String(r.id)===id);
      if(!r){r=facilityEntries(requested).find(r=>String(r.id)===id);source=r?._source_kind || requested;}
      const kind=r ? facilitySection(source,r) : requested;
      if(r)r={...r,_source_kind:source};
      const org=r && facilityGroups(kind).find(org=>org.branches.some(b=>b.entries.some(e=>String(e.id)===id)));
      main.append(button("العودة إلى النتائج",()=>backToResults("services"),"text-button profile-back"),heading("الجهة الطبية"),r ? facilityOrganizationCard(kind,org,id) : empty("الجهة لم تعد متاحة."));
    }
  }
  function doctorProfile(p) {
    const box=el("section",{class:"doctor-profile-page"},
      button("العودة إلى النتائج",()=>backToResults("doctors"),"text-button profile-back"),
      doctorCard({...p,matched:p.branches.filter(matchesBranch).length ? p.branches.filter(matchesBranch) : p.branches},true));
    const target="doctor:"+p.id;
    const tabs=el("nav",{class:"profile-sections","aria-label":"أقسام ملف الطبيب"},
      el("a",{href:"#profile-locations",onClick:event=>{event.preventDefault();box.querySelector(".branch-details").scrollIntoView({behavior:"smooth",block:"center"});}},"المقار والتواصل"),
      el("a",{href:"#profile-reputation",onClick:event=>{event.preventDefault();box.querySelector(".external-reputation").scrollIntoView({behavior:"smooth",block:"start"});}},"الآراء والمصادر"));
    box.prepend(tabs);
    const facts=RESEARCH.doctor(p);
    const external=el("section",{class:"external-reputation reputation-panel",id:"profile-reputation"},
      el("div",{class:"section-heading"},el("div",{},el("span",{class:"card-eyebrow"},"تجارب ومصادر مستقلة"),el("h2",{},"آراء المرضى"))),
      el("div",{class:"reputation-local"},el("h3",{},"تقييم أعضاء تطبيق رعايتي"),rating(target)));
    if(facts) {
      const snapshot=facts.average ? el("div",{class:"external-score"},el("strong",{},`★ ${facts.average.toFixed(1)}/5`),el("span",{},`${facts.count} تقييمًا على ${facts.source}`)) : null;
      external.append(el("article",{class:"external-source"},el("h3",{},facts.source),snapshot,
        facts.reviewSummary ? el("p",{},facts.reviewSummary) : null,
        facts.reviewDate ? el("small",{class:"muted"},"تاريخ الرأي المعروض: "+facts.reviewDate) : null,
        facts.average ? el("p",{class:"source-snapshot"},"لقطة المصدر بتاريخ 18 أكتوبر 2026 · مستقلة عن تقييم أعضاء التطبيق") : null,
        link("عرض الملف والآراء في المصدر",facts.url,"button outline"),
        facts.reviewUrl ? link("ملف فيزيتا",facts.reviewUrl,"fact-source") : null,
        isAdmin() && facts.note ? el("p",{class:"data-note"},facts.note) : null));
    }
    const search="https://www.google.com/search?q="+encodeURIComponent([p.name,p.specialty,...new Set(p.branches.map(b=>b.markaz || b.city)),"آراء المرضى"].filter(Boolean).join(" "));
    external.append(link("بحث خارجي عن الطبيب",search,"text-button"));
    if(isAdmin() && !facts) external.append(el("p",{class:"data-note"},"لم تثبت مطابقة ملف خارجي لهذا الطبيب؛ لا يوجد تقييم خارجي مضاف."));
    box.append(external);
    return box;
  }
  function memberForm() {
    const form = el(
      "form",
      { class: "form-stack" },
      el(
        "p",
        { class: "muted" },
        "أدخل بياناتك للدخول",
      ),
      !API.configured
        ? el(
            "p",
            { class: "notice warning" },
            "تسجيل الدخول غير متاح حاليًا. يرجى المحاولة لاحقًا.",
          )
        : null,
      field("كود الموظف", "employee_code", "text", "", {
        placeholder: "اكتب كود العامل بالأرقام الإنجليزية",
        inputmode: "numeric",
        dir: "ltr",
        required: true,
        maxlength: 40,
        autocomplete: "off",
      }),
      field("رقم الموبايل المسجل", "phone", "tel", "", {
        placeholder: "رقمك الأساسي 015… بالأرقام الإنجليزية",
        required: true,
        inputmode: "tel",
        maxlength: 20,
        autocomplete: "tel",
        dir: "ltr",
      }),
      field("آخر ٤ أرقام من الرقم القومي", "last4", "password", "", {
        placeholder: "آخر 4 أرقام بالأرقام الإنجليزية",
        dir: "ltr",
        required: true,
        inputmode: "numeric",
        minlength: 4,
        maxlength: 4,
        autocomplete: "off",
      }),
      el(
        "label",
        { class: "remember-option" },
        el("input", { type: "checkbox", name: "remember" }),
        "تذكّر دخولي على هذا الجهاز لمدة ٣٠ يومًا",
      ),
    );
    form.save = async (data) => {
      viewHistory.clear();activeViewKey=null;
    state.greetingName="";state.identityEpoch++;
      await API.login("member", { ...data, remember: data.remember === "on" });
      form.reset();
      closeDialog();
      updateHeader();
      route();
      await refresh();
      toast(
        API.persistenceNotice ||
          "مرحبًا، " + session().name + ". سعداء بوجودك في تطبيق رعايتي.",
      );
    };
    formAction(form, "تحقق وادخل");
    form.querySelector('button[type="submit"]').classList.add("login-submit");
    form.querySelector('button[type="submit"]').setAttribute("aria-label","تحقق وادخل");
    form.append(el("a", {
      class: "login-support",
      href: "https://wa.me/201550100025?text=" + encodeURIComponent("تعذّر عليّ تسجيل الدخول إلى تطبيق رعايتي. أرجو المساعدة."),
      target: "_blank", rel: "noopener noreferrer",
      "aria-label": "تعذّر الدخول؟ تواصل عبر واتساب على 01550100025",
    }, el("span", {}, "إن تعذّر الدخول، تواصل عبر واتساب"), el("strong", {dir:"ltr"}, "01550100025")));

    if (!API.configured)
      form.querySelector("button[type=submit]").disabled = true;
    return form;
  }
  function renderLogin(main) {
    const box = el(
      "section",
      { class: "login-card" },
      el("div", {class:"brand-pair", "aria-label":"اللجنة النقابية والمصرية للاتصالات"},
        el("img",{src:"img/nekaba-mark-512.webp",alt:"شعار اللجنة النقابية",width:90,height:90}),
        el("span",{class:"brand-divider","aria-hidden":"true"}),
        el("img",{src:"img/we_logo.webp",alt:"شعار WE",width:130,height:80})),
      el("h1", {}, "دليل الرعاية الطبية بالدقهلية"),
      el("p", {class:"login-tagline"}, "الشبكة الطبية للموظفين والأسر والمعاشات"),
      el("p", {class:"creator-credit"}, el("strong",{},"إعداد وتنفيذ أ / محمود العراقي"),el("a",{href:"tel:01550100025",dir:"ltr"},"01550100025")),
    );
    box.append(
      memberForm(),
      el("div",{class:"login-president"},el("span",{},"رئيس النقابة"),el("strong",{},"الأستاذ/ محمود صالح")));
    if(state.restoring) {
      box.setAttribute("aria-busy","true");
      box.querySelector("button[type=submit]").disabled=true;
    }
    main.replaceChildren(box);
  }
  function memberDialog() {
    const u = session();
    if (u) {
      go("account");
      return;
    }
    if($('.login-card')){$('.login-card [name="employee_code"]').focus();$('.login-card').scrollIntoView({block:'start',behavior:'smooth'});return;}
    route();requestAnimationFrame(()=>$('.login-card [name="employee_code"]')?.focus());
  }
  $(".admin-link").addEventListener("click",event=>{
    event.preventDefault();
    if (isAdmin()) return go("admin");
    adminDialog();
  });
  function adminDialog() {
    const form = el(
      "form",
      { class: "form-stack" },
      el(
        "p",
        { class: "muted" },
        "الدخول مخصص لحساب المدير المعتمد في MyNekaba. صلاحيات العضوية لا تتيح إدارة الدليل.",
      ),
      field("بريد حساب المدير أو اسم المستخدم", "email", "text", "", {
        required: true,
        autocomplete: "username",
        dir: "ltr",
      }),
      field("كلمة مرور الحساب", "password", "password", "", {
        required: true,
        autocomplete: "current-password",
        maxlength: 256,
      }),
    );
    if (!API.configured)
      form.append(
        el("p", { class: "notice warning" }, "خدمة دخول المدير قيد التجهيز."),
      );
    form.save = async (data) => {
      viewHistory.clear();activeViewKey=null;
    state.greetingName="";state.identityEpoch++;
      await API.login("admin", data);
      form.reset();
      closeDialog();
      state.tab = "admin";
      location.hash = "admin";
      route();
      await refresh();
      renderMain();
    };
    dialog("دخول المدير", formAction(form, "دخول الإدارة"));
    if (!API.configured)
      form.querySelector("button[type=submit]").disabled = true;
  }
  function reviewDialog(target, name, branch, previous = null) {
    if (session()?.role !== "member") {
      if (session()?.role === "admin")
        toast("حساب الإدارة مخصص لإدارة الدليل. التقييم يتطلب تحقق العضوية.");
      else memberDialog();
      return;
    }
    const form = el(
      "form",
      { class: "form-stack" },
      el("p", {}, name),
      selectField(
        "تقييم تجربة الزيارة",
        "rating",
        [
          ["", "اختر التقييم"],
          ["5", "★★★★★ ممتازة"],
          ["4", "★★★★ جيدة"],
          ["3", "★★★ متوسطة"],
          ["2", "★★ ضعيفة"],
          ["1", "★ غير مرضية"],
        ],
        previous ? String(previous.rating) : "",
      ),
      field("ملاحظاتك على الزيارة", "comment", "textarea", previous?.comment || "", {
        maxlength: 1500,
        placeholder: "صف تجربتك دون ذكر رقم قومي أو تفاصيل صحية خاصة.",
      }),
      el(
        "label",
        {},
        el("input", { type: "checkbox", name: "visited", required: true }),
        " أقر بأنني أو أحد أفراد أسرتي تلقينا الخدمة بالفعل.",
      ),
    );
    form.querySelector("select").required = true;
    if(state.reviewCriteria) {
      const measured=el("fieldset",{class:"review-criteria"},el("legend",{},"تفاصيل تجربة الخدمة"),el("p",{class:"muted"},"من 1 غير مرضٍ إلى 5 ممتاز. اترك ما لم تجربه دون تقييم. هذه العناصر لا تقيس الكفاءة الطبية."));
      for(const item of CRITERIA.items) {
        const row=selectField(item.label,"criteria_"+item.id,[["","لم أجرب / لا ينطبق"],["1","1 · غير مرضٍ"],["2","2 · ضعيف"],["3","3 · متوسط"],["4","4 · جيد"],["5","5 · ممتاز"]],String(previous?.criteria?.[item.id] || ""));
        row.append(el("small",{class:"muted"},item.hint));measured.append(row);
      }
      form.querySelector('[name="comment"]').closest("label").before(measured);
    }
    if(state.publicReviewDetails)form.append(el('label',{class:'remember-option'},el('input',{type:'checkbox',name:'share_comment',checked:previous?.share_comment===true}),'أوافق على عرض ملاحظتي للأعضاء دون اسمي بعد مراجعتها'),el('p',{class:'muted'},'اختياري. لا تكتب أسماء أو أرقامًا أو تشخيصًا أو تفاصيل صحية. إذا لم تختر المشاركة تبقى الملاحظة لك وللإدارة فقط.'));
    form.save = async (data) => {
      const measured=Object.fromEntries(CRITERIA.items.filter(i=>data["criteria_"+i.id]).map(i=>[i.id,Number(data["criteria_"+i.id])]));
      const result = await API.review({
        ...(Object.keys(measured).length ? {criteria:measured} : {}),
        target_id: target,
        branch_id: branch,
        rating: Number(data.rating),
        comment: data.comment,
        ...(state.publicReviewDetails ? {share_comment:data.share_comment==="on"} : {}),
        visited_declared: data.visited === "on",
      });
      closeDialog();
      toast(result.message);
      if (location.hash === "#account") route();
    };
    dialog(previous ? "تعديل تقييمي" : "تقييم الزيارة وملاحظاتك", formAction(form, "حفظ التقييم"));
  }
  const profileRequestStatus=s=>({pending:'بانتظار المراجعة',applying:'جارٍ تطبيق تحديث المصدر — يتطلب المتابعة',approved:'موافقة كاملة',partially_approved:'موافقة جزئية',rejected:'لم يُعتمد',cancelled:'ألغي بواسطة العضو'}[s] || 'غير محدد');
  const profileLabel=key=>window.MedicalMemberProfile.fields.find(f=>f.key===key)?.label || key;
  function profileChangesTable(request,editable=false){
    const choices=new Map(),list=el('div',{class:'profile-comparison'});
    for(const [key,change] of Object.entries(request.changes)){
      const checked=request.status==='applying'?request.intent?.fields?.includes(key):true;
      const input=el('input',{type:'checkbox',checked,disabled:request.status==='applying','aria-label':'اعتماد '+profileLabel(key)});choices.set(key,input);
      list.append(el('article',{},el('strong',{},editable?el('label',{},input,profileLabel(key)):profileLabel(key)),el('div',{},el('small',{},'الحالي'),el('p',{},change.before || 'غير مسجل')),el('div',{},el('small',{},'المقترح'),el('p',{},change.value || 'حذف القيمة')),request.approvedFields?el('small',{class:'profile-local-badge'},request.approvedFields.includes(key)?'معتمد':'لم يُعتمد'):null));
    }
    return {list,choices};
  }
  async function loadOwnProfileRequests(box){
    try{const data=await API.profileRequests();if(!box.isConnected || session()?.role!=='member')return;
      for(const request of data.requests){const details=el('details',{class:'profile-request-card'},el('summary',{},el('strong',{},profileRequestStatus(request.status)),el('small',{},new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeZone:'Africa/Cairo'}).format(new Date(request.createdAt))))),comparison=profileChangesTable(request);
        replaceNodes(details,...details.childNodes,comparison.list,request.destination?el('p',{class:'muted'},request.destination==='app'?'الاعتماد يخص بيانات رعايتي فقط.':'الاعتماد يخص سجل النقابة الأصلي.'):null,request.note?el('p',{},'رد الإدارة: '+request.note):null);
        if(request.status==='pending')details.append(button('إلغاء الطلب',async()=>{if(!confirm('إلغاء طلب تعديل البيانات؟'))return;try{await API.cancelProfileRequest(request.id,request.version);go('account');}catch(e){toast(e.message);}},'text-button danger-text'));
        box.append(details);
      }
      if(!data.requests.length)box.append(el('p',{class:'muted'},'لا توجد طلبات تعديل مسجلة.'));
    }catch(e){if(box.isConnected && session())box.append(el('p',{class:'notice'},e.message));}
  }
  async function profileEditDialog(){
    const holder=el('div',{},el('p',{role:'status'},'جارٍ جلب بياناتك الحالية…'));dialog('طلب تعديل بيانات',holder);
    try{const data=await API.profileEdit();if(!holder.isConnected || session()?.role!=='member')return;
      const form=el('form',{class:'form-stack entity-editor profile-request-editor'},el('p',{class:'notice'},'هذا طلب للمراجعة، ولا يغير بياناتك بمجرد الإرسال. يعرض النموذج البيانات الأساسية المسموح بها؛ الرقم القومي الكامل والمستندات والحقول التقنية محمية.'));
      for(const [group,label] of Object.entries(window.MedicalMemberProfile.groups)){const section=el('fieldset',{class:'profile-form-group'},el('legend',{},label));
        for(const f of window.MedicalMemberProfile.fields.filter(f=>f.group===group))section.append(field(f.label,f.key,f.key==='address'?'textarea':'text',data.values[f.key] || '',{maxlength:f.max,dir:['phone','phone2','email','jobId'].includes(f.key)?'ltr':'rtl'}));form.append(section);
      }
      const preview=el('section',{class:'profile-preview',hidden:true});
      form.append(button('معاينة التغييرات',()=>{const values=Object.fromEntries(new FormData(form)),changes=Object.fromEntries(window.MedicalMemberProfile.fields.filter(f=>(values[f.key] || '').trim()!==(data.values[f.key] || '')).map(f=>[f.key,{before:data.values[f.key],value:values[f.key]}]));preview.hidden=false;replaceNodes(preview,el('h3',{},'التغييرات المقترحة'),Object.keys(changes).length?profileChangesTable({changes}).list:el('p',{},'لم تغيّر أي بيانات.'));},'button outline'),preview,el('label',{class:'remember-option'},el('input',{type:'checkbox',name:'confirm_request',required:true}),'راجعت البيانات وأطلب مراجعة التصحيحات المحددة'));
      const requestId=crypto.randomUUID().replaceAll('-','');
      form.save=async values=>{const changes=Object.fromEntries(window.MedicalMemberProfile.fields.map(f=>[f.key,values[f.key] || '']));await API.submitProfileRequest({request_id:requestId,snapshot:data.snapshot,values:changes});closeDialog(true);go('account');toast('أُرسل طلبك إلى الإدارة؛ بيانات المصدر لم تتغير.');};
      replaceNodes(holder,formAction(form,'إرسال طلب التعديل'));form.initialValues=editorValues(form);
    }catch(e){if(holder.isConnected)replaceNodes(holder,el('p',{class:'notice',role:'alert'},e.message));}
  }
  async function adminProfileRequestsDialog(){
    if(!state.profileManagement){dialog('طلبات تعديل بيانات الأعضاء',el('p',{class:'notice'},'يلزم نشر تحديث الخدمة المركزية لتفعيل طلبات تعديل بيانات الأعضاء.'));return;}
    const box=el('section',{class:'profile-review-queue'},el('p',{},'جارٍ تحميل طلبات الأعضاء…'));dialog('طلبات تعديل بيانات الأعضاء',box);
    try{const data=await API.adminProfileRequests();if(!box.isConnected || !isAdmin())return;
      replaceNodes(box,el('p',{class:'muted'},'اختر طلبًا لمراجعة الحقول، ثم حدد وجهة التحديث. لا يُنشر أي قرار كخبر عام.'));
      for(const request of data.requests)box.append(el('article',{class:'profile-request-card'},el('strong',{},request.memberName),el('p',{},'كود الموظف: '+request.employeeCode+' · '+profileRequestStatus(request.status)),button(['pending','applying'].includes(request.status)?'مراجعة الطلب':'عرض القرار',()=>profileDecisionDialog(request,data.sourceWriterConfigured),'button outline')));
      if(!data.requests.length)box.append(empty('لا توجد طلبات تعديل بيانات.'));
    }catch(e){if(box.isConnected)replaceNodes(box,el('p',{class:'notice'},e.message));}
  }
  function profileDecisionDialog(request,sourceWriter){
    const form=el('form',{class:'form-stack'},el('h3',{},request.memberName),el('p',{},'كود الموظف: '+request.employeeCode)),comparison=profileChangesTable(request,['pending','applying'].includes(request.status));form.append(comparison.list);
    if(!['pending','applying'].includes(request.status)){form.append(el('p',{},profileRequestStatus(request.status)),el('p',{},request.destination==='source'?'حُفظ في السجل الأصلي.':'لم يتغير سجل النقابة؛ القرار يخص رعايتي.'),el('p',{},request.note || ''));dialog('قرار طلب تعديل البيانات',form);return;}
    const destination=selectField('وجهة التحديث','destination',[['app','التطبيق فقط — دون تغيير سجل النقابة'],['source','تحديث السجل الأصلي في MyNekaba']],request.intent?.destination || 'app');
    if(!sourceWriter)destination.querySelector('option[value="source"]').disabled=true;
    if(request.status==='applying')destination.querySelector('select').disabled=true;
    replaceNodes(form,...form.childNodes,destination,!sourceWriter?el('p',{class:'notice warning'},'تحديث الأصل يحتاج ربط هوية كتابة منفصلة؛ حساب القراءة الحالي لا يُستخدم للكتابة. خيار التطبيق فقط متاح.'):el('p',{class:'notice'},'تحديث الأصل يطبق الحقول المختارة فقط، ويتوقف إذا وجد قيمة أحدث؛ تغيير كود الدخول أو الموبايل قد يتطلب من العضو الدخول بالبيانات الجديدة.'),field('رد الإدارة للعضو (اختياري)','note','textarea',request.intent?.note || '',{maxlength:500}),el('p',{class:'muted'},'الحقول المحددة تُعتمد، وغير المحددة لا تُعتمد. عدم تحديد أي حقل يعني رفض الطلب بالكامل.'),el('label',{class:'remember-option'},el('input',{type:'checkbox',name:'confirm_decision',required:true}),'راجعت المقارنة ووجهة التحديث وأوافق على القرار'));
    if(request.status==='applying')form.querySelector('[name="note"]').readOnly=true;
    form.save=async data=>{const fields=[...comparison.choices].filter(([,input])=>input.checked).map(([key])=>key);await API.decideProfileRequest(request.id,{version:request.version,fields,destination:request.intent?.destination || data.destination,note:data.note});closeDialog(true);toast('حُفظ القرار وأُرسل إشعار خاص بصاحب الطلب.');await adminProfileRequestsDialog();};
    dialog(request.status==='applying'?'متابعة تحديث السجل الأصلي':'مراجعة واعتماد التصحيحات',formAction(form,request.status==='applying'?'إعادة محاولة التطبيق بأمان':'تأكيد القرار وإرسال الإشعار'));
  }
  async function renderAccount(main) {
    const u = session();
    if (!u) {
      main.append(
        heading("جلسة العضو"),
        button("تسجيل الدخول", memberDialog, "button primary"),
      );
      return;
    }
    main.append(
      heading("مرحبًا، " + u.name, u.role === "admin" ? "بيانات حسابك وصلاحيات إدارة المنظومة." : "بياناتك النقابية وتقييمات زياراتك في مكان واحد."),
      button("تسجيل الخروج", logout, "button outline"),
    );
    if (u.role === "admin") {
      const box=el("section",{class:"member-profile admin-profile","aria-label":"بيانات المدير"},el("h2",{},"حساب مدير المنظومة"),el("p",{},u.name));
      main.append(box,button("فتح لوحة الإدارة",()=>go("admin"),"button primary"));
      try {
        const {profile}=await API.adminProfile();
        const date=v=>v?new Intl.DateTimeFormat("ar-EG",{timeZone:"Africa/Cairo",dateStyle:"medium",timeStyle:"short"}).format(new Date(v)):"غير مسجل";
        box.replaceChildren(el("h2",{},"حساب مدير المنظومة"),el("dl",{class:"profile-grid"},[["الاسم",profile.name],["البريد",profile.email || "غير مسجل في الحساب"],["الصلاحية","مدير المنظومة"],["حالة الحساب",profile.accountStatus === "active" ? "نشط" : profile.accountStatus],["دخول الجلسة الحالية",date(profile.lastLoginAt)],["انتهاء الجلسة",date(profile.expiresAt)]].map(([label,value])=>el("div",{},el("dt",{},label),el("dd",{},value)))));
      } catch(error) {box.append(el("p",{class:"notice warning"},state.adminWorkspace ? error.message : "عرض بيانات المدير الكاملة يحتاج تحديث خدمة Firebase."));}
      return;
    }
    if (companionPreview) main.append(el("div", {class:"companion-account-actions"},
      button("العودة للرئيسية", () => go("home"), "button primary"),
      button("جهاتي المفضلة", () => go("favorites"), "button outline")));
    const profileBox = el("section", { class: "member-profile", "aria-label": "بيانات العضو" },
      el("h2", {}, "بطاقتي النقابية"), el("p", { class: "muted" }, "جارٍ تحميل بياناتك…"));
    main.append(profileBox);
    const showProfile = async () => {
      try {
        const result = await API.profile();
        const profile = cleanDisplay(result.profile);
        const date = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat("ar-EG", {
          timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short",
        }).format(new Date(value)) : "لم يُسجّل بعد";
        if(!profileBox.isConnected || session()?.role!=='member')return;
        const extended=profile.profileRequests===true && profile.fields;
        profileBox.classList.add('member-profile-v2');
        const hero=el('div',{class:'profile-hero'},el('div',{class:'profile-monogram','aria-hidden':'true'},'◎'),el('div',{},el('span',{class:'eyebrow'},'ملفي الشخصي · رعايتي'),el('h2',{},profile.name || 'بيانات العضو'),el('p',{},'كود الموظف: '+(profile.employeeCode || 'غير مسجل'))),el('span',{class:'profile-readonly'},'للعرض فقط'));
        const chips=el('div',{class:'profile-status-chips'},el('span',{},'العضوية: '+(profile.memberState || 'غير مسجلة')),el('span',{},profile.membershipType || 'نوع العضوية غير مسجل'),el('span',{},'موقف العمل المسجل: '+(profile.workState || 'غير مسجل')));
        const sections=el('div',{class:'profile-sections-grid'});
        if(extended){
          for(const [group,label] of Object.entries(window.MedicalMemberProfile.groups))sections.append(el('section',{class:'profile-data-section'},el('h3',{},label),el('dl',{class:'profile-grid'},window.MedicalMemberProfile.fields.filter(f=>f.group===group && (['name','jobId','membershipId','membershipStatus','memberState','phone','email','workplace','jobTitle'].includes(f.key) || profile.fields[f.key])).map(f=>el('div',{},el('dt',{},f.label),el('dd',{},profile.fields[f.key] || (f.key==='email'?'لا يوجد بريد':'غير مسجل')),profile.overriddenFields?.includes(f.key)?el('small',{class:'profile-local-badge'},'معتمد في رعايتي فقط'):null)))));
        }else sections.append(el('dl',{class:'profile-grid'},[['الاسم',profile.name],['كود الموظف',profile.employeeCode],['رقم العضوية النقابية',profile.membershipCode],['الوظيفة',profile.jobTitle],['مكان العمل',profile.workplace]].map(([label,value])=>el('div',{},el('dt',{},label),el('dd',{},value || 'غير مسجل')))));
        replaceNodes(profileBox,hero,chips,sections,el('section',{class:'profile-activity'},el('h3',{},'نشاط الدخول'),el('dl',{class:'profile-grid'},[['آخر دخول إلى الدليل الطبي',date(profile.lastLoginAt)],['الدخول السابق إلى الدليل الطبي',date(profile.previousLoginAt)]].map(([label,value])=>el('div',{},el('dt',{},label),el('dd',{},value))))),el('div',{class:'profile-actions'},extended?button('طلب تعديل بيانات',profileEditDialog,'button primary'):null,button('تحديث بيانات الصفحة',showProfile,'button outline')),el('p',{class:'muted'},'بيانات المصدر للعرض فقط. اعتماد تعديل في رعايتي لا يغير بيانات دخولك لدى النقابة إلا عند تحديث السجل الأصلي.'),profile.conflictingOverrides?.length?el('p',{class:'notice'},'تغيرت بعض بيانات المصدر بعد تعديل سابق؛ تُعرض القيمة الأحدث من النقابة لحمايتها.'):null);
        if(extended){const requests=el('section',{class:'profile-requests-section'},el('h3',{},'طلبات تعديل بياناتي'));profileBox.append(requests);void loadOwnProfileRequests(requests);}

      } catch (error) {
        profileBox.replaceChildren(el("div",{class:"member-card-heading"},el("img",{src:"img/nekaba-mark-512.webp",alt:"",onError:e=>e.target.hidden=true}),el("div",{},el("small",{},"تطبيق رعايتي · WE"),el("h2", {}, "بطاقتي النقابية")),el("span",{class:"member-lock"},"بيانات شخصية")),
          el("p", {class:"notice warning"}, error.code === "NOT_FOUND"
            ? "تعذر عرض بياناتك حاليًا. يمكنك المتابعة والمحاولة لاحقًا."
            : error.message));
      }
    };
    void showProfile();
    const content = el(
      "div",
      {},
      el("p", { class: "muted" }, "جارٍ تحميل تقييماتك…"),
    );
    main.append(content);
    try {
      const result = await API.myReviews();
      content.replaceChildren(
        el("h2", {}, "تقييماتي وملاحظاتي"),
        ...(result.reviews.length
          ? result.reviews.map((r) => {
              const item = reviewItem(r);
              item.append(button("تعديل تقييمي", () => reviewDialog(r.target_id, r.target_name, r.branch_id, r), "button outline"));
              return item;
            })
          : [empty("لم تسجل تقييمات بعد. اختر الجهة التي زرتها من الدليل.")]),
      );
    } catch (e) {
      content.replaceChildren(empty(e.message));
    }
  }
  const statusText = (s) =>
    ({ pending: "بانتظار الاعتماد", published: "معتمد ومنشور", hidden: "مخفي من التقييم العام" })[
      s
    ] || s;
  function reviewItem(r) {
    const score = r.rating != null && Number.isFinite(Number(r.rating)) && Number(r.rating) >= 1 && Number(r.rating) <= 5 ? `${Number(r.rating)}/5` : "دون تقييم رقمي";
    return el(
      "article",
      { class: "review" },
      el("strong", {}, r.target_name),
      el(
        "div",
        { class: "muted" },
        `${isAdmin() ? display(r.author_name) || "عضو النقابة" : "تقييمك"} · ${score} · ${display(statusText(r.status)) || "قيد المراجعة"}`,
      ),
      r.criteria ? el("dl",{class:"review-breakdown"},CRITERIA.items.filter(i=>r.criteria[i.id]).map(i=>el("div",{},el("dt",{},i.label),el("dd",{},r.criteria[i.id]+" / 5")))) : null,
      el("p", {}, r.comment),
      el("small",{class:"muted"},r.share_comment===true ? "اختار صاحب التقييم مشاركة الملاحظة دون اسم بعد الاعتماد." : "الملاحظة خاصة بصاحبها والإدارة."),
    );
  }
  async function logout() {
    try {
      await API.logout();
    } catch (e) {
      toast(e.message);
    } finally {
      viewHistory.clear();activeViewKey=null;
      state.catalog = Object.fromEntries(kinds.map((k) => [k, []]));
      state.stats = {};
      state.remote = false;
      updateHeader();
      go("home");
      renderMain();
      toast("تم تسجيل الخروج.");
    }
  }
  const idleBanner=el("aside",{class:"notice admin-idle-banner",role:"status",hidden:true});
  $("#connection-status").after(idleBanner);
  const idleModalBanner=el("aside",{class:"notice admin-idle-banner",role:"status",hidden:true});
  $("#app-dialog .dialog-header").after(idleModalBanner);
  window.addEventListener("medical-admin-idle",event=>{
    const data=event.detail || {};
    if(data.expired){idleBanner.hidden=true;idleModalBanner.hidden=true;toast("انتهت جلسة الإدارة بعد 10 دقائق من الخمول. سجّل الدخول للمتابعة.");return;}
    idleBanner.hidden=true;idleModalBanner.hidden=true;
    const banner=$("#app-dialog").open?idleModalBanner:idleBanner;
    banner.hidden=!isAdmin() || (!data.seconds && !data.networkError);
    if(!banner.hidden)replaceNodes(banner,el("span",{},data.networkError?"تعذر تمديد جلسة الإدارة. تحقق من الاتصال بالإنترنت.":"ستنتهي جلسة الإدارة خلال دقيقة إذا استمر الخمول."),button("متابعة العمل",()=>API.continueAdminSession(),"button outline"));
  });
  function contentScheduleEditor(form,r,republish){
    const C=window.MedicalContent;
    if(!state.contentLifecycle){form.append(el('p',{class:'notice warning'},'التعديل والحذف متاحان. جدولة العرض والأرشفة وإعادة النشر تنتظر تفعيل تحديث Firebase.'));return;}
    const from=field('بداية العرض — بتوقيت القاهرة','display_from','datetime-local',C.cairoInput(republish?Date.now():r.display_from)),
      until=field('نهاية العرض — بتوقيت القاهرة','display_until','datetime-local',C.cairoInput(republish?Date.now()+7*86400000:r.display_until)),
      duration=selectField('مدة ظهور المحتوى','display_duration',[['custom','موعد مخصص'],['','بدون نهاية محددة'],['1','يوم واحد'],['3','3 أيام'],['7','أسبوع'],['30','30 يومًا']],republish?'7':r.display_until?'custom':'');
    const start=from.querySelector('input'),end=until.querySelector('input');
    const apply=()=>{const value=duration.querySelector('select').value;if(value==='custom')return;if(!value){end.value='';return;}try{end.value=C.cairoInput(Date.parse(C.cairoISO(start.value) || new Date().toISOString())+Number(value)*86400000);}catch(e){toast(e.message);}};
    duration.querySelector('select').addEventListener('change',apply);start.addEventListener('change',apply);end.addEventListener('input',()=>duration.querySelector('select').value='custom');
    const resend=el('input',{type:'checkbox',name:'republish',checked:republish});
    form.append(el('fieldset',{class:'content-schedule'},el('legend',{},'النشر ومدة الظهور'),el('p',{class:'muted'},'اترك البداية فارغة للعرض فور النشر. نهاية العرض توقف الظهور تلقائيًا؛ لا تحذف المحتوى. تواريخ السريان أعلاه تخص صلاحية التعليمات نفسها.'),from,duration,until));
    if(r.id)form.append(el('label',{class:'remember-option'},resend,'إعادة نشر صريحة: إظهار الخبر أو النشرة كجديد في الإشعارات'),el('p',{class:'muted'},'الحفظ العادي لا يعيد تنبيه الأعضاء. إعادة النشر تتطلب حالة منشور ومدة عرض سارية.'));
    if(republish)form.querySelector('[name="publication_status"]').value='published';
    const preview=el('section',{class:'content-preview',hidden:true});
    form.append(button('معاينة المحتوى قبل الحفظ',()=>{const data=Object.fromEntries(new FormData(form));preview.hidden=false;replaceNodes(preview,el('span',{class:'eyebrow'},'معاينة فقط — لم تُحفظ'),el('h3',{},data.name),el('p',{},data.summary),el('ol',{},data.steps.split('\n').filter(Boolean).map(step=>el('li',{},step))),el('small',{},C.types[data.document_type]+' · '+(data.publication_status==='published'?'سيخضع لمواعيد العرض والسريان':'للإدارة فقط')));},'button outline'),preview);
  }
  function contentStateDialog(r,status){
    const label=status==='archived'?'أرشفة المحتوى':'إيقاف النشر وحفظ مسودة';
    const form=el('form',{class:'form-stack'},el('p',{},label+': '+r.title),el('p',{class:'muted'},'سيختفي عن الأعضاء عند تحديث بيانات التطبيق، ويبقى قابلًا للتعديل وإعادة النشر من الإدارة.'));
    form.save=async()=>{if(!state.contentLifecycle && status==='archived')throw new Error('الأرشفة تحتاج تفعيل تحديث Firebase.');await API.save('medical_guidelines',{...r,publication_status:status},r._version || 0);closeDialog(true);await refresh();toast('حُدّثت حالة المحتوى.');};
    dialog(label,formAction(form,'تأكيد الإجراء'));
  }
  function renderContentAdmin(main){
    const C=window.MedicalContent,all=state.catalog.medical_guidelines;
    main.append(button('العودة إلى إدارة الدليل',()=>{state.adminKind='all';state.query='';$('#search-input').value='';renderMain();},'text-button'));
    main.append(el('section',{class:'content-studio-intro'},el('span',{class:'eyebrow'},'مركز النشر'),el('h2',{},'التعليمات والأخبار والنشرات'),el('p',{},'تحكم في المحتوى من المسودة حتى نهاية العرض. تعديل النص لا يعيد نشره كخبر جديد.'),el('div',{class:'actions-row'},Object.entries(C.types).map(([type,label])=>button('+ إضافة '+label,()=>editDialog('medical_guidelines',null,type),'button '+(type==='news'?'primary':'outline'))))));
    if(!state.contentLifecycle)main.append(el('p',{class:'notice warning'},'يلزم نشر تحديث Firebase لتفعيل النشرات وجدولة مدة العرض والأرشفة وإعادة النشر. التعليمات والأخبار الحالية قابلة للتعديل والحذف.'));
    const type=selectField('نوع المحتوى المعروض','content-type',[['','كل الأنواع'],...Object.entries(C.types)],state.contentType || ''),status=selectField('مرحلة النشر','content-status',[['','كل المراحل'],...Object.entries(C.labels)],state.contentStatus || '');
    type.querySelector('select').addEventListener('change',e=>{state.contentType=e.target.value;renderMain();});status.querySelector('select').addEventListener('change',e=>{state.contentStatus=e.target.value;renderMain();});
    main.append(el('div',{class:'content-filters'},type,status,button('مسح تصفية المحتوى',()=>{state.contentType='';state.contentStatus='';state.query='';$('#search-input').value='';renderMain();},'button outline')));
    const counts=Object.keys(C.labels).map(key=>[key,all.filter(r=>C.status(r)===key).length]).filter(([,count])=>count);
    main.append(el('div',{class:'content-counts'},counts.map(([key,count])=>button(C.labels[key]+' · '+count,()=>{state.contentStatus=key;renderMain();},'filter-chip'))));
    const rows=all.filter(r=>(!state.contentType || r.document_type===state.contentType) && (!state.contentStatus || C.status(r)===state.contentStatus) && matchesText([r.title,r.summary,r.issuing_authority,r.source_reference,...(r.steps || [])])).sort((a,b)=>C.order(b).localeCompare(C.order(a)));
    main.append(el('p',{class:'muted',role:'status'},rows.length+' مادة — تشمل المواد المنجزة والمخفية والمنتهية؛ لا تُستبعد بعد تعديلها.'));
    const time=value=>value?new Intl.DateTimeFormat('ar-EG',{timeZone:'Africa/Cairo',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'';
    main.append(el('div',{class:'content-admin-grid'},rows.map(r=>el('article',{class:'card content-admin-card','data-content-id':r.id},el('div',{class:'content-card-heading'},el('span',{class:'card-eyebrow'},C.types[r.document_type] || C.types.instruction),el('span',{class:'content-status status-'+C.status(r)},C.labels[C.status(r)])),el('h3',{},r.title),el('p',{class:'content-excerpt'},r.summary),el('p',{class:'muted'},r.issuing_authority || 'أضف الجهة المصدرة قبل النشر'),el('dl',{class:'content-timing'},el('dt',{},'العرض'),el('dd',{},(r.display_from?time(r.display_from):'من وقت النشر')+' — '+(r.display_until?time(r.display_until):'دون نهاية محددة')),r.published_at?el('dt',{},'آخر نشر'):null,r.published_at?el('dd',{},time(r.published_at)):null),el('div',{class:'content-card-actions'},button('معاينة',()=>dialog('معاينة: '+r.title,contentCard(r)),'text-button'),button('تعديل',()=>editDialog('medical_guidelines',r),'button outline'),button('إعادة نشر',()=>editDialog('medical_guidelines',r,undefined,{republish:true}),'button primary'),button(r.publication_status==='published'?'إيقاف النشر':'تحرير للنشر',()=>r.publication_status==='published'?contentStateDialog(r,'draft'):editDialog('medical_guidelines',r),'text-button'),state.contentLifecycle && r.publication_status!=='archived'?button('أرشفة',()=>contentStateDialog(r,'archived'),'text-button'):null,button('حذف',()=>deleteDialog('medical_guidelines',r),'text-button danger-text'))))));
    if(!rows.length)main.append(empty('لا توجد مواد ضمن التصفية الحالية. أضف محتوى جديدًا أو امسح التصفية.'));
  }
  async function renderAdmin(main) {
    if(!isAdmin()){main.append(heading("إدارة الدليل الطبي"),button("دخول المدير",adminDialog,"button primary"));return;}
    const all=kinds.flatMap(source=>state.catalog[source].map(r=>({kind:facilitySection(source,r),r:{...r,_source_kind:source}})));
    const parentOf=r=>r.contract_type === "hospital" && r.contract_entity_id !== String(r.id) ? state.catalog.hospitals.find(h=>h.id === r.contract_entity_id) : null;
    const parentHidden=r=>{const parent=parentOf(r);return parent && (parent.directory_visibility === "hidden" || parent.contract_listing === false);};
    const hidden=r=>r.directory_visibility === "hidden" || r.contract_listing === false || parentHidden(r) || (!!r.title && !publishedContent(r));
    const filter=(kind,status="")=>{for(const key of ["adminSpecialty","adminCategory","adminMarkaz","adminNetwork","adminContract"])state[key]="";state.adminKind=kind;state.adminState=status;state.limit=24;state.query="";$("#search-input").value="";renderMain();};
    main.append(el("section",{class:"admin-intro"},el("div",{},el("span",{class:"eyebrow"},"مساحة العمل الإدارية"),heading("مركز إدارة تطبيق رعايتي","الجهات والتعاقدات والمحتوى في مساحة عمل واحدة.")),el("div",{class:"actions-row"},button("إضافة سجل",()=>editDialog(state.adminKind === "all" ? "records" : state.adminKind),"button primary"),button("حساب المدير",()=>go("account"),"button outline"))));
    if(!API.adminIdleSupported)main.append(el("p",{class:"notice warning"},"تجديد جلسة المدير أثناء النشاط ينتظر نشر تحديث Firebase. الخدمة الحالية تنهي الجلسة بعد 10 دقائق من الدخول."));
    if(!state.adminWorkspace)main.append(el("p",{class:"notice warning"},"صلاحية اعتماد الجهات والقوائم المشتركة وبطاقة المدير تحتاج نشر تحديث Firebase مرة واحدة بالإعداد المحفوظ."));
    if(!state.adminBatch || !state.structuredBranches || !state.adminBatchData)main.append(el('p',{class:'notice warning'},'الفروع المتعددة والمعالجة الجماعية جاهزتان في الواجهة وتحتاجان نشر تحديث Firebase لتفعيل الحفظ.'));
    if(state.adminKind==='medical_guidelines'){renderContentAdmin(main);return;}
    main.append(el("section",{class:"admin-metrics","aria-label":"ملخص الإدارة"},[
      ["إجمالي السجلات",all.length,()=>{state.adminWorklist="all";filter("all");}],
      ["المخفية والمحجوبة",all.filter(({r})=>hidden(r)).length,()=>filter("all","hidden")],
      ["موقوفة مؤقتًا",all.filter(({r})=>r.service_status === "suspended").length,()=>filter("all","suspended")],
      ["لم تُراجع بعد",all.filter(({r})=>!r.admin_reviewed_at).length,()=>{state.adminWorklist="pending";filter("all");}],
    ].map(([label,count,action])=>el("article",{},button(String(count),action,"admin-metric-count"),el("span",{},label)))));
    main.append(el("div",{class:"admin-section-tabs","aria-label":"أقسام الإدارة"},kinds.map(kind=>button(labels[kind]+" · "+facilityEntries(kind).length,()=>filter(kind),"button "+(state.adminKind===kind?"primary":"outline")))));
    main.append(el("div",{class:"admin-tools"},button("مراجعة التقييمات",adminReviewDialog,"button outline"),button("طلبات تعديل الأعضاء",adminProfileRequestsDialog,"button outline"),button("إضافة تعليمات",()=>editDialog("medical_guidelines"),"button outline"),button("إضافة خبر",()=>editDialog("medical_guidelines",null,"news"),"button outline"),button("إدارة المحتوى",()=>filter("medical_guidelines"),"button outline"),button("جودة بيانات الدليل",qualityDialog,"text-button"),button("مراجعة التصنيفات",classificationDialog,"text-button"),button("الفروع والتكرار",facilityDuplicatesDialog,"text-button"),button("مراجعة المواقع والمواعيد",researchDialog,"text-button"),button("تصدير بيانات الدليل",exportCatalog,"text-button")));
    const kindSelect=selectField("نوع السجلات","admin-kind",[["all","كل الأقسام"],...kinds.map(k=>[k,labels[k]])],state.adminKind);
    const statusSelect=selectField("حالة العرض والخدمة","admin-state",[["","كل الحالات"],["visible","ظاهرة"],["hidden","مخفية ومحجوبة"],["suspended","موقوفة مؤقتًا"]],state.adminState);
    const worklist=selectField("قائمة العمل","admin-worklist",[["pending","بانتظار المراجعة"],["all","جميع السجلات بما فيها المحدّثة"]],state.adminWorklist);
    const scope=all.filter(({kind})=>state.adminKind==="all" || kind===state.adminKind);
    const values=key=>[...new Set(scope.map(({r})=>usable(r[key])).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"));
    const filterFields=[[kindSelect,"adminKind"],[statusSelect,"adminState"],[worklist,"adminWorklist"],
      [selectField("التخصص الطبي","admin-specialty",[["","كل التخصصات"],...values("specialty").map(v=>[v,v])],state.adminSpecialty),"adminSpecialty"],
      [selectField("التصنيف الفرعي","admin-category",[["","كل التصنيفات"],...values("category").map(v=>[v,v])],state.adminCategory),"adminCategory"],
      [selectField("المركز أو المدينة","admin-markaz",[["","كل المراكز"],...values("markaz").map(v=>[v,v])],state.adminMarkaz),"adminMarkaz"],
      [selectField("شبكة المستفيدين","admin-network",[["","كل المستفيدين"],["employee","الموظفون"],["family","الأسر والمعاشات"]],state.adminNetwork),"adminNetwork"],
      [selectField("جهة التعاقد","admin-contract",[["","كل جهات التعاقد"],...values("contract_entity").map(v=>[v,v])],state.adminContract),"adminContract"]];
    for(const [field,key] of filterFields)field.querySelector("select").addEventListener("change",e=>{
      state[key]=e.target.value;state.limit=24;
      if(key==="adminKind")for(const k of ["adminSpecialty","adminCategory","adminMarkaz","adminNetwork","adminContract"])state[k]="";
      renderMain();
    });
    main.append(el("section",{class:"admin-filterbar","aria-label":"تصفية سجلات الإدارة"},filterFields.map(([field])=>field)));
    const rows=all.filter(({kind,r})=>(state.adminKind === "all" || kind === state.adminKind) &&
      (state.adminWorklist === "all" || state.adminState === "hidden" || state.adminState === "suspended" || !r.admin_reviewed_at || state.query.trim()) &&
      matchesText([r.name,r.title,r.id,r.hospital,r.address,r.markaz,r.specialty,r.category,r.contract_entity]) &&
      (!state.adminSpecialty || r.specialty===state.adminSpecialty) && (!state.adminCategory || r.category===state.adminCategory) &&
      (!state.adminMarkaz || (r.markaz || r.city)===state.adminMarkaz) && (!state.adminNetwork || r.network_members?.includes(state.adminNetwork)) &&
      (!state.adminContract || r.contract_entity===state.adminContract) &&
      (!state.adminState || (state.adminState === "suspended" ? r.service_status === "suspended" : state.adminState === "hidden" ? hidden(r) : !hidden(r))));
    const clear=()=>{for(const k of ["adminSpecialty","adminCategory","adminMarkaz","adminNetwork","adminContract","adminState","query"])state[k]="";state.adminKind="all";state.adminWorklist="all";state.limit=24;$("#search-input").value="";renderMain();};
    const chips=filterFields.filter(([,key])=>state[key] && !["adminKind","adminWorklist"].includes(key)).map(([field,key])=>button(field.querySelector("select").selectedOptions[0]?.textContent+" ×",()=>{state[key]="";renderMain();},"filter-chip"));
    main.append(el("div",{class:"admin-active-filters"},chips));
    main.append(el("div",{class:"admin-results-heading"},el("div",{},el("strong",{role:"status"},rows.length+" سجلًا"),el("p",{class:"muted"},state.adminWorklist==="pending"?"قائمة المراجعة تستبعد المنجز؛ ابحث عنه بالاسم أو اختر جميع السجلات.":"تعرض القائمة السجلات المحفوظة وفق الفلاتر الحالية.")),button("مسح الفلاتر وعرض الكل",clear,"button outline")));
    const selected=new Map();
    const process=button('معالجة المحدد (0)',()=>batchStateDialog([...selected.values()]),'button primary');process.disabled=true;
    const selectionCount=el('span',{class:'muted'},'التحديد يخص السجلات المعروضة فقط ويُمسح عند تغيير القائمة.');
    const updateSelection=()=>{process.textContent='معالجة المحدد ('+selected.size+')';process.disabled=!selected.size;};
    const selectAll=el('input',{type:'checkbox','aria-label':'تحديد السجلات المعروضة',onChange:e=>{for(const input of main.querySelectorAll('.batch-row-check')){input.checked=e.target.checked;input.dispatchEvent(new Event('change'));}}});
    main.append(el('section',{class:'batch-toolbar'},process,button('مسح التحديد',()=>{selected.clear();for(const input of main.querySelectorAll('.batch-row-check'))input.checked=false;selectAll.checked=false;updateSelection();},'button outline'),selectionCount));
    const body=el("tbody",{},rows.slice(0,state.limit).map(({kind,r})=>el("tr",{"data-admin-id":String(r.id)},
      el('td',{},kind==='medical_guidelines'?null:el('input',{type:'checkbox',class:'batch-row-check','aria-label':'تحديد '+(r.name || r.title)+' · '+r.id,onChange:e=>{const key=kind+':'+r.id;if(e.target.checked)selected.set(key,{kind,r});else {selected.delete(key);selectAll.checked=false;}updateSelection();}})),
      el("td",{},el("strong",{},r.name || r.title),el("small",{class:"muted admin-record-id"},String(r.id))),
      el("td",{},labels[kind],el("small",{class:"muted admin-record-id"},r.markaz || r.city || r.hospital || "")),
      el("td",{},el("span",{class:hidden(r)?"service-status":"status-visible"},r.title && !publishedContent(r) ? (r.publication_status === "published" ? "غير سارية / تحتاج استكمال مرجع" : "مسودة — للإدارة فقط") : parentHidden(r) ? "مخفية تبعًا للمستشفى" : r.contract_listing === false ? "محجوبة — تنتظر اعتمادك" : r.directory_visibility === "hidden" ? "مخفية عن الأعضاء" : "ظاهرة في الدليل"),statusBadge(r)),
      el("td",{},r.contract_entity || (kind === "medical_guidelines" ? r.issuing_authority : "غير مسجلة")),
      el("td",{class:"admin-row-actions"},button("تعديل",()=>editDialog(kind,r),"text-button"),
        kind === "medical_guidelines" ? button("تحرير النشر",()=>editDialog(kind,r),"text-button") : parentHidden(r) ? button("إدارة المستشفى",()=>{state.adminKind="hospitals";state.adminState="";state.query=parentOf(r).name;$("#search-input").value=state.query;renderMain();},"text-button") : button(hidden(r)?"إظهار":"إخفاء",()=>changeEntityState(kind,r,"directory_visibility",hidden(r)?"visible":"hidden"),"text-button"),
        kind === "medical_guidelines" ? null : button(r.service_status === "suspended"?"استئناف الخدمة":"إيقاف مؤقت",()=>changeEntityState(kind,r,"service_status",r.service_status === "suspended"?"active":"suspended"),"text-button"),
        button("حذف",()=>deleteDialog(kind,r),"text-button danger-text")))));
    for(const row of body.rows)for(const [i,cell] of [...row.cells].entries())cell.dataset.label=["تحديد","الجهة / المعرّف","القسم / الموقع","حالة النشر","جهة التعاقد / المصدر","الإجراءات"][i];
    main.append(el("div",{class:"table-wrap admin-records"},el("table",{},el("thead",{},el("tr",{},el('th',{},selectAll),["الجهة / المعرّف","القسم / الموقع","حالة النشر","جهة التعاقد / المصدر","الإجراءات"].map(t=>el("th",{},t)))),body)));
    if(!rows.length)main.append(empty("لا توجد سجلات ضمن الاختيار. اختر جميع السجلات أو غيّر البحث."));
    if(rows.length>state.limit)main.append(button("عرض المزيد",()=>{state.limit+=24;renderMain();},"button outline load-more"));
  }
  function classificationDialog(){
    const rows=kinds.flatMap(source=>state.catalog[source].map(r=>({kind:facilitySection(source,r),r:{...r,_source_kind:source}}))).filter(({kind,r})=>kind!=="hospitals" && kind!=="emergency_services" && /^مستشف[ىي]/.test(normalize(r.name)));
    const box=el("div",{class:"form-stack"},el("p",{class:"notice"},"هذه اقتراحات للمراجعة وليست أخطاء مؤكدة؛ قد يكون السجل قسمًا طبيًا صحيحًا. لا تنشئ نسخة ثانية أو تحذف الأصل لتغيير القسم."));
    for(const {kind,r} of rows)box.append(el("article",{class:"card"},el("strong",{},r.name),el("p",{},labels[kind]+" · "+(r.markaz || r.city || "")),button("فتح السجل الأصلي",()=>editDialog(kind,r),"button outline")));
    box.append(button("البحث في جميع الأقسام",()=>{closeDialog();state.adminKind="all";state.adminWorklist="all";renderMain();$("#search-input").focus();},"button primary"));
    if(!rows.length)box.append(empty("لا توجد أسماء مستشفيات خارج قسمها ضمن فحص الأسماء الحالي. يمكنك البحث في جميع الأقسام بما فيها المخفي."));
    dialog("مراجعة تصنيفات الجهات",box);
  }
  function batchStateDialog(rows){
    rows=rows.map(({kind,r})=>({kind:r._source_kind || kind,r}));
    if(!rows.length)return;
    if(rows.length>50){toast('حدد 50 سجلًا بحد أقصى لكل عملية.');return;}
    const editable=rows.every(({kind})=>['records','hospitals','labs','radiology','pharmacies','specialized_centers'].includes(kind));
    const form=el('form',{class:'form-stack'},el('p',{},'ستُطبق العملية على '+rows.length+' سجلًا محددًا.'),el('ul',{class:'batch-preview'},rows.map(({kind,r})=>el('li',{},r.name+' · '+labels[kind]+' · '+(r.markaz || r.city || '')+' · '+r.id))),selectField('العملية الجماعية','operation',[['hide','إخفاء عن الأعضاء'],['show','إظهار للأعضاء'],['pause','إيقاف مؤقت'],['resume','استئناف الخدمة'],...(editable?[['edit','تعديل البيانات المشتركة']]:[])],'hide'),el('p',{class:'muted'},'العملية تشمل السجلات المحددة فقط. حالة المستشفى تنعكس على خدماتها التابعة. لن تُنشر أخبار تلقائيًا.'));
    const approval=el('label',{},el('input',{type:'checkbox',name:'approve_contract'}),' راجعت وأعتمد تعاقد السجلات المحجوبة عند اختيار الإظهار');form.append(approval);
    const editor=el('fieldset',{class:'batch-data-editor',disabled:true,hidden:true},el('legend',{},'الحقول المشتركة'),el('p',{class:'muted'},'اختر الحقول المطلوبة فقط. فئات المستفيدين المختارة تستبدل الفئات الحالية للسجلات المحددة، مع حفظ مصادر التعاقد التاريخية. تغيير المركز يحفظ العنوان ويمسح رابط الخريطة السابق للمراجعة. لتغيير تخصص طبيب متعدد المقار، حدّد جميع مقاره.'));
    const centers=[...new Set([...dakahliaCenters,...(state.options.markaz || []),...rows.map(({r})=>r.markaz || r.city)].filter(Boolean))];
    editor.append(selectField('المركز الجديد','batch_markaz',[['','دون تغيير'],...centers.map(v=>[v,v])],''));
    if(rows.every(({kind})=>kind==='records'))editor.append(selectField('التخصص الجديد','batch_specialty',[['','دون تغيير'],...[...new Set([...state.catalog.records.map(r=>r.specialty),...(state.options.specialty || [])].filter(Boolean))].map(v=>[v,v])],''));
    if(new Set(rows.map(({kind})=>kind)).size===1 && rows[0].kind!=='records'){
      const kind=rows[0].kind,values=[...new Set([labels[kind],...(kind==='hospitals'?['مستشفى استثماري','مستشفى حكومي','مستشفى جامعي']:[]),...state.catalog[kind].map(r=>r.category),...(state.options['category_'+kind] || [])].filter(Boolean))];
      editor.append(selectField('التصنيف الجديد','batch_category',[['','دون تغيير'],...values.map(v=>[v,v])],''));
    }
    editor.append(selectField('المستفيدون الجدد','batch_network',[['','دون تغيير'],['employee','الموظفون'],['family','الأسر والمعاشات'],['all','الموظفون والأسر والمعاشات']],''));
    const preview=el('div',{class:'batch-data-preview'}),confirm=el('input',{type:'checkbox',name:'confirm_data',required:true});let stamp='';
    const patch=()=>{const data=Object.fromEntries(new FormData(form)),result={};for(const [key,input] of [['markaz','batch_markaz'],['specialty','batch_specialty'],['category','batch_category']])if(data[input])result[key]=data[input];if(data.batch_network)result.network_members=data.batch_network==='all'?['employee','family','retiree']:data.batch_network==='family'?['family','retiree']:['employee'];return result;};
    const readable=(key,value)=>key==='network_members'?(value || []).map(v=>({employee:'الموظفون',family:'الأسر',retiree:'المعاشات'}[v] || v)).join(' · '):String(value || 'غير مسجل');
    editor.append(button('معاينة التغييرات',()=>{
      const proposed=patch();if(!Object.keys(proposed).length){toast('اختر حقلًا واحدًا على الأقل.');return;}
      stamp=JSON.stringify(proposed);confirm.checked=false;
      const cards=rows.map(({r})=>{
        const card=el('article',{class:'batch-change-row'},el('strong',{},r.name+' · '+r.id));
        for(const [key,value] of Object.entries(proposed))card.append(el('p',{},({markaz:'المركز',category:'التصنيف',specialty:'التخصص',network_members:'المستفيدون'}[key])+': الحالية '+readable(key,r[key])+'؛ الجديدة '+readable(key,value)));
        return card;
      });replaceNodes(preview,cards);
    },'button outline'),preview,el('label',{},confirm,' راجعت القيم الحالية والجديدة وأوافق على تطبيقها على المحدد'));
    for(const input of editor.querySelectorAll('select'))input.addEventListener('change',()=>{stamp='';confirm.checked=false;preview.replaceChildren();});
    form.append(editor);
    form.querySelector('[name="operation"]').addEventListener('change',e=>{const editing=e.target.value==='edit';editor.hidden=!editing;editor.disabled=!editing;approval.hidden=editing;stamp='';confirm.checked=false;preview.replaceChildren();});
    form.save=async data=>{
      const items=rows.map(({kind,r})=>({kind,id:String(r.id),version:r._version || 0}));
      if(data.operation==='edit'){
        if(!state.adminBatchData)throw new Error('تعديل البيانات الجماعي يحتاج تحديث Firebase. لم تتغير السجلات.');
        const proposed=patch();if(!stamp || stamp!==JSON.stringify(proposed) || data.confirm_data!=='on')throw new Error('عاين التغييرات وراجع القيم قبل تطبيقها.');
        await API.batchData({items,patch:proposed});
      }else{
        if(!state.adminBatch)throw new Error('المعالجة الجماعية تحتاج تحديث Firebase. لم تتغير السجلات.');
        const [field,value]={hide:['directory_visibility','hidden'],show:['directory_visibility','visible'],pause:['service_status','suspended'],resume:['service_status','active']}[data.operation];
        await API.batchState({field,value,items,approve_contract:data.approve_contract==='on'});
      }
      toast('تمت معالجة '+rows.length+' سجلًا.');
      try{await refresh();}catch{toast('حُفظت العملية. حدّث الصفحة لعرض النتائج.');}
      closeDialog();
    };
    dialog('معالجة السجلات المحددة',formAction(form,'تطبيق على المحدد'));
  }
  function facilityDuplicatesDialog() {
    const box=el("div",{class:"facility-audit"},el("p",{class:"muted"},"التجميع للعرض يحافظ على سجلات المصدر. تشابه الاسم أو الخط الساخن لا يثبت تطابق الفرع. تعديل عنوان سجل مرتبط يستدعي مراجعة الربط."));
    for(const kind of ['labs','pharmacies']) {
      const groups=FACILITIES.branches(kind,state.catalog[kind]).filter(b=>b.entries.length>1);
      box.append(el("h3",{},labels[kind]+" · "+groups.length+" فروع مجمعة"));
      for(const b of groups)box.append(el("details",{class:"card"},el("summary",{},b.entries[0].name+" · "+(b.entries[0].markaz || "")),...b.entries.map(r=>el("div",{class:"audit-source"},el("strong",{},r.id),el("p",{},r.address),coverage(r),contactGroups(r),button("تحرير سجل المصدر",()=>editDialog(kind,r),"text-button")))));
      const seen=new Set();
      for(const r of state.catalog[kind])for(const {row,reason} of FACILITIES.candidates(kind,r,state.catalog[kind])) {
        const key=[r.id,row.id].sort().join('|');if(seen.has(key) || FACILITIES.branchKey(kind,r)===FACILITIES.branchKey(kind,row))continue;seen.add(key);
        box.append(el("details",{class:"card duplicate-candidate"},el("summary",{},"للمراجعة: "+r.name+" / "+row.name),el("p",{class:"notice"},reason==='same_address'?"العنوان متطابق؛ راجع هوية الجهة قبل توحيد بياناتها.":"توجد معالم مشتركة، ولم تُدمج السجلات تلقائيًا."),...[r,row].map(e=>el("div",{class:"audit-source"},el("strong",{},e.id),el("p",{},e.address),coverage(e),button("فتح السجل",()=>editDialog(kind,e),"text-button")))));
      }
    }
    dialog("مراجعة الفروع والتكرار",box);
  }
  function researchDialog() {
    if(!isAdmin()) return;
    const content=el("div",{class:"research-review"},el("p",{class:"muted"},"مراجعة مصادر منشورة بتاريخ 18 أكتوبر 2026. ساعات فتح المنشأة لا تثبت مواعيد جميع التخصصات أو استقبال كل فئات المرضى. لم تجر مكالمات هاتفية."));
    for(const r of state.catalog.hospitals) {
      const facts=RESEARCH.hospital(r);
      content.append(el("article",{class:"quality-item"},el("h3",{},r.name),
        el("p",{},"مطابقة الموقع: "+({matched:"اسم الجهة متوافق مع رابط الخريطة",conflict:"تعارض يستلزم تصحيحًا",unresolved:"المطابقة التفصيلية غير محسومة"}[facts?.mapStatus] || "لم يراجع")),
        el("p",{},facts?.hours || "لم تثبت مواعيد استقبال حديثة"),
        facts?.note ? el("p",{class:"data-note"},facts.note) : null,
        facts?.address ? el("p",{},"عنوان العرض المصحح: "+facts.address) : null,
        facts?.hoursSource ? link("مصدر ساعات العمل",facts.hoursSource,"fact-source") : null,
        facts?.addressSource ? link("مصدر العنوان",facts.addressSource,"fact-source") : null,
        facts?.scheduleSource ? link("جدول العيادات والاستقبال",facts.scheduleSource,"fact-source") : null,
        button("مراجعة بيانات الجهة",()=>editDialog("hospitals",r),"button outline")));
    }
    content.append(el("h3",{},"مواعيد جهات الطوارئ"));
    for(const r of state.catalog.emergency_services.filter(r=>/مستش/.test(r.name))) {
      const facts=RESEARCH.urgent(r);
      content.append(el("article",{class:"quality-item"},el("strong",{},r.name),el("p",{},facts?.hours || "لم تثبت ساعات استقبال قابلة للنشر"),facts?.hoursSource ? link("المصدر",facts.hoursSource,"fact-source") : null));
    }
    dialog("مراجعة المواقع والمواعيد",content);
  }
  async function changeEntityState(kind,r,key,value) {
    kind=r._source_kind || kind;
    const all=kind === "records" ? state.catalog.records.filter(e=>e.provider_id===r.provider_id) : [r];
    const content=el("div",{},el("p",{},key === "directory_visibility"
      ? "الإخفاء يمنع عرض المقر للأعضاء. إخفاء المستشفى يخفي مقار الأطباء التابعة لها أيضًا."
      : "الإيقاف يبقي المقر ظاهرًا بعلامة موقوف مؤقتًا. تتأثر به مقار الأطباء التابعة للمستشفى فقط."));
    const group=el("input",{type:"checkbox",checked:true});
    if (all.length>1) content.append(el("label",{class:"remember-option"},group,` تطبيق على جميع مقار هذا الطبيب (${all.length})`));
    const approval=el("input",{type:"checkbox"});
    if(key === "directory_visibility" && value === "visible" && all.some(e=>e.contract_listing === false))content.append(el("label",{class:"remember-option"},approval,kind === "emergency_services" ? "راجعت بيانات خدمة الطوارئ وأعتمد إظهارها" : "راجعت جهة التعاقد وأعتمد إظهار هذا السجل للأعضاء"));
    const error=el("p",{class:"notice warning",role:"alert",hidden:true});content.append(error);
    dialog(r.name || r.title,content);
    const save=button("تأكيد التغيير",async()=>{
      save.disabled=true;error.hidden=true;
      try {
        const health=await API.health();
        if(!health.capabilities?.includes("directory-state-v1")) throw new Error("هذه الميزة تحتاج نشر تحديث الخدمة المركزية أولًا. لم تتغير حالة الجهة.");
        const selected=all.length>1 && group.checked ? all : [r];
        if(key === "directory_visibility" && value === "visible" && selected.some(e=>e.contract_listing === false)) {
          if(!health.capabilities?.includes("admin-workspace-v1"))throw new Error("اعتماد الجهات يحتاج تحديث Firebase أولًا.");
          if(!approval.checked)throw new Error("أكد مراجعة جهة التعاقد لاعتماد الإظهار.");
        }
        await API.setState(kind,r.id,{field:key,value,scope:selected.length>1 ? "provider" : "entity",versions:Object.fromEntries(selected.map(e=>[String(e.id),e._version || 0])),approve_contract:approval.checked});
        closeDialog();toast("تم حفظ الحالة.");
        try {await refresh();} catch {toast("حُفظت الحالة. حدّث الصفحة لعرض التغيير.");}
      } catch(e) {error.textContent=e.message;error.hidden=false;}
      finally {save.disabled=false;}
    },"button primary");
    content.append(save);
  }
  function addListControl(form,wrapper,key,label,optionKey) {
    const panel=el("div",{class:"inline-option",hidden:true});
    const input=el("input",{type:"text",maxlength:160,"aria-label":"اسم العنصر الجديد: "+label});
    const error=el("p",{class:"form-error",role:"alert"});
    const publish=el("input",{type:"checkbox"});
    const save=button("حفظ العنصر",async()=>{
      save.disabled=true;error.textContent="";
      try {
        if(!state.adminWorkspace)throw new Error("حفظ القوائم يحتاج تحديث خدمة Firebase أولًا.");
        const value=input.value.trim();if(!value)throw new Error("اكتب اسم العنصر الجديد.");
        let stored=value;
        if(key === "hospital") {
          const beneficiary=form.querySelector('[name="beneficiary_group"]')?.value;
          const markaz=form.querySelector('[name="markaz"]')?.value;
          if(!beneficiary || !markaz)throw new Error("اختر المستفيدين والمركز في النموذج أولًا لتحديد بيانات المستشفى الجديدة.");
          if(state.catalog.hospitals.some(h=>(h.markaz || h.city)===markaz && [h.name,h.short_name].some(n=>normalize(n)===normalize(value))))throw new Error("هذه المستشفى موجودة بالفعل في المركز نفسه؛ اختر السجل الموجود من القائمة.");
          const parentId="entry_"+crypto.randomUUID().replaceAll("-","");
          const entity={id:parentId,name:value,short_name:value,category:"مستشفى استثماري",markaz,city:markaz,network_members:beneficiary === "all"?["employee","family","retiree"]:beneficiary === "family"?["family","retiree"]:["employee"],contract_type:"independent",contract_entity:value,contract_entity_id:parentId,directory_visibility:"hidden"};
          await API.save("hospitals",entity,0,publish.checked);stored=parentId;
          const result=await API.catalog();state.catalog=cleanDisplay(result.catalog);
          toast(publish.checked?"أضيفت المستشفى واعتمد إظهارها.":"أضيفت المستشفى كمسودة مخفية؛ يمكنك اعتمادها من قائمة المخفية.");
        } else {stored=(await API.addOption(optionKey,value)).value;(state.options[optionKey] ||= []).push(stored);}
        const select=wrapper.querySelector("select");if(![...select.options].some(o=>o.value===stored))select.append(el("option",{value:stored},key === "hospital" ? value : stored));select.value=stored;select.dispatchEvent(new Event("change"));panel.hidden=true;input.value="";
      } catch(e){error.textContent=e.message;}finally{save.disabled=false;}
    },"button primary");
    panel.append(input);
    if(key === "hospital")panel.append(el("label",{class:"remember-option"},publish,"راجعت التعاقد وأعتمد إظهار المستشفى الجديدة"));
    panel.append(save,button("إلغاء",()=>panel.hidden=true,"text-button"),error);
    wrapper.append(button("+",()=>{panel.hidden=!panel.hidden;if(!panel.hidden)input.focus();},"add-option-button"),panel);
    wrapper.querySelector(".add-option-button").setAttribute("aria-label","إضافة عنصر إلى "+label);
  }
  function organizeEditor(form,kind){
    const details=el("details",{class:"editor-advanced"},el("summary",{},"التوثيق والتغطية والصورة — خيارات إضافية"));
    const advanced=["source_url","coverage_scope","verified_at","coverage_verified","verification_date","verified","avatar_type","image_url","image_source_url","image_kind","image_verified"];
    for(const name of advanced){const input=form.querySelector('[name="'+name+'"]');if(input){const wrapper=input.closest(".form-field") || input.closest("label");if(wrapper)details.append(wrapper);}}
    form.append(details);
    const contract=form.querySelector('[name="contract_type"]'),hospital=form.querySelector('[name="hospital"]');
    if(contract && hospital){const sync=()=>{hospital.required=contract.value==="hospital";hospital.closest(".form-field").hidden=contract.value!=="hospital" && kind!=="records";};contract.addEventListener("change",sync);sync();}
    for(const select of form.querySelectorAll("select")){
      if(select.options.length<9)continue;
      const options=[...select.options];
      const search=el("input",{type:"search",class:"select-search",placeholder:"ابحث داخل القائمة…","aria-label":"بحث في "+(form.querySelector('label[for="'+select.id+'"]')?.textContent || select.name)});
      search.addEventListener("input",()=>{const selected=select.value;select.replaceChildren(...options.filter(option=>!search.value || option.value===selected || normalize(option.textContent).includes(normalize(search.value))));select.value=selected;});
      select.before(search);
    }
    const preview=el("section",{class:"editor-preview",hidden:true,"aria-label":"معاينة بيانات الجهة"});
    form.append(button("معاينة بيانات الجهة قبل الحفظ",()=>{
      const data=Object.fromEntries(new FormData(form));
      preview.hidden=false;
      replaceNodes(preview,el("span",{class:"eyebrow"},"معاينة — لم تُحفظ بعد"),el("h3",{},data.name || "اسم الجهة"),detail("⌖",data.address),detail("◷",data.schedule || data.working_hours),el("p",{},labels[data.entity_kind || kind]),...[["محمول","mobile"],["أرضي","landline"],["مختصر","shortcode"]].map(([label,key])=>detail(label,data["contact_"+key])),el("p",{class:"muted"},"ظهور الجهة يتبع اعتماد التعاقد وحالة العرض عند الحفظ."));
      preview.scrollIntoView({block:"nearest",behavior:"smooth"});
    },"button outline"),preview);
    for(const type of ["mobile","landline","shortcode"]){const input=form.querySelector('[name="contact_'+type+'"]');if(!input)continue;
      const feedback=el("small",{class:"field-error",id:"error-"+input.name,role:"status"});input.closest(".form-field").after(feedback);input.setAttribute("aria-describedby",feedback.id);
      input.addEventListener("input",()=>{const parsed=CONTACTS.parse(input.value);const invalid=parsed.invalid.length || ["mobile","landline","shortcode"].some(k=>k!==type && parsed[k].length);input.setCustomValidity(invalid?"أدخل رقمًا كاملًا في فئته الصحيحة؛ رقم واحد في كل سطر.":"");feedback.textContent=input.validationMessage;});
    }
  }
  function editDialog(kind, original,documentType,initial={}) {
    if(kind==="medical_guidelines" && !state.contentLifecycle && (documentType==="bulletin" || initial.republish)){toast("هذه الخاصية تحتاج تفعيل تحديث Firebase أولًا.");return;}
    const sourceKind=original?._source_kind || kind;
    if(original)kind=facilitySection(sourceKind,original);
    const canReclassify=!!original && ["hospitals","specialized_centers"].includes(sourceKind);
    const r = original || {...(documentType ? {document_type:documentType} : kind==='hospitals' ? {category:'مستشفى استثماري'} : {}),...initial};
    const id = r.id || "entry_" + crypto.randomUUID().replaceAll("-", "");
    const form = el(
      "form",
      { class: "form-stack entity-editor" },
      field(
        kind === "medical_guidelines" ? "عنوان النشرة" : "الاسم",
        "name",
        "text",
        r.name || r.title || "",
        { required: true, maxlength: 250 },
      ),
    );

    const rootKind=selectField("القسم الرئيسي للجهة","entity_kind",(canReclassify?["hospitals","specialized_centers"]:kinds).map(k=>[k,labels[k]]),kind);
    rootKind.querySelector("select").disabled=!!original && !canReclassify;
    if(!original)rootKind.querySelector("select").addEventListener("change",event=>{
      if(editorDirty() && !window.confirm("سيُحفظ الاسم والمركز والعنوان عند تغيير القسم، وتُعاد بقية الخيارات. هل تريد المتابعة؟")){event.target.value=kind;return;}
      const draft=Object.fromEntries(new FormData(form));
      editDialog(event.target.value,null,undefined,{name:draft.name || "",markaz:draft.markaz || "",address:draft.address || ""});
    });
    form.prepend(el("p",{class:"editor-intro"},kind==="medical_guidelines"?"حرّر المحتوى ومصدره، ثم اختر حالة النشر ومدة العرض. مواعيد العرض بتوقيت القاهرة.":original?"تعديل السجل الأصلي مع الحفاظ على ارتباطاته وتقييماته.":"اختر القسم الرئيسي أولًا: المستشفى قسم مستقل عن الأطباء والمراكز."),rootKind);
    if(kind==="records" && !original){
      const hint=el("section",{class:"notice",hidden:true},el("p",{},"يبدو الاسم اسم مستشفى. هل تريد إدراجها في قسم المستشفيات؟"),button("تسجيلها كمستشفى",()=>{const data=Object.fromEntries(new FormData(form));editDialog("hospitals",null,undefined,{name:data.name,markaz:data.markaz || "",address:data.address || ""});},"button outline"));
      const name=form.querySelector('[name="name"]');name.addEventListener("input",()=>hint.hidden=!/^مستشفي/.test(normalize(name.value)));name.closest("label").after(hint);
    }
    const textFields =
      kind === "records"
        ? [
            ["specialty", "التخصص"],
            ["hospital", "المستشفى"],
            ["markaz", "المركز / المدينة"],
            ["address", "العنوان"],
            ["schedule", "المواعيد"],
            ["notes", "ملاحظات"],
          ]
        : kind === "medical_guidelines"
          ? [
              ["summary", "الموجز"],
              ["steps", "الخطوات (سطر لكل خطوة)"],
            ]
          : kind === "emergency_services"
            ? [
                ["number", "رقم الاتصال"],
                ["markaz", "المركز / المدينة"],
                ["address", "العنوان / نطاق الخدمة"],
                ["description", "وصف الخدمة"],
                ["hours", "ساعات العمل"],
              ]
            : [
                ["markaz", "المركز / المدينة"],
                ["address", "العنوان"],
                ["working_hours", "المواعيد"],
              ];
    if(!["records","medical_guidelines","emergency_services"].includes(kind))textFields.push(["hospital","المستشفى التابعة لها (للتعاقد عبر مستشفى)"]);
    const choices={
      specialty:[...new Set([...state.catalog.records.map(x=>x.specialty),...(state.options.specialty || [])].filter(Boolean))],
      hospital:[...new Set(["عيادة مستقلة",...state.catalog.hospitals.map(x=>x.short_name || x.name),...state.catalog.records.map(x=>x.hospital)].filter(Boolean))],
      markaz:[...new Set([...dakahliaCenters,...(state.options.markaz || []),...kinds.flatMap(k=>state.catalog[k]).map(x=>x.markaz || x.city)].filter(Boolean))],
    };
    for (const [key, label] of textFields) {
      if(choices[key]) {
        const values=[...new Set([...choices[key],r[key]].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"));
        const hospitalChoices=[["عيادة مستقلة","عيادة مستقلة"],...state.catalog.hospitals.filter(h=>facilitySection("hospitals",h)==="hospitals" || String(h.id)===r.contract_entity_id).map(h=>[String(h.id),h.name+" · "+(h.branch_label || h.markaz || h.city || "")+ (h.organization_id ? " · "+(h.address || "") : "")])];
        const currentHospital=state.catalog.hospitals.find(h=>String(h.id)===r.contract_entity_id || [h.name,h.short_name].includes(r.hospital));
        const currentValue=key === "hospital" ? currentHospital ? String(currentHospital.id) : r.hospital || "" : r[key] || "";
        if(key === "hospital" && currentValue && !hospitalChoices.some(([v])=>v===currentValue))hospitalChoices.push([currentValue,currentValue]);
        const wrapper=selectField(label,key,[["","اختر "+label],...(key === "hospital" ? hospitalChoices : values.map(v=>[v,v]))],currentValue);
        wrapper.querySelector("select").required=key === "specialty" || (key === "markaz" && kind !== "emergency_services") || (key === "hospital" && kind === "records");
        form.append(wrapper);
        addListControl(form,wrapper,key,label,key);
      } else form.append(field(label,key,["notes","summary","description","steps"].includes(key) ? "textarea" : "text",Array.isArray(r[key]) ? r[key].join("\n") : r[key] || "",{required:key === "summary",maxlength:3000}));
    }
    if(kind === "medical_guidelines") {
      form.append(
        selectField("نوع المحتوى","document_type",[["instruction","تعليمات الحصول على الخدمة"],["news","خبر أو إعلان للشبكة"],...(state.contentLifecycle ? [["bulletin","نشرة طبية"]] : [])],r.document_type || "instruction"),
        selectField("حالة النشر","publication_status",[["draft","مسودة — للإدارة فقط"],["published","منشور للأعضاء"],...(state.contentLifecycle ? [["archived","مؤرشف — للإدارة فقط"]] : [])],r.publication_status || "draft"),
        selectField("تصنيف المحتوى","category",[["general","تعليمات عامة"],["approvals","الموافقات"],["referrals","التحويلات"],["medications","الأدوية"],["emergency","الطوارئ"],["benefits","المزايا والخدمات"],["network","أخبار وتعاقدات الشبكة"],...r.category && !["general","approvals","referrals","medications","emergency","benefits","network"].includes(r.category) ? [[r.category,r.category]] : []],r.category || "general"),
        field("الجهة المصدرة","issuing_authority","text",r.issuing_authority || "",{maxlength:250}),
        field("مرجع التعليمات أو الإعلان","source_reference","text",r.source_reference || "",{maxlength:500}),
        field("تاريخ مراجعة المحتوى","verified_at","date",r.verified_at || ""),
        field("ساري من (اختياري)","effective_from","date",r.effective_from || ""),
        field("ساري حتى (اختياري)","expires_at","date",r.expires_at || ""),
        el("p",{class:"notice"},"المسودة لا تظهر للأعضاء. النشر يتطلب جهة مصدرة ومرجعًا أو رابط مصدر وتاريخ مراجعة؛ لا تكتب نسب تحمل أو إجراءات غير معتمدة."));
    }
    if(kind==='medical_guidelines')contentScheduleEditor(form,r,initial.republish===true);
    if(!["medical_guidelines","emergency_services"].includes(kind)) {
      const n=r.network_members || [];
      form.append(selectField("المستفيدون","beneficiary_group",[["","اختر المستفيدين"],["employee","الموظفون"],["family","الأسر والمعاشات"],["all","الموظفون والأسر والمعاشات"]],n.includes("employee") && n.some(x=>x !== "employee") ? "all" : n.includes("family") || n.includes("retiree") ? "family" : n.includes("employee") ? "employee" : ""),
        selectField("مسار التعاقد","contract_type",[["","اختر مسار التعاقد"],["direct_we","تعاقد مباشر من الشركة"],["hospital","عبر مستشفى"],["family_network","شبكة الأسر والمعاشات"],["independent","الجهة نفسها / تعاقد مستقل"]],r.contract_type || (kind === "hospitals" ? "independent" : "")));
      for(const key of ["beneficiary_group","contract_type"]) form.querySelector('[name="'+key+'"]').required=true;
      if(kind !== "records") {
        const categories=[...new Set([...(kind==='hospitals'?['مستشفى استثماري','مستشفى حكومي','مستشفى جامعي']:[]),labels[kind],...state.catalog[kind].map(e=>e.category),...(state.options["category_"+kind] || []),...(kind === "specialized_centers" ? ["مركز أسنان","علاج طبيعي","بصريات"] : [])].filter(Boolean))];
        form.append(selectField("تصنيف الجهة","category",categories.map(v=>[v,v]),r.category || labels[kind]));
      }
    }
    if (!["medical_guidelines","emergency_services"].includes(kind)) {
      const contacts = CONTACTS.forEntity(r);
      form.append(el("p",{class:"muted"},"أضف كل فئة هاتف منفصلة؛ رقم واحد في كل سطر. لا نكمل الأرقام الناقصة بالتخمين."));
      for (const [type,label] of [["mobile","المحمول"],["landline","الأرضي"],["shortcode","الأرقام المختصرة"]]) {
        form.append(field(label,"contact_"+type,"textarea",contacts[type].join("\n"),{dir:"ltr",maxlength:500}));
      }
    }
    form.append(
      field("رابط المصدر (https)", "source_url", "url", r.source_url || "", {
        maxlength: 2000,
      }),
    );
    if (!["medical_guidelines", "emergency_services"].includes(kind))
      form.append(
        selectField(
          "التغطية وفق المصدر",
          "coverage_scope",
          [
            ["unknown", "غير مؤكدة"],
            ["employee_only", "العاملون فقط"],
            ["family_globemed", "أسر جلوب ميد فقط"],
            ["both", "العاملون والأسر"],
          ],
          r.coverage_scope || "unknown",
        ),
        field(
          "تاريخ مراجعة التغطية",
          "verified_at",
          "date",
          r.verified_at || "",
        ),
        el(
          "label",
          {},
          el("input", {
            type: "checkbox",
            name: "coverage_verified",
            checked: r.coverage_verified === true,
          }),
          " تأكدت من التغطية من المصدر المذكور",
        ),
      );
    if (kind === "emergency_services")
      form.append(
        field(
          "تاريخ التحقق من الرقم",
          "verification_date",
          "date",
          r.verification_date || "",
        ),
        el(
          "label",
          {},
          el("input", {
            type: "checkbox",
            name: "verified",
            checked: r.verified === true,
          }),
          " تم التحقق من الرقم من المصدر المذكور",
        ),
      );
    if (kind !== "medical_guidelines")
      form.append(
        selectField("الرسم التعبيري","avatar_type",[["","تلقائي حسب نوع الجهة"],["doctor_male","رسم طبيب"],["doctor_female","رسم طبيبة"],["clinic","رسم مركز طبي"],["pharmacy","رسم صيدلية"]],r.avatar_type || ""),
        field("رابط الخريطة (https)", "maps_url", "url", r.maps_url || ""),
        field("رابط صورة الطبيب أو الجهة (https)", "image_url", "url", r.image_url || "", {maxlength:2000}),
        field("مصدر الصورة وحق استخدامها (https)", "image_source_url", "url", r.image_source_url || "", {maxlength:2000}),
        selectField("نوع الصورة","image_kind",[["portrait","صورة الطبيب أو الطبيبة"],["facility","صورة المقر أو المركز"],["logo","شعار الجهة"]],r.image_kind || (kind === "records" ? "portrait" : "facility")),
        el("label", {class:"remember-option"}, el("input",{type:"checkbox",name:"image_verified",checked:r.image_verified === true}), " تأكدت من هوية صاحب الصورة وحق استخدامها"),
      );
    if(kind !== "medical_guidelines") {
      form.append(selectField("حالة العرض","directory_visibility",[["visible","ظاهرة للأعضاء"],["hidden","مسودة / مخفية عن الأعضاء"]],r.directory_visibility || "visible"));
      if(!original || r.contract_listing === false)form.append(el("label",{class:"remember-option admin-publication"},el("input",{type:"checkbox",name:"approve_contract"}),kind === "emergency_services" ? "راجعت بيانات خدمة الطوارئ وأعتمد إظهارها" : "راجعت بيانات الجهة وتعاقدها وأعتمد إظهارها للأعضاء"));
    }
    const categorySelect=form.querySelector('[name="category"]');
    if(categorySelect) {
      for(const value of state.options["category_"+kind] || [])if(![...categorySelect.options].some(o=>o.value===value))categorySelect.append(el("option",{value},value));
      addListControl(form,categorySelect.closest(".form-field"),"category","تصنيف الجهة","category_"+kind);
    }
    if(!original && ['labs','pharmacies'].includes(kind)) {
      const duplicateBox=el("section",{class:"duplicate-warning",hidden:true,"aria-live":"polite"});
      const confirm=el("label",{class:"remember-option"},el("input",{type:"checkbox",name:"distinct_branch"})," راجعت التشابه وأؤكد أن هذا فرع مختلف");
      form.append(duplicateBox);
      const check=()=>{const data=Object.fromEntries(new FormData(form));const rows=FACILITIES.candidates(kind,{...data,id,city:data.markaz},state.catalog[kind]);duplicateBox.hidden=!rows.length;replaceNodes(duplicateBox,el("strong",{},"يوجد فرع مشابه — تجنب إنشاء نسخة جديدة"),...rows.slice(0,5).map(({row})=>el("div",{},el("p",{},row.name+" · "+row.address),button("تعديل الفرع الموجود",()=>editDialog(kind,row),"text-button"))),confirm);};
      for(const key of ['name','address','markaz'])form.querySelector('[name="'+key+'"]').addEventListener('input',check);
    }
    const extraBranches=[];
    if(!original && ['records','hospitals','labs','radiology','pharmacies','specialized_centers'].includes(kind)){
      const list=el('div',{class:'additional-branches'});
      const addBranch=()=>{
        if(extraBranches.length>=9){toast('الحد الأقصى عشرة فروع في العملية الواحدة.');return;}
        const key=crypto.randomUUID().slice(0,8),box=el('fieldset',{class:'branch-editor'});
        const name=field('اسم مختصر للفرع','branch_label_'+key,'text','',{maxlength:120});
        const center=selectField('مركز الفرع','branch_markaz_'+key,choices.markaz.map(v=>[v,v]),form.querySelector('[name="markaz"]').value);
        const address=field('عنوان الفرع','branch_address_'+key,'text','',{required:true,maxlength:1000});
        const hours=field('مواعيد الفرع','branch_hours_'+key,'text','',{maxlength:500});
        const map=field('خريطة الفرع (https)','branch_map_'+key,'url','');
        box.append(el('legend',{},'فرع إضافي'),name,center,address,hours,map);
        for(const [type,label] of [['mobile','محمول الفرع'],['landline','أرضي الفرع'],['shortcode','مختصر الفرع']])box.append(field(label,'branch_'+type+'_'+key,'textarea','',{dir:'ltr',maxlength:300}));
        const entry={box,key};extraBranches.push(entry);
        box.append(button('إزالة هذا الفرع',()=>{extraBranches.splice(extraBranches.indexOf(entry),1);box.remove();},'text-button danger-text'));list.append(box);
      };
      form.append(el('section',{class:'new-branches-panel'},el('h3',{},'عناوين وفروع الجهة'),el('p',{class:'muted'},'العنوان أعلاه هو الفرع الرئيسي. أضف لكل فرع مركزه وأرقامه ومواعيده. بيانات الجهة والمستفيدين والتعاقد مشتركة، ويمكن تحرير كل فرع بعد حفظه.'),list,button('+ إضافة عنوان / فرع',addBranch,'button outline')));
    }
    if(canReclassify){
      const notice=el("section",{class:"notice section-change-preview",hidden:true},el("strong",{},"مراجعة تغيير القسم"));
      const explanation=el("p",{}),confirm=el("input",{type:"checkbox",name:"confirm_section"});
      notice.append(explanation,el("label",{},confirm," راجعت تغيير قسم هذا السجل مع الحفاظ على بياناته وتقييماته"));rootKind.after(notice);
      rootKind.querySelector("select").addEventListener("change",event=>{
        const next=event.target.value,category=form.querySelector('[name="category"]');
        const values=next==="hospitals"?["مستشفى استثماري","مستشفى حكومي","مستشفى جامعي"]:["مركز متخصص","مركز أسنان","علاج طبيعي","بصريات"];
        const choices=next===kind?[...new Set([r.category,...values].filter(Boolean))]:values;
        category.replaceChildren(...choices.map(value=>el("option",{value},value)));category.value=choices[0];
        $("#dialog-title").textContent="تعديل: "+labels[next];
        notice.hidden=next===kind;confirm.checked=false;
        explanation.textContent="من "+labels[kind]+" إلى "+labels[next]+". التغيير يخص هذا السجل فقط؛ بقية الفروع تبقى كما هي. المعرف "+r.id+" والتقييمات وروابط التعاقد لا تتغير.";
      });
    }
    if(kind!=="medical_guidelines")organizeEditor(form,kind);
    form.save = async (data) => {
      const entity = { ...r, ...data, id };
      if(canReclassify){
        const next=data.entity_kind;
        if(!["hospitals","specialized_centers"].includes(next))throw new Error("اختر قسمًا صالحًا لهذه الجهة.");
        if(next!==kind && data.confirm_section!=="on")throw new Error("راجع معاينة تغيير القسم ثم أكدها قبل الحفظ.");
        if(next!==kind && facilityEntries(next).some(row=>String(row.id)===String(id) && (row._source_kind || next)!==sourceKind))throw new Error("يوجد معرف مماثل بالقسم الآخر؛ يلزم مراجعة السجلين قبل تغيير التصنيف.");
        entity.category=sectionCategory(next,sourceKind,data.category);
        if(facilitySection(sourceKind,entity)!==next)throw new Error("التصنيف المختار يخص قسمًا آخر. اختر القسم الرئيسي المناسب وراجع التغيير أولًا.");
      }
      delete entity._source_kind;delete entity.confirm_section;
      if(kind === "medical_guidelines") {
        const health=await API.health();
        if(!health.capabilities?.includes("directory-content-v1")) throw new Error("حفظ التعليمات والأخبار يحتاج نشر تحديث Firebase أولًا. لم يُنشر المحتوى.");
      } else if(kind !== "emergency_services") {
        entity.network_members=data.beneficiary_group === "all" ? ["employee","family","retiree"] : data.beneficiary_group === "family" ? ["family","retiree"] : ["employee"];
        entity.city=data.markaz;
        entity.country_code="EG";entity.governorate="الدقهلية";entity.governorate_code="EG-DK";
        const hospital=state.catalog.hospitals.find(h=>[String(h.id),h.name,h.short_name].includes(data.hospital));
        if(kind === "records" && hospital)entity.hospital=hospital.short_name || hospital.name;
        if(data.contract_type === "hospital") {
          if(!hospital)throw new Error("اختر مستشفى مسجلة لربط التعاقد بها، أو اختر جهة مستقلة.");
          entity.contract_entity="تابع لـ"+hospital.name;entity.contract_entity_id=hospital.id;
        } else if(data.contract_type === "independent") {
          entity.contract_entity=data.name;entity.contract_entity_id=id;
        } else {
          entity.contract_entity=data.contract_type === "family_network" ? "شبكة الأسر والمعاشات" : "تعاقد مباشر من الشركة WE";
          entity.contract_entity_id=data.contract_type === "family_network" ? "family_network" : "direct_we";
        }
      }
      delete entity.beneficiary_group;
      delete entity.entity_kind;
      if (!["medical_guidelines","emergency_services"].includes(kind)) {
        const canonical = [];
        for (const type of ["mobile","landline","shortcode"]) {
          const parsed = CONTACTS.parse(data["contact_" + type] || "");
          if (parsed.invalid.length || ["mobile","landline","shortcode"].some((other) => other !== type && parsed[other].length)) throw new Error("راجع أرقام الاتصال: أدخل كل رقم كاملًا داخل فئته الصحيحة.");
          canonical.push(...parsed[type]);
        }
        if (kind === "records") entity.raw_phone = canonical.join(" - ");
        else { entity.phone = canonical.join(" - "); entity.hotline = CONTACTS.parse(data.contact_shortcode || "").shortcode[0] || ""; }
      }
      if (kind !== "medical_guidelines") entity.image_verified = data.image_verified === "on";
      if (entity.image_url || (entity.avatar_type && entity.avatar_type !== r.avatar_type)) {
        const health = await API.health();
        if (!health.capabilities?.includes("provider-images")) throw new Error("حفظ الصور يحتاج تحديث الخدمة المركزية أولًا؛ لم تُحفظ التغييرات.");
        if (entity.avatar_type && entity.avatar_type !== r.avatar_type && !health.capabilities?.includes("provider-illustrations")) throw new Error("حفظ اختيار الرسم يحتاج تحديث خدمة الإدارة أولًا؛ لم تُحفظ التغييرات.");
      }
      delete entity._version;
      if (kind === "records") {
        entity.display_name = data.name;
        entity.raw_name = data.name;
      }
      if (kind === "hospitals") {
        entity.short_name = r.short_name || data.name;
        const savedContacts = CONTACTS.parse(entity.phone || "");
        entity.phone_digits = savedContacts.landline[0] || savedContacts.mobile[0] || "";
      }
      if (kind === "medical_guidelines") {
        if(state.contentLifecycle){
          entity.display_from=window.MedicalContent.cairoISO(data.display_from);
          entity.display_until=window.MedicalContent.cairoISO(data.display_until);
          entity.directory_visibility='visible';
        }
        if(data.republish==='on' && !state.contentLifecycle)throw new Error('إعادة النشر تحتاج تفعيل تحديث Firebase.');
        entity.title = data.name;
        delete entity.name;
        entity.steps = data.steps
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);
      }
      if (kind === "emergency_services") {
        entity.tel = telephone(data.number);
        entity.verified = data.verified === "on";
      } else entity.coverage_verified = data.coverage_verified === "on";
      entity.coverage_label = {
        unknown: "التغطية تحتاج تأكيدًا من الجهة",
        employee_only: "العاملون فقط",
        family_globemed: "أسر جلوب ميد فقط",
        both: "العاملون والأسر",
      }[entity.coverage_scope];
      if(data.approve_contract === "on" && !state.adminWorkspace)throw new Error("اعتماد الإظهار يحتاج تحديث Firebase أولًا.");
      if(!original && ['labs','pharmacies'].includes(kind)) {
        const candidates=FACILITIES.candidates(kind,entity,state.catalog[kind]);
        if(candidates.length && data.distinct_branch !== 'on')throw new Error("يوجد فرع مشابه. راجع التنبيه واختر تعديل الموجود، أو أكد أنه فرع مختلف قبل الحفظ.");
      }
      const draft=(!original || r.contract_listing === false) && data.approve_contract !== "on" && kind !== "medical_guidelines";
      if(draft)entity.directory_visibility="hidden";
      if(extraBranches.length){
        if(!state.structuredBranches)throw new Error('حفظ الفروع المتعددة يحتاج تحديث Firebase. لم يُحفظ أي فرع.');
        const branches=extraBranches.map(({key})=>{
          const numbers=[];
          for(const type of ['mobile','landline','shortcode']){
            const parsed=CONTACTS.parse(data['branch_'+type+'_'+key] || '');
            if(parsed.invalid.length || ['mobile','landline','shortcode'].some(k=>k!==type && parsed[k].length))throw new Error('راجع فئات أرقام الفرع الإضافي.');
            numbers.push(...parsed[type]);
          }
          return {branch_label:data['branch_label_'+key],markaz:data['branch_markaz_'+key],address:data['branch_address_'+key],working_hours:data['branch_hours_'+key],schedule:data['branch_hours_'+key],maps_url:data['branch_map_'+key],phone:numbers.join(' - '),raw_phone:numbers.join(' - ')};
        });
        const primary={...entity};for(const key of Object.keys(primary))if(/^branch_(label|markaz|address|hours|map|mobile|landline|shortcode)_/.test(key))delete primary[key];
        await API.createBranches({kind,entity:primary,branches,approve_contract:data.approve_contract==='on'});
      }else await API.save(sourceKind, entity, r._version || 0,data.approve_contract === "on",kind==="medical_guidelines" && data.republish==="on");
      const previousScroll=window.scrollY;
      closeDialog(true);
      await refresh();
      requestAnimationFrame(()=>window.scrollTo({top:previousScroll,left:0,behavior:"instant"}));
      toast(kind === "medical_guidelines" ? (data.republish === "on" ? "أُعيد نشر المحتوى كإعلان جديد." : "حُفظ المحتوى وفق حالة النشر ومدة العرض المختارتين.") : draft ? "حُفظت مسودة مخفية. يمكنك اعتماد إظهارها من قائمة المخفية." : "تم حفظ السجل. السجلات المنجزة متاحة بالبحث أو من جميع السجلات.");
    };
    dialog(
      (original ? "تعديل: " : "إضافة: ") + labels[kind],
      formAction(form, "حفظ التغييرات"),
    );
    form.initialValues=editorValues(form);
  }
  function deleteDialog(kind, r) {
    const box = el(
      "div",
      { class: "form-stack" },
      el("p", {}, "حذف " + (r.name || r.title) + " من الدليل؟"),
      el("p", { class: "muted" }, "لا يؤثر ذلك في بيانات أعضاء النقابة."),
    );
    const error = el("p", { class: "form-error", role: "alert" });
    const b = button(
      "تأكيد الحذف",
      async () => {
        b.disabled = true;
        try {
          await API.remove(r._source_kind || kind, r);
          closeDialog();
          await refresh();
          toast("تم حذف السجل.");
        } catch (e) {
          error.textContent = e.message;
        } finally {
          b.disabled = false;
        }
      },
      "button danger",
    );
    box.append(error, b);
    dialog("تأكيد حذف السجل", box);
  }
  async function adminReviewDialog() {
    const box = el("div", {}, el("p", {class:"muted"}, "جارٍ تحميل التقييمات…"));
    dialog("مراجعة تقييمات الزيارات", box);
    let reviews = [], reviewed = false, busy = false, error = "", compatible = false, healthUnavailable = false;
    const draw = () => {
      const waiting = reviews.filter((r) => r.status === "pending");
      const history = reviews.filter((r) => r.status !== "pending");
      const tabs = el("div", {class:"actions-row"},
        button("بانتظار الاعتماد (" + waiting.length + ")", () => { reviewed=false; error=""; draw(); }, "button " + (!reviewed ? "primary" : "outline")),
        button("تمت مراجعتها (" + history.length + ")", () => { reviewed=true; error=""; draw(); }, "button " + (reviewed ? "primary" : "outline")));
      box.replaceChildren(tabs);
      if (!compatible) box.append(el("p", {class:"notice warning",role:"status"},
        healthUnavailable
          ? "تعذر التحقق من جاهزية خدمة المراجعة. أعد الفحص قبل اتخاذ القرار."
          : "يلزم نشر تحديث الخدمة المركزية لتفعيل مراجعة نسخ التقييمات بأمان. يمكنك الاطلاع على القائمة حاليًا."),
        button("إعادة فحص الخدمة", load, "button outline"));
      if (error) box.append(el("p", {class:"notice warning",role:"alert"}, error),
        button("تحديث قائمة التقييمات", load, "button outline"));
      const selected = reviewed ? history : waiting;
      if (!selected.length) box.append(empty(reviewed ? "لا توجد تقييمات تمت مراجعتها." : "لا توجد تقييمات بانتظار الاعتماد."));
      for (const r of selected) {
        const item = reviewItem(r);
        item.append(el("p", {class:"muted"}, "نسخة التقييم: " + (r.revision || 1)));
        if (r.status !== "pending") item.append(el("p", {class:"notice"},
          "تمت مراجعة هذه النسخة. العضو وحده يستطيع تعديل محتواها وإرسال نسخة جديدة للمراجعة."));
        const publicCheck=el('input',{type:'checkbox','aria-label':'راجعت الملاحظة للنشر دون بيانات شخصية'});
        if(r.share_comment===true && r.comment && r.status==='pending')item.append(el('label',{class:'notice public-comment-check'},publicCheck,'اختار العضو المشاركة دون اسم. راجعت النص وتأكدت من خلوه من بيانات شخصية وصحية.'));
        const actions = el("div", {class:"actions-row"});
        const statuses = r.status === "pending" ? ["published", "hidden"] : r.status === "published" ? ["hidden"] : [];
        for (const status of statuses) {
          const action = button(status === "published" ? "اعتماد ونشر" : "إخفاء التقييم", async () => {
            if (busy || !compatible) return;
            busy = true;
            box.querySelectorAll("button[data-review-action]").forEach((b) => b.disabled=true);
            try {
              const result = await API.moderate(r.id, status, r.revision || 1,publicCheck.checked);
              r.status = status;
              closeDialog();
              let message = result.changed === false
                ? "هذه الحالة محفوظة بالفعل؛ لم يُكرر الاعتماد."
                : status === "published" ? "تم اعتماد التقييم ونشره بنجاح." : "تم إخفاء التقييم بنجاح.";
              toast(message);
              try { await refresh(); }
              catch { toast(message + " تعذر تحديث الدليل الآن؛ حدّث الصفحة لاحقًا."); }
            } catch (e) {
              error = e.message;
            } finally {
              busy = false;
              if (box.isConnected && $("#app-dialog").open) draw();
            }
          }, "button " + (status === "published" ? "primary" : "outline"));
          action.dataset.reviewAction = "true";
          action.disabled = busy || !compatible;
          actions.append(action);
        }
        item.append(actions);
        box.append(item);
      }
    };
    const load = async () => {
      try {
        const [result, health] = await Promise.all([API.adminReviews(), API.health().catch(() => ({unavailable:true}))]);
        reviews = result.reviews;
        compatible = health.capabilities?.includes("review-revisions") === true;
        healthUnavailable = health.unavailable === true;
        error = "";
        draw();
      } catch (e) { box.replaceChildren(empty(e.message)); }
    };
    await load();
  }
  function qualityDialog() {
    if (session()?.role !== "admin") return;
    let kind = "", code = "", query = "", limit = 30;
    const box = el("div", { class: "form-stack" });
    dialog("جودة بيانات الدليل", box);
    const draw = () => {
      const report = window.MedicalQuality.audit(state.catalog);
      const rows = report.issues.filter((i) => {
        const r=state.catalog[i.kind]?.[i.rowIndex];
        return (!kind || i.kind === kind) && (!code || i.code === code) && (query.trim() ? normalize([i.name,r?.id,r?.address].join(" ")).includes(normalize(query.trim())) : !r?.admin_reviewed_at);
      });
      const searchField=field("البحث في جميع السجلات بما فيها المحدّثة","quality-search","search",query);
      searchField.querySelector("input").addEventListener("change",e=>{query=e.target.value;limit=30;draw();box.querySelector("#quality-search")?.focus();});
      const kindField = selectField("القسم المراد مراجعته", "quality-kind", [["", "كل الأقسام"], ...Object.keys(report.counts).map((k) => [k, labels[k]])], kind);
      const codeField = selectField("نوع الملاحظة", "quality-code", [["", "كل الملاحظات"], ...Object.keys(report.byCode).map((c) => [c, qualityLabel(c)])], code);
      kindField.querySelector("select").addEventListener("change", (e) => { kind = e.target.value; limit = 30; draw(); });
      codeField.querySelector("select").addEventListener("change", (e) => { code = e.target.value; limit = 30; draw(); });
      replaceNodes(box,
        el("p", {class:"muted"}, `فُحص ${report.total} سجلًا؛ ${report.affected} منها يحتاج مراجعة. هذا فحص اكتمال واتساق، ولا يثبت صحة التعاقد أو عمل الهاتف.`),
        el("p", {}, "لا تُحذف التكرارات تلقائيًا. قد يكون للطبيب أكثر من فرع، وقد تشترك الجهات في رقم استقبال. تُراجع المعلومات التي مضى على تحققها 180 يومًا."),
        kindField, codeField, searchField,
        el("p",{class:"muted"},"تخرج السجلات التي حفظت تعديلها من قائمة المراجعة الافتراضية؛ للعودة إليها ابحث باسمها. تظل الملاحظات غير المستكملة محفوظة في التقرير."),
        button("تنزيل تقرير الجودة", () => downloadJSON(report, "medical-catalog-quality.json"), "button outline"),
        el("p", {role:"status"}, `${rows.length} ملاحظة مطابقة للمرشحات`),
        ...rows.slice(0, limit).map((issue) => {
          const record = state.catalog[issue.kind]?.[issue.rowIndex];
          const editable = record?.id && state.catalog[issue.kind].filter((r) => String(r.id) === String(record.id)).length === 1;
          return el("article", {class:"quality-item"},
            el("h3", {}, issue.name || "سجل بلا اسم"),
            el("small", {class:"muted"}, `${labels[issue.kind]} · ${qualityLabel(issue.code)}`),
            el("p", {}, issue.message),
            editable ? button("مراجعة السجل وتعديله", () => editDialog(issue.kind, record), "button outline") : el("p", {}, "يلزم تصحيح المعرّف قبل التعديل لحماية السجلات الأخرى."));
        }),
        rows.length === 0 ? el("p", {}, "لا توجد ملاحظات ضمن الاختيار الحالي؛ صحة المعلومات تحتاج تأكيدًا من مصدرها.") : null,
        rows.length > limit ? button("عرض المزيد من الملاحظات", () => { limit += 30; draw(); }, "button outline") : null,
      );
    };
    draw();
  }
  function qualityLabel(code) {
    return ({missing_id:"معرّف ناقص", duplicate_id:"معرّف مكرر", missing_name:"اسم ناقص", missing_specialty:"تخصص ناقص", missing_address:"عنوان ناقص", missing_area:"منطقة ناقصة", missing_contact:"رقم اتصال ناقص", invalid_contact:"أرقام تحتاج مراجعة", unconfirmed:"بحاجة لتأكيد", missing_source:"مصدر ناقص", missing_date:"تاريخ تحقق ناقص", invalid_date:"تاريخ غير صالح", stale:"معلومة قديمة", possible_duplicate:"تكرار محتمل"})[code] || code;
  }
  function downloadJSON(value, filename) {
    const blob = new Blob(
      [
        JSON.stringify(value, null, 2),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportCatalog() {
    downloadJSON({ exported_at: new Date().toISOString(), catalog: state.catalog }, "medical-directory.json");
  }
  $("#main-nav").append(
    ...nav.map(([id, symbol, label]) =>
      el(
        "a",
        { href: "#" + id, class: "nav-item" },
        el("span", { "aria-hidden": "true" }, symbol),
        el("span", {}, label),
      ),
    ),
  );
  $("#main-nav").append(el("a",{href:"#account",class:"nav-item desktop-nav-item"},el("span",{},"◎"),el("span",{},"حسابي")),el("a",{href:"#admin",class:"nav-item desktop-nav-item desktop-admin-link",hidden:!isAdmin()},el("span",{},"⚙"),el("span",{},"إدارة المنظومة")));
  $("#main-nav").querySelectorAll("a").forEach(a=>a.addEventListener("click",event=>{event.preventDefault();go(a.getAttribute("href").slice(1));}));
  $("#member-button").addEventListener("click", memberDialog);
  $("#dialog-close").addEventListener("click", closeDialog);
  $("#theme-toggle").addEventListener("click", () => {
    const t =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    prefs.setTheme(t);
  });
  document.documentElement.dataset.theme = prefs.getTheme();
  $("#search-input").addEventListener("input", (event) => {
    startOfPage();
    state.query = event.target.value;
    state.limit = 24;
    if (["home","profile"].includes(state.tab)) {
      go("search",{query:state.query});
    } else renderMain();
  });
  $("#clear-search").addEventListener("click", () => {
    state.query = "";
    $("#search-input").value = "";
    renderMain();
    $("#search-input").focus({preventScroll:true});
    startOfPage();
  });
  window.addEventListener("hashchange", route);
  window.addEventListener("online", () => {
    connection();
    refresh().catch(() => connection());
  });
  window.addEventListener("offline", connection);
  async function resume() {
    state.restoring = true;
    renderMain();
    connection();
    try {
      await API.restore();
    } catch (e) {
      toast(e.message);
    } finally {
      state.restoring = false;
      route();
      connection();
    }
    if (session()) refresh().catch((e) => toast(e.message));
  }
  window.addEventListener("medical-session-invalidated", () => {
    viewHistory.clear();activeViewKey=null;
    state.greetingName="";state.identityEpoch++;
    idleBanner.hidden=true;idleModalBanner.hidden=true;
    state.catalog = Object.fromEntries(kinds.map((k) => [k, []]));
    state.stats = {};
    state.recommendations=[];
    state.privateNotifications=[];
    state.privateNotificationVersion=undefined;
    state.profileManagement=false;
    state.remote = false;
    if ($("#app-dialog").open) closeDialog(true);
    route();
    connection();
  });
  window.addEventListener("online", () => {
    if (!session()) resume();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !session() && !$(".login-card")) route();
  });
  let memberCheckBusy=false;
  setInterval(async()=>{if(memberCheckBusy || document.hidden || session()?.role!=='member')return;memberCheckBusy=true;try{if(state.profileManagement){const result=await API.profileNotifications(state.privateNotificationVersion);if(!result.notModified){state.privateNotifications=result.notifications || [];state.privateNotificationVersion=result.version;updateNotifications();}}else await API.checkSession();}catch{}finally{memberCheckBusy=false;}},60000);
  let contentVisibility='';
  setInterval(() => {
    API.session();
    if(!session())return;
    const signature=state.catalog.medical_guidelines.map(r=>r.id+':'+window.MedicalContent.status(r)).join('|');
    if(signature!==contentVisibility){contentVisibility=signature;updateNotifications();const opened=$('#app-dialog [data-document]');if(!isAdmin() && opened && !state.catalog.medical_guidelines.some(r=>String(r.id)===opened.dataset.document && publishedContent(r)))closeDialog(true);if(!$('#app-dialog').open && ['home','guidelines'].includes(state.tab)){const scroll=window.scrollY;renderMain();requestAnimationFrame(()=>window.scrollTo({top:scroll,behavior:'instant'}));}}
  }, 15000);
  resume();
  if ("serviceWorker" in navigator) {
    const controlled = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (controlled && !reloading) {
        reloading = true;
        location.reload();
      }
    });
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        const offer = () => {
          if (!reg.waiting) return;
          waitingUpdate = () => reg.waiting?.postMessage({ action: "activate-update" });
          updateNotifications();
          const b = $("#update-button");
          b.hidden = false;
          b.onclick = () =>
            reg.waiting?.postMessage({ action: "activate-update" });
        };
        offer();
        reg.addEventListener("updatefound", () =>
          reg.installing?.addEventListener("statechange", offer),
        );
      })
      .catch(() => {});
  }
})();
