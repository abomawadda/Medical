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
  for (const key of ["nationalId", "sourceId", "passwordHash", "fingerprint"])
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

test('administrator activity extends only a live authorized session beyond the original ten minutes',async()=>{
  const f=setup();const login=await f.service.adminLogin({id_token:'valid-fixture-token'},'idle-test');
  f.advance(9*60000);const renewed=await f.service.adminActivity(login.token);
  assert.equal(renewed.expiresAt-login.expiresAt,9*60000);
  f.advance(9*60000);assert.equal((await f.service.session(login.token)).role,'admin');
  f.advance(60000);await assert.rejects(()=>f.service.adminActivity(login.token),e=>e.status===401);
});
test('background reads cannot extend the admin deadline, and member sessions cannot renew as admin',async()=>{
  const f=setup();const login=await f.service.adminLogin({id_token:'valid-fixture-token'},'idle-read');
  f.advance(9*60000);assert.equal((await f.service.session(login.token)).expiresAt,login.expiresAt);
  await f.service.catalog(login.token);f.advance(60000);await assert.rejects(()=>f.service.session(login.token),e=>e.status===401);
  const member=await f.service.memberLogin(credentials,'idle-member');
  await assert.rejects(()=>f.service.adminActivity(member.token),e=>e.status===403);
});
test('revoked or concurrently logged-out administrator sessions cannot be renewed or recreated',async()=>{
  const f=setup();const login=await f.service.adminLogin({id_token:'valid-fixture-token'},'idle-revoke');
  f.accounts[0].accountStatus='inactive';await assert.rejects(()=>f.service.adminActivity(login.token),e=>e.status===403);
  f.accounts[0].accountStatus='active';const original=f.store.renewAdminSession;
  f.store.renewAdminSession=async(...args)=>{await f.service.logout(login.token);return original(...args);};
  await assert.rejects(()=>f.service.adminActivity(login.token),e=>e.status===401);
  assert.equal(f.store.sessions.size,0);
});

test('content lifecycle: scheduled windows, archived state, explicit republication and version-safe deletion',async()=>{
  const f=setup(),a=await admin(f),m=await member(f),at=1700000000000;
  const base={title:'خبر تجريبي',summary:'محتوى اصطناعي',document_type:'bulletin',publication_status:'published',issuing_authority:'جهة اختبار',source_reference:'مرجع',verified_at:'2023-11-14',display_from:new Date(at+60000).toISOString(),display_until:new Date(at+180000).toISOString()};
  await assert.rejects(()=>f.service.putEntity(m,'medical_guidelines','bulletin',{entity:base,expected_version:0}),e=>e.status===403);
  await f.service.putEntity(a,'medical_guidelines','bulletin',{entity:{...base,publication_revision:999,published_at:'2099-01-01'},expected_version:0});
  assert.equal((await f.service.catalog(m)).catalog.medical_guidelines.length,0);
  let row=(await f.service.catalog(a)).catalog.medical_guidelines[0];assert.equal(row.publication_revision,1);assert.equal(row.published_at,new Date(at).toISOString());
  f.advance(60000);assert.equal((await f.service.catalog(m)).catalog.medical_guidelines.length,1);
  await f.service.putEntity(a,'medical_guidelines','bulletin',{entity:{...row,summary:'تصحيح بلا إعلان'},expected_version:1});
  row=(await f.store.catalog()).medical_guidelines[0];assert.equal(row.publication_revision,1);assert.equal(row.published_at,new Date(at).toISOString());
  await f.service.putEntity(a,'medical_guidelines','bulletin',{entity:row,expected_version:2,republish:true});
  row=(await f.store.catalog()).medical_guidelines[0];assert.equal(row.publication_revision,2);assert.equal(row.published_at,new Date(at+60000).toISOString());
  await assert.rejects(()=>f.service.putEntity(a,'medical_guidelines','bulletin',{entity:row,expected_version:2,republish:true}),e=>e.status===409);
  assert.equal((await f.store.catalog()).medical_guidelines[0].publication_revision,2);
  f.advance(120000);assert.equal((await f.service.catalog(m)).catalog.medical_guidelines.length,0);
  await assert.rejects(()=>f.service.putEntity(a,'medical_guidelines','bulletin',{entity:row,expected_version:3,republish:true}),e=>e.code==='CONTENT_NOT_ACTIVE');
  await f.service.putEntity(a,'medical_guidelines','bulletin',{entity:{...row,publication_status:'archived'},expected_version:3});
  assert.equal((await f.service.catalog(m)).catalog.medical_guidelines.length,0);
  assert.equal((await f.service.catalog(a)).catalog.medical_guidelines[0].publication_status,'archived');
  await assert.rejects(()=>f.service.deleteEntity(a,'medical_guidelines','bulletin',{expected_version:3}),e=>e.status===409);
  await f.service.deleteEntity(a,'medical_guidelines','bulletin',{expected_version:4});
  assert.equal((await f.service.catalog(a)).catalog.medical_guidelines.length,0);
});
test('content scheduling rejects invalid timestamps and conflicting validity windows',()=>{
  const row={id:'valid',title:'نشرة اختبار',summary:'موجز',document_type:'bulletin',publication_status:'draft'};
  for(const values of [{display_from:'2026-02-30T10:00:00.000Z'},{display_from:123},{display_from:'2026-10-19T10:00:00.000Z',display_until:'2026-10-19T10:00:00.000Z'},{display_from:'2026-10-19T10:00:00.000Z',expires_at:'2026-10-18'},{display_until:'2026-10-19T10:00:00.000Z',effective_from:'2026-10-20'},{steps:'not an array'}])assert.throws(()=>validateEntity('medical_guidelines',{...row,...values}),e=>e.code==='INVALID_ENTITY');
});

