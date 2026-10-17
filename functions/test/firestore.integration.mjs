// Real Firestore SDK/transaction integration against a local emulator only.
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash } from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { firebaseAdapters } from "../src/firebase-adapters.mjs";
import { createService } from "../src/core.mjs";
if (
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  )
)
  throw new Error(
    "Local Firestore emulator required; production access is forbidden.",
  );
const ownId = "demo-medical",
  sourceId = "demo-medical-membership";
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const credentials = {
  project_id: sourceId,
  client_email: `fixture-reader@${sourceId}.iam.gserviceaccount.com`,
  private_key: privateKey,
};
const fixtureApp = initializeApp(
  { projectId: sourceId, credential: cert(credentials) },
  "source-emulator-fixture",
);
const foreign = getFirestore(fixtureApp);
await foreign.collection("employees").doc("member-one").set({
  name: "عضو اختبار",
  jobId: "00123",
  phone: "01012345678",
  nationalId: "29901010101234",
  memberState: "نشط",
  membershipId:"UNION-123", jobTitle:"مهندس اختبار", workplace:"سنترال اختبار",
  privateField: "must-not-be-selected",
});
await foreign.collection("user_accounts").doc("admin-one").set({
  name: "مدير اختبار",
  firebaseUid: "admin-uid",
  role: "admin",
  accountStatus: "active",
  email: "fixture-admin@example.invalid",
  passwordSalt: "emulator-only-salt",
  passwordHash: createHash("sha256").update("emulator-only-salt::fixture-password").digest("hex"),
  privateField: "must-not-be-selected",
});
await foreign.collection("user_accounts").doc("unapproved-admin").set({
  email: "unapproved@example.invalid", role: "admin", accountStatus: "active",
  passwordSalt: "emulator-only-salt",
  passwordHash: createHash("sha256").update("emulator-only-salt::fixture-password").digest("hex"),
});
const accountsBefore = JSON.stringify((await foreign.collection("user_accounts").get()).docs.map((d) => d.data()));
await foreign.collection("employees").doc("arabic-code").set({ jobId: "٠٠٩٩" });
await foreign.collection("employees").doc("numeric-code").set({ jobId: 456 });
const before = JSON.stringify(
  (await foreign.collection("employees").get()).docs.map((d) => d.data()),
);
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
};
const adapters = firebaseAdapters({
  medicalProjectId: ownId,
  sourceCredentials: credentials,
  adminAccountIds: ["admin-one"],
  bindingSecret: "emulator-only-test-secret-1234567890abc",
  seed,
});
const masked = await adapters.source.getEmployee("member-one");
assert.ok(!("privateField" in masked));
const listed = await adapters.source.findEmployees("00123");
assert.equal(listed.length, 1);
assert.ok(!("privateField" in listed[0]));
assert.equal(
  (await adapters.source.findEmployees("0099"))[0].id,
  "arabic-code",
);
assert.equal(
  (await adapters.source.findEmployees("456"))[0].id,
  "numeric-code",
);
const foundAccounts = await adapters.source.findAccounts("admin-uid");
assert.equal(foundAccounts.length, 1);
assert.ok(!("privateField" in foundAccounts[0]));
assert.ok(!("passwordHash" in foundAccounts[0]));
assert.ok(!("passwordSalt" in foundAccounts[0]));
assert.equal(await adapters.source.getLegacyAdminState("unapproved-admin"), null);
await assert.rejects(() => adapters.source.verifyAdminIdentity({email:"unapproved@example.invalid",password:"fixture-password"}));
const service = createService({
  ...adapters,
  secret: "emulator-only-test-secret-1234567890abc",
  adminAccountIds: ["admin-one"],
  allowedStates: ["نشط"],
});
const member = (
  await service.memberLogin(
    { employee_code: "00123", phone: "01012345678", last4: "1234" },
    "emulator-member",
  )
).token;
const admin = (await service.adminLogin({email:"fixture-admin@example.invalid",password:"fixture-password"}, "emulator-admin")).token;
await service.submitReview(
  member,
  {
    target_id: "doctor:p1",
    branch_id: "1",
    rating: 4,
    comment: "اختبار تكامل محلي",
    visited_declared: true,
  },
  "emulator-member",
);
const ownProfile = (await service.memberProfile(member)).profile;
assert.equal(ownProfile.employeeCode, "00123");
assert.equal(ownProfile.jobTitle, "مهندس اختبار");
assert.ok(ownProfile.lastLoginAt);
assert.ok(!("nationalId" in ownProfile));
assert.ok(!("phone" in ownProfile));
const profileSource = await adapters.source.getMemberProfile("member-one");
assert.ok(!("nationalId" in profileSource));
assert.ok(!("privateField" in profileSource));
const id = (await service.adminReviews(admin)).reviews[0].id;
await service.moderateReview(admin, id, { status: "published", revision: 1 });
assert.deepEqual((await service.catalog(admin)).stats["doctor:p1"], {
  count: 1,
  average: 4,
});
await service.submitReview(
  member,
  {
    target_id: "doctor:p1",
    branch_id: "1",
    rating: 2,
    comment: "تحديث محلي",
    visited_declared: true,
  },
  "emulator-member",
);
assert.deepEqual((await service.catalog(admin)).stats["doctor:p1"], {
  count: 0,
  average: null,
});
const concurrent = await Promise.all([
  service.moderateReview(admin,id,{status:"published",revision:2}),
  service.moderateReview(admin,id,{status:"published",revision:2}),
]);
assert.equal(concurrent.filter((r) => r.changed).length,1);
const ownDbForAudits = getFirestore((await import("firebase-admin/app")).getApps().find((a) => a.name === "medical-data"));
const moderationAudits = (await ownDbForAudits.collection("medical_audit").get()).docs
  .map((d) => d.data()).filter((d) => d.action === "review.moderate");
