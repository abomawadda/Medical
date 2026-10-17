import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => {
  throw new ApiError(status, code, message);
};
export const digits = (value) =>
  String(value ?? "")
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
export function phone(value) {
  let p = digits(value).replace(/[\s()+.-]/g, "");
  if (p.startsWith("0020")) p = "0" + p.slice(4);
  else if (p.startsWith("20")) p = "0" + p.slice(2);
  return /^01[0125]\d{8}$/.test(p) ? p : "";
}
export const code = (value) => digits(value).trim();
export const kinds = [
  "records",
  "hospitals",
  "labs",
  "radiology",
  "pharmacies",
  "specialized_centers",
  "medical_guidelines",
  "emergency_services",
];
const mismatch = () =>
  fail(
    401,
    "IDENTITY_MISMATCH",
    "تعذر التحقق من البيانات. راجع المدخلات الثلاثة أو تواصل مع النقابة.",
  );
const shortName = (value) =>
  String(value || "عضو النقابة")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ")
    .slice(0, 60);
function safeEqual(a, b) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function targets(catalog) {
  const map = new Map();
  for (const r of catalog.records || []) {
    const id = `doctor:${r.provider_id}`;
    if (!map.has(id))
      map.set(id, { name: r.display_name || r.name, branches: [] });
    map.get(id).branches.push(String(r.id));
  }
  for (const kind of [
    "hospitals",
    "labs",
    "radiology",
    "pharmacies",
    "specialized_centers",
  ]) {
    for (const r of catalog[kind] || [])
      map.set(`${kind}:${r.id}`, { name: r.name, branches: [String(r.id)] });
  }
  return map;
}