test('public reviews require sessions and visible targets; names stay admin-only and legacy comments remain private',async()=>{
 const f=setup(),a=await admin(f),m=await member(f);
 f.employees.push({...f.employees[0],id:'viewer-member',name:'قارئ اختبار آخر',jobId:'00999'});
 const reader=(await f.service.memberLogin({...credentials,employee_code:'00999'},'viewer-ip')).token;
 await f.service.submitReview(m,{...review,criteria:{reception:5,waiting:3}},'review-ip');
 let r=(await f.service.adminReviews(a)).reviews[0];assert.equal(r.author_name,'عضو اختبار');
 await f.service.moderateReview(a,r.id,{status:'published',revision:1,share_comment:true});
 await assert.rejects(()=>f.service.publicReviews('',review.target_id),e=>e.status===401);
 let result=await f.service.publicReviews(reader,review.target_id);
 assert.equal(result.summary.average,4);assert.equal(result.summary.criteria.reception.average,5);assert.equal(result.summary.criteria.reception.count,1);assert.equal(result.summary.criteria.cleanliness.average,null);
 assert.deepEqual(result.comments,[]);
 await f.service.submitReview(m,{...review,criteria:{reception:5,waiting:3},share_comment:true},'review-ip');
 r=(await f.service.adminReviews(a)).reviews[0];assert.equal(r.revision,2);
 await assert.rejects(()=>f.service.moderateReview(a,r.id,{status:'published',revision:2}),e=>e.code==='PUBLIC_COMMENT_REVIEW_REQUIRED');
 await f.service.moderateReview(a,r.id,{status:'published',revision:2,confirm_public_comment:true});
 assert.equal((await f.service.moderateReview(a,r.id,{status:'published',revision:2})).changed,false);
 result=await f.service.publicReviews(reader,review.target_id);
 assert.equal(result.comments[0].comment,review.comment);assert.deepEqual(Object.keys(result.comments[0]).sort(),['comment','criteria','rating']);
 const serialized=JSON.stringify(result);for(const secret of ['source-member','عضو اختبار محلي',r.id,'author_name','author_id','branch_id'])assert.equal(serialized.includes(secret),false);
 assert.equal((await f.service.adminReviews(a)).reviews[0].author_name,'عضو اختبار');
 await f.service.submitReview(m,{...review,criteria:{reception:5,waiting:3},share_comment:false},'review-ip');
 assert.equal((await f.service.publicReviews(reader,review.target_id)).comments.length,0);
 assert.equal((await f.service.publicReviews(reader,review.target_id)).summary.count,0);
 await f.service.moderateReview(a,r.id,{status:'published',revision:3});
 assert.equal((await f.service.publicReviews(reader,review.target_id)).summary.count,1);
 await f.service.setEntityState(a,'records','1',{field:'directory_visibility',value:'hidden',scope:'entity',versions:{'1':0}});
 await assert.rejects(()=>f.service.publicReviews(reader,review.target_id),e=>e.status===404);
});
test('anonymous comments are paginated and neither invalid consent nor invalid pages are accepted',async()=>{
 const f=setup(),m=await member(f);
 await assert.rejects(()=>f.service.submitReview(m,{...review,share_comment:'yes'},'review-ip'),e=>e.code==='INVALID_COMMENT');
 for(let i=0;i<27;i++)f.store.reviews.set('fixture-'+i,{id:'fixture-'+i,author_id:'synthetic-'+i,author_name:'اسم سري',target_id:review.target_id,rating:5,criteria:i%2?{waiting:4}:{},comment:'تجربة اختبار '+i,share_comment:true,status:'published',updated_at:i});
 const first=await f.service.publicReviews(m,review.target_id),second=await f.service.publicReviews(m,review.target_id,1);
 assert.equal(first.summary.count,27);assert.equal(first.summary.criteria.waiting.count,13);assert.equal(first.comments.length,20);assert.equal(first.hasMore,true);assert.equal(second.comments.length,7);assert.equal(second.hasMore,false);
 for(const page of [-1,0.2,1001,NaN])await assert.rejects(()=>f.service.publicReviews(m,review.target_id,page),e=>e.code==='INVALID_PAGE');
});

