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
    medical_guidelines: "التعليمات",
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
    adminKind: "records",
    adminState: "",
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
      if (h) {const parent=publicBranch(h,"hospitals");result.address=parent.address;result.maps_url=parent.maps_url;}
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
  function closeDialog() {
    $("#app-dialog").close();
  }
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
      if (!form.reportValidity()) return;
      submitButton.disabled = true;
      error.textContent = "";
      try {
        await form.save(Object.fromEntries(new FormData(form)));
      } catch (e) {
        error.textContent = e.message;
        updateHeader();
      } finally {
        submitButton.disabled = false;
      }
    });
    return form;
  }
  function session() {
    const user = API.session();
    return user ? {...user, name: display(user.name) || (user.role === "admin" ? "مدير المنظومة" : "عضو النقابة")} : null;
  }
  function updateHeader() {
    connection();
    const u = session();
    $(".admin-link").hidden = u?.role === "member";
    $("#filter-panel > small").hidden = !isAdmin();
    $("#member-button").textContent = u
      ? (u.role === "member" ? "مرحبًا، " : "") + u.name
      : "دخول الأعضاء";
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
    const result = await API.catalog();
    if (
      !result.catalog ||
      !kinds.every((k) => Array.isArray(result.catalog[k]))
    )
      throw new Error("تعذر قراءة بيانات الدليل.");
    state.catalog = cleanDisplay(result.catalog);
    state.directoryState = result.directoryState === true;
    state.familyDirectory = result.familyDirectory === true;
    state.contractDirectory = result.contractDirectory === true;
    state.stats = result.stats || {};
    state.remote = true;
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
    return (
      !state.query ||
      normalize(values.join(" ")).includes(normalize(state.query))
    );
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
  function rating(target) {
    const stats = state.stats[target];
    const count = Number(stats?.count);
    const average = stats?.average == null || stats.average === "" ? NaN : Number(stats.average);
    if (Number.isInteger(count) && count > 0 && Number.isFinite(average) && average >= 1 && average <= 5)
      return el("div", {class:"rating"}, el("strong",{},"★ " + average.toFixed(1)), el("span",{class:"muted"},`${count} تقييم منشور`));
    return el("p",{class:"rating-empty"},"لا يوجد تقييم متاح بعد · شارك تجربتك");
  }
  function favorite(target) {
    const b = button(
      prefs.getFavorites().includes(target) ? "♥" : "♡",
      () => {
        try {
          const active = prefs.toggleFavorite(target);
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
    b.classList.toggle("active", prefs.getFavorites().includes(target));
    b.setAttribute("aria-label", "حفظ في المفضلة على هذا الجهاز");
    b.setAttribute(
      "aria-pressed",
      String(prefs.getFavorites().includes(target)),
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
  function actionLinks(branch) {
    const query=[branch.name,branch.address,branch.markaz || branch.city,"الدقهلية","مصر"].map(display).filter(Boolean).join(" ");
    const original=safeUrl(branch.maps_url);
    const exact=original && !/\/maps\/search|[?&](q|query)=/.test(original);
    return [contactGroups(branch,true),link(exact ? "الموقع على الخريطة" : "البحث عن العنوان", exact ? original : "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(query))];
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
        detail("⌖",usable(shown.address) || (isAdmin() ? "العنوان غير متاح" : "")),
        detail("◷",usable(branch.schedule) || (isAdmin() ? "المواعيد تحتاج استكمالًا" : "")),
        coverage(shown),
        companionPreview ? beforeVisit(publicBranch(branch,"records")) : null);
      replaceNodes(actions,...actionLinks(shown), button("قيّم الزيارة",()=>reviewDialog(target,p.name,String(branch.id)),"button primary"));
    };
    const card = el("article",{class:"card doctor-card"+(full ? " provider-profile" : ""),"data-target":target},
      el("div",{class:"card-top"},providerAvatar(p,p.is_department ? "clinic" : "doctor"),
        el("div",{class:"card-info"},el("span",{class:"card-eyebrow"},p.is_department ? "قسم طبي" : "رعاية متخصصة"),el(full ? "h1" : "h3",{},full ? p.name : el("a",{href:"#entity="+encodeURIComponent(target),class:"provider-title-link"},p.name)),el("p",{class:"card-specialty"},p.specialty),
          isAdmin() && p.image_verified ? link("مصدر الصورة",p.image_source_url,"image-source") : null),favorite(target)));
    if (p.branches.length > 1) card.append(el("p",{class:"multi-location"},`له ${p.branches.length} مقار · لكل مقر تفاصيله`));
    if (p.matched.length > 1) {
      if(isAdmin()) card.append(el("p",{class:"branch-instruction"},"اختر المستشفى أو العيادة لعرض تفاصيلها"));
      for (const b of p.matched) {
        const option = button("",()=>{branch=b;renderBranch();},"branch-option");
        option.dataset.branch = String(b.id);
        replaceNodes(option,el("strong",{},b.hospital || "العيادة"),el("small",{},[b.clinic_type,b.markaz || b.city].filter(Boolean).join(" · ")),statusBadge(b));
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
  function facilityCard(kind, original) {
    const r=publicBranch(original,kind);
    const facts=kind === "hospitals" ? RESEARCH.hospital(original) : null;
    const target = kind + ":" + r.id;
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
          el("h3", {}, r.name),
          el("p", {}, (r.category && r.source_ref ? r.category : labels[kind]) + " · " + (r.markaz || r.city || "")),
          isAdmin() && r.image_verified ? link(r.image_kind === "logo" ? "شعار الجهة · المصدر" : "مصدر الصورة",r.image_source_url,"image-source") : null,
        ),
        favorite(target),
      ),
      statusBadge(r),
      detail("⌖", usable(r.address)),
      detail("↔",r.contract_type === "direct_we" || r.contract_entity_id === "direct_we" ? "تعاقد مباشر مع الشركة" : usable(r.contract_entity)),
      isAdmin() && r.data_notes ? el("p", {class:"data-note"}, r.data_notes) : null,
      detail("◷",facts?.hours || usable(r.working_hours)),
      facts?.hoursSource ? link("مصدر ساعات العمل",facts.hoursSource,"fact-source") : null,
      facts?.scheduleSource ? link("جدول الاستقبال والعيادات",facts.scheduleSource,"fact-source") : null,
      isAdmin() && facts?.note ? el("p",{class:"data-note"},facts.note) : null,
      isAdmin() && !usable(r.working_hours) && !facts?.hours ? el("p",{class:"data-note"},"مواعيد استقبال موثقة مطلوبة") : null,
      coverage(r),
      companionPreview ? beforeVisit(r) : null,
      rating(target),
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
      go("doctors",{query:state.query});
    });
    main.append(el("section", {class:"companion-welcome"},
      el("div", {class:"eyebrow"}, "نبض النقابة · معك خطوة بخطوة"),
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
        el("li", {}, el("strong", {}, "شارك تجربتك بعد الزيارة"), el("p", {}, "قيّم التجربة، وتابع حالتها من صفحتك. ملاحظاتك خاصة بك وبالإدارة.")))));
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
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format();
    return r.publication_status === "published" && r.issuing_authority && (r.source_reference || r.source_url) && r.verified_at && (!r.effective_from || r.effective_from <= today) && (!r.expires_at || r.expires_at >= today) && r.directory_visibility !== "hidden";
  }
  function contentCard(r) {
    return el("details",{class:"card instruction-card","data-document":r.id},
      el("summary",{},el("span",{class:"card-eyebrow"},r.document_type === "news" ? "أخبار الشبكة" : "تعليمات الخدمة"),el("strong",{},r.title)),
      el("p",{},r.summary),el("ol",{},(r.steps || []).map(t=>el("li",{},t))),
      el("p",{class:"muted"},[r.issuing_authority,r.source_reference,r.verified_at ? "مراجعة: "+r.verified_at : ""].filter(Boolean).join(" · ")),
      r.effective_from || r.expires_at ? el("p",{class:"muted"},[r.effective_from ? "ساري من "+r.effective_from : "",r.expires_at ? "حتى "+r.expires_at : ""].filter(Boolean).join(" · ")) : null,
      r.source_url ? link("المصدر",r.source_url,"text-button") : null,
      isAdmin() ? button("تحرير المحتوى",()=>editDialog("medical_guidelines",r),"text-button") : null);
  }
  function recentUpdates(main) {
    const rows=[];
    for(const r of state.catalog.medical_guidelines.filter(r=>r.document_type === "news" && publishedContent(r))) rows.push({id:r.id,title:r.title,at:r.directory_update?.at || r.verified_at,type:"news",document:r,subtitle:r.summary});
    const recent=rows.filter(r=>Number.isFinite(Date.parse(r.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,6);
    main.append(el("section",{class:"recent-updates","aria-label":"آخر تحديثات الشبكة"},
      el("div",{class:"section-heading"},el("h2",{},"آخر تحديثات الشبكة"),button("تعليمات الخدمة",()=>go("guidelines"),"text-button")),
      recent.length ? el("div",{class:"updates-grid"},recent.map(r=>el("article",{class:"update-card","data-update":r.id},
        el("span",{class:"update-label "+r.type},{added:"إضافة جديدة",updated:"تحديث بيانات",suspended:"موقوف مؤقتًا",resumed:"استئناف الخدمة",news:"خبر الشبكة"}[r.type] || "تحديث الشبكة"),
        el("h3",{},r.title),el("p",{class:"muted"},r.subtitle),el("time",{datetime:r.at},new Intl.DateTimeFormat("ar-EG",{timeZone:"Africa/Cairo",dateStyle:"medium"}).format(new Date(r.at))),
        button(r.document ? "قراءة الإعلان" : "عرض التفاصيل",()=>r.document ? dialog(r.title,contentCard(r.document)) : (location.hash="entity="+encodeURIComponent(r.target)),"text-button"))))
      : el("p",{class:"updates-empty"},"ستظهر هنا الأخبار والإعلانات التي تنشرها النقابة.")));
  }
  function renderHome(main) {
    if (companionPreview) {renderCompanionHome(main);recentUpdates(main);return;}
    const networkRecords=state.catalog.records.filter(r=>!state.network || (r.network_members || []).includes(state.network));
    const networkProviders=providers().filter(p=>p.branches.some(r=>!state.network || (r.network_members || []).includes(state.network)));
    main.append(
      el(
        "section",
        { class: "hero hero-compact" },
        el(
          "div",
          {},
          el("div", { class: "eyebrow" }, "رعايتك تبدأ بمعلومة واضحة"),
          el("h1", {}, "دليلك إلى الرعاية الطبية", el("br"), "في الدقهلية"),
          el(
            "p",
            {},
            "ابحث عن الطبيب أو الجهة، اختر مقر العمل المناسب، وتواصل مباشرة. شارك زملاءك تقييم تجربتك بعد الزيارة.",
          ),
          el(
            "div",
            { class: "actions-row" },
            button("ابحث عن طبيب", () => go("doctors"), "button"),
            el("a", { href: "tel:123", class: "button" }, "الإسعاف 123"),
          ),
        ),
        el(
          "div",
          { class: "hero-stat" },
          [
            ["طبيب وقسم", networkProviders.length],
            [
              "تخصصًا",
              new Set(networkRecords.map((r) => r.specialty)).size,
            ],
            ["مستشفيات", state.catalog.hospitals.filter(r=>!state.network || (r.network_members || []).includes(state.network)).length],
          ].map(([t, n]) =>
            el("div", {}, el("strong", {}, n), el("small", {}, t)),
          ),
        ),
      ),
    );
    recentUpdates(main);
    main.append(
      el(
        "div",
        { class: "section-heading" },
        el("h2", {}, "ما الخدمة التي تبحث عنها؟"),
      ),
    );
    const cats = [
      ["الأطباء والعيادات", "♧", () => go("doctors")],
      ["المستشفيات", "▥", () => go("hospitals")],
      [
        "معامل التحاليل",
        "⚗",
        () => {
          go("services",{serviceKind:"labs"});
        },
      ],
      [
        "الأشعة",
        "◉",
        () => {
          go("services",{serviceKind:"radiology"});
        },
      ],
      [
        "الصيدليات",
        "✚",
        () => {
          go("services",{serviceKind:"pharmacies"});
        },
      ],
      [
        "المراكز المتخصصة",
        "◇",
        () => {
          go("services",{serviceKind:"specialized_centers"});
        },
      ],
      ["مراكز الدقهلية", "⌖", () => go("districts")],
      ["الأسنان", "◇", () => go("dental")],
      ["التعليمات", "≡", () => go("guidelines")],
      ["الطوارئ", "✦", () => go("emergency")],
    ];
    main.append(
      el(
        "div",
        { class: "category-grid" },
        cats.map(([name, symbol, action]) =>
          el(
            "button",
            { class: "category", onClick: action },
            el("span", { class: "symbol", "aria-hidden": "true" }, symbol),
            el("strong", {}, name),
          ),
        ),
      ),
    );
    main.append(
      el("div", { class: "section-heading" }, el("h2", {}, "التخصصات الطبية")),
    );
    main.append(
      el(
        "div",
        { class: "category-grid" },
        [...new Set(networkRecords.map((r) => r.specialty))].map((s) =>
          el(
            "button",
            {
              class: "category",
              onClick: () => {
                go("doctors",{specialty:s});
              },
            },
            el("strong", {}, s),
            el(
              "small",
              {},
              networkProviders.filter((p) => p.specialty === s).length +
                " طبيب وقسم",
            ),
          ),
        ),
      ),
    );
  }
  function renderMain() {
    updateHeader();
    const main = $("#main");
    main.dataset.catalogReady = String(!!session() && state.remote);
    main.replaceChildren();
    const signedIn = !!session();
    previewNotice.hidden = !isAdmin();
    $(".search-panel").hidden = !signedIn || (companionPreview && ["home", "account"].includes(state.tab));
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
    if (state.tab === "admin") return renderAdmin(main);
    if (state.tab === "account") return renderAccount(main);
    if (state.tab === "districts") {
      main.append(heading("شبكتك في مراكز الدقهلية", "اختر المركز لاستعراض الأطباء والمستشفيات والخدمات المرتبطة به."));
      main.append(el("div",{class:"district-grid"}, dakahliaCenters.map(name => {
        const records = state.catalog.records.filter(r => (r.markaz || r.city) === name && (!state.network || r.network_members?.includes(state.network)));
        const facilities = ["hospitals","labs","radiology","pharmacies","specialized_centers"].flatMap(k => state.catalog[k].filter(r => (r.markaz || r.city) === name && (!state.network || r.network_members?.includes(state.network))));
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
      main.append(heading("تعليمات الحصول على الخدمة","تعليمات الشركة وإجراءات الرعاية الطبية المنشورة"));
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
      if(isAdmin() && other.length) main.append(heading("سجلات أخرى للمراجعة"),gridCards(other.map(emergencyCard)));
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
        ...state.catalog[kind]
          .filter(
            (r) =>
              matchesBranch(r) &&
              (state.tab !== "dental" || isDental(r)) &&
              matchesText([r.name, r.address, r.markaz, r.phone]) &&
              (state.tab !== "favorites" || favs.includes(kind + ":" + r.id)),
          )
          .map((r) => facilityCard(kind, r)),
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
  function route() {
    startOfPage();
    if (!session()) {
      renderMain();
      return;
    }
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
      const at = target.indexOf(":"),
        kind = target.slice(0, at),
        id = target.slice(at + 1),
        r = state.catalog[kind]?.find((r) => String(r.id) === id);
      main.append(heading("الجهة الطبية"),r ? facilityCard(kind, r) : empty("الجهة لم تعد متاحة."));
    }
  }
  function doctorProfile(p) {
    const box=el("section",{class:"doctor-profile-page"},
      button("العودة إلى الأطباء",()=>go("doctors"),"text-button profile-back"),
      doctorCard({...p,matched:p.branches.filter(matchesBranch).length ? p.branches.filter(matchesBranch) : p.branches},true));
    const target="doctor:"+p.id;
    const tabs=el("nav",{class:"profile-sections","aria-label":"أقسام ملف الطبيب"},
      el("a",{href:"#profile-locations",onClick:event=>{event.preventDefault();box.querySelector(".branch-details").scrollIntoView({behavior:"smooth",block:"center"});}},"المقار والتواصل"),
      el("a",{href:"#profile-reputation",onClick:event=>{event.preventDefault();box.querySelector(".external-reputation").scrollIntoView({behavior:"smooth",block:"start"});}},"الآراء والمصادر"));
    box.prepend(tabs);
    const facts=RESEARCH.doctor(p);
    const external=el("section",{class:"external-reputation reputation-panel",id:"profile-reputation"},
      el("div",{class:"section-heading"},el("div",{},el("span",{class:"card-eyebrow"},"تجارب ومصادر مستقلة"),el("h2",{},"آراء المرضى"))),
      el("div",{class:"reputation-local"},el("h3",{},"تقييم أعضاء نبض النقابة"),rating(target)));
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
        required: true,
        maxlength: 40,
        autocomplete: "off",
      }),
      field("رقم الموبايل المسجل", "phone", "tel", "", {
        required: true,
        inputmode: "tel",
        maxlength: 20,
        autocomplete: "tel",
        dir: "ltr",
      }),
      field("آخر ٤ أرقام من الرقم القومي", "last4", "password", "", {
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
      await API.login("member", { ...data, remember: data.remember === "on" });
      form.reset();
      closeDialog();
      updateHeader();
      route();
      await refresh();
      toast(
        API.persistenceNotice ||
          "مرحبًا، " + session().name + ". سعداء بوجودك في نبض النقابة.",
      );
    };
    formAction(form, "تحقق وادخل");
    if (!API.configured)
      form.querySelector("button[type=submit]").disabled = true;
    return form;
  }
  function renderLogin(main) {
    const box = el(
      "section",
      { class: "login-card" },
      el("div", {class:"brand-pair", "aria-label":"اللجنة النقابية والمصرية للاتصالات"},
        el("img",{src:"img/nekaba-mark.png",alt:"شعار اللجنة النقابية",width:90,height:90}),
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
      go(u.role === "admin" ? "admin" : "account");
      return;
    }
    renderMain();
    $("#main").focus({preventScroll:true});
    startOfPage();
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
    form.save = async (data) => {
      const result = await API.review({
        target_id: target,
        branch_id: branch,
        rating: Number(data.rating),
        comment: data.comment,
        visited_declared: data.visited === "on",
      });
      closeDialog();
      toast(result.message);
      if (location.hash === "#account") route();
    };
    dialog(previous ? "تعديل تقييمي" : "تقييم الزيارة وملاحظاتك", formAction(form, "حفظ التقييم"));
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
      heading("مرحبًا، " + u.name, "بياناتك النقابية وتقييمات زياراتك في مكان واحد."),
      button("تسجيل الخروج", logout, "button outline"),
    );
    if (u.role !== "member") return;
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
        const fields = [
          ["الاسم", profile.name], ["كود الموظف", profile.employeeCode],
          ["رقم العضوية النقابية", profile.membershipCode], ["الوظيفة", profile.jobTitle],
          ["مكان العمل", profile.workplace], ["آخر دخول إلى الدليل الطبي", date(profile.lastLoginAt)],
          ["الدخول السابق إلى الدليل الطبي", date(profile.previousLoginAt)],
        ];
        profileBox.replaceChildren(el("div",{class:"member-card-heading"},el("img",{src:"img/nekaba-mark.png",alt:"",onError:e=>e.target.hidden=true}),el("div",{},el("small",{},"نبض النقابة · WE"),el("h2", {}, "بطاقتي النقابية")),el("span",{class:"member-lock"},"بيانات شخصية")),
          el("dl", {class:"profile-grid"}, ...fields.map(([label,value]) =>
            el("div", {}, el("dt", {}, label), el("dd", {}, value || "غير مسجل لدى النقابة")))),
          el("p", {class:"muted"}, "بياناتك للعرض لك وحدك من سجل النقابة. تحديثها يتم لدى النقابة."));
      } catch (error) {
        profileBox.replaceChildren(el("div",{class:"member-card-heading"},el("img",{src:"img/nekaba-mark.png",alt:"",onError:e=>e.target.hidden=true}),el("div",{},el("small",{},"نبض النقابة · WE"),el("h2", {}, "بطاقتي النقابية")),el("span",{class:"member-lock"},"بيانات شخصية")),
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
        `${display(r.author_name) || "عضو النقابة"} · ${score} · ${display(statusText(r.status)) || "قيد المراجعة"}`,
      ),
      el("p", {}, r.comment),
    );
  }
  async function logout() {
    try {
      await API.logout();
    } catch (e) {
      toast(e.message);
    } finally {
      state.catalog = Object.fromEntries(kinds.map((k) => [k, []]));
      state.stats = {};
      state.remote = false;
      updateHeader();
      go("home");
      renderMain();
      toast("تم تسجيل الخروج.");
    }
  }
  async function renderAdmin(main) {
    if (session()?.role !== "admin") {
      main.append(
        heading(
          "إدارة الدليل الطبي",
          "للمدير المعتمد إضافة الجهات وتعديلها وحذفها ومراجعة التقييمات.",
        ),
        button("دخول المدير", adminDialog, "button primary"),
      );
      return;
    }
    main.append(
      heading(
        "مركز إدارة نبض النقابة",
        "تُحفظ التعديلات مركزيًا. سجل أعضاء النقابة لا يُعدّل من هنا.",
      ),
      el(
        "div",
        { class: "actions-row" },
        button(
          "إضافة سجل",
          () => editDialog(state.adminKind),
          "button primary",
        ),
        button("إضافة تعليمات",()=>editDialog("medical_guidelines"),"button outline"),
        button("إضافة خبر",()=>editDialog("medical_guidelines",null,"news"),"button outline"),
        button("مراجعة التقييمات", adminReviewDialog, "button outline"),
        button("جودة بيانات الدليل", qualityDialog, "button outline"),
        button("مراجعة المواقع والمواعيد", researchDialog, "button outline"),
        button("تصدير بيانات الدليل", exportCatalog, "button outline"),
        button("تسجيل الخروج", logout, "button outline"),
      ),
    );
    if(!state.contractDirectory) main.append(el("p",{class:"notice warning"},"حجب الجهات غير الواردة بالمصادر ينتظر نشر تحديث Firebase بالإعداد المحفوظ."));
    if(!state.familyDirectory) main.append(el("p",{class:"notice warning"},"دليل الأسر الجديد ينتظر نشر تحديث Firebase؛ تبويب الأسر يعرض البيانات المنشورة سابقًا فقط."));
    main.append(el("div",{class:"admin-metrics"}, [["إجمالي السجلات",kinds.flatMap(k=>state.catalog[k]).length],["مخفية",kinds.flatMap(k=>state.catalog[k]).filter(r=>r.directory_visibility === "hidden" || r.contract_listing === false).length],["موقوفة مؤقتًا",kinds.flatMap(k=>state.catalog[k]).filter(r=>r.service_status === "suspended").length]].map(([label,count])=>el("article",{},el("strong",{},count),el("span",{},label)))));
    const kindSelect = selectField(
      "نوع السجلات",
      "admin-kind",
      kinds.map((k) => [k, labels[k]]),
      state.adminKind,
    );
    kindSelect.querySelector("select").addEventListener("change", (e) => {
      state.adminKind = e.target.value;
      renderMain();
    });
    main.append(el("div",{class:"admin-filterbar"},kindSelect));
    const statusSelect=selectField("حالة العرض والخدمة","admin-state",[["","كل الحالات"],["visible","ظاهرة"],["hidden","مخفية"],["suspended","موقوفة مؤقتًا"]],state.adminState);
    statusSelect.querySelector("select").addEventListener("change",e=>{state.adminState=e.target.value;state.limit=24;renderMain();});
    main.querySelector(".admin-filterbar").append(statusSelect);
    if(state.adminKind === "records") main.append(el("p",{class:"muted"},"كل صف يمثل مقرًا. عند تغيير الحالة يمكنك اختيار جميع مقار الطبيب أو هذا المقر فقط."));
    const rows = state.catalog[state.adminKind].filter((r) =>
      (!r.admin_reviewed_at || !!state.query.trim()) && matchesText([r.name, r.title, r.hospital, r.address]) && (!state.adminState || (state.adminState === "suspended" ? r.service_status === "suspended" : (r.directory_visibility === "hidden" || r.contract_listing === false ? "hidden" : "visible") === state.adminState)),
    );
    main.append(el("p", { class: "muted" }, `${rows.length} سجلًا · السجلات التي حدّثتها تظهر عند البحث عنها.`));
    const body = el(
      "tbody",
      {},
      rows.slice(0, state.limit).map((r) =>
        el(
          "tr",
          {},
          el("td", {}, el("strong",{},r.name || r.title),el("div",{class:"admin-state"},(r.directory_visibility === "hidden" || r.contract_listing === false) ? el("span",{class:"service-status"},r.contract_listing === false ? "محجوبة: يلزم مصدر تعاقد معتمد" : "مخفية عن الأعضاء") : el("span",{class:"muted"},"ظاهرة في الدليل"), statusBadge(r))),
          el("td", {}, r.markaz || r.hospital || r.category || ""),
          el(
            "td",
            {},
            button(
              "تعديل",
              () => editDialog(state.adminKind, r),
              "text-button",
            ),
            button(r.directory_visibility === "hidden" ? "إظهار" : "إخفاء", () => changeEntityState(state.adminKind,r,"directory_visibility",r.directory_visibility === "hidden" ? "visible" : "hidden"), "text-button"),
            button(r.service_status === "suspended" ? "استئناف الخدمة" : "إيقاف مؤقت", () => changeEntityState(state.adminKind,r,"service_status",r.service_status === "suspended" ? "active" : "suspended"), "text-button"),
            button(
              "حذف",
              () => deleteDialog(state.adminKind, r),
              "text-button danger-text",
            ),
          ),
        ),
      ),
    );
    main.append(
      el(
        "div",
        { class: "table-wrap" },
        el(
          "table",
          {},
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", {}, "الاسم"),
              el("th", {}, "المنطقة / التصنيف"),
              el("th", {}, "إجراءات"),
            ),
          ),
          body,
        ),
      ),
    );
    if (rows.length > state.limit)
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
    const all=kind === "records" ? state.catalog.records.filter(e=>e.provider_id===r.provider_id) : [r];
    const content=el("div",{},el("p",{},key === "directory_visibility"
      ? "الإخفاء يمنع عرض المقر للأعضاء. إخفاء المستشفى يخفي مقار الأطباء التابعة لها أيضًا."
      : "الإيقاف يبقي المقر ظاهرًا بعلامة موقوف مؤقتًا. تتأثر به مقار الأطباء التابعة للمستشفى فقط."));
    const group=el("input",{type:"checkbox",checked:true});
    if (all.length>1) content.append(el("label",{class:"remember-option"},group,` تطبيق على جميع مقار هذا الطبيب (${all.length})`));
    const error=el("p",{class:"notice warning",role:"alert",hidden:true});content.append(error);
    dialog(r.name || r.title,content);
    const save=button("تأكيد التغيير",async()=>{
      save.disabled=true;error.hidden=true;
      try {
        const health=await API.health();
        if(!health.capabilities?.includes("directory-state-v1")) throw new Error("هذه الميزة تحتاج نشر تحديث الخدمة المركزية أولًا. لم تتغير حالة الجهة.");
        const selected=all.length>1 && group.checked ? all : [r];
        await API.setState(kind,r.id,{field:key,value,scope:selected.length>1 ? "provider" : "entity",versions:Object.fromEntries(selected.map(e=>[String(e.id),e._version || 0]))});
        closeDialog();toast("تم حفظ الحالة.");
        try {await refresh();} catch {toast("حُفظت الحالة. حدّث الصفحة لعرض التغيير.");}
      } catch(e) {error.textContent=e.message;error.hidden=false;}
      finally {save.disabled=false;}
    },"button primary");
    content.append(save);
  }
  function editDialog(kind, original,documentType) {
    const r = original || (documentType ? {document_type:documentType} : {});
    const id = r.id || "entry_" + crypto.randomUUID().replaceAll("-", "");
    const form = el(
      "form",
      { class: "form-stack" },
      field(
        kind === "medical_guidelines" ? "عنوان النشرة" : "الاسم",
        "name",
        "text",
        r.name || r.title || "",
        { required: true, maxlength: 250 },
      ),
    );
    if (!["medical_guidelines","emergency_services"].includes(kind) && (!original || r.contract_listing === false))
      form.prepend(el("p",{class:"notice warning"},"الجهات غير الواردة في ملفات التعاقد المعتمدة تبقى محجوبة عن الأعضاء. حفظ البيانات أو الضغط على إظهار لا يضيف اعتماد تعاقد؛ يلزم إدراج الجهة في ملف تعاقد معتمد."));
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
    const choices={
      specialty:[...new Set(state.catalog.records.map(x=>x.specialty).filter(Boolean))],
      hospital:[...new Set(["عيادة مستقلة",...state.catalog.hospitals.map(x=>x.short_name || x.name),...state.catalog.records.map(x=>x.hospital)].filter(Boolean))],
      markaz:[...new Set([...dakahliaCenters,...kinds.flatMap(k=>state.catalog[k]).map(x=>x.markaz || x.city)].filter(Boolean))],
    };
    for (const [key, label] of textFields) {
      if(choices[key]) {
        const values=[...new Set([...choices[key],r[key]].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"));
        const wrapper=selectField(label,key,[["","اختر "+label],...values.map(v=>[v,v])],r[key] || "");
        wrapper.querySelector("select").required=key !== "markaz" || kind !== "emergency_services";
        form.append(wrapper);
      } else form.append(field(label,key,["notes","summary","description","steps"].includes(key) ? "textarea" : "text",Array.isArray(r[key]) ? r[key].join("\n") : r[key] || "",{required:key === "summary",maxlength:3000}));
    }
    if(kind === "medical_guidelines") {
      form.append(
        selectField("نوع المحتوى","document_type",[["instruction","تعليمات الحصول على الخدمة"],["news","خبر أو إعلان للشبكة"]],r.document_type || "instruction"),
        selectField("حالة النشر","publication_status",[["draft","مسودة — للإدارة فقط"],["published","منشور للأعضاء"]],r.publication_status || "draft"),
        selectField("تصنيف المحتوى","category",[["general","تعليمات عامة"],["approvals","الموافقات"],["referrals","التحويلات"],["medications","الأدوية"],["emergency","الطوارئ"],["benefits","المزايا والخدمات"],["network","أخبار وتعاقدات الشبكة"],...r.category && !["general","approvals","referrals","medications","emergency","benefits","network"].includes(r.category) ? [[r.category,r.category]] : []],r.category || "general"),
        field("الجهة المصدرة","issuing_authority","text",r.issuing_authority || "",{maxlength:250}),
        field("مرجع التعليمات أو الإعلان","source_reference","text",r.source_reference || "",{maxlength:500}),
        field("تاريخ مراجعة المحتوى","verified_at","date",r.verified_at || ""),
        field("ساري من (اختياري)","effective_from","date",r.effective_from || ""),
        field("ساري حتى (اختياري)","expires_at","date",r.expires_at || ""),
        el("p",{class:"notice"},"المسودة لا تظهر للأعضاء. النشر يتطلب جهة مصدرة ومرجعًا أو رابط مصدر وتاريخ مراجعة؛ لا تكتب نسب تحمل أو إجراءات غير معتمدة."));
    }
    if(!["medical_guidelines","emergency_services"].includes(kind)) {
      const n=r.network_members || [];
      form.append(selectField("المستفيدون","beneficiary_group",[["","اختر المستفيدين"],["employee","الموظفون"],["family","الأسر والمعاشات"],["all","الموظفون والأسر والمعاشات"]],n.includes("employee") && n.some(x=>x !== "employee") ? "all" : n.includes("family") || n.includes("retiree") ? "family" : n.includes("employee") ? "employee" : ""),
        selectField("مسار التعاقد","contract_type",[["","اختر مسار التعاقد"],["direct_we","تعاقد مباشر من الشركة"],["hospital","عبر مستشفى"],["family_network","شبكة الأسر والمعاشات"]],r.contract_type || ""));
      for(const key of ["beneficiary_group","contract_type"]) form.querySelector('[name="'+key+'"]').required=true;
      if(kind !== "records") {
        const categories=[...new Set([labels[kind],...state.catalog[kind].map(e=>e.category),...(kind === "specialized_centers" ? ["مركز أسنان","علاج طبيعي","بصريات"] : [])].filter(Boolean))];
        form.append(selectField("نوع الجهة","category",categories.map(v=>[v,v]),r.category || labels[kind]));
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
    form.save = async (data) => {
      const entity = { ...r, ...data, id };
      if(kind === "medical_guidelines") {
        const health=await API.health();
        if(!health.capabilities?.includes("directory-content-v1")) throw new Error("حفظ التعليمات والأخبار يحتاج نشر تحديث Firebase أولًا. لم يُنشر المحتوى.");
      } else if(kind !== "emergency_services") {
        entity.network_members=data.beneficiary_group === "all" ? ["employee","family","retiree"] : data.beneficiary_group === "family" ? ["family","retiree"] : ["employee"];
        entity.city=data.markaz;
        entity.country_code="EG";entity.governorate="الدقهلية";entity.governorate_code="EG-DK";
        const hospital=state.catalog.hospitals.find(h=>[h.name,h.short_name].includes(data.hospital));
        if(kind === "records" && (data.hospital !== r.hospital || data.contract_type !== r.contract_type || !original)) {
          entity.contract_entity_id=data.contract_type === "hospital" && hospital ? hospital.id : data.contract_type;
          entity.contract_entity=data.contract_type === "hospital" ? data.hospital : data.contract_type === "family_network" ? "شبكة الأسر والمعاشات" : "تعاقد مباشر من الشركة";
        }
      }
      delete entity.beneficiary_group;
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
      await API.save(kind, entity, r._version || 0);
      closeDialog();
      await refresh();
      toast("تم حفظ السجل في الدليل المركزي.");
    };
    dialog(
      (original ? "تعديل: " : "إضافة: ") + labels[kind],
      formAction(form, "حفظ التغييرات"),
    );
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
          await API.remove(kind, r);
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
        const actions = el("div", {class:"actions-row"});
        const statuses = r.status === "pending" ? ["published", "hidden"] : r.status === "published" ? ["hidden"] : [];
        for (const status of statuses) {
          const action = button(status === "published" ? "اعتماد ونشر" : "إخفاء التقييم", async () => {
            if (busy || !compatible) return;
            busy = true;
            box.querySelectorAll("button[data-review-action]").forEach((b) => b.disabled=true);
            try {
              const result = await API.moderate(r.id, status, r.revision || 1);
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
      go("doctors",{query:state.query});
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
    state.catalog = Object.fromEntries(kinds.map((k) => [k, []]));
    state.stats = {};
    state.remote = false;
    if ($("#app-dialog").open) closeDialog();
    route();
    connection();
  });
  window.addEventListener("online", () => {
    if (!session()) resume();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !session() && !$(".login-card")) route();
  });
  setInterval(() => { API.session(); }, 60000);
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