const fields = {
  records: [
    "id",
    "provider_id",
    "name",
    "raw_name",
    "display_name",
    "specialty",
    "subspecialty",
    "hospital",
    "academic_rank",
    "clinic_type",
    "raw_phone",
    "phones",
    "address",
    "city",
    "markaz",
    "area",
    "schedule",
    "notes",
    "maps_url",
    "is_department",
    "category",
    "contract_entity",
    "contract_entity_id",
    "coverage_scope",
    "coverage_label",
    "coverage_verified",
    "source_url",
    "verified_at",
    "services",
  ],
  hospitals: [
    "id",
    "name",
    "short_name",
    "address",
    "city",
    "markaz",
    "phone",
    "phone_digits",
    "whatsapp",
    "working_hours",
    "description",
    "maps_url",
    "google_maps_query",
    "services",
    "contract_entity",
    "contract_entity_id",
    "coverage_scope",
    "coverage_label",
    "coverage_verified",
    "source_url",
    "verified_at",
  ],
  facilities: [
    "id",
    "name",
    "category",
    "address",
    "city",
    "markaz",
    "phone",
    "hotline",
    "working_hours",
    "description",
    "maps_url",
    "services",
    "contract_entity",
    "contract_entity_id",
    "coverage_scope",
    "coverage_label",
    "coverage_verified",
    "source_url",
    "verified_at",
  ],
  medical_guidelines: [
    "id",
    "title",
    "category",
    "summary",
    "steps",
    "source_url",
    "verified_at",
  ],
  emergency_services: [
    "id",
    "name",
    "number",
    "tel",
    "markaz",
    "city",
    "affiliation",
    "service_type",
    "hours",
    "is_24h",
    "address",
    "maps_url",
    "verified",
    "verification_date",
    "verification_source",
    "source_url",
    "description",
    "category",
  ],
};
function clean(value, depth = 0) {
  if (depth > 4) fail(400, "INVALID_ENTITY", "بنية البيانات غير صالحة.");
  if (typeof value === "string") {
    if (
      value.length > 3000 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)
    )
      fail(400, "INVALID_ENTITY", "حقل نصي غير صالح.");
    return value.trim();
  }
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.length <= 40)
    return value.map((v) => clean(v, depth + 1));
  if (value && typeof value === "object" && Object.keys(value).length <= 40) {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        fail(400, "INVALID_ENTITY", "بنية البيانات غير صالحة.");
      result[k] = clean(v, depth + 1);
    }
    return result;
  }
  fail(400, "INVALID_ENTITY", "نوع بيانات غير صالح.");
}
export function validateEntity(kind, input, previous) {
  if (
    !kinds.includes(kind) ||
    !input ||
    Array.isArray(input) ||
    typeof input !== "object"
  )
    fail(400, "INVALID_ENTITY", "نوع الجهة غير صالح.");
  const allowed = fields[kind] || fields.facilities;
  const out = Object.fromEntries(
    allowed
      .filter((k) => Object.hasOwn(input, k))
      .map((k) => [k, clean(input[k])]),
  );
  if (!/^[\p{L}\p{N}_-]{1,100}$/u.test(String(out.id || "")))
    fail(400, "INVALID_ENTITY", "معرف السجل غير صالح.");
  for (const field of kind === "records"
    ? ["name", "specialty", "hospital"]
    : kind === "medical_guidelines"
      ? ["title", "summary"]
      : ["name"]) {
    if (
      typeof out[field] !== "string" ||
      !out[field] ||
      out[field].length > (field === "summary" ? 3000 : 250)
    )
      fail(400, "INVALID_ENTITY", "يرجى استكمال الحقول المطلوبة.");
  }
  for (const key of ["maps_url", "source_url"]) {
    if (!out[key]) continue;
    try {
      const u = new URL(out[key]);
      if (u.protocol !== "https:") throw new Error();
    } catch {
      fail(400, "INVALID_URL", "الرابط يجب أن يبدأ بـ https://.");
    }
  }
  for (const field of ["coverage_verified", "verified"]) {
    if (out[field] !== undefined && typeof out[field] !== "boolean")
      fail(400, "INVALID_ENTITY", "حالة التحقق غير صالحة.");
    if (
      out[field] === true &&
      (!out.source_url || !(out.verified_at || out.verification_date))
    )
      fail(400, "VERIFICATION_REQUIRED", "الاعتماد يحتاج مصدرًا وتاريخ تحقق.");
  }
  if (kind === "records") {
    out.provider_id = previous?.provider_id || `provider_${randomUUID()}`;
    out.display_name ||= out.name;
    out.raw_name ||= out.name;
    out.category = "doctors";
    // Rebuild phone actions from the number, never from caller-supplied tel/JS URLs.
    out.phones = String(out.raw_phone || "")
      .split(/\s*[-،,]\s*/)
      .map((n) => ({ display: n, tel: digits(n).replace(/[^\d+]/g, "") }))
      .filter((p) => /^\+?\d{3,15}$/.test(p.tel));
  }
  return out;
}

