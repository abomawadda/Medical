/* Medical v4: public directory, server-verified member reviews, separate administration. */
(() => {
  "use strict";
  const companionPreview = new URL(location.href).searchParams.get("experience") === "companion";
  document.documentElement.classList.toggle("companion-preview", companionPreview);
  const API = window.MedicalAPI,
    prefs = window.MedicalStorage;
  const CONTACTS = window.MedicalContacts;
  const dakahliaCenters = ["المنصورة","طلخا","ميت غمر","السنبلاوين","بلقاس","دكرنس","شربين","أجا","المنزلة","منية النصر","ميت سلسيل","بني عبيد","نبروه","الجمالية","تمي الأمديد","محلة دمنة"];
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
    ["hospitals", "▥", "المستشفيات"],
    ["favorites", "♡", "المفضلة"],
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
  // Every data value becomes a text node or a checked URL. No data is inserted as HTML.
  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const c of children.flat(Infinity)) {
      if (c !== null && c !== undefined && c !== false)
        n.append(c instanceof Node ? c : document.createTextNode(String(c)));
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
    text
      ? el(
          "p",
          { class: "detail" },
          el("span", { "aria-hidden": "true" }, symbol),
          el("span", {}, text),
        )
      : null;
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
    return API.session();
  }
  function updateHeader() {
    const u = session();
    $("#member-button").textContent = u
      ? (u.role === "member" ? "مرحبًا، " : "") + u.name
      : "دخول الأعضاء";
  }
  function connection() {
    const n = $("#connection-status");
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
    state.catalog = result.catalog;
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
      (!state.contractType || (b.contract_type || (b.contract_entity_id === "direct_we" ? "direct_we" : "hospital")) === state.contractType) &&
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
    const s = state.stats[target];
    return s?.count
      ? el(
          "div",
          { class: "rating" },
          el("strong", {}, "★ " + Number(s.average).toFixed(1)),
          el("span", { class: "muted" }, `${s.count} تقييم منشور`),
        )
      : el(
          "p",
          { class: "muted" },
          API.configured && !state.remote
            ? "التقييمات تحتاج اتصالًا بالخدمة المركزية"
            : "لا توجد تقييمات منشورة بعد",
        );
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
    const confirmed = entity.coverage_verified === true;
    return el(
      "div",
      { class: "coverage" + (confirmed ? "" : " unknown") },
      confirmed
        ? entity.coverage_label ||
            {
              both: "العاملون وأسرهم",
              employee_only: "العاملون فقط",
              family_globemed: "أسر جلوب ميد",
            }[entity.coverage_scope] ||
            "راجع شروط الجهة"
        : entity.source_ref === "staff-20261018" ? "مدرج بشبكة الموظفين · أكّد تغطية الخدمة" : "التغطية تحتاج تأكيدًا من الجهة",
    );
  }
  function providerAvatar(entity, type) {
    const placeholder = el("span", {class:"avatar-placeholder"}, el("span", {"aria-hidden":"true"}, type === "doctor" ? "♧" : "✚"), el("small", {}, "صورة غير مضافة"));
    const avatar = el("div", {class:"provider-avatar" + (entity.image_kind === "logo" ? " provider-logo" : "") + (String(entity.image_url || "").includes("el-ezaby.png") ? " provider-logo-light" : "")}, placeholder);
    const url = entity.image_verified === true && safeUrl(entity.image_url);
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
        return el("span", {class:"phone-entry"}, el("a", {class:"phone-chip",href:"tel:" + n,dir:"ltr","aria-label":`${kind === "mobile" ? "محمول" : kind === "landline" ? "أرضي" : "رقم مختصر"} ${n}`}, n), evidence ? link("المصدر",evidence.source_url,"phone-source") : null);
      }))));
    return el("div", {class:"contact-groups"}, rows.length ? rows : el("p", {class:"muted"}, "رقم الاتصال غير متاح"),
      branch.contact_review_required || groups.invalid.length ? el("small", {class:"muted"}, "بعض الأرقام تحتاج مراجعة؛ أُخفيت الأرقام غير سليمة الصيغة.") : null);
  }
  function actionLinks(branch) {
    return [
      contactGroups(branch, true),
      link(
        "الخريطة",
        branch.maps_url ||
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([branch.name, branch.address, branch.markaz || branch.city].filter(Boolean).join(" "))}`,
      ),
    ];
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
      el("p", {class:"muted"}, "راجع تفاصيل هذا المقر قبل الزيارة."),
      el("dl", {class:"visit-checklist"},
        el("div", {}, el("dt", {}, "العنوان"), el("dd", {}, branch.address || "تأكد من العنوان عند الاتصال")),
        el("div", {}, el("dt", {}, "المواعيد"), el("dd", {}, branch.schedule || branch.working_hours || "تحتاج تأكيدًا عند الاتصال")),
        el("div", {}, el("dt", {}, "التغطية"), el("dd", {}, coverage(branch))),
        el("div", {}, el("dt", {}, "تاريخ التحقق"), el("dd", {}, branch.verified_at || "غير مسجل في الدليل"))),
      branch.source_url ? link("مصدر المعلومة", branch.source_url, "text-button") : null,
      el("p", {class:"notice"}, "تأكد من توفر الخدمة والتغطية والإجراءات المطلوبة مع الجهة ومسؤول الرعاية. الاتصال المباشر لا يُعد حجزًا مؤكدًا."));
  }
  function doctorCard(p) {
    const target = "doctor:" + p.id;
    let branch = p.matched[0];
    const details = el("div", { class: "branch-details" });
    const actions = el("div", { class: "card-actions" });
    const renderBranch = () => {
      details.replaceChildren(
        detail("▥", branch.hospital),
        branch.contract_type === "direct_we" ? detail("↔", "تعاقد مباشر من الشركة WE") : detail("↔", "تعاقد عبر المستشفى · أكد إجراء التحويل قبل الزيارة"),
        detail("⌖", branch.address),
        detail("◷", branch.schedule || "المواعيد تحتاج تأكيدًا"),
        coverage(branch),
        companionPreview ? beforeVisit(branch) : null,
      );
      actions.replaceChildren(
        ...actionLinks(branch),
        button(
          "قيّم الزيارة",
          () => reviewDialog(target, p.name, String(branch.id)),
          "button outline",
        ),
      );
    };
    const card = el(
      "article",
      { class: "card", "data-target": target },
      el(
        "div",
        { class: "card-top" },
        providerAvatar(p, p.is_department ? "facility" : "doctor"),
        el(
          "div",
          { class: "card-info" },
          el("h3", {}, p.name),
          el("p", {}, p.specialty),
          p.image_verified ? link("مصدر الصورة",p.image_source_url,"image-source") : null,
        ),
        favorite(target),
      ),
    );
    if (p.matched.length > 1) {
      const label = el("label", { class: "sr-only" }, "اختر مقر العمل");
      const select = el(
        "select",
        {
          class: "branch-select",
          "aria-label": "اختر مقر عمل " + p.name,
          onChange: (e) => {
            branch = p.matched.find((b) => String(b.id) === e.target.value);
            renderBranch();
          },
        },
        p.matched.map((b) =>
          el(
            "option",
            { value: b.id },
            `${b.hospital} · ${b.markaz || b.city}`,
          ),
        ),
      );
      card.append(label, select);
    }
    card.append(
      details,
      rating(target),
      actions,
      button("مشاركة الجهة", () => share(target, p.name), "text-button"),
    );
    renderBranch();
    return card;
  }
  function facilityCard(kind, r) {
    const target = kind + ":" + r.id;
    return el(
      "article",
      { class: "card", "data-target": target },
      el(
        "div",
        { class: "card-top" },
        providerAvatar(r, "facility"),
        el(
          "div",
          { class: "card-info" },
          el("h3", {}, r.name),
          el("p", {}, (r.category && r.source_ref ? r.category : labels[kind]) + " · " + (r.markaz || r.city || "")),
          r.image_verified ? link(r.image_kind === "logo" ? "شعار الجهة · المصدر" : "مصدر الصورة",r.image_source_url,"image-source") : null,
        ),
        favorite(target),
      ),
      detail("⌖", r.address),
      r.source_ref ? detail("↔", "مدرج بقائمة تعاقدات الموظفين") : null,
      r.data_notes ? el("p", {class:"data-note"}, r.data_notes) : null,
      detail("◷", r.working_hours || "المواعيد تحتاج تأكيدًا"),
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
    $("#filter-panel").hidden = ["home", "admin", "account", "guidelines"].includes(state.tab);
    if (["home", "admin", "account", "guidelines"].includes(state.tab)) return;
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
    if (["doctors", "favorites"].includes(state.tab)) {
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
    if (["doctors", "services", "hospitals"].includes(state.tab)) {
      for (const [title,key,options] of [
        ["الشبكة","network",[["","كل الشبكات"],["employee","الموظفون"],["family","الأسر"],["retiree","المعاشات"]]],
        ["مسار التعاقد","contractType",[["","كل المسارات"],["direct_we","تعاقد مباشر من الشركة"],["hospital","عبر مستشفى"]]],
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
      container.append(el("label", {}, "التغطية المؤكدة", select));
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
      go("doctors");
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
  function renderHome(main) {
    if (companionPreview) return renderCompanionHome(main);
    main.append(
      el(
        "section",
        { class: "hero" },
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
            ["طبيب وقسم", providers().length],
            [
              "تخصصًا",
              new Set(state.catalog.records.map((r) => r.specialty)).size,
            ],
            ["مستشفيات", state.catalog.hospitals.length],
          ].map(([t, n]) =>
            el("div", {}, el("strong", {}, n), el("small", {}, t)),
          ),
        ),
      ),
    );
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
          state.serviceKind = "labs";
          go("services");
        },
      ],
      [
        "الأشعة",
        "◉",
        () => {
          state.serviceKind = "radiology";
          go("services");
        },
      ],
      [
        "الصيدليات",
        "✚",
        () => {
          state.serviceKind = "pharmacies";
          go("services");
        },
      ],
      [
        "المراكز المتخصصة",
        "◇",
        () => {
          state.serviceKind = "specialized_centers";
          go("services");
        },
      ],
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
        [...new Set(state.catalog.records.map((r) => r.specialty))].map((s) =>
          el(
            "button",
            {
              class: "category",
              onClick: () => {
                state.specialty = s;
                go("doctors");
              },
            },
            el("strong", {}, s),
            el(
              "small",
              {},
              providers().filter((p) => p.specialty === s).length +
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
    main.replaceChildren();
    const signedIn = !!session();
    previewNotice.hidden = !signedIn;
    $(".search-panel").hidden = !signedIn || (companionPreview && ["home", "account"].includes(state.tab));
    $("#main-nav").hidden = !signedIn;
    if (!signedIn) return renderLogin(main);
    if (!state.remote) {
      main.append(
        heading("تحميل الدليل الطبي"),
        el("p", { class: "muted" }, "يتم تحميل الجهات بعد تأكيد الدخول."),
        button(
          "إعادة المحاولة",
          () => refresh().catch((e) => toast(e.message)),
          "button outline",
        ),
      );
      return;
    }
    if (state.tab === "home") return renderHome(main);
    if (state.tab === "admin") return renderAdmin(main);
    if (state.tab === "account") return renderAccount(main);
    if (state.tab === "guidelines") {
      main.append(
        heading(
          "التعليمات والإجراءات",
          "راجع الشروط الحالية مع مسؤول الرعاية قبل الاعتماد عليها.",
        ),
      );
      for (const r of state.catalog.medical_guidelines.filter((r) =>
        matchesText([r.title, r.summary]),
      ))
        main.append(
          el(
            "details",
            { class: "card" },
            el("summary", {}, el("strong", {}, r.title)),
            el("p", {}, r.summary),
            el(
              "ol",
              {},
              (r.steps || []).map((s) => el("li", {}, s)),
            ),
          ),
        );
      return;
    }
    if (state.tab === "emergency") {
      main.append(
        heading(
          "الطوارئ والاتصال العاجل",
          "للإسعاف اتصل مباشرة بـ123. أرقام الجهات المحلية تحتاج تأكيدًا دوريًا.",
        ),
        el(
          "div",
          { class: "actions-row" },
          el(
            "a",
            { class: "button danger", href: "tel:123" },
            "اتصال بالإسعاف 123",
          ),
        ),
      );
      main.append(
        gridCards(
          state.catalog.emergency_services
            .filter(
              (r) =>
                (!state.markaz || r.markaz === state.markaz) &&
                matchesText([r.name, r.markaz, r.description]),
            )
            .map((r) =>
              el(
                "article",
                { class: "card" },
                el("h3", {}, r.name),
                detail("⌖", r.markaz),
                el("p", { class: "muted" }, r.description),
                el(
                  "p",
                  { class: "coverage unknown" },
                  r.verified && r.source_url
                    ? "آخر تحقق: " + r.verification_date
                    : "رقم منشور بالدليل · راجع حداثة البيانات",
                ),
                telephone(r.tel || r.number)
                  ? el(
                      "a",
                      {
                        class: "button danger",
                        href: "tel:" + telephone(r.tel || r.number),
                      },
                      "اتصال " + (r.number || r.tel),
                    )
                  : null,
              ),
            ),
        ),
      );
      return;
    }
    if (state.tab === "services")
      main.append(
        el(
          "div",
          { class: "actions-row" },
          [
            ["", "كل الخدمات"],
            ...["labs", "radiology", "pharmacies", "specialized_centers"].map(
              (k) => [k, labels[k]],
            ),
          ].map(([k, t]) =>
            button(
              t,
              () => {
                state.serviceKind = k;
                renderMain();
              },
              "button " + (state.serviceKind === k ? "primary" : "outline"),
            ),
          ),
        ),
      );
    const favs = prefs.getFavorites();
    let cards = [];
    if (["doctors", "favorites"].includes(state.tab))
      cards.push(
        ...doctorResults()
          .filter(
            (p) => state.tab !== "favorites" || favs.includes("doctor:" + p.id),
          )
          .map(doctorCard),
      );
    const facilityKinds =
      state.tab === "hospitals"
        ? ["hospitals"]
        : state.tab === "services"
          ? ["labs", "radiology", "pharmacies", "specialized_centers"].filter(
              (k) => !state.serviceKind || state.serviceKind === k,
            )
          : state.tab === "favorites"
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
              matchesText([r.name, r.address, r.markaz, r.phone]) &&
              (state.tab !== "favorites" || favs.includes(kind + ":" + r.id)),
          )
          .map((r) => facilityCard(kind, r)),
      );
    main.append(
      heading(
        {
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
  function go(tab) {
    location.hash = tab;
  }
  function route() {
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
    state.tab = [
      ...nav.map((n) => n[0]),
      "admin",
      "guidelines",
      "account",
    ].includes(hash)
      ? hash
      : "home";
    if (!["doctors", "favorites"].includes(state.tab)) {
      state.specialty = "";
      state.hospital = "";
    }
    if (!["doctors", "services", "hospitals"].includes(state.tab))
      state.coverage = "";
    state.limit = 24;
    $("#main-nav")
      .querySelectorAll("a")
      .forEach((a) => {
        const active = a.getAttribute("href") === "#" + state.tab;
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
    state.tab = "doctors";
    renderFilters();
    main.replaceChildren(heading("الجهة الطبية"));
    if (target.startsWith("doctor:")) {
      const p = providers().find((p) => "doctor:" + p.id === target);
      main.append(
        p
          ? doctorCard({ ...p, matched: p.branches })
          : empty("الجهة لم تعد متاحة."),
      );
    } else {
      const at = target.indexOf(":"),
        kind = target.slice(0, at),
        id = target.slice(at + 1),
        r = state.catalog[kind]?.find((r) => String(r.id) === id);
      main.append(r ? facilityCard(kind, r) : empty("الجهة لم تعد متاحة."));
    }
  }
  function memberForm() {
    const form = el(
      "form",
      { class: "form-stack" },
      el(
        "p",
        { class: "muted" },
        "أدخل بياناتك المسجلة لدى النقابة للاطلاع على الدليل وتقييم زيارتك. لا تحتاج إنشاء حساب.",
      ),
      !API.configured
        ? el(
            "p",
            { class: "notice warning" },
            "خدمة التحقق قيد التجهيز. لا تُرسل بياناتك حتى يتم تفعيل الاتصال المركزي.",
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
      el(
        "p",
        { class: "muted" },
        "اختر التذكّر على جهازك الشخصي فقط. لن نحفظ بيانات التحقق الثلاثة.",
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
        el("img",{src:"img/nekaba_logo.png",alt:"شعار اللجنة النقابية",width:90,height:90}),
        el("span",{class:"brand-divider","aria-hidden":"true"}),
        el("img",{src:"img/we_logo.webp",alt:"شعار WE",width:130,height:80})),
      el("p", { class: "eyebrow" }, "خدمة أعضاء النقابة · المصرية للاتصالات"),
      el("h1", {}, "مرحبًا بك في نبض النقابة"),
      el("p", {class:"login-tagline"}, "رفيقك للرعاية والخدمات النقابية — WE"),
      el("p", {class:"login-region"}, "رعايتك أقرب · الدقهلية وجميع مراكزها"),
      el("p", {class:"creator-credit"}, el("strong",{},"إعداد وتنفيذ أ / محمود العراقي"),el("a",{href:"tel:01550100025",dir:"ltr"},"01550100025")),
    );
    if (state.restoring)
      box.append(
        el(
          "p",
          { class: "notice", role: "status" },
          "جارٍ التحقق من جلسة الدخول المحفوظة…",
        ),
      );
    else
      box.append(
        memberForm(),
        el(
          "div",
          { class: "login-links" },
          button("دخول المدير", adminDialog, "text-button"),
          el("a", { href: "tel:123" }, "الإسعاف 123"),
        ),
      );
    main.replaceChildren(box);
  }
  function memberDialog() {
    const u = session();
    if (u) {
      go(u.role === "admin" ? "admin" : "account");
      return;
    }
    renderMain();
    $("#employee_code")?.focus();
  }
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
        const {profile} = await API.profile();
        const date = (value) => value ? new Intl.DateTimeFormat("ar-EG", {
          timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short",
        }).format(new Date(value)) : "لم يُسجّل بعد";
        const fields = [
          ["الاسم", profile.name], ["كود الموظف", profile.employeeCode],
          ["رقم العضوية النقابية", profile.membershipCode], ["الوظيفة", profile.jobTitle],
          ["مكان العمل", profile.workplace], ["آخر دخول إلى الدليل الطبي", date(profile.lastLoginAt)],
          ["الدخول السابق إلى الدليل الطبي", date(profile.previousLoginAt)],
        ];
        profileBox.replaceChildren(el("h2", {}, "بطاقتي النقابية"),
          el("dl", {class:"profile-grid"}, ...fields.map(([label,value]) =>
            el("div", {}, el("dt", {}, label), el("dd", {}, value || "غير مسجل لدى النقابة")))),
          el("p", {class:"muted"}, "بياناتك للعرض لك وحدك من سجل النقابة. تحديثها يتم لدى النقابة."));
      } catch (error) {
        profileBox.replaceChildren(el("h2", {}, "بطاقتي النقابية"),
          el("p", {class:"notice warning"}, error.code === "NOT_FOUND"
            ? "بطاقة بياناتك تنتظر نشر تحديث الخدمة المركزية. دخولك وتقييماتك متاحان."
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
    return el(
      "article",
      { class: "review" },
      el("strong", {}, r.target_name),
      el(
        "div",
        { class: "muted" },
        `${r.author_name || ""} · ${r.rating}/5 · ${statusText(r.status)}`,
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
        "لوحة إدارة الدليل",
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
        button("مراجعة التقييمات", adminReviewDialog, "button outline"),
        button("جودة بيانات الدليل", qualityDialog, "button outline"),
        button("تصدير بيانات الدليل", exportCatalog, "button outline"),
        button("تسجيل الخروج", logout, "button outline"),
      ),
    );
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
    main.append(kindSelect);
    const rows = state.catalog[state.adminKind].filter((r) =>
      matchesText([r.name, r.title, r.hospital, r.address]),
    );
    main.append(el("p", { class: "muted" }, `${rows.length} سجلًا`));
    const body = el(
      "tbody",
      {},
      rows.slice(0, state.limit).map((r) =>
        el(
          "tr",
          {},
          el("td", {}, r.name || r.title),
          el("td", {}, r.markaz || r.hospital || r.category || ""),
          el(
            "td",
            {},
            button(
              "تعديل",
              () => editDialog(state.adminKind, r),
              "text-button",
            ),
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
  function editDialog(kind, original) {
    const r = original || {};
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
    for (const [key, label] of textFields)
      form.append(
        field(
          label,
          key,
          ["notes", "summary", "description", "steps"].includes(key)
            ? "textarea"
            : "text",
          Array.isArray(r[key]) ? r[key].join("\n") : r[key] || "",
          {
            required: ["specialty", "hospital", "summary"].includes(key),
            maxlength: 3000,
          },
        ),
      );
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
        field("رابط الخريطة (https)", "maps_url", "url", r.maps_url || ""),
        field("رابط صورة الطبيب أو الجهة (https)", "image_url", "url", r.image_url || "", {maxlength:2000}),
        field("مصدر الصورة وحق استخدامها (https)", "image_source_url", "url", r.image_source_url || "", {maxlength:2000}),
        selectField("نوع الصورة","image_kind",[["portrait","صورة الطبيب أو الطبيبة"],["facility","صورة المقر أو المركز"],["logo","شعار الجهة"]],r.image_kind || (kind === "records" ? "portrait" : "facility")),
        el("label", {class:"remember-option"}, el("input",{type:"checkbox",name:"image_verified",checked:r.image_verified === true}), " تأكدت من هوية صاحب الصورة وحق استخدامها"),
      );
    form.save = async (data) => {
      const entity = { ...r, ...data, id };
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
      if (entity.image_url) {
        const health = await API.health();
        if (!health.capabilities?.includes("provider-images")) throw new Error("حفظ الصور يحتاج تحديث الخدمة المركزية أولًا؛ لم تُحفظ التغييرات.");
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
    const report = window.MedicalQuality.audit(state.catalog);
    let kind = "", code = "", limit = 30;
    const box = el("div", { class: "form-stack" });
    dialog("جودة بيانات الدليل", box);
    const draw = () => {
      const rows = report.issues.filter((i) => (!kind || i.kind === kind) && (!code || i.code === code));
      const kindField = selectField("القسم المراد مراجعته", "quality-kind", [["", "كل الأقسام"], ...Object.keys(report.counts).map((k) => [k, labels[k]])], kind);
      const codeField = selectField("نوع الملاحظة", "quality-code", [["", "كل الملاحظات"], ...Object.keys(report.byCode).map((c) => [c, qualityLabel(c)])], code);
      kindField.querySelector("select").addEventListener("change", (e) => { kind = e.target.value; limit = 30; draw(); });
      codeField.querySelector("select").addEventListener("change", (e) => { code = e.target.value; limit = 30; draw(); });
      box.replaceChildren(
        el("p", {class:"muted"}, `فُحص ${report.total} سجلًا؛ ${report.affected} منها يحتاج مراجعة. هذا فحص اكتمال واتساق، ولا يثبت صحة التعاقد أو عمل الهاتف.`),
        el("p", {}, "لا تُحذف التكرارات تلقائيًا. قد يكون للطبيب أكثر من فرع، وقد تشترك الجهات في رقم استقبال. تُراجع المعلومات التي مضى على تحققها 180 يومًا."),
        kindField, codeField,
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
    state.query = event.target.value;
    state.limit = 24;
    if (state.tab === "home") {
      go("doctors");
    } else renderMain();
  });
  $("#clear-search").addEventListener("click", () => {
    state.query = "";
    $("#search-input").value = "";
    renderMain();
    $("#search-input").focus();
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
    if (!document.hidden && !session()) route();
  });
  setInterval(() => {
    if (!session()) route();
  }, 60000);
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
