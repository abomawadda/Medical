import test from "node:test";
import assert from "node:assert/strict";
import { createService, phone, digits, validateEntity } from "../src/core.mjs";
import { createHandler } from "../src/http.mjs";
import { fixtureStore } from "./memory-store.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("deployment guard blocks the membership project and requires an explicit Medical target", () => {
  const file = fileURLToPath(
    new URL("../../scripts/assert-medical-project.mjs", import.meta.url),
  );
  for (const env of [
    {},
    {
      GCLOUD_PROJECT: "source",
      MEDICAL_DEPLOY_PROJECT: "source",
      MYNEKABA_PROJECT_ID: "source",
    },
    {
      GCLOUD_PROJECT: "wrong",
      MEDICAL_DEPLOY_PROJECT: "medical",
      MYNEKABA_PROJECT_ID: "source",
    },
  ])
    assert.notEqual(spawnSync(process.execPath, [file], { env }).status, 0);
  assert.equal(
    spawnSync(process.execPath, [file], {
      env: {
        GCLOUD_PROJECT: "medical",
        MEDICAL_DEPLOY_PROJECT: "medical",
        MYNEKABA_PROJECT_ID: "source",
      },
    }).status,
    0,
  );
});

const seed = {
  records: [
    {
      id: 1,
      provider_id: "p1",
      name: "طبيب اختبار",
      specialty: "باطنة",
      hospital: "مستشفى اختبار",
    },
  ],
  hospitals: [{ id: "h1", name: "مستشفى اختبار" }],
};
function setup(options = {}) {
  let time = 1700000000000;
  const employees = [
    {
      id: "source-member",
      name: "عضو اختبار محلي",
      jobId: "00123",
      phone: "01012345678",
      nationalId: "29901010101234",
      memberState: "نشط",
      membershipId: "UNION-123", jobTitle: "مهندس اختبار", workplace: "سنترال اختبار",
    },
  ];
  const accounts = [
    {
      id: "source-admin",
      name: "مدير الاختبار",
      firebaseUid: "admin-uid",
      role: "admin",
      accountStatus: "active",
    },
  ];
  let lookups = 0;
  const source = Object.freeze({
    findEmployees: async (c) => {
      lookups++;
      return employees.filter((e) => e.jobId === c);
    },
    getEmployee: async (id) => employees.find((e) => e.id === id),
    getMemberProfile: async (id) => employees.find((e) => e.id === id),
    findAccounts: async (uid) => accounts.filter((a) => a.firebaseUid === uid),
    getAccount: async (id) => accounts.find((a) => a.id === id),
    verifyAdminIdentity: async (b) => {
      if (b.id_token !== "valid-fixture-token") throw new Error("bad identity");
      return { uid: "admin-uid" };
    },
  });
  const store = fixtureStore(seed);
  const service = createService({
    source,
    store,
    secret: "test-only-secret-not-valid-in-production-12345",
    adminAccountIds: ["source-admin"],
    allowedStates: ["نشط"],
    now: () => time,
    ...options,
  });
  return {
    service,
    store,
    source,
    employees,
    accounts,
    lookups: () => lookups,
    advance: (n) => (time += n),
  };
}
const credentials = {
  employee_code: "00123",
  phone: "01012345678",
  last4: "1234",
};
const review = {
  target_id: "doctor:p1",
  branch_id: "1",
  rating: 4,
  comment: "تجربة اختبار",
  visited_declared: true,
};
const member = async (f) =>
  (await f.service.memberLogin(credentials, "member-ip")).token;
const admin = async (f) =>
  (await f.service.adminLogin({ id_token: "valid-fixture-token" }, "admin-ip"))
    .token;

test("all registered members can enter regardless of state but still require matching identity and a live source record", async () => {
  for (const state of ["نشط", "متقاعد", "موقوف", "", undefined]) {
    const f = setup({ memberAccessPolicy: "all_registered", allowedStates: [] });
    f.employees[0].memberState = state;
    await assert.rejects(
      () => f.service.memberLogin({ ...credentials, last4: "0000" }, "bad"),
      (e) => e.status === 401,
    );
    const token = await member(f);
    assert.equal((await f.service.session(token)).role, "member");
    f.employees[0].phone = "01112345678";
    await assert.rejects(() => f.service.session(token), (e) => e.status === 401);
    f.employees[0].phone = credentials.phone;
    f.employees.length = 0;
    await assert.rejects(() => f.service.session(token), (e) => e.status === 401);
    await assert.rejects(() => member(f), (e) => e.status === 401);
  }
});

test("unconfigured restricted membership and unknown policies cannot enable login", async () => {
  const f = setup({ allowedStates: [] });
  await assert.rejects(() => member(f), (e) => e.status === 503);
  assert.throws(() => setup({ memberAccessPolicy: "all" }), /Unknown member access policy/);
});