assert.equal(moderationAudits.length,2);
assert.deepEqual((await service.catalog(admin)).stats["doctor:p1"], {
  count: 1,
  average: 2,
});
await service.moderateReview(admin,id,{status:"hidden",revision:2});
await assert.rejects(() => service.moderateReview(admin,id,{status:"published",revision:2}), (e) => e.code === "REVIEW_ALREADY_DECIDED");
await service.submitReview(member,{target_id:"doctor:p1",branch_id:"1",rating:3,comment:"نسخة جديدة من العضو",visited_declared:true},"edit-member");
await assert.rejects(() => service.moderateReview(admin,id,{status:"published",revision:2}), (e) => e.code === "REVIEW_CHANGED");
await service.moderateReview(admin,id,{status:"published",revision:3});
assert.equal((await service.catalog(admin)).stats["doctor:p1"].average,3);
const attempts = await Promise.allSettled([
  service.putEntity(admin, "records", "1", {
    entity: { ...seed.records[0], name: "تعديل أ" },
    expected_version: 0,
  }),
  service.putEntity(admin, "records", "1", {
    entity: { ...seed.records[0], name: "تعديل ب" },
    expected_version: 0,
  }),
]);
assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
assert.equal(attempts.find((a) => a.status === "rejected").reason.status, 409);
const saved = (await service.catalog(admin)).catalog.records[0];
assert.equal(saved._version, 1);
assert.equal(saved.provider_id, "p1");
await service.deleteEntity(admin, "records", "1", { expected_version: 1 });
assert.equal((await service.catalog(admin)).catalog.records.length, 0);
assert.equal(
  JSON.stringify(
    (await foreign.collection("employees").get()).docs.map((d) => d.data()),
  ),
  before,
);
await service.logout(member);
await assert.rejects(
  () => service.ownReviews(member),
  (e) => e.status === 401,
);
assert.equal(JSON.stringify((await foreign.collection("user_accounts").get()).docs.map((d) => d.data())), accountsBefore);
const ownDb = getFirestore((await import("firebase-admin/app")).getApps().find((a) => a.name === "medical-data"));
const storedSessions = JSON.stringify((await ownDb.collection("medical_sessions").get()).docs.map((d) => d.data()));
assert.ok(!storedSessions.includes("passwordHash"));
assert.ok(!storedSessions.includes("emulator-only-salt"));
await foreign.collection("user_accounts").doc("admin-one").update({passwordHash:"a".repeat(64)});
await assert.rejects(() => service.session(admin), (e) => e.status === 403);
console.log(
  "Firestore emulator: approved legacy admin authentication, credential isolation, password-change revocation, masked source reads, persisted sessions, transactional ratings, conflict handling, soft deletion and unchanged source during app operations passed.",
);
await Promise.all([foreign.terminate()]);
process.exit(0);