test('recommendations use only published totals and visible active targets, including when the caller is an administrator',async()=>{
 const f=setup(),m=await member(f),a=await admin(f);
 for(let i=0;i<5;i++)f.store.reviews.set('rec'+i,{id:'rec'+i,author_id:'synthetic'+i,author_name:'اسم خاص',target_id:'doctor:p1',rating:5,status:i===0?'pending':'published',comment:'خاص'});
 assert.equal((await f.service.catalog(m)).recommendations.items.length,0);
 f.store.reviews.get('rec0').status='published';
 let result=(await f.service.catalog(m)).recommendations;assert.equal(result.version,1);assert.equal(result.items[0].target,'doctor:p1');assert.equal(result.items[0].count,5);assert.ok(!JSON.stringify(result).includes('اسم خاص'));
 await f.service.setEntityState(a,'records','1',{field:'service_status',value:'suspended',scope:'entity',versions:{'1':0}});
 assert.equal((await f.service.catalog(m)).recommendations.items.length,0);assert.equal((await f.service.catalog(a)).recommendations.items.length,0);
});

test('deceased states and recorded past death dates override all_registered, and revoke existing sessions',async()=>{
 for(const state of ['وفاة','متوفي','متوفى','متوفاة','deceased']){const f=setup({memberAccessPolicy:'all_registered'});f.employees[0].memberState=state;await assert.rejects(()=>member(f),e=>e.status===401);}
 const f=setup({memberAccessPolicy:'all_registered'}),m=await member(f);f.employees[0].deathDate='01/01/2020';
 await assert.rejects(()=>f.service.catalog(m),e=>e.status===401);assert.equal(f.store.sessions.size,0);
 for(const state of ['معاش','استقالة']){const x=setup({memberAccessPolicy:'all_registered'});x.employees[0].memberState=state;const token=await member(x);assert.equal((await x.service.memberProfile(token)).profile.workState,state);}
});
test('profile requests are owner scoped, snapshot checked, replay safe, partially approved locally and privately notified',async()=>{
 const f=setup(),m=await member(f),a=await admin(f);const sourceBefore=JSON.stringify(f.employees);
 f.employees.push({...f.employees[0],id:'viewer-profile',jobId:'00999'});const other=(await f.service.memberLogin({...credentials,employee_code:'00999'},'other-profile')).token;
 let form=await f.service.profileEdit(m);assert.ok(!('nationalId' in form.values));
 const body={request_id:'a'.repeat(32),snapshot:form.snapshot,values:{...form.values,email:'member@example.invalid',workplace:'مكان عمل مقترح'}};
 const saved=await f.service.submitProfileRequest(m,body);assert.equal((await f.service.submitProfileRequest(m,body)).changed,false);
 await assert.rejects(()=>f.service.submitProfileRequest(other,body),e=>e.code==='SOURCE_CHANGED');
 assert.equal((await f.service.ownProfileRequests(other)).requests.length,0);
 await assert.rejects(()=>f.service.cancelProfileRequest(other,saved.id,{version:1}),e=>e.status===404);
 await assert.rejects(()=>f.service.adminProfileRequests(m),e=>e.status===403);
 let request=(await f.service.adminProfileRequests(a)).requests[0];assert.equal(request.status,'pending');
 await f.service.decideProfileRequest(a,saved.id,{version:1,fields:['email'],destination:'app',note:'اعتماد البريد فقط'});
 assert.equal((await f.service.decideProfileRequest(a,saved.id,{version:1,fields:['email'],destination:'app',note:'اعتماد البريد فقط'})).changed,false);
 assert.equal((await f.service.memberProfile(m)).profile.email,'member@example.invalid');assert.equal((await f.service.memberProfile(m)).profile.workplace,'سنترال اختبار');
 const own=(await f.service.ownProfileRequests(m)).requests[0];assert.equal(own.status,'partially_approved');assert.ok(!('sourceId' in own));
 assert.equal((await f.service.profileNotifications(other)).notifications.length,0);
 const note=(await f.service.profileNotifications(m)).notifications[0];assert.ok(note.message.includes('رعايتي فقط'));assert.equal(f.store.profileNotes.size,1);
 await assert.rejects(()=>f.service.readProfileNotification(other,note.id),e=>e.status===404);await f.service.readProfileNotification(m,note.id);
 assert.ok((await f.service.profileNotifications(m)).notifications[0].readAt);
 assert.equal(JSON.stringify(f.employees.slice(0,1)),sourceBefore);
 // A later source correction wins over an obsolete local override.
 f.employees[0].email='new-source@example.invalid';const profile=(await f.service.memberProfile(m)).profile;assert.equal(profile.email,'new-source@example.invalid');assert.deepEqual(profile.conflictingOverrides,['email']);
});
test('profile requests reject stale snapshots, unknown protected fields, concurrent decisions and unconfigured source writes',async()=>{
 const f=setup(),m=await member(f),a=await admin(f);let form=await f.service.profileEdit(m);
 f.employees[0].jobTitle='وظيفة أحدث';await assert.rejects(()=>f.service.submitProfileRequest(m,{request_id:'b'.repeat(32),snapshot:form.snapshot,values:{email:'valid@example.invalid'}}),e=>e.code==='SOURCE_CHANGED');
 form=await f.service.profileEdit(m);
 for(const values of [{nationalId:'29901010101234'},{email:'invalid'},{phone:'123'},{name:''},{birthDate:'31/02/2026'}])await assert.rejects(()=>f.service.submitProfileRequest(m,{request_id:'c'.repeat(32),snapshot:form.snapshot,values}),e=>e.status===400);
 const result=await f.service.submitProfileRequest(m,{request_id:'d'.repeat(32),snapshot:form.snapshot,values:{email:'valid@example.invalid'}});
 await assert.rejects(()=>f.service.decideProfileRequest(a,result.id,{version:1,fields:['email'],destination:'source'}),e=>e.code==='SOURCE_WRITER_UNAVAILABLE');
 const decisions=await Promise.allSettled([f.service.decideProfileRequest(a,result.id,{version:1,fields:['email'],destination:'app'}),f.service.decideProfileRequest(a,result.id,{version:1,fields:[],destination:'app'})]);assert.equal(decisions.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.store.profileNotes.size,1);
});
test('source-profile decisions use an immutable intent and never fall back to app-only when a source write fails',async()=>{
 let failWriter=true,calls=0;let f;
 const writer={async updateProfile(id,changes){calls++;if(failWriter)throw new Error('writer unavailable');const row=f.employees.find(r=>r.id===id);for(const [key,c] of Object.entries(changes)){if(String(row[key] || '')!==c.sourceBefore && row[key]!==c.value)throw new Error('conflict');row[key]=c.value;}}};
 f=setup({sourceWriter:writer});const m=await member(f),a=await admin(f),form=await f.service.profileEdit(m),saved=await f.service.submitProfileRequest(m,{request_id:'e'.repeat(32),snapshot:form.snapshot,values:{email:'source@example.invalid'}});
 const decision={version:1,fields:['email'],destination:'source',note:'اعتماد الأصل'};
 await assert.rejects(()=>f.service.decideProfileRequest(a,saved.id,decision),e=>e.code==='SOURCE_UPDATE_FAILED');assert.equal((await f.store.profileRead(saved.id)).status,'applying');assert.equal(f.store.profileNotes.size,0);
 await assert.rejects(()=>f.service.decideProfileRequest(a,saved.id,{...decision,destination:'app'}),e=>e.status===409);
 failWriter=false;await f.service.decideProfileRequest(a,saved.id,decision);assert.equal(f.employees[0].email,'source@example.invalid');assert.equal(f.store.profileNotes.size,1);assert.ok((await f.service.profileNotifications(m)).notifications[0].message.includes('سجل النقابة الأصلي'));
 await f.service.decideProfileRequest(a,saved.id,decision);assert.equal(calls,2);
});

