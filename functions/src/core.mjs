import {roadmapLabService} from './lab-roadmap.mjs';
import {visitLabService} from './lab-visit.mjs';
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import contacts from "./contacts.cjs";
import facilities from "./facility-directory.cjs";
import criteria from "./review-criteria.cjs";
import content from "./content-policy.cjs";
import {developmentLabService} from "./development-lab.mjs";
import {profileService} from "./profile-service.mjs";
import {effectiveProfile} from "./profile-requests.mjs";
import memberProfilePolicy from "./member-profile.cjs";
import recommendations from "./recommendations.cjs";
import {approvedExperiences,reviewSummary,publicReviewPage} from "./public-reviews.mjs";

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
const hasContract=r=>[r.contract_entity,r.contract_entity_id].every(v=>typeof v === "string" && !!v.trim() && !/^(null|undefined|unknown|غير محدد)$/i.test(v.trim()));
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

// Project at the server boundary: hidden entries never reach member browsers.
export function publishedDocument(r, at=Date.now()) {
  return content.visible(r,at);
}
export function memberCatalog(catalog, at=Date.now()) {
  const hospitals = catalog.hospitals || [];
  const parent = r => hospitals.find(h => (r.contract_parent_id || r.contract_entity_id) === h.id || (r.hospital && [h.name,h.short_name].includes(r.hospital)));
  const dependsOnHospital = (kind,r) => kind === "records" || (r.contract_type === "hospital" && r.contract_entity_id !== String(r.id)) || (kind === "emergency_services" && !!r.contract_parent_id);
  return Object.fromEntries(kinds.map(kind => [kind, (catalog[kind] || [])
    .filter(r => {
      if (r.contract_listing === false || r.directory_visibility === "hidden") return false;
      if (dependsOnHospital(kind,r)) {
        const hospital=parent(r);
        if (hospital?.directory_visibility === "hidden" || hospital?.contract_listing === false) return false;
        if ((r.contract_type === "hospital" || r.contract_parent_id) && !hospital) return false;
      }
      return kind !== "medical_guidelines" || publishedDocument(r,at);
    })
    .map(({publication_approval,...r}) => ({...r, service_status: r.service_status === "suspended" || (dependsOnHospital(kind,r) && parent(r)?.service_status === "suspended") ? "suspended" : "active"}))]));
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
  for(const group of facilities.reviewGroups(catalog)) {
    const branches=group.targets.map(t=>t.slice(t.indexOf(":")+1));
    for(const id of group.targets)if(map.has(id))map.get(id).branches=branches;
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
    "category",
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
    "document_type", "publication_status", "issuing_authority", "source_reference", "effective_from", "expires_at", "display_from", "display_until",
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
  const allowed = [...(fields[kind] || fields.facilities), "country_code", "governorate", "governorate_code", "network_members", "network_source", "contract_type", "contract_relationships", "source_ref", "source_row", "staff_provider_code", "branch_label", "data_notes", "image_url", "image_source_url", "image_verified", "contact_evidence", "contact_review_required", "directory_visibility", "service_status"];
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
  for (const [field, values] of [["directory_visibility",["visible","hidden"]],["service_status",["active","suspended"]]]) {
    if (Object.hasOwn(out,field) && !values.includes(out[field])) fail(400,"INVALID_ENTITY","حالة الجهة غير صالحة.");
    if (!Object.hasOwn(out,field) && previous?.[field]) out[field] = previous[field];
  }
  if (Object.hasOwn(input,"image_kind")) out.image_kind = clean(input.image_kind);
  if (Object.hasOwn(input,"avatar_type")) out.avatar_type = clean(input.avatar_type);
  if (out.avatar_type && !["doctor_male","doctor_female","clinic","pharmacy"].includes(out.avatar_type)) fail(400,"INVALID_ENTITY","نوع الرسم التعبيري غير صالح.");
  if (out.image_kind && !["logo","portrait","facility"].includes(out.image_kind)) fail(400,"INVALID_ENTITY","نوع الصورة غير صالح.");
  for (const key of ["maps_url", "source_url", "image_url", "image_source_url"]) {
    if (!out[key]) continue;
    try {
      const u = new URL(out[key]);
      if (u.protocol !== "https:") throw new Error();
    } catch {
      fail(400, "INVALID_URL", "الرابط يجب أن يبدأ بـ https://.");
    }
  }
  if (out.image_verified !== undefined && typeof out.image_verified !== "boolean") fail(400,"INVALID_ENTITY","حالة اعتماد الصورة غير صالحة.");
  if (out.image_url && (!out.image_verified || !out.image_source_url)) fail(400,"IMAGE_SOURCE_REQUIRED","أضف مصدر الصورة وأكد هوية الجهة وحق الاستخدام أولًا.");
  if (out.governorate_code && !/^EG-[A-Z]{1,3}$/.test(out.governorate_code)) fail(400,"INVALID_ENTITY","رمز المحافظة غير صالح.");
  if(out.contract_type && !["direct_we","hospital","family_network","independent"].includes(out.contract_type))fail(400,"INVALID_ENTITY","مسار التعاقد غير صالح.");
  if (out.network_members && (!Array.isArray(out.network_members) || out.network_members.some((n) => !["employee","family","retiree"].includes(n)))) fail(400,"INVALID_ENTITY","فئة الشبكة غير صالحة.");
  for (const field of ["coverage_verified", "verified"]) {
    if (out[field] !== undefined && typeof out[field] !== "boolean")
      fail(400, "INVALID_ENTITY", "حالة التحقق غير صالحة.");
    if (
      out[field] === true &&
      (!out.source_url || !(out.verified_at || out.verification_date))
    )
      fail(400, "VERIFICATION_REQUIRED", "الاعتماد يحتاج مصدرًا وتاريخ تحقق.");
  }
  if(kind === "medical_guidelines") {
    for(const key of ['issuing_authority','source_reference','verified_at','effective_from','expires_at','display_from','display_until'])if(out[key] !== undefined && typeof out[key]!=='string')fail(400,'INVALID_ENTITY','راجع حقول مصدر المحتوى وتواريخه.');
    out.document_type ||= 'instruction';
    out.publication_status ||= 'draft';
    if(!['instruction','news','bulletin'].includes(out.document_type) || !['draft','published','archived'].includes(out.publication_status)) fail(400,'INVALID_ENTITY','نوع المحتوى أو حالة النشر غير صالحة.');
    for(const key of ['verified_at','effective_from','expires_at']) if(out[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(out[key]) || !Number.isFinite(Date.parse(out[key])) || new Date(out[key]).toISOString().slice(0,10)!==out[key])) fail(400,'INVALID_ENTITY','راجع تواريخ المحتوى.');
    if(out.effective_from && out.expires_at && out.expires_at < out.effective_from) fail(400,'INVALID_ENTITY','نهاية السريان تسبق بدايته.');
    if(out.steps !== undefined && (!Array.isArray(out.steps) || out.steps.some(step=>typeof step!=='string')))fail(400,'INVALID_ENTITY','اكتب كل خطوة في سطر مستقل.');
    for(const key of ['display_from','display_until']) {
      if(out[key] && (typeof out[key]!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(out[key]) || !Number.isFinite(Date.parse(out[key])) || new Date(out[key]).toISOString()!==out[key]))fail(400,'INVALID_ENTITY','راجع توقيت عرض المحتوى.');
    }
    if(out.display_from && out.display_until && out.display_until<=out.display_from)fail(400,'INVALID_ENTITY','نهاية العرض يجب أن تأتي بعد بدايته.');
    if(out.display_from && out.expires_at && content.day(Date.parse(out.display_from))>out.expires_at)fail(400,'INVALID_ENTITY','موعد العرض يأتي بعد نهاية سريان التعليمات.');
    if(out.display_until && out.effective_from && content.day(Date.parse(out.display_until)-1)<out.effective_from)fail(400,'INVALID_ENTITY','نهاية العرض تسبق بداية السريان.');
    if(out.publication_status === 'published' && (!out.issuing_authority || !(out.source_reference || out.source_url) || !out.verified_at)) fail(400,'PUBLICATION_SOURCE_REQUIRED','النشر يحتاج الجهة المصدرة ومرجعًا وتاريخ مراجعة.');
  }
  if(kind === "hospitals" && !previous && !out.category)out.category="مستشفى استثماري";
  for(const key of ['organization_id','organization_name','network_override'])if(previous?.[key])out[key]=previous[key];
  if (kind === "records") {
    out.provider_id = previous?.provider_id || `provider_${randomUUID()}`;
    out.display_name ||= out.name;
    out.raw_name ||= out.name;
    out.category = "doctors";
    // Rebuild phone actions from the number, never from caller-supplied tel/JS URLs.
    const parsed = contacts.forEntity(out);
    out.phones = ["mobile","landline","shortcode"].flatMap((k) => parsed[k].map((n) => ({display:n, digits:n, tel:n, is_mobile:k === "mobile"})));
  }
  if (kind !== "medical_guidelines") {
    const parsed = contacts.forEntity(out);
    out.contact_groups = Object.fromEntries(["mobile","landline","shortcode"].map((k) => [k,parsed[k]]));
    out.contact_review_required = parsed.invalid.length > 0;
    // A changed contact cannot inherit publication evidence for the old number.
    const present = new Set(Object.values(out.contact_groups).flat());
    const previousEvidence = previous?.contact_evidence || [];
    out.contact_evidence = previousEvidence.filter((e) => present.has(e.number));
  }
  return out;
}

export function createService({
  source,
  store,
  sourceWriter=null,
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
    e && !memberProfilePolicy.deceased(e,now()) &&
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
      loginAt: extra.loginAt ?? new Date(now()).toISOString(),
      expiresAt,
      ...(role === "admin" ? {lastActivityAt:now()} : {}),
    });
    return { token, expiresAt, user: { name: extra.name, role },...(role === "admin" ? {idleTimeoutMs:600000,lastActivityAt:now()} : {}) };
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
        !safeEqual(fingerprint(employee), session.fingerprint) ||
        memberProfilePolicy.deceased(effectiveProfile(employee,await store.getProfileOverrides(session.subject)).values,now())
      )
        {await store.deleteSession(digest(token));fail(401, "SESSION_EXPIRED", "يرجى تسجيل الدخول مجددًا.");}
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
  const readDirectory=async()=>{const catalog=memberCatalog(await store.catalog(),now()),allowed=targets(catalog);const stats=Object.fromEntries(Object.entries(await store.getStats()).filter(([id])=>allowed.has(id)));return {catalog,stats,facilityStats:await store.getGroupedStats(facilities.reviewGroups(catalog))};};
  const profileOperations=profileService({source,store,sourceWriter,authorize,digest,rate,now});
  return {
    ...profileOperations,
    ...developmentLabService({store,authorize,now,readDirectory}),
    ...visitLabService({store,authorize,now,readDirectory}),
    ...roadmapLabService({store,authorize,now,readDirectory}),
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
      if(memberProfilePolicy.deceased(effectiveProfile(e,await store.getProfileOverrides(digest(`member|${e.id}`))).values,now()))mismatch();
      return issue(
        "member",
        e.id,
        {
          name: shortName(e.name),
          fingerprint: fingerprint(e),
          subject: digest(`member|${e.id}`),
          loginAt: now(),
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
      return { name: s.name, role: s.role, expiresAt: s.expiresAt,...(s.role === "admin" ? {idleTimeoutMs:600000,lastActivityAt:s.lastActivityAt ?? s.expiresAt-600000} : {}) };
    },
    async adminActivity(token){
      await authorize(token,"admin");
      await rate("", "admin-activity",30,digest(token));
      const at=now();
      const renewed=await store.renewAdminSession(digest(token),at,at+600000);
      if(!renewed)fail(401,"SESSION_EXPIRED","انتهت جلسة الإدارة. يرجى تسجيل الدخول مجددًا.");
      return {...renewed,idleTimeoutMs:600000};
    },
    async catalog(token) {
      const user = await authorize(token);
      const all = await store.catalog();
      const catalog = user.role === "admin" ? all : memberCatalog(all,now());
      const allowed = targets(catalog);
      const stats = Object.fromEntries(Object.entries(await store.getStats()).filter(([id]) => allowed.has(id)));
      const facilityStats=await store.getGroupedStats(facilities.reviewGroups(catalog));
      const visible=user.role==='admin'?memberCatalog(all,now()):catalog;
      const recommendationStats=user.role==='admin'?await store.getGroupedStats(facilities.reviewGroups(visible)):facilityStats;
      return {catalog, stats, profileManagement:true, recommendations:{version:1,policy:recommendations.policy,items:recommendations.build(visible,stats,recommendationStats)}, publicReviewDetails:true, contentLifecycle:true, adminBatch:true, adminBatchData:true, structuredBranches:true, facilityBranches: true, facilityStats, reviewCriteria: true, directoryState: true, contractDirectory: true, adminWorkspace: true, familyDirectory: Object.values(all).flat().some(r=>r.source_ref === "family-20261018" || r.contract_relationships?.some(c=>c.source_ref === "family-20261018"))};
    },
    async adminProfile(token) {
      const session=await authorize(token,"admin");
      const account=await source.getAccount(session.sourceId);
      return {profile:{name:String(account?.name || session.name || "مدير المنظومة").slice(0,200),email:String(account?.email || "").slice(0,254),role:"admin",accountStatus:account?.accountStatus || "active",lastLoginAt:session.loginAt || null,expiresAt:new Date(session.expiresAt).toISOString()}};
    },
    async adminOptions(token) {
      await authorize(token,"admin");
      return {options:await store.getOptions()};
    },
    async addAdminOption(token,key,body) {
      const session=await authorize(token,"admin");
      if(!["specialty","markaz","hospital",...['hospitals','labs','radiology','pharmacies','specialized_centers','medical_guidelines'].map(k=>'category_'+k)].includes(key))fail(400,"INVALID_OPTION","هذه القائمة ذات قيم تنظيمية ثابتة.");
      const value=typeof body.value === "string" ? body.value.normalize('NFKC').trim().replace(/\s+/g,' ') : "";
      if(!value || value.length>160 || /[<>\u0000-\u001f]/u.test(value))fail(400,"INVALID_OPTION","أدخل اسمًا صالحًا لا يتجاوز 160 حرفًا.");
      return {value:await store.addOption(key,value,session.sourceId,now())};
    },
    async submitReview(token, body, ip) {
      // Only this authenticated member can write the content of their review.
      const s = await authorize(token, "member");
      await rate(ip, "review", 20);
      const catalog=memberCatalog(await store.catalog(),now());
      const group=facilities.reviewGroup(facilities.reviewGroups(catalog),body.target_id);
      const target = targets(catalog).get(body.target_id);
      const branch = String(body.branch_id ?? "");
      if (!target || !target.branches.includes(branch))
        fail(400, "INVALID_TARGET", "مقر الزيارة غير متاح في الدليل.");
      if (body.visited_declared !== true)
        fail(400, "VISIT_REQUIRED", "يلزم الإقرار بالزيارة قبل التقييم.");
      if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)
        fail(400, "INVALID_RATING", "اختر تقييمًا من 1 إلى 5.");
      if (typeof body.comment !== "string" || body.comment.length > 1500)
        fail(400, "INVALID_COMMENT", "الملاحظات بحد أقصى 1500 حرف.");
      if(body.share_comment !== undefined && typeof body.share_comment!=='boolean')fail(400,'INVALID_COMMENT','اختيار مشاركة الملاحظة غير صالح.');
      let measured;
      try { measured = criteria.parse(body.criteria); }
      catch { fail(400,"INVALID_CRITERIA","اختر درجة من 1 إلى 5 للعناصر التي جربتها فقط."); }
      const id = digest(`${s.subject}|${group.target}`);
      const review = {
        id,
        target_id: group.target,
        branch_id: branch,
        target_name: target.name,
        author_id: s.subject,
        author_name: s.name,
        rating: body.rating,
        ...(measured ? {criteria:measured} : {}),
        comment: body.comment.trim(),
        share_comment:body.share_comment===true,
        visited_declared: true,
        status: "pending",
        updated_at: now(),
      };
      const saved = await store.saveReview(review,group.targets.map(target=>digest(`${s.subject}|${target}`)));
      return {
        success: true,
        ...saved,
        message: saved.changed
          ? "تم حفظ تقييمك وملاحظاتك، وسيظهر التقييم العام بعد المراجعة."
          : "تقييمك محفوظ بالفعل ولم يتغير؛ تظل حالة مراجعته كما هي.",
      };
    },
    async publicReviews(token,target,page=0) {
      await authorize(token);
      if(!Number.isInteger(page) || page<0 || page>1000)fail(400,'INVALID_PAGE','رقم الصفحة غير صالح.');
      const catalog=memberCatalog(await store.catalog(),now());
      if(typeof target!=='string' || !targets(catalog).has(target))fail(404,'NOT_FOUND','الجهة غير متاحة في الدليل.');
      await rate('', 'public-reviews',60,digest(token));
      const group=facilities.reviewGroup(facilities.reviewGroups(catalog),target);
      const rows=approvedExperiences(await store.targetReviews(group.targets),group);
      return {summary:reviewSummary(rows),...publicReviewPage(rows,page)};
    },
    async ownReviews(token) {
      const s = await authorize(token, "member");
      const groups=facilities.reviewGroups(await store.catalog());
      const rows=facilities.uniqueReviews(await store.listReviews({author_id:s.subject}),groups,true);
      return {reviews:rows.map(({author_id,...row})=>row)};
    },
    async adminReviews(token) {
      await authorize(token, "admin");
      const groups=facilities.reviewGroups(await store.catalog());
      return {reviews:facilities.uniqueReviews(await store.listReviews({}),groups).map(({author_id,...row})=>row)};
    },
    async moderateReview(token, id, body) {
      const s = await authorize(token, "admin");
      if (!["published", "hidden"].includes(body.status))
        fail(400, "INVALID_STATUS", "حالة المراجعة غير صالحة.");
      if (!Number.isInteger(body.revision) || body.revision < 1)
        fail(409, "REVIEW_CHANGED", "حدّث التطبيق وقائمة التقييمات قبل الاعتماد.");
      const previous=await store.getReview(id);
      if(!previous)fail(404,"NOT_FOUND","التقييم غير موجود.");
      if(body.status==='published' && previous.status==='pending' && (previous.revision || 1)===body.revision && previous.share_comment===true && previous.comment && body.confirm_public_comment!==true)fail(400,'PUBLIC_COMMENT_REVIEW_REQUIRED','راجع الملاحظة وأكد خلوها من بيانات شخصية أو صحية قبل نشرها للأعضاء.');
      const group=facilities.reviewGroup(facilities.reviewGroups(await store.catalog()),previous.target_id);
      const candidates=group.targets.map(target=>digest(`${previous.author_id}|${target}`));
      const result = await store.moderateReview(id, body.status, s.sourceId, now(), body.revision,candidates);
      return { success: true, ...result };
    },
    async setEntityState(token,kind,id,body) {
      const s=await authorize(token,"admin");
      const field=body.field, value=body.value;
      if (!kinds.includes(kind) || !["directory_visibility","service_status"].includes(field) ||
          !(field === "directory_visibility" ? ["visible","hidden"] : ["active","suspended"]).includes(value) ||
          !["entity","provider"].includes(body.scope) || (body.scope === "provider" && kind !== "records"))
        fail(400,"INVALID_ENTITY","طلب حالة الجهة غير صالح.");
      const rows=(await store.catalog())[kind];
      const current=rows.find(r=>String(r.id)===id);
      if (!current) fail(404,"NOT_FOUND","المقر غير موجود.");
      const selected=body.scope === "provider" ? rows.filter(r=>r.provider_id === current.provider_id) : [current];
      if (!body.versions || Array.isArray(body.versions) || typeof body.versions !== "object" ||
          Object.keys(body.versions).length !== selected.length || selected.some(r=>!Number.isInteger(body.versions[String(r.id)]) || body.versions[String(r.id)] !== (r._version || 0)))
        fail(409,"VERSION_CONFLICT","تغيرت مقار الجهة؛ حدّث الدليل وأعد المحاولة.");
      await store.mutateEntities(selected.map(r=>{
        const entity={...r,[field]:value,directory_update:{type:field === 'service_status' ? (value === 'suspended' ? 'suspended' : 'resumed') : 'updated',at:new Date(now()).toISOString()}}; delete entity._version;
        if(field === "directory_visibility" && value === "visible" && r.contract_listing === false) {
          if(body.approve_contract !== true)fail(400,"APPROVAL_REQUIRED","اعتمد جهة التعاقد أولًا لإظهار السجل.");
          if(kind !== "emergency_services" && !hasContract(r))fail(400,"CONTRACT_REQUIRED","أكمل جهة التعاقد في بيانات السجل أولًا.");
          entity.publication_approval={status:"approved",by:s.sourceId,at:new Date(now()).toISOString()};
        }
        return {kind,id:String(r.id),value:entity,expectedVersion:r._version || 0};
      }),s.sourceId,now());
      return {success:true,updated:selected.length};
    },
    async batchEntityState(token,body) {
      const session=await authorize(token,"admin");
      const {field,value,items}=body;
      if(!["directory_visibility","service_status"].includes(field) || !(field==='directory_visibility'?['visible','hidden']:['active','suspended']).includes(value) || !Array.isArray(items) || !items.length || items.length>50)
        fail(400,"INVALID_BATCH","حدد من سجل واحد إلى 50 سجلًا واختر عملية صحيحة.");
      const catalog=await store.catalog(),seen=new Set();
      const changes=items.map(item=>{
        if(!item || !kinds.includes(item.kind) || item.kind==='medical_guidelines' || typeof item.id!=='string' || !Number.isInteger(item.version))fail(400,"INVALID_BATCH","أحد السجلات المحددة غير صالح.");
        const key=item.kind+':'+item.id;if(seen.has(key))fail(400,"INVALID_BATCH","السجل مكرر داخل التحديد.");seen.add(key);
        const current=catalog[item.kind].find(r=>String(r.id)===item.id);
        if(!current || (current._version || 0)!==item.version)fail(409,"VERSION_CONFLICT","تغير أحد السجلات؛ حدّث القائمة وأعد التحديد. لم تُحفظ العملية.");
        const entity={...current,[field]:value,directory_update:{type:field==='service_status'?(value==='suspended'?'suspended':'resumed'):'updated',at:new Date(now()).toISOString()}};delete entity._version;
        if(field==='directory_visibility' && value==='visible' && current.contract_listing===false){
          if(body.approve_contract!==true)fail(400,"APPROVAL_REQUIRED","راجع واعتمد تعاقدات السجلات المحجوبة قبل الإظهار الجماعي.");
          if(item.kind!=='emergency_services' && !hasContract(entity))fail(400,"CONTRACT_REQUIRED","أكمل جهة تعاقد السجلات المحددة أولًا.");
          entity.publication_approval={status:'approved',by:session.sourceId,at:new Date(now()).toISOString()};
        }
        return {kind:item.kind,id:item.id,value:entity,expectedVersion:item.version};
      });
      if(field==='directory_visibility' && value==='visible')for(const c of changes){
        const r=c.value,linked=catalog.hospitals.find(h=>r.contract_entity_id===h.id || (r.hospital && [h.name,h.short_name].includes(r.hospital)));
        const parentId=r.contract_parent_id || (c.kind==='records'?linked?.id:(r.contract_type==='hospital'?r.contract_entity_id:null));
        if(!parentId || parentId===c.id)continue;
        const parent=changes.find(p=>p.kind==='hospitals' && p.id===parentId)?.value || catalog.hospitals.find(p=>p.id===parentId);
        if(!parent || parent.directory_visibility==='hidden' || (parent.contract_listing===false && parent.publication_approval?.status!=='approved'))fail(400,'PARENT_HIDDEN','أظهر واعتمد المستشفى التابعة أولًا، أو ضمها إلى التحديد نفسه.');
      }
      await store.mutateEntities(changes,session.sourceId,now());
      return {success:true,updated:changes.length};
    },
    async batchEntityData(token,body){
      const session=await authorize(token,'admin');
      const {items,patch}=body;
      const fields=['markaz','category','specialty','network_members'];
      if(!Array.isArray(items)||!items.length||items.length>50||!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(key=>!fields.includes(key)))fail(400,'INVALID_BATCH','اختر حقولًا مشتركة محددة ومن سجل إلى 50 سجلًا.');
      for(const key of ['markaz','category','specialty'])if(Object.hasOwn(patch,key)&&(typeof patch[key]!=='string'||!patch[key].trim()||patch[key].length>160))fail(400,'INVALID_BATCH','القيم المشتركة يجب أن تكون نصوصًا غير فارغة بحد أقصى 160 حرفًا.');
      if(Object.hasOwn(patch,'network_members') && (!Array.isArray(patch.network_members)||!patch.network_members.length||patch.network_members.some(n=>!['employee','family','retiree'].includes(n))||new Set(patch.network_members).size!==patch.network_members.length))fail(400,'INVALID_BATCH','اختر فئات مستفيدين صحيحة.');
      const supported=['records','hospitals','labs','radiology','pharmacies','specialized_centers'];
      if(items.some(item=>!item || !supported.includes(item.kind)||typeof item.id!=='string'||!Number.isInteger(item.version)))fail(400,'INVALID_BATCH','التعديل المشترك يخص الأطباء والجهات الطبية المحددة فقط.');
      if(Object.hasOwn(patch,'specialty') && items.some(item=>item.kind!=='records'))fail(400,'INVALID_BATCH','التخصص يطبق على الأطباء فقط.');
      if(Object.hasOwn(patch,'category') && (items.some(item=>item.kind==='records')||new Set(items.map(item=>item.kind)).size!==1))fail(400,'INVALID_BATCH','التصنيف يتطلب سجلات من نوع جهة واحد.');
      const catalog=await store.catalog(),seen=new Set();
      const changes=items.map(item=>{
        const key=item.kind+':'+item.id;if(seen.has(key))fail(400,'INVALID_BATCH','السجل مكرر داخل التحديد.');seen.add(key);
        const previous=catalog[item.kind].find(r=>String(r.id)===item.id);
        if(!previous || (previous._version||0)!==item.version)fail(409,'VERSION_CONFLICT','تغير أحد السجلات. حدّث القائمة وأعد المعاينة؛ لم يُحفظ أي تعديل.');
        if(Object.hasOwn(patch,'specialty') && catalog.records.some(r=>r.provider_id===previous.provider_id && r.specialty!==patch.specialty.trim() && !items.some(i=>i.kind==='records' && i.id===String(r.id))))fail(400,'PROVIDER_BRANCHES_REQUIRED','حدّد جميع مقار الطبيب لتغيير تخصصه، أو راجع تخصص كل مقر أولًا.');
        const normalized=Object.fromEntries(Object.entries(patch).map(([key,value])=>[key,typeof value==='string'?value.trim():[...value]]));
        const entity={...previous,...normalized};delete entity._version;
        if(Object.hasOwn(patch,'markaz')){entity.city=normalized.markaz;if(normalized.markaz!==previous.markaz)entity.maps_url='';}
        if(Object.hasOwn(patch,'network_members'))entity.network_override=true;
        entity.admin_reviewed_at=new Date(now()).toISOString();entity.directory_update={type:'updated',at:new Date(now()).toISOString()};
        return {kind:item.kind,id:item.id,value:entity,expectedVersion:item.version};
      });
      await store.mutateEntities(changes,session.sourceId,now(),'entity.batch.data');
      return {success:true,updated:changes.length};
    },
    async createEntityBranches(token,body) {
      const session=await authorize(token,'admin');
      const kind=body.kind,extra=body.branches;
      if(!['records','hospitals','labs','radiology','pharmacies','specialized_centers'].includes(kind) || !Array.isArray(extra) || !extra.length || extra.length>9)fail(400,'INVALID_BRANCHES','أضف من فرع إضافي إلى تسعة فروع إضافية.');
      const catalog=await store.catalog();
      const first=validateEntity(kind,body.entity);
      if(catalog[kind].some(r=>String(r.id)===String(first.id)))fail(409,'ALREADY_EXISTS','السجل موجود بالفعل. حدّث الدليل قبل إعادة الإضافة.');
      if(first.contract_type==='independent'){first.contract_entity_id=first.id;first.contract_entity=first.name;}
      const organization='org_'+randomUUID(),seen=new Set();
      const entities=[first];
      for(const branch of extra){
        if(!branch || typeof branch.address!=='string' || !branch.address.trim() || typeof branch.markaz!=='string' || !branch.markaz.trim())fail(400,'INVALID_BRANCHES','لكل فرع عنوان ومركز مستقلان.');
        const input={...first,id:'entry_'+randomUUID().replaceAll('-',''),...Object.fromEntries(['address','markaz','branch_label','maps_url','working_hours','schedule','phone','raw_phone'].filter(k=>Object.hasOwn(branch,k)).map(k=>[k,branch[k]]))};
        for(const key of ['phone','raw_phone','hotline','phone_digits','whatsapp','phones','contact_groups','contact_evidence'])delete input[key];
        input.phone=String(branch.phone || '');input.raw_phone=String(branch.raw_phone || branch.phone || '');
        input.schedule=String(branch.schedule || '');input.working_hours=String(branch.working_hours || '');input.maps_url=String(branch.maps_url || '');input.city=branch.markaz;
        if(input.contract_type==='independent'){input.contract_entity_id=input.id;input.contract_entity=input.name;}
        const entity=validateEntity(kind,input);
        if(kind==='records')entity.provider_id=first.provider_id;
        entities.push(entity);
      }
      const changes=entities.map(entity=>{
        if(typeof entity.address!=='string'||!entity.address.trim()||!entity.markaz)fail(400,'INVALID_BRANCHES','أكمل عنوان ومركز الفرع الرئيسي.');
        const key=facilities.normalize(digits(entity.address))+'|'+facilities.normalize(entity.markaz);
        if(seen.has(key))fail(400,'DUPLICATE_BRANCH','يوجد عنوان مكرر في الفروع المدخلة.');seen.add(key);
        if(entity.contact_review_required)fail(400,'INVALID_PHONE','راجع أرقام اتصال الفروع قبل الحفظ.');
        entity.organization_id=organization;entity.organization_name=first.name;
        entity.admin_reviewed_at=new Date(now()).toISOString();entity.directory_update={type:'added',at:new Date(now()).toISOString()};
        if(body.approve_contract===true){
          if(!hasContract(entity))fail(400,'CONTRACT_REQUIRED','أكمل جهة التعاقد أولًا.');
          entity.publication_approval={status:'approved',by:session.sourceId,at:new Date(now()).toISOString()};entity.directory_visibility='visible';
        }else entity.directory_visibility='hidden';
        return {kind,id:String(entity.id),value:entity,expectedVersion:0};
      });
      await store.mutateEntities(changes,session.sourceId,now(),'entity.branches.create');
      return {success:true,created:changes.map(c=>c.id)};
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
      if(kind==='medical_guidelines') {
        if(body.republish !== undefined && typeof body.republish!=='boolean')fail(400,'INVALID_ENTITY','طلب إعادة النشر غير صالح.');
        if(body.republish && !content.visible(entity,now()))fail(400,'CONTENT_NOT_ACTIVE','لإعادة النشر اختر النشر الآن ومدة عرض سارية، وراجع تواريخ السريان.');
        const firstPublish=entity.publication_status==='published' && !previous?.published_at;
        entity.publication_revision=Number(previous?.publication_revision) || 0;
        if(previous?.published_at)entity.published_at=previous.published_at;
        if(firstPublish || body.republish) {
          entity.publication_revision++;
          entity.published_at=new Date(now()).toISOString();
        }
      }
      if(previous?.publication_approval)entity.publication_approval=previous.publication_approval;
      if(body.approve_contract === true) {
        if(kind === "medical_guidelines" || (kind !== "emergency_services" && !hasContract(entity)))fail(400,"CONTRACT_REQUIRED","أكمل جهة التعاقد قبل اعتماد الإظهار.");
        entity.publication_approval={status:"approved",by:s.sourceId,at:new Date(now()).toISOString()};
        entity.directory_visibility="visible";
      }
      entity.admin_reviewed_at=new Date(now()).toISOString();
      entity.directory_update={type:previous ? 'updated' : 'added',at:new Date(now()).toISOString()};
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