export function createService({
  source,
  store,
  secret,
  adminAccountIds = [],
  allowedStates = [],
  memberAccessPolicy = "allowed_states",
  now = () => Date.now(),
}) {
  if (!secret || secret.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  if (!["allowed_states", "all_registered"].includes(memberAccessPolicy))
    throw new Error("Unknown member access policy");
  const digest = (value) =>
    createHmac("sha256", secret).update(String(value)).digest("hex");
  const eligible = (e) =>
    e &&
    (memberAccessPolicy === "all_registered" ||
      allowedStates.includes(String(e.memberState || "").trim()));
  const fingerprint = (e) =>
    digest(
      [code(e.jobId), phone(e.phone), digits(e.nationalId).slice(-4)].join("|"),
    );
  async function rate(ip, purpose, limit, identifier = "") {
    const bucket = Math.floor(now() / 900000);
    const key = digest(`${purpose}|${ip}|${identifier}|${bucket}`);
    if (!(await store.consumeLimit(key, limit, now() + 1800000)))
      fail(429, "RATE_LIMITED", "محاولات كثيرة. يرجى المحاولة بعد قليل.");
  }
  async function issue(role, sourceId, extra, remember = false) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt =
      now() +
      (role === "admin" ? 10 * 60000 : remember ? 30 * 86400000 : 30 * 60000);
    await store.saveSession(digest(token), {
      role,
      sourceId,
      ...extra,
      expiresAt,
    });
    return { token, expiresAt, user: { name: extra.name, role } };
  }
  async function authorize(token, role) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token || ""))
      fail(401, "SESSION_REQUIRED", "يرجى تسجيل الدخول مجددًا.");
    const session = await store.getSession(digest(token));
    if (!session || session.expiresAt <= now())
      fail(401, "SESSION_EXPIRED", "انتهت الجلسة. يرجى تسجيل الدخول مجددًا.");
    if (
      !["member", "admin"].includes(session.role) ||
      (role && session.role !== role)
    )
      fail(403, "FORBIDDEN", "هذه العملية غير متاحة لحسابك.");
    if (session.role === "member") {
      const employee = await source.getEmployee(session.sourceId);
      if (
        !eligible(employee) ||
        !safeEqual(fingerprint(employee), session.fingerprint)
      )
        fail(401, "SESSION_EXPIRED", "يرجى تسجيل الدخول مجددًا.");
    } else {
      const account = session.authMethod === "source-legacy"
        ? await source.getLegacyAdminState(session.sourceId)
        : await source.getAccount(session.sourceId);
      if (
        !adminAccountIds.includes(session.sourceId) ||
        account?.accountStatus !== "active" ||
        account?.role !== "admin" ||
        (account?.firebaseUid || "") !== session.firebaseUid ||
        (session.authMethod === "source-legacy" &&
          (!account?.credentialBinding || !safeEqual(account.credentialBinding, session.credentialBinding || "")))
      )
        fail(403, "FORBIDDEN", "حساب الإدارة غير متاح.");
    }
    return session;
  }
  return {
    async memberLogin(body, ip) {
      await rate(ip, "member-ip", 30);
      const c = code(body.employee_code),
        p = phone(body.phone),
        n = digits(body.last4).trim();
      if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(c) || !p || !/^\d{4}$/.test(n))
        mismatch();
      if (memberAccessPolicy === "allowed_states" && !allowedStates.length)
        fail(503, "NOT_CONFIGURED", "خدمة التحقق غير مفعلة حاليًا.");
      await rate("all", "member-code", 6, c);
      const matches = await source.findEmployees(c);
      if (matches.length !== 1) mismatch();
      const e = matches[0];
      const national = digits(e.nationalId).trim();
      if (
        !eligible(e) ||
        code(e.jobId) !== c ||
        phone(e.phone) !== p ||
        !/^\d{14}$/.test(national) ||
        !safeEqual(national.slice(-4), n)
      )
        mismatch();
      return issue(
        "member",
        e.id,
        {
          name: shortName(e.name),
          fingerprint: fingerprint(e),
          subject: digest(`member|${e.id}`),
        },
        body.remember === true,
      );
    },
    async adminLogin(body, ip) {
      await rate(ip, "admin", 8);
      await rate("all", "admin-account", 12);
      if (!adminAccountIds.length)
        fail(503, "ADMIN_NOT_CONFIGURED", "خدمة دخول المدير غير مفعلة حاليًا.");
      let identity;
      try {
        identity = await source.verifyAdminIdentity(body);
      } catch {
        fail(401, "ADMIN_LOGIN_FAILED", "تعذر التحقق من بيانات المدير.");
      }
      const legacy = identity.method === "source-legacy";
      if (legacy && (!adminAccountIds.includes(identity.accountId) || !identity.credentialBinding))
        fail(403, "FORBIDDEN", "حساب الإدارة غير متاح.");
      if (!legacy && (typeof identity.uid !== "string" || !identity.uid))
        fail(403, "FORBIDDEN", "حساب الإدارة غير متاح.");
      const accounts = legacy
        ? [await source.getLegacyAdminState(identity.accountId)].filter(Boolean)
        : await source.findAccounts(identity.uid);
      if (accounts.length !== 1)
        fail(403, "FORBIDDEN", "حساب الإدارة غير متاح.");
      const a = accounts[0];
      if (
        !adminAccountIds.includes(a.id) ||
        a.accountStatus !== "active" ||
        a.role !== "admin" ||
        (identity.accountId && identity.accountId !== a.id) ||
        (legacy && ((a.firebaseUid || "") !== identity.uid ||
          !safeEqual(a.credentialBinding || "", identity.credentialBinding)))
      )
        fail(403, "FORBIDDEN", "حساب الإدارة غير متاح.");
      return issue("admin", a.id, {
        name: shortName(a.name),
        firebaseUid: identity.uid || "",
        ...(legacy ? { authMethod: "source-legacy", credentialBinding: identity.credentialBinding } : {}),
      });
    },
    async logout(token) {
      if (token) await store.deleteSession(digest(token));
      return { success: true };
    },
    async session(token, role) {
      const s = await authorize(token, role);
      return { name: s.name, role: s.role, expiresAt: s.expiresAt };
    },
    async catalog(token) {
      await authorize(token);
      return { catalog: await store.catalog(), stats: await store.getStats() };
    },
    async submitReview(token, body, ip) {
      const s = await authorize(token, "member");
      await rate(ip, "review", 20);
      const target = targets(await store.catalog()).get(body.target_id);
      const branch = String(body.branch_id ?? "");
      if (!target || !target.branches.includes(branch))
        fail(400, "INVALID_TARGET", "مقر الزيارة غير متاح في الدليل.");
      if (body.visited_declared !== true)
        fail(400, "VISIT_REQUIRED", "يلزم الإقرار بالزيارة قبل التقييم.");
      if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)
        fail(400, "INVALID_RATING", "اختر تقييمًا من 1 إلى 5.");
      if (typeof body.comment !== "string" || body.comment.length > 1500)
        fail(400, "INVALID_COMMENT", "الملاحظات بحد أقصى 1500 حرف.");
      const id = digest(`${s.subject}|${body.target_id}`);
      const review = {
        id,
        target_id: body.target_id,
        branch_id: branch,
        target_name: target.name,
        author_id: s.subject,
        author_name: s.name,
        rating: body.rating,
        comment: body.comment.trim(),
        visited_declared: true,
        status: "pending",
        updated_at: now(),
      };
      await store.saveReview(review);
      return {
        success: true,
        status: "pending",
        message: "تم حفظ تقييمك وملاحظاتك، وسيظهر التقييم العام بعد المراجعة.",
      };
    },
    async ownReviews(token) {
      const s = await authorize(token, "member");
      return { reviews: await store.listReviews({ author_id: s.subject }) };
    },
    async adminReviews(token) {
      await authorize(token, "admin");
      return { reviews: await store.listReviews({}) };
    },
    async moderateReview(token, id, body) {
      const s = await authorize(token, "admin");
      if (!["published", "hidden"].includes(body.status))
        fail(400, "INVALID_STATUS", "حالة المراجعة غير صالحة.");
      await store.moderateReview(id, body.status, s.sourceId, now());
      return { success: true };
    },
    async putEntity(token, kind, id, body) {
      const s = await authorize(token, "admin");
      if (
        !kinds.includes(kind) ||
        !Number.isInteger(body.expected_version) ||
        body.expected_version < 0
      )
        fail(400, "INVALID_ENTITY", "طلب تعديل غير صالح.");
      const previous = (await store.catalog())[kind].find(
        (e) => String(e.id) === id,
      );
      const entity = validateEntity(
        kind,
        { ...body.entity, id: previous?.id || id },
        previous,
      );
      await store.mutateEntity(
        kind,
        id,
        { value: entity, deleted: false },
        body.expected_version,
        s.sourceId,
        now(),
      );
      return { success: true };
    },
    async deleteEntity(token, kind, id, body) {
      const s = await authorize(token, "admin");
      if (!kinds.includes(kind) || !Number.isInteger(body.expected_version))
        fail(400, "INVALID_ENTITY", "طلب حذف غير صالح.");
      if (!(await store.catalog())[kind].some((e) => String(e.id) === id))
        fail(404, "NOT_FOUND", "السجل غير موجود.");
      await store.mutateEntity(
        kind,
        id,
        { deleted: true },
        body.expected_version,
        s.sourceId,
        now(),
      );
      return { success: true };
    },
  };
}