test('development lab authorizes every read, preview and decision against the live administrator',async()=>{
 const f=setup(),m=await member(f),a=await admin(f);
 for(const token of ['',m])for(const op of [()=>f.service.adminLab(token),()=>f.service.labPreview(token,'compact_home'),()=>f.service.saveLabFeature(token,'compact_home',{})])await assert.rejects(op,e=>e.status===(token?403:401));
 const data=await f.service.adminLab(a);assert.equal(data.features.length,8);assert.equal(data.memberReleaseSupported,false);
 assert.ok(data.features.every(r=>r.audience==='admin'&&!r.memberEnabled));assert.equal(data.features.find(f=>f.id==='directory_experience').syntheticOnly,false);
 const preview=await f.service.labPreview(a,'compact_home');assert.match(preview.scene.label,/توضيحية/);assert.equal(preview.scene.provider.rating,null);
 f.accounts[0].accountStatus='disabled';await assert.rejects(()=>f.service.labPreview(a,'compact_home'),e=>e.status===403);
 f.accounts[0].accountStatus='active';f.advance(600001);await assert.rejects(()=>f.service.adminLab(a),e=>e.status===401);
});
test('lab decisions are private, version guarded, idempotent and cannot enable a member feature',async()=>{
 const f=setup(),m=await member(f),a=await admin(f),before=await f.service.catalog(m),sourceBefore=structuredClone(f.employees);
 const feature=(await f.service.adminLab(a)).features[0],body={expected_version:0,previewRevision:feature.previewRevision,review:'approved',note:'مساحة البحث أوضح — ملاحظة اختبار',previewEnabled:true};
 const results=await Promise.all([1,2].map(()=>f.service.saveLabFeature(a,feature.id,body)));
 assert.equal(results.filter(r=>r.changed).length,1);assert.equal(results[0].feature.version,1);assert.equal(results[0].feature.memberEnabled,false);
 assert.equal((await f.service.saveLabFeature(a,feature.id,body)).changed,false);
 await assert.rejects(()=>f.service.saveLabFeature(a,feature.id,{...body,review:'needs_changes'}),e=>e.code==='LAB_VERSION_CONFLICT');
 for(const extra of [{memberEnabled:true},{audience:'member'},{role:'admin'}])await assert.rejects(()=>f.service.saveLabFeature(a,feature.id,{...body,...extra}),e=>e.status===400);
 await assert.rejects(()=>f.service.saveLabFeature(a,'unknown',body),e=>e.status===404);
 await assert.rejects(()=>f.service.labPreview(a,'unknown'),e=>e.status===404);
 for(const note of ['<img src=x>','x'.repeat(1001),'bad\u0000'])await assert.rejects(()=>f.service.saveLabFeature(a,feature.id,{...body,note}),e=>e.status===400);
 await f.service.saveLabFeature(a,feature.id,{...body,expected_version:1,previewEnabled:false});
 await assert.rejects(()=>f.service.labPreview(a,feature.id),e=>e.code==='LAB_PAUSED');
 assert.deepEqual(await f.service.catalog(m),before);assert.deepEqual(f.employees,sourceBefore);assert.equal(f.store.overlays.size,0);assert.equal(f.store.reviews.size,0);assert.equal(f.store.profileNotes.size,0);
 assert.equal(f.store.audit.filter(r=>r.action==='lab.review').length,2);
});
test('lab retains bounded review history and invalidates approval for a new specimen revision',async()=>{
 const {labProjection}=await import('../src/development-lab.mjs');const f=setup(),a=await admin(f),feature=(await f.service.adminLab(a)).features[0];
 for(let i=0;i<25;i++)await f.service.saveLabFeature(a,feature.id,{expected_version:i,previewRevision:feature.previewRevision,review:'approved',note:'مراجعة '+i,previewEnabled:true});
 const saved=await f.store.labRead(feature.id);assert.equal(saved.history.length,20);assert.equal(saved.history[0].version,6);
 const changed=labProjection({...feature,previewRevision:'future-revision'},saved);assert.equal(changed.staleApproval,true);assert.equal(changed.review,'pending');assert.equal(changed.note,'');assert.equal(changed.memberEnabled,false);
 await assert.rejects(()=>f.service.saveLabFeature(a,feature.id,{expected_version:25,previewRevision:'old-revision',review:'approved',note:'',previewEnabled:true}),e=>e.code==='LAB_REVISION_CHANGED');
});
test('HTTP lab routes require live admin authorization and send no-store for every response',async()=>{
 const f=setup(),a=await admin(f),m=await member(f),handler=createHandler({getService:()=>f.service,origins:['https://abomawadda.github.io']});
 for(const [path,method] of [['/v1/admin/lab','GET'],['/v1/admin/lab/preview/provider_card','GET'],['/v1/admin/lab/features/provider_card','PATCH']])for(const token of ['',m,a]){
  const r=response();await handler(request(path,method,{memberEnabled:true},{authorization:'Bearer '+token}),r);
  assert.equal(r.statusCode,token===a?(method==='PATCH'?400:200):token?403:401);
  assert.equal(r.headers['Cache-Control'],'no-store');
  if(token!==a)assert.ok(!JSON.stringify(r.body).includes('previewRevision'));
 }
});
test('real directory preview uses the member projection, never writes production, and status polling omits the catalog',async()=>{
 const allowed={contract_listing:true,contract_entity:'تعاقد اختبار',contract_entity_id:'direct_we',contract_type:'direct_we'};
 const store=fixtureStore({hospitals:[{...allowed,id:'parent',name:'مستشفى منشور'},{...allowed,id:'hidden',name:'مستشفى مخفي',directory_visibility:'hidden'}],records:[{...allowed,id:'visible-doctor',provider_id:'visible',name:'طبيب ظاهر'},{...allowed,id:'hidden-doctor',provider_id:'hidden',name:'طبيب محجوب',contract_type:'hospital',contract_entity_id:'hidden',hospital:'مستشفى مخفي'}],medical_guidelines:[{id:'draft',title:'مسودة',publication_status:'draft'}]});
 const f=setup({store}),a=await admin(f),m=await member(f),before=await f.service.catalog(m),sourceBefore=structuredClone(f.employees);
 for(const token of ['',m])await assert.rejects(()=>f.service.labPreview(token,'directory_experience'),e=>e.status===(token?403:401));
 const preview=await f.service.labPreview(a,'directory_experience');assert.equal(preview.feature.syntheticOnly,false);assert.equal(preview.scene.mode,'directory-readonly');assert.equal(preview.feature.memberEnabled,false);
 assert.deepEqual(preview.scene.catalog,before.catalog);assert.deepEqual(preview.scene.catalog.records.map(r=>r.id),['visible-doctor']);assert.equal(preview.scene.catalog.medical_guidelines.length,0);
 const status=await f.service.labPreview(a,'directory_experience',true);assert.ok(!('scene'in status));
 assert.equal(store.overlays.size,0);assert.equal(store.reviews.size,0);assert.equal(store.audit.length,0);assert.deepEqual(f.employees,sourceBefore);
 await f.service.saveLabFeature(a,'directory_experience',{expected_version:0,previewRevision:preview.feature.previewRevision,review:'pending',note:'',previewEnabled:false});
 for(const metadata of [true,false])await assert.rejects(()=>f.service.labPreview(a,'directory_experience',metadata),e=>e.code==='LAB_PAUSED');
 assert.deepEqual(await f.service.catalog(m),before);
});

