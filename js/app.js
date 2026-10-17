/* Medical v4: public directory, server-verified member reviews, separate administration. */
(() => {
  "use strict";
  const API = window.MedicalAPI,
    prefs = window.MedicalStorage,
    initial = window.INITIAL_MEDICAL_DATA || {};
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
    catalog: Object.fromEntries(
      kinds.map((k) => [
        k,
        (Array.isArray(initial[k])
          ? initial[k]
          : Object.values(initial[k] || {})
        ).map((e) => ({ ...e, _version: 0 })),
      ]),
    ),
    stats: {},
    tab: "home",
    query: "",
    markaz: "",
    specialty: "",
    hospital: "",
    coverage: "",
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
    $("#member-button").textContent = u ? u.name : "دخول الأعضاء";
  }
  function connection() {
    const n = $("#connection-status");
    n.classList.toggle("offline", !navigator.onLine);
    n.textContent = !navigator.onLine
      ? "أنت دون اتصال · يمكنك الاطلاع على النسخة المحفوظة، والتقييم يحتاج الإنترنت."
      : !API.configured
        ? "الدليل متاح للتصفح · الدخول والتقييمات المركزية قيد التجهيز."
        : state.remote
          ? "متصل · بيانات الدليل والتقييمات من الخدمة المركزية."
          : "تعرض النسخة المنشورة · تعذر تحديث البيانات المركزية حاليًا.";
  }
  async function refresh() {
    if (!API.configured) {
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
        : "التغطية تحتاج تأكيدًا من الجهة",
    );
  }
  function actionLinks(branch) {
    let tel = telephone(
      branch.phones?.find((p) => telephone(p.tel))?.tel ||
        branch.phone_digits ||
        branch.hotline ||
        branch.tel,
    );
    let label = "اتصال";
    if (!tel && branch.hospital) {
      const h = state.catalog.hospitals.find(
        (h) => h.short_name === branch.hospital || h.name === branch.hospital,
      );
      tel = telephone(h?.phone_digits);
      label = "استقبال المستشفى";
    }
    if (!tel)
      tel = String(branch.phone || "")
        .split(/\s*[-،,]\s*/)
        .map(telephone)
        .find(Boolean);
    return [
      tel
        ? el("a", { class: "button primary", href: "tel:" + tel }, label)
        : el("span", { class: "muted" }, "رقم الاتصال غير متاح"),
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
  function doctorCard(p) {
    const target = "doctor:" + p.id;
    let branch = p.matched[0];
    const details = el("div", { class: "branch-details" });
    const actions = el("div", { class: "card-actions" });
    const renderBranch = () => {
      details.replaceChildren(
        detail("▥", branch.hospital),
        detail("⌖", branch.address),
        detail("◷", branch.schedule || "المواعيد تحتاج تأكيدًا"),
        coverage(branch),
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
        el(
          "div",
          { class: "avatar", "aria-hidden": "true" },
          p.is_department ? "✚" : "♧",
        ),
        el(
          "div",
          { class: "card-info" },
          el("h3", {}, p.name),
          el("p", {}, p.specialty),
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
        el(
          "div",
          { class: "avatar", "aria-hidden": "true" },
          kind === "hospitals" ? "▥" : "✚",
        ),
        el(
          "div",
          { class: "card-info" },
          el("h3", {}, r.name),
          el("p", {}, labels[kind] + " · " + (r.markaz || r.city || "")),
        ),
        favorite(target),
      ),
      detail("⌖", r.address),
      detail("◷", r.working_hours || "المواعيد تحتاج تأكيدًا"),
      coverage(r),
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
    if (["home", "admin", "account", "guidelines"].includes(state.tab)) return;
    const areas = [
      ...new Set(
        kinds
          .flatMap((k) => state.catalog[k])
          .map((r) => r.markaz || r.city)
          .filter(Boolean),
      ),
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
          state.query = "";
          $("#search-input").value = "";
          renderFilters();
          renderMain();
        },
        "text-button",
      ),
    );
  }
  function renderHome(main) {
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
  function memberDialog() {
    const u = session();
    if (u) {
      go(u.role === "admin" ? "admin" : "account");
      return;
    }
    const form = el(
      "form",
      { class: "form-stack" },
      el(
        "p",
        { class: "muted" },
        "أدخل بياناتك المسجلة لدى النقابة لتقييم زيارتك. لا تحتاج إنشاء حساب.",
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
    );
    form.save = async (data) => {
      await API.login("member", data);
      form.reset();
      closeDialog();
      updateHeader();
      toast("تم التحقق من بيانات العضوية. يمكنك الآن تسجيل تقييمك.");
    };
    dialog("دخول أعضاء النقابة", formAction(form, "تحقق وادخل"));
    if (!API.configured)
      form.querySelector("button[type=submit]").disabled = true;
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
      field("بريد حساب المدير", "email", "email", "", {
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
      await refresh();
      renderMain();
    };
    dialog("دخول المدير", formAction(form, "دخول الإدارة"));
    if (!API.configured)
      form.querySelector("button[type=submit]").disabled = true;
  }
  function reviewDialog(target, name, branch) {
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
        "",
      ),
      field("ملاحظاتك على الزيارة", "comment", "textarea", "", {
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
    };
    dialog("تقييم الزيارة وملاحظاتك", formAction(form, "حفظ التقييم"));
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
      heading("مرحبًا، " + u.name, "هذه الجلسة مخصصة للتقييم والملاحظات فقط."),
      button("تسجيل الخروج", logout, "button outline"),
    );
    if (u.role !== "member") return;
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
          ? result.reviews.map(reviewItem)
          : [empty("لم تسجل تقييمات بعد. اختر الجهة التي زرتها من الدليل.")]),
      );
    } catch (e) {
      content.replaceChildren(empty(e.message));
    }
  }
  const statusText = (s) =>
    ({ pending: "بانتظار المراجعة", published: "منشور", hidden: "غير منشور" })[
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
            ["raw_phone", "أرقام التواصل (افصل بشرطة)"],
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
                ["description", "وصف الخدمة"],
                ["hours", "ساعات العمل"],
              ]
            : [
                ["markaz", "المركز / المدينة"],
                ["address", "العنوان"],
                ["phone", "أرقام التواصل (افصل بشرطة)"],
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
      );
    form.save = async (data) => {
      const entity = { ...r, ...data, id };
      delete entity._version;
      if (kind === "records") {
        entity.display_name = data.name;
        entity.raw_name = data.name;
      }
      if (kind === "hospitals") {
        entity.short_name = r.short_name || data.name;
        entity.phone_digits = telephone(String(data.phone).split(" - ")[0]);
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
    const box = el(
      "div",
      {},
      el("p", { class: "muted" }, "جارٍ تحميل أحدث 500 تقييم…"),
    );
    dialog("مراجعة تقييمات الزيارات", box);
    try {
      const result = await API.adminReviews();
      box.replaceChildren();
      if (!result.reviews.length) box.append(empty("لا توجد تقييمات بعد."));
      for (const r of result.reviews) {
        const item = reviewItem(r);
        item.append(
          el(
            "div",
            { class: "actions-row" },
            ...["published", "hidden"].map((status) =>
              button(
                status === "published" ? "نشر" : "إخفاء",
                async (event) => {
                  const b = event.currentTarget;
                  b.disabled = true;
                  try {
                    await API.moderate(r.id, status);
                    r.status = status;
                    await refresh();
                    adminReviewDialog();
                  } catch (e) {
                    toast(e.message);
                  } finally {
                    b.disabled = false;
                  }
                },
                "button " + (status === "published" ? "primary" : "outline"),
              ),
            ),
          ),
        );
        box.append(item);
      }
    } catch (e) {
      box.replaceChildren(empty(e.message));
    }
  }
  function exportCatalog() {
    const blob = new Blob(
      [
        JSON.stringify(
          { exported_at: new Date().toISOString(), catalog: state.catalog },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "medical-directory.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
  route();
  connection();
  refresh().catch(() => connection());
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