test("Arabic/Persian digits and full international phone normalization preserve identity", () => {
  assert.equal(digits("٠٠۱۲۳"), "00123");
  assert.equal(phone("+20 1012345678"), "01012345678");
  assert.equal(phone("٨"), "");
  assert.equal(phone("01012345678abc"), "");
});
test("catalog and session restoration require a live server session", async () => {
  const f = setup();
  await assert.rejects(
    () => f.service.catalog(),
    (e) => e.status === 401,
  );
  const token = await member(f);
  const identity = await f.service.session(token);
  assert.equal(identity.role, "member");
  assert.ok(Number.isFinite(identity.expiresAt));
  assert.equal((await f.service.catalog(token)).catalog.records.length, 1);
  await f.service.logout(token);
  await assert.rejects(
    () => f.service.catalog(token),
    (e) => e.status === 401,
  );
});
test("remembered member sessions last 30 days but still enforce source eligibility", async () => {
  const f = setup();
  const normal = await f.service.memberLogin(credentials, "normal");
  const kept = await f.service.memberLogin(
    { ...credentials, remember: true },
    "remembered",
  );
  assert.equal(kept.expiresAt - normal.expiresAt, 30 * 86400000 - 30 * 60000);
  f.advance(31 * 60000);
  assert.equal((await f.service.session(kept.token)).role, "member");
  await assert.rejects(
    () => f.service.session(normal.token),
    (e) => e.status === 401,
  );
  f.employees[0].memberState = "موقوف";
  await assert.rejects(
    () => f.service.catalog(kept.token),
    (e) => e.status === 401,
  );
  f.employees[0].memberState = "نشط";
  f.advance(30 * 86400000);
  await assert.rejects(
    () => f.service.session(kept.token),
    (e) => e.status === 401,
  );
});
test("administrator sessions remain short even when remember is requested", async () => {
  const f = setup();
  const result = await f.service.adminLogin(
    { id_token: "valid-fixture-token", remember: true },
    "admin",
  );
  f.advance(11 * 60000);
  await assert.rejects(
    () => f.service.session(result.token),
    (e) => e.status === 401,
  );
});
test("three matching fields create a member session with no source identifiers or credentials", async () => {
  const f = setup();
  const result = await f.service.memberLogin(
    { employee_code: "٠٠١٢٣", phone: "+20 1012345678", last4: "۱۲۳۴" },
    "ip",
  );
  assert.equal(result.user.role, "member");
  const response = JSON.stringify(result);
  for (const value of [
    "source-member",
    "00123",
    "01012345678",
    "1234",
    "29901010101234",
  ])
    assert.ok(!response.includes(value));
  assert.equal(f.store.sessions.size, 1);
  assert.equal(f.source.saveEmployee, undefined);
});
for (const bad of [
  { employee_code: "123" },
  { phone: "8" },
  { last4: "0000" },
  { phone: "01012345678-extra" },
  { last4: "١٢٣" },
])
  test("rejects mismatching identity " + JSON.stringify(bad), async () => {
    const f = setup();
    await assert.rejects(
      () => f.service.memberLogin({ ...credentials, ...bad }, "ip"),
      (e) => e.status === 401,
    );
    assert.equal(f.store.sessions.size, 0);
  });