const visitRev='p2-visit-20261021-1';
function visitFixture(){
 const shared={contract_listing:true,contract_entity:'تعاقد اختبار',contract_entity_id:'direct_we',contract_type:'direct_we',network_members:['employee']};
 const store=fixtureStore({records:[{...shared,id:'branch-one',provider_id:'visit-doctor',name:'طبيب مصطنع',specialty:'باطنة'},{...shared,id:'hidden-branch',provider_id:'hidden-visit',name:'طبيب مخفي',directory_visibility:'hidden'}],hospitals:[{...shared,id:'visit-hospital',name:'مستشفى اختبار'}]});const f=setup({store});return {...f,store};
}
const visitBody=(extra={})=>({request_id:'1'.repeat(32),previewRevision:visitRev,target_id:'doctor:visit-doctor',branch_id:'branch-one',network:'employee',issue:'phone',...extra});
test('visit workspace rejects visitors, members, stale revisions and live administrator revocation',async()=>{
 const f=visitFixture(),a=await admin(f),m=await member(f);
 for(const token of ['',m])for(const fn of [()=>f.service.labPreview(token,'visit_workspace'),()=>f.service.labVisitReports(token),()=>f.service.createLabVisitReport(token,visitBody()),()=>f.service.decideLabVisitReport(token,'1'.repeat(32),{})])await assert.rejects(fn,e=>e.status===(token?403:401));
 const preview=await f.service.labPreview(a,'visit_workspace');assert.equal(preview.scene.mode,'directory-sandbox');assert.equal(preview.feature.memberEnabled,false);assert.equal(preview.feature.previewRevision,visitRev);assert.deepEqual(preview.scene.catalog,(await f.service.catalog(m)).catalog);
 await assert.rejects(()=>f.service.createLabVisitReport(a,visitBody({previewRevision:'old'})),e=>e.code==='LAB_REVISION_CHANGED');
 f.accounts[0].accountStatus='disabled';await assert.rejects(()=>f.service.labVisitReports(a),e=>e.status===403);assert.equal(f.store.labScenarios.size,0);
});
test('experimental reports are idempotent, reference published branches/networks and never change production or source',async()=>{
 const f=visitFixture(),a=await admin(f),m=await member(f),before=await f.service.catalog(m),sourceBefore=structuredClone(f.employees);
 const results=await Promise.all([1,2].map(()=>f.service.createLabVisitReport(a,visitBody())));assert.equal(results.filter(r=>r.changed).length,1);
 assert.equal((await f.service.createLabVisitReport(a,visitBody({request_id:'2'.repeat(32)}))).changed,false);
 await assert.rejects(()=>f.service.createLabVisitReport(a,visitBody({issue:'address'})),e=>e.code==='LAB_REQUEST_REUSED');
 for(const change of [{network:'family'},{target_id:'doctor:hidden-visit',branch_id:'hidden-branch'},{branch_id:'wrong'},{target_id:'hospitals:unknown'}])await assert.rejects(()=>f.service.createLabVisitReport(a,visitBody({...change,request_id:'3'.repeat(32)})),e=>e.code==='LAB_TARGET_UNAVAILABLE');
 for(const change of [{comment:'بيانات غير مسموحة'},{memberEnabled:true},{issue:'__proto__'},{request_id:'bad'},{network:'all'}])await assert.rejects(()=>f.service.createLabVisitReport(a,visitBody(change)),e=>[400,404].includes(e.status));
 const rows=(await f.service.labVisitReports(a)).reports;assert.equal(rows.length,1);assert.equal(rows[0].syntheticOnly,true);assert.ok(!JSON.stringify(rows).includes('source-admin'));
 assert.deepEqual(await f.service.catalog(m),before);assert.deepEqual(f.employees,sourceBefore);assert.equal(f.store.overlays.size,0);assert.equal(f.store.reviews.size,0);assert.equal(f.store.profileNotes.size,0);assert.equal(f.store.audit.filter(r=>r.action==='lab.scenario').length,1);
});
test('experimental review workflow is versioned, rejects skipped stages and preserves terminal history',async()=>{
 const f=visitFixture(),a=await admin(f),created=await f.service.createLabVisitReport(a,visitBody()),id=created.report.id;
 const decide=(version,status,outcome='')=>f.service.decideLabVisitReport(a,id,{expected_version:version,previewRevision:visitRev,status,outcome});
 await assert.rejects(()=>decide(1,'resolved','checked'),e=>e.code==='LAB_REPORT_TRANSITION');
 const start=await Promise.all([1,2].map(()=>decide(1,'in_review')));assert.equal(start.filter(r=>r.changed).length,1);
 await assert.rejects(()=>decide(1,'resolved','checked'),e=>e.code==='LAB_REPORT_CONFLICT');
 const done=await decide(2,'resolved','needs_confirmation');assert.equal(done.report.version,3);assert.equal(done.report.history.length,3);assert.equal((await decide(2,'resolved','needs_confirmation')).changed,false);
 await assert.rejects(()=>decide(3,'in_review'),e=>e.code==='LAB_REPORT_TRANSITION');
 await assert.rejects(()=>decide(3,'resolved','arbitrary'),e=>e.code==='INVALID_LAB_REPORT');
 assert.equal((await f.service.createLabVisitReport(a,visitBody({request_id:'4'.repeat(32)}))).changed,true);
});
test('pause is rechecked inside the scenario transaction and the bounded sandbox never evicts an open report',async()=>{
 const f=visitFixture(),a=await admin(f),original=f.store.labScenarioTransact;
 f.store.labScenarioTransact=(id,apply)=>{f.store.labRows.set(id,{previewEnabled:false});return original(id,apply);};
 await assert.rejects(()=>f.service.createLabVisitReport(a,visitBody()),e=>e.code==='LAB_PAUSED');assert.equal(f.store.labScenarios.size,0);
 f.store.labScenarioTransact=original;f.store.labRows.set('visit_workspace',{previewEnabled:true});
 f.store.labScenarios.set('visit_workspace',{rows:Array.from({length:100},(_,i)=>({id:String(i),status:'new'}))});
 await assert.rejects(()=>f.service.createLabVisitReport(a,visitBody()),e=>e.code==='LAB_REPORT_LIMIT');assert.equal((await f.store.labScenarioRead('visit_workspace')).rows.length,100);
 (f.store.labScenarios.get('visit_workspace').rows[0]).status='resolved';await f.service.createLabVisitReport(a,visitBody());assert.equal((await f.store.labScenarioRead('visit_workspace')).rows.length,100);assert.ok((await f.store.labScenarioRead('visit_workspace')).rows.some(r=>r.id==='99'));
});
test('HTTP visit endpoints are administrator-only and cannot send member notifications or accept free text',async()=>{
 const f=visitFixture(),a=await admin(f),m=await member(f),handler=createHandler({getService:()=>f.service,origins:['https://abomawadda.github.io']});
 for(const [path,method]of [['/v1/admin/lab/preview/visit_workspace','GET'],['/v1/admin/lab/visit-reports','GET'],['/v1/admin/lab/visit-reports','POST'],['/v1/admin/lab/visit-reports/'+'1'.repeat(32),'PATCH']])for(const token of ['',m]){
  const r=response();await handler(request(path,method,visitBody(),{authorization:'Bearer '+token}),r);assert.equal(r.statusCode,token?403:401);assert.equal(r.headers['Cache-Control'],'no-store');
 }
 const r=response();await handler(request('/v1/admin/lab/visit-reports','POST',visitBody({comment:'غير مسموح'}),{authorization:'Bearer '+a}),r);assert.equal(r.statusCode,400);assert.equal(f.store.profileNotes.size,0);
});

