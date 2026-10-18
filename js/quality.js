/* Read-only catalog checks, shared by the administrator and offline audit. */
(() => {
  "use strict";
  const kinds = ["records", "hospitals", "labs", "radiology", "pharmacies", "specialized_centers", "emergency_services"];
  const digits = (v) => String(v ?? "").replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
  const text = (v) => String(v ?? "").trim();
  const key = (v) => text(v).normalize("NFKC").replace(/[\u064B-\u065Fـ]/g, "").replace(/[إأآ]/g, "ا").replace(/\s+/g, " ").toLowerCase();
  const webURL = (v) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
  function audit(catalog, { now = Date.now(), staleDays = 180 } = {}) {
    const issues = [], counts = {}, day = 86400000;
    let total = 0;
    for (const kind of kinds) {
      const source = catalog[kind] || [];
      const rows = Array.isArray(source) ? source : Object.values(source);
      counts[kind] = rows.length;
      total += rows.length;
      const ids = new Map(), identities = new Map();
      rows.forEach((r, rowIndex) => {
        const name = text(r.display_name || r.name || r.title), id = text(r.id);
        const add = (code, message, severity = "review") => issues.push({kind, id, rowIndex, name, code, message, severity});
        if (!id) add("missing_id", "معرّف السجل غير مسجل.", "error");
        else if (ids.has(id)) add("duplicate_id", `المعرّف مكرر مع السجل ${ids.get(id) + 1} في القسم نفسه.`, "error");
        else ids.set(id, rowIndex);
        if (!name) add("missing_name", "اسم الجهة غير مسجل.", "error");
        if (kind === "records" && !text(r.specialty)) add("missing_specialty", "تخصص الطبيب غير مسجل.");
        if (!text(r.address)) add("missing_address", "العنوان غير مسجل.");
        if (!text(r.markaz || r.city)) add("missing_area", "المنطقة غير مسجلة.");
        const phones = Array.isArray(r.phones)
          ? r.phones.map((p) => p.digits || p.tel || "").filter(Boolean)
          : [r.phone, r.hotline, r.number, r.tel].filter(Boolean);
        const parsed = globalThis.MedicalContacts?.forEntity(r);
        const usable = parsed ? ["mobile","landline","shortcode"].some((k) => parsed[k].length) : phones.some((p) => digits(p).split(/\s*[-–،,;/]\s*/).some((part) => {
          const n = part.replace(/\D/g, "");
          // Accept short codes and local/international lengths; this does not verify ownership.
          return [3, 5, 7, 8, 9, 10, 11, 12, 13].includes(n.length);
        }));
        if (!usable) add("missing_contact", "لا يوجد رقم قابل للاتصال؛ راجع رقم الجهة أو استقبال المستشفى.");
        if (r.contact_review_required || parsed?.invalid.length) add("invalid_contact", "توجد أرقام تحتاج مراجعة، ولا تظهر الأرقام غير سليمة الصيغة كأزرار اتصال.");
        const date = text(r.verified_at || r.verification_date);
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
        const confirmed = kind === "emergency_services" ? r.verified === true : r.coverage_verified === true && r.coverage_scope && r.coverage_scope !== "unknown";
        if (!confirmed) add("unconfirmed", kind === "emergency_services" ? "بيانات الطوارئ لم تُؤكد بعد." : "التغطية تحتاج تأكيدًا من مصدر معتمد.");
        if (!webURL(r.source_url)) add("missing_source", "رابط مصدر موثوق للمعلومة غير مسجل بصيغة HTTPS.");
        if (!date) add("missing_date", "تاريخ التحقق غير مسجل.");
        else if (!validDate || Date.parse(date) > now + day) add("invalid_date", "تاريخ التحقق غير صالح أو يقع في المستقبل.", "error");
        else if (now - Date.parse(date) > staleDays * day) add("stale", `مر أكثر من ${staleDays} يومًا على التحقق؛ يلزم التأكيد مجددًا.`);
        // A provider can legitimately have multiple branches and specialties. Require all four fields.
        const identity = [r.name || r.display_name, r.specialty || kind, r.hospital || kind, r.address].map(key);
        if (identity[0] && identity[3]) {
          const fingerprint = identity.join("\u0000");
          if (identities.has(fingerprint)) add("possible_duplicate", `تشابه في الاسم والتخصص والمقر والعنوان مع السجل ${identities.get(fingerprint) + 1}؛ راجع قبل أي دمج.`);
          else identities.set(fingerprint, rowIndex);
        }
      });
    }
    const byCode = {};
    for (const issue of issues) byCode[issue.code] = (byCode[issue.code] || 0) + 1;
    return { generatedAt: new Date(now).toISOString(), staleDays, total, affected: new Set(issues.map((i) => `${i.kind}:${i.rowIndex}`)).size, counts, byCode, issues };
  }
  globalThis.MedicalQuality = Object.freeze({ audit });
})();