test("duplicate membership and inactive membership fail closed", async () => {
  const f = setup();
  f.employees.push({ ...f.employees[0], id: "duplicate" });
  await assert.rejects(
    () => member(f),
    (e) => e.status === 401,
  );
  f.employees.pop();
  f.employees[0].memberState = "موقوف";
  await assert.rejects(
    () => member(f),
    (e) => e.status === 401,
  );
});
test("a source outage cannot create a session", async () => {
  const f = setup();
  const service = createService({
    source: {
      ...f.source,
      findEmployees: async () => {
        throw new Error("source offline");
      },
    },
    store: f.store,
    secret: "test-only-secret-not-valid-in-production",
    allowedStates: ["نشط"],
  });
  await assert.rejects(() => service.memberLogin(credentials, "ip"));
  assert.equal(f.store.sessions.size, 0);
});
test("rate limit applies across IPs for the same employee code", async () => {
  const f = setup();
  for (let i = 0; i < 6; i++)
    await assert.rejects(
      () => f.service.memberLogin({ ...credentials, last4: "0000" }, "ip-" + i),
      (e) => e.status === 401,
    );
  await assert.rejects(
    () => f.service.memberLogin(credentials, "new-ip"),
    (e) => e.status === 429,
  );
  assert.equal(f.lookups(), 6);
});
test("client role spoofing never grants administration", async () => {
  const f = setup();
  const t = await member(f);
  await assert.rejects(
    () =>
      f.service.putEntity(t, "records", "1", {
        entity: seed.records[0],
        expected_version: 0,
        role: "admin",
      }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => f.service.putEntity("true", "records", "1", {}),
    (e) => e.status === 401,
  );
  assert.equal(f.store.overlays.size, 0);
});
test("only the approved active admin account receives an administrative session", async () => {
  const f = setup();
  await admin(f);
  f.accounts[0].role = "member";
  await assert.rejects(
    () => admin(f),
    (e) => e.status === 403,
  );
  f.accounts[0].role = "admin";
  f.accounts[0].id = "unapproved-admin";
  await assert.rejects(
    () => admin(f),
    (e) => e.status === 403,
  );
});
test("expired, revoked and changed-membership sessions cannot write", async () => {
  const f = setup();
  const t = await member(f);
  f.employees[0].phone = "01112345678";
  await assert.rejects(
    () => f.service.submitReview(t, review, "ip"),
    (e) => e.status === 401,
  );
  f.employees[0].phone = credentials.phone;
  f.advance(31 * 60000);
  await assert.rejects(
    () => f.service.submitReview(t, review, "ip"),
    (e) => e.status === 401,
  );
  const fresh = await member(f);
  await f.service.logout(fresh);
  await assert.rejects(
    () => f.service.submitReview(fresh, review, "ip"),
    (e) => e.status === 401,
  );
});
test("review author comes from the server; retries update one review; no invented stars", async () => {
  const f = setup();
  const t = await member(f);
  assert.deepEqual((await f.service.catalog(t)).stats, {});
  await f.service.submitReview(
    t,
    {
      ...review,
      employee_id: "someone-else",
      author_id: "forged",
      role: "admin",
    },
    "ip",
  );
  const first = [...f.store.reviews.values()][0];
  assert.notEqual(first.author_id, "forged");
  assert.equal(first.status, "pending");
  await f.service.submitReview(t, { ...review, rating: 5 }, "ip");
  assert.equal(f.store.reviews.size, 1);
  assert.equal((await f.service.ownReviews(t)).reviews[0].rating, 5);
  assert.deepEqual((await f.service.catalog(t)).stats, {});
});
test("review requires a live target, matching branch, visit declaration and valid score", async () => {
  const f = setup();
  const t = await member(f);
  for (const bad of [
    { target_id: "doctor:missing" },
    { branch_id: "another-branch" },
    { visited_declared: false },
    { rating: 6 },
    { rating: 4.5 },
    { comment: "x".repeat(1501) },
  ])
    await assert.rejects(
      () => f.service.submitReview(t, { ...review, ...bad }, "ip"),
      (e) => e.status === 400,
    );
});
test("a different member cannot read another members notes", async () => {
  const f = setup();
  const t = await member(f);
  await f.service.submitReview(t, review, "ip");
  f.employees.push({ ...f.employees[0], id: "second", jobId: "00234" });
  const t2 = (
    await f.service.memberLogin(
      { ...credentials, employee_code: "00234" },
      "another-ip",
    )
  ).token;
  assert.equal((await f.service.ownReviews(t2)).reviews.length, 0);
  await assert.rejects(
    () => f.service.adminReviews(t2),
    (e) => e.status === 403,
  );
});
test("publishing/hiding/updating a review changes actual aggregate values", async () => {
  const f = setup();
  const t = await member(f),
    a = await admin(f);
  await f.service.submitReview(t, review, "ip");
  const id = [...f.store.reviews.keys()][0];
  await f.service.moderateReview(a, id, { status: "published", revision: f.store.reviews.get(id).revision });
  assert.deepEqual((await f.service.catalog(t)).stats["doctor:p1"], {
    count: 1,
    average: 4,
  });
  await f.service.submitReview(t, { ...review, rating: 2 }, "ip");
  assert.deepEqual((await f.service.catalog(t)).stats, {});
  await f.service.moderateReview(a, id, { status: "published", revision: f.store.reviews.get(id).revision });
  assert.equal((await f.service.catalog(t)).stats["doctor:p1"].average, 2);
  await f.service.moderateReview(a, id, { status: "hidden", revision: f.store.reviews.get(id).revision });
  assert.deepEqual((await f.service.catalog(t)).stats, {});
});
test("admin CRUD is shared and refuses stale edits; role revocation takes effect", async () => {
  const f = setup();
  const a = await admin(f);
  await f.service.putEntity(a, "records", "1", {
    entity: { ...seed.records[0], name: "اسم محدث" },
    expected_version: 0,
  });
  assert.equal(
    (await f.service.catalog(a)).catalog.records[0].name,
    "اسم محدث",
  );
  assert.equal(
    (await f.service.catalog(a)).catalog.records[0].provider_id,
    "p1",
  );
  await assert.rejects(
    () =>
      f.service.putEntity(a, "records", "1", {
        entity: seed.records[0],
        expected_version: 0,
      }),
    (e) => e.status === 409,
  );
  await f.service.deleteEntity(a, "records", "1", { expected_version: 1 });
  assert.equal((await f.service.catalog(a)).catalog.records.length, 0);
  f.accounts[0].accountStatus = "disabled";
  await assert.rejects(
    () =>
      f.service.putEntity(a, "records", "2", {
        entity: seed.records[0],
        expected_version: 0,
      }),
    (e) => e.status === 403,
  );
});
test("verified coverage needs a source and date; dangerous URL schemes rejected", () => {
  for (const body of [
    { name: "test", source_url: "javascript:alert(1)" },
    { name: "test", coverage_verified: true },
  ])
    assert.throws(() => validateEntity("hospitals", { id: "h2", ...body }));
});
function response() {
  return {
    headers: {},
    statusCode: 200,
    set(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    },
  };
}
function request(path, method = "GET", body = {}, extra = {}) {
  return {
    path,
    method,
    body,
    ip: "test-ip",
    get: (name) =>
      ({
        origin: "https://abomawadda.github.io",
        "content-type": "application/json",
        ...extra,
      })[name],
    is: (t) => t === "application/json",
  };
}
test("HTTP CORS, generic outage responses and no credential logging", async () => {
  const errors = [];
  const handler = createHandler({
    getService: () => {
      throw new Error("sensitive-provider-error");
    },
    origins: ["https://abomawadda.github.io"],
    logger: { error: (...args) => errors.push(args) },
  });
  const denied = response();
  await handler(
    request("/v1/member/session", "POST", credentials, {
      origin: "https://evil.example",
    }),
    denied,
  );
  assert.equal(denied.statusCode, 403);
  const res = response();
  await handler(request("/v1/member/session", "POST", credentials), res);
  assert.equal(res.statusCode, 503);
  assert.ok(
    !JSON.stringify([res.body, errors]).includes("sensitive-provider-error"),
  );
  assert.ok(!JSON.stringify(errors).includes(credentials.phone));
});
test("HTTP routes enforce authorization rather than UI state", async () => {
  const f = setup();
  const handler = createHandler({
    getService: () => f.service,
    origins: ["https://abomawadda.github.io"],
  });
  const res = response();
  await handler(
    request(
      "/v1/admin/entities/records/1",
      "DELETE",
      { expected_version: 0 },
      { authorization: "Bearer true" },
    ),
    res,
  );
  assert.equal(res.statusCode, 401);
  const preflight = response();
  await handler(request("/v1/reviews", "OPTIONS"), preflight);
  assert.equal(preflight.statusCode, 204);
  assert.equal(
    preflight.headers["Access-Control-Allow-Origin"],
    "https://abomawadda.github.io",
  );
});


test("member profile exposes only the current member display fields and real Medical login history", async () => {
  const f = setup();
  const token = await member(f);
  const first = (await f.service.memberProfile(token)).profile;
  assert.equal(first.name, f.employees[0].name);
  assert.equal(first.employeeCode, "00123");
  assert.equal(first.membershipCode, "UNION-123");
  assert.equal(first.jobTitle, "مهندس اختبار");
  assert.equal(first.workplace, "سنترال اختبار");
  assert.ok(first.lastLoginAt);
  assert.equal(first.previousLoginAt, null);
  for (const key of ["nationalId", "phone", "sourceId", "passwordHash", "fingerprint"])
    assert.ok(!(key in first));
  await f.service.session(token);
  assert.deepEqual((await f.service.memberProfile(token)).profile, first);
  f.advance(1000);
  const later = await member(f);
  const history = (await f.service.memberProfile(later)).profile;
  assert.equal(history.lastLoginAt, first.lastLoginAt + 1000);
  assert.equal(history.previousLoginAt, first.lastLoginAt);
  await assert.rejects(() => f.service.memberProfile(), (e) => e.status === 401);
  const adminToken = await admin(f);
  await assert.rejects(() => f.service.memberProfile(adminToken), (e) => e.status === 403);
});

test("review versions are approved once, retries do not duplicate auditing, and only author changes reopen moderation", async () => {
  const f=setup(), t=await member(f), a=await admin(f);
  await f.service.submitReview(t, review, "review-ip");
  const id=[...f.store.reviews.keys()][0];
  const published=await f.service.moderateReview(a,id,{status:"published",revision:1});
  assert.equal(published.changed,true);
  const audits=f.store.audit.length;
  const retry=await f.service.moderateReview(a,id,{status:"published",revision:1});
  assert.equal(retry.changed,false);
  assert.equal(f.store.audit.length,audits);
  const same=await f.service.submitReview(t,review,"same");
  assert.equal(same.changed,false);
  assert.equal(same.status,"published");
  await f.service.moderateReview(a,id,{status:"hidden",revision:1});
  await assert.rejects(() => f.service.moderateReview(a,id,{status:"published",revision:1}), (e) => e.code === "REVIEW_ALREADY_DECIDED");
  await assert.rejects(() => f.service.submitReview(a,review,"admin-edit"), (e) => e.status === 403);
  await f.service.submitReview(t,{...review,comment:"تعديل العضو"},"edit");
  assert.equal(f.store.reviews.get(id).revision,2);
  assert.equal(f.store.reviews.get(id).status,"pending");
  await assert.rejects(() => f.service.moderateReview(a,id,{status:"published",revision:1}), (e) => e.code === "REVIEW_CHANGED");
  await assert.rejects(() => f.service.moderateReview(a,id,{status:"published"}), (e) => e.status === 409);
  await f.service.moderateReview(a,id,{status:"published",revision:2});
  assert.equal(f.store.reviews.get(id).status,"published");
});


test("member profiles and login activity are isolated between members", async () => {
  const f=setup(), first=await member(f);
  f.employees.push({...f.employees[0],id:"other-member",jobId:"00234",name:"عضو آخر",membershipId:"OTHER"});
  const second=(await f.service.memberLogin({...credentials,employee_code:"00234"},"other-ip")).token;
  assert.equal((await f.service.memberProfile(first)).profile.membershipCode,"UNION-123");
  assert.equal((await f.service.memberProfile(second)).profile.membershipCode,"OTHER");
  const before=(await f.service.memberProfile(first)).profile;
  f.advance(1000);
  await f.service.memberLogin({...credentials,employee_code:"00234"},"other-ip-2");
  assert.deepEqual((await f.service.memberProfile(first)).profile,before);
});

test("directory hiding is server enforced, retains admin access and blocks hidden review targets", async () => {
  const f=setup(), a=await admin(f), m=await member(f);
  await assert.rejects(()=>f.service.putEntity(m,"records","1",{entity:{...seed.records[0],directory_visibility:"hidden"},expected_version:0}),e=>e.status===403);
  await f.service.putEntity(a,"records","1",{entity:{...seed.records[0],directory_visibility:"hidden"},expected_version:0});
  assert.equal((await f.service.catalog(m)).catalog.records.length,0);
  assert.equal((await f.service.catalog(a)).catalog.records[0].directory_visibility,"hidden");
  await assert.rejects(()=>f.service.submitReview(m,review,"review-hidden"),e=>e.code==="INVALID_TARGET");
  await assert.rejects(()=>f.service.putEntity(a,"records","1",{entity:seed.records[0],expected_version:0}),e=>e.status===409);
  await f.service.putEntity(a,"records","1",{entity:{...seed.records[0],directory_visibility:"visible"},expected_version:1});
  assert.equal((await f.service.catalog(m)).catalog.records.length,1);
});

test("hospital suspension or hiding affects only its dependent doctor branches and is reversible", async () => {
  const f=setup(), a=await admin(f), m=await member(f);
  await f.service.putEntity(a,"records","independent",{entity:{...seed.records[0],id:"independent",hospital:"مستشفى أخرى",provider_id:"p1"},expected_version:0});
  await f.service.putEntity(a,"hospitals","h1",{entity:{...seed.hospitals[0],service_status:"suspended"},expected_version:0});
  let catalog=(await f.service.catalog(m)).catalog;
  assert.equal(catalog.hospitals[0].service_status,"suspended");
  assert.equal(catalog.records.find(r=>r.id===1).service_status,"suspended");
  assert.equal(catalog.records.find(r=>r.id==="independent").service_status,"active");
  await f.service.putEntity(a,"hospitals","h1",{entity:{...seed.hospitals[0],directory_visibility:"hidden"},expected_version:1});
  catalog=(await f.service.catalog(m)).catalog;
  assert.equal(catalog.hospitals.length,0);
  assert.equal(catalog.records.length,1);
  assert.equal(catalog.records[0].id,"independent");
  await f.service.putEntity(a,"hospitals","h1",{entity:{...seed.hospitals[0],directory_visibility:"visible",service_status:"active"},expected_version:2});
  assert.equal((await f.service.catalog(m)).catalog.records.length,2);
  assert.throws(()=>validateEntity("hospitals",{...seed.hospitals[0],service_status:"broken"}),e=>e.code==="INVALID_ENTITY");
});

test("all current doctor branches change atomically; stale versions cannot partially hide a doctor", async () => {
  const f=setup(), a=await admin(f), m=await member(f);
  await f.store.mutateEntity("records","other",{value:{...seed.records[0],id:"other",hospital:"مستشفى أخرى"},deleted:false},0,"fixture",Date.now());
  const body={field:"directory_visibility",value:"hidden",scope:"provider",versions:{"1":0,other:1}};
  await assert.rejects(()=>f.service.setEntityState(m,"records","1",body),e=>e.status===403);
  await assert.rejects(()=>f.service.setEntityState(a,"records","1",{...body,versions:{"1":0,other:0}}),e=>e.status===409);
  assert.equal((await f.service.catalog(m)).catalog.records.length,2);
  assert.equal((await f.service.setEntityState(a,"records","1",body)).updated,2);
  assert.equal((await f.service.catalog(m)).catalog.records.length,0);
  const rows=(await f.service.catalog(a)).catalog.records;
  assert.ok(rows.every(r=>r.directory_visibility === "hidden"));
  await assert.rejects(()=>f.service.setEntityState(a,"records","1",body),e=>e.status===409);
  await f.service.setEntityState(a,"records","1",{...body,value:"visible",versions:{"1":1,other:2}});
  assert.equal((await f.service.catalog(m)).catalog.records.length,2);
});

test('instruction publication requires an authority, reference and valid dates; drafts and inactive documents stay out of member catalogs', async()=>{
  const f=setup(),a=await admin(f),m=await member(f);
  const entity={title:'إجراء اختبار',summary:'نص اختبار',document_type:'instruction',publication_status:'published'};
  await assert.rejects(()=>f.service.putEntity(a,'medical_guidelines','guide_test',{entity,expected_version:0}),e=>e.code==='PUBLICATION_SOURCE_REQUIRED');
  await f.service.putEntity(a,'medical_guidelines','guide_test',{entity:{...entity,publication_status:'draft'},expected_version:0});
  assert.equal((await f.service.catalog(m)).catalog.medical_guidelines.length,0);
  assert.equal((await f.service.catalog(a)).catalog.medical_guidelines.length,1);
  const source={issuing_authority:'جهة اختبار',source_reference:'مرجع اختبار',verified_at:'2023-11-14'};
  for(const dates of [{effective_from:'2023-02-30'},{effective_from:'2023-12-01',expires_at:'2023-11-01'}]) await assert.rejects(()=>f.service.putEntity(a,'medical_guidelines','guide_test',{entity:{...entity,...source,...dates},expected_version:1}),e=>e.code==='INVALID_ENTITY');
  await f.service.putEntity(a,'medical_guidelines','guide_test',{entity:{...entity,...source,effective_from:'2023-11-16'},expected_version:1});
  assert.equal((await f.service.catalog(m)).catalog.medical_guidelines.length,0);
  f.advance(24*60*60*1000);
  const nextMember=await member(f),nextAdmin=await admin(f);
  assert.equal((await f.service.catalog(nextMember)).catalog.medical_guidelines.length,1);
  await f.service.putEntity(nextAdmin,'medical_guidelines','guide_test',{entity:{...entity,...source,expires_at:'2023-11-14'},expected_version:2});
  assert.equal((await f.service.catalog(nextMember)).catalog.medical_guidelines.length,0);
});
test('directory update dates and types come from the server; hidden entries never appear in member updates', async()=>{
  const f=setup(),a=await admin(f),m=await member(f);
  await f.service.putEntity(a,'hospitals','new_hospital',{entity:{name:'مستشفى اختبار جديد',directory_update:{type:'suspended',at:'2099-01-01'}},expected_version:0});
  let row=(await f.service.catalog(m)).catalog.hospitals.find(r=>r.id==='new_hospital');
  assert.deepEqual(row.directory_update,{type:'added',at:'2023-11-14T22:13:20.000Z'});
  assert.equal(row.admin_reviewed_at,'2023-11-14T22:13:20.000Z');
  await f.service.setEntityState(a,'hospitals','new_hospital',{field:'service_status',value:'suspended',scope:'entity',versions:{new_hospital:1}});
  row=(await f.service.catalog(m)).catalog.hospitals.find(r=>r.id==='new_hospital');assert.equal(row.directory_update.type,'suspended');
  await f.service.setEntityState(a,'hospitals','new_hospital',{field:'directory_visibility',value:'hidden',scope:'entity',versions:{new_hospital:2}});
  assert.ok(!(await f.service.catalog(m)).catalog.hospitals.some(r=>r.id==='new_hospital'));
});

test("measured reviews retain private criteria, unchanged saves are idempotent and changed criteria reopen author revision",async()=>{
 const f=setup(),t=await member(f),a=await admin(f);
 const submitted={...review,criteria:{service:4,reception:3}};
 const first=await f.service.submitReview(t,submitted,'criteria-ip');
 const saved=[...f.store.reviews.values()][0];
 assert.deepEqual(saved.criteria,{reception:3,service:4});
 await f.service.moderateReview(a,saved.id,{status:'published',revision:1});
 assert.equal((await f.service.submitReview(t,{...submitted,criteria:{reception:3,service:4}},'criteria-ip')).changed,false);
 assert.equal(f.store.reviews.get(saved.id).revision,1);
 assert.equal((await f.service.catalog(t)).reviewCriteria,true);
 assert.deepEqual((await f.service.catalog(t)).stats['doctor:p1'],{count:1,average:4});
 assert.ok(!JSON.stringify((await f.service.catalog(t)).stats).includes('reception'));
 await f.service.submitReview(t,{...submitted,criteria:{reception:5,service:4}},'criteria-ip');
 assert.equal(f.store.reviews.get(saved.id).revision,2);
 assert.equal(f.store.reviews.get(saved.id).status,'pending');
 await assert.rejects(()=>f.service.moderateReview(a,saved.id,{status:'published',revision:1}),e=>e.code==='REVIEW_CHANGED');
 for(const criteria of [{unknown:5},{waiting:9},{reception:'5'},{}])await assert.rejects(()=>f.service.submitReview(t,{...review,criteria},'criteria-ip'),e=>e.code==='INVALID_CRITERIA');
 assert.equal((await f.service.ownReviews(t)).reviews[0].criteria.reception,5);
});

test('a member reviewing staff/family aliases edits one logical branch experience and grouped stats count it once',async()=>{
 const data=JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../data.json',import.meta.url),'utf8'));
 const f=setup();for(const id of ['staff_2378','family_20261018_068'])await f.store.mutateEntity('labs',id,{value:data.labs.find(r=>r.id===id)},0,'fixture',1);
 const t=await member(f),a=await admin(f);
 const body={target_id:'labs:family_20261018_068',branch_id:'family_20261018_068',rating:4,comment:'تجربة فرع اختبار',visited_declared:true};
 await f.service.submitReview(t,body,'alias-test');
 const original=[...f.store.reviews.values()][0];assert.equal(original.target_id,'labs:staff_2378');
 await f.service.moderateReview(a,original.id,{status:'published',revision:1});
 assert.equal((await f.service.submitReview(t,{...body,target_id:'labs:staff_2378',branch_id:'staff_2378'},'alias-test')).changed,false);
 assert.equal(f.store.reviews.size,1);
 const response=await f.service.catalog(t);assert.deepEqual(response.facilityStats['labs:staff_2378'],{count:1,average:4});
 assert.deepEqual(response.facilityStats['labs:family_20261018_068'],{count:1,average:4});
 assert.ok(!JSON.stringify(response.facilityStats).includes('author_id'));
 f.advance(1);
 await f.service.submitReview(t,{...body,rating:2},'alias-test');
 assert.equal(f.store.reviews.size,1);assert.equal((await f.service.ownReviews(t)).reviews[0].revision,2);
 assert.deepEqual((await f.service.catalog(t)).facilityStats['labs:staff_2378'],{count:0,average:null});
});

test('batch states require an administrator and exact fresh versions, apply atomically, and never implicitly approve contracts',async()=>{
 const f=setup(),a=await admin(f),m=await member(f);
 const body={field:'service_status',value:'suspended',items:[{kind:'records',id:'1',version:0},{kind:'hospitals',id:'h1',version:0}]};
 await assert.rejects(()=>f.service.batchEntityState(m,body),e=>e.status===403);
 await assert.rejects(()=>f.service.batchEntityState(a,{...body,items:[...body.items,{kind:'records',id:'1',version:0}]}),e=>e.code==='INVALID_BATCH');
 await assert.rejects(()=>f.service.batchEntityState(a,{...body,items:[body.items[0],{kind:'hospitals',id:'h1',version:9}]}),e=>e.code==='VERSION_CONFLICT');
 assert.equal(f.store.overlays.size,0);
 assert.equal((await f.service.batchEntityState(a,body)).updated,2);
 assert.ok((await f.store.catalog()).records.every(r=>r.service_status==='suspended'));
 await assert.rejects(()=>f.service.batchEntityState(a,body),e=>e.code==='VERSION_CONFLICT');
 await f.store.mutateEntity('labs','withheld',{value:{id:'withheld',name:'جهة اختبار',contract_listing:false,contract_entity:'شركة اختبار',contract_entity_id:'direct_we'}},0,'fixture',1);
 const show={field:'directory_visibility',value:'visible',items:[{kind:'labs',id:'withheld',version:1}]};
 await assert.rejects(()=>f.service.batchEntityState(a,show),e=>e.code==='APPROVAL_REQUIRED');
 await f.service.batchEntityState(a,{...show,approve_contract:true});
 assert.equal((await f.store.catalog()).labs[0].publication_approval.by,'source-admin');
});

test('multi-address creation is atomic, keeps independent contacts and trusted organization metadata, and defaults new hospitals to investment classification',async()=>{
 const f=setup(),a=await admin(f),m=await member(f);
 const entity={id:'test_hospital',name:'مستشفى اختبار متعدد الفروع',address:'عنوان رئيسي للاختبار',markaz:'المنصورة',phone:'01012345678',network_members:['employee'],contract_type:'independent',contract_entity:'مستشفى اختبار',contract_entity_id:'test_hospital'};
 const body={kind:'hospitals',entity,branches:[{address:'عنوان آخر للاختبار',markaz:'طلخا',phone:'0502000001',working_hours:'مواعيد اختبار'}],approve_contract:true};
 await assert.rejects(()=>f.service.createEntityBranches(m,body),e=>e.status===403);
 await assert.rejects(()=>f.service.createEntityBranches(a,{...body,branches:[{address:entity.address,markaz:entity.markaz}]}),e=>e.code==='DUPLICATE_BRANCH');
 assert.equal(f.store.overlays.size,0);
 await assert.rejects(()=>f.service.createEntityBranches(a,{...body,branches:[{...body.branches[0],maps_url:'javascript:bad'}]}),e=>e.code==='INVALID_URL');
 assert.equal(f.store.overlays.size,0);
 const result=await f.service.createEntityBranches(a,body);
 const hospitals=(await f.store.catalog()).hospitals.filter(r=>result.created.includes(r.id));
 assert.equal(hospitals.length,2);assert.ok(hospitals.every(r=>r.category==='مستشفى استثماري'));
 assert.equal(hospitals[0].organization_id,hospitals[1].organization_id);
 assert.deepEqual(hospitals[1].contact_groups.mobile,[]);assert.deepEqual(hospitals[1].contact_groups.landline,['0502000001']);
 assert.ok(hospitals.every(r=>r.contract_entity_id===r.id));
 const edited=validateEntity('hospitals',{...hospitals[0],organization_id:'forged'},hospitals[0]);assert.equal(edited.organization_id,hospitals[0].organization_id);
 assert.equal(validateEntity('hospitals',{id:'newh',name:'اختبار',organization_id:'forged'}).organization_id,undefined);
 await assert.rejects(()=>f.service.createEntityBranches(a,body),e=>e.code==='ALREADY_EXISTS');
});

test('new doctor addresses share one provider, and batch showing a dependent branch requires its parent to be shown',async()=>{
 const f=setup(),a=await admin(f);
 await f.service.batchEntityState(a,{field:'directory_visibility',value:'hidden',items:[{kind:'hospitals',id:'h1',version:0}]});
 await assert.rejects(()=>f.service.batchEntityState(a,{field:'directory_visibility',value:'visible',items:[{kind:'records',id:'1',version:0}]}),e=>e.code==='PARENT_HIDDEN');
 assert.equal((await f.store.catalog()).records[0]._version,0);
 await f.service.batchEntityState(a,{field:'directory_visibility',value:'visible',items:[{kind:'records',id:'1',version:0},{kind:'hospitals',id:'h1',version:1}]});
 const result=await f.service.createEntityBranches(a,{kind:'records',entity:{id:'multi_doctor',name:'طبيب فروع اختبار',specialty:'باطنة',hospital:'مستشفى اختبار',contract_type:'hospital',contract_entity:'مستشفى اختبار',contract_entity_id:'h1',address:'عنوان رئيسي',markaz:'المنصورة'},branches:[{address:'عنوان آخر',markaz:'طلخا'}]});
 const rows=(await f.store.catalog()).records.filter(r=>result.created.includes(String(r.id)));
 assert.equal(new Set(rows.map(r=>r.provider_id)).size,1);
 assert.ok(rows.every(r=>r.directory_visibility==='hidden'));
 assert.equal(f.employees[0].name,'عضو اختبار محلي');
});

test('shared data changes are explicit, versioned and atomic, preserve contacts and approvals, and cannot alter names or publish records',async()=>{
 const f=setup(),a=await admin(f),m=await member(f);
 const previous=(await f.store.catalog()).records[0];
 await f.store.mutateEntity('records','1',{value:{...previous,contact_groups:{mobile:['01012345678'],landline:[],shortcode:[]},directory_visibility:'hidden',maps_url:'https://maps.example.invalid/old',publication_approval:{status:'approved',by:'original',at:'2026-01-01'}}},0,'fixture',1);
 const items=[{kind:'records',id:'1',version:1},{kind:'hospitals',id:'h1',version:0}];
 await assert.rejects(()=>f.service.batchEntityData(m,{items,patch:{markaz:'طلخا'}}),e=>e.status===403);
 for(const patch of [{name:'بديل'},{directory_visibility:'visible'},{network_members:[]},{network_members:['fake']},{category:'تصنيف'}])await assert.rejects(()=>f.service.batchEntityData(a,{items,patch}),e=>e.code==='INVALID_BATCH');
 await assert.rejects(()=>f.service.batchEntityData(a,{items:[items[0],{...items[1],version:9}],patch:{markaz:'طلخا'}}),e=>e.code==='VERSION_CONFLICT');
 assert.equal((await f.store.catalog()).records[0]._version,1);
 await f.service.batchEntityData(a,{items,patch:{markaz:'طلخا',network_members:['family','retiree']}});
 const row=(await f.store.catalog()).records[0];
 assert.equal(row.markaz,'طلخا');assert.equal(row.city,'طلخا');assert.equal(row.maps_url,'');
 assert.equal(row.name,previous.name);assert.equal(row.directory_visibility,'hidden');assert.equal(row.publication_approval.by,'original');
 assert.deepEqual(row.contact_groups.mobile,['01012345678']);assert.deepEqual(row.network_members,['family','retiree']);assert.equal(row.network_override,true);
 assert.equal(f.store.audit.at(-1).action,'entity.batch.data');
});

test('a shared specialty change cannot leave unselected locations of the same physician with a conflicting specialty',async()=>{
 const f=setup(),a=await admin(f),row=(await f.store.catalog()).records[0];
 await f.store.mutateEntity('records','second_location',{value:{...row,id:'second_location'}},0,'fixture',1);
 await assert.rejects(()=>f.service.batchEntityData(a,{items:[{kind:'records',id:'1',version:0}],patch:{specialty:'قلب'}}),e=>e.code==='PROVIDER_BRANCHES_REQUIRED');
 assert.equal((await f.store.catalog()).records[0]._version,0);
 await f.service.batchEntityData(a,{items:[{kind:'records',id:'1',version:0},{kind:'records',id:'second_location',version:1}],patch:{specialty:'قلب'}});
 assert.ok((await f.store.catalog()).records.every(r=>r.specialty==='قلب'));
});