test('HTTP roadmap routes enforce live admin ownership, private caching and preview-only projections',async()=>{
 const f=visitFixture(),a=await admin(f),m=await member(f),handler=createHandler({getService:()=>f.service,origins:['https://abomawadda.github.io']});
 for(const id of ['care_companion','service_planning']){
  for(const path of ['/v1/admin/lab/preview/'+id,'/v1/admin/lab/workspaces/'+id])for(const token of ['',m,a]){
   const r=response();await handler(request(path,'GET',{}, {authorization:'Bearer '+token}),r);assert.equal(r.statusCode,token===a?200:token?403:401);assert.match(r.headers['Cache-Control'],/no-store/);
   if(token===a){assert.equal(r.body.memberEnabled??r.body.feature.memberEnabled,false);if(r.body.scene)assert.deepEqual(r.body.scene.catalog,(await f.service.catalog(m)).catalog);}
  }
  for(const token of ['',m,a]){const r=response();await handler(request('/v1/admin/lab/workspaces/'+id,'PATCH',{owner:'other',memberEnabled:true},{authorization:'Bearer '+token}),r);assert.equal(r.statusCode,token===a?400:token?403:401);assert.match(r.headers['Cache-Control'],/no-store/);}
 }
 const p=await f.service.labPreview(a,'care_companion');assert.equal(p.scene.policy.limits.journey,6);assert.equal(p.scene.mode,'care-workspace');assert.equal(p.feature.syntheticOnly,false);
 f.accounts[0].accountStatus='disabled';await assert.rejects(()=>f.service.labWorkspace(a,'care_companion'),e=>e.status===403);
});

