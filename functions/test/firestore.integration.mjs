// Real Firestore SDK/transaction integration against a local emulator only.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
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
  privateField: "must-not-be-selected",
});
await foreign.collection("user_accounts").doc("admin-one").set({
  name: "مدير اختبار",
  firebaseUid: "admin-uid",
  role: "admin",
  accountStatus: "active",
  privateField: "must-not-be-selected",
});
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
const service = createService({
  ...adapters,
  source: {
    ...adapters.source,
    verifyAdminIdentity: async () => ({ uid: "admin-uid" }),
  },
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
const admin = (await service.adminLogin({}, "emulator-admin")).token;
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
const id = (await service.adminReviews(admin)).reviews[0].id;
await service.moderateReview(admin, id, { status: "published" });
assert.deepEqual((await service.catalog()).stats["doctor:p1"], {
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
assert.deepEqual((await service.catalog()).stats["doctor:p1"], {
  count: 0,
  average: null,
});
await service.moderateReview(admin, id, { status: "published" });
await service.moderateReview(admin, id, { status: "published" });
assert.deepEqual((await service.catalog()).stats["doctor:p1"], {
  count: 1,
  average: 2,
});
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
const saved = (await service.catalog()).catalog.records[0];
assert.equal(saved._version, 1);
assert.equal(saved.provider_id, "p1");
await service.deleteEntity(admin, "records", "1", { expected_version: 1 });
assert.equal((await service.catalog()).catalog.records.length, 0);
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
console.log(
  "Firestore emulator: masked source reads, persisted sessions, transactional ratings, conflict handling, soft deletion and unchanged membership source passed.",
);
await Promise.all([foreign.terminate()]);
process.exit(0);