test('phase readiness is read-only, live-admin protected, aggregate-only and never publishes a phase',async()=>{
 const f=visitFixture(),a=await admin(f),m=await member(f),before=await f.service.catalog(m),sourceBefore=structuredClone(f.employees),handler=createHandler({getService:()=>f.service,origins:['https://abomawadda.github.io']});
 for(const token of ['',m,a]){const r=response();await handler(request('/v1/admin/lab/readiness','GET',{}, {authorization:'Bearer '+token}),r);assert.equal(r.statusCode,token===a?200:token?403:401);assert.match(r.headers['Cache-Control'],/no-store/);if(token===a){assert.equal(r.body.phases.length,7);assert.equal(r.body.releaseSupported,false);assert.equal(r.body.bookingConnected,false);assert.equal(r.body.memberEnabled,false);assert.equal(r.body.scope,'admin-sandbox');}}
 const light=await f.service.labReadiness(a,true);assert.equal(light.revision,'p0-readiness-20261021-2');assert.equal('phases'in light,false);assert.equal(f.store.audit.length,0);
 const body={expected_version:0,previewRevision:'p4-p5-20261021-2',request_id:'a'.repeat(32),operation:'save_role',payload:{id:'b'.repeat(32),label:'دور خاص لا يصدر في التقرير',channel:'قناة خاصة لا تصدر'}};await f.service.saveLabWorkspace(a,'service_planning',body);
 let report=await f.service.labReadiness(a);assert.equal(report.phases.find(p=>p.id==='P4').evidence.find(e=>e.label.includes('أدوار')).count,1);assert.ok(!JSON.stringify(report).includes('قناة خاصة'));assert.ok(!JSON.stringify(report).includes('دور خاص'));assert.ok(!JSON.stringify(report).includes(f.employees[0].name));
 const feature=(await f.service.adminLab(a)).features.find(f=>f.id==='service_planning');await f.service.saveLabFeature(a,feature.id,{expected_version:feature.version,previewRevision:feature.previewRevision,review:'approved',note:'ملاحظة خاصة لا تصدر',previewEnabled:false});
 report=await f.service.labReadiness(a);assert.equal(report.phases.find(p=>p.id==='P4').previewStatus,'paused');assert.deepEqual(report.phases.find(p=>p.id==='P4').evidence,[]);assert.notEqual(report.guardVersion,light.guardVersion);assert.ok(!JSON.stringify(report).includes('ملاحظة خاصة'));
 assert.deepEqual(await f.service.catalog(m),before);assert.deepEqual(f.employees,sourceBefore);assert.equal(f.store.overlays.size,0);assert.equal(f.store.profileNotes.size,0);
 f.accounts[0].accountStatus='disabled';await assert.rejects(()=>f.service.labReadiness(a,true),e=>e.status===403);
});
test('readiness status polling avoids directory/statistics reads and never imports a prior workflow approval',async()=>{
 const f=visitFixture(),a=await admin(f),catalog=f.store.catalog,stats=f.store.getStats;let reads=0;f.store.catalog=async()=>{reads++;return catalog();};f.store.getStats=async()=>{reads++;return stats();};
 await f.service.labReadiness(a,true);assert.equal(reads,0);
 f.store.labRows.set('service_planning',{version:1,review:'approved',previewRevision:'p4-p5-20261021-1',previewEnabled:true,note:'قديم'});
 const report=await f.service.labReadiness(a);const f4=report.phases.find(p=>p.id==='P4').features[0];assert.equal(f4.review,'pending');assert.equal(f4.staleApproval,true);assert.equal(report.phases.find(p=>p.id==='P5').previewStatus,'awaiting_review');assert.ok(reads>0);
});

test('HTTP import review endpoints enforce live administration, no-store, bounded bodies and no public write route',async()=>{
 const f=visitFixture(),a=await admin(f),m=await member(f),h=createHandler({getService:()=>f.service,origins:['https://abomawadda.github.io'],logger:{error(){}}});
 for(const [path,method]of [['/v1/admin/lab/imports','GET'],['/v1/admin/lab/imports','POST'],['/v1/admin/lab/imports/'+'a'.repeat(32),'GET']])for(const [token,status]of [['',401],[m,403]]){const r=response();await h(request(path,method,{},token?{authorization:'Bearer '+token}:{}),r);assert.equal(r.statusCode,status);assert.match(r.headers['Cache-Control'],/no-store/);}
 const r=response();await h(request('/v1/admin/lab/imports','GET',{}, {authorization:'Bearer '+a}),r);assert.equal(r.body.productionWriteSupported,false);assert.equal(r.body.batches.length,0);
 const big=response();await h(request('/v1/admin/lab/imports','POST',{source:'x'.repeat(40000)}, {authorization:'Bearer '+a}),big);assert.equal(big.statusCode,413);
 f.accounts[0].accountStatus='disabled';const revoked=response();await h(request('/v1/admin/lab/imports','GET',{}, {authorization:'Bearer '+a}),revoked);assert.equal(revoked.statusCode,403);
});
