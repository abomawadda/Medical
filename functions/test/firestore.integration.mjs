// Real Firestore SDK/transaction integration against a local emulator only.
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, createHmac } from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { firebaseAdapters } from "../src/firebase-adapters.mjs";
import {profileWriterFromDb} from "../src/profile-source-writer.mjs";
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
  hospitals:[{id:"family_shared",name:"مستشفى اختبار مشترك",network_members:["employee","family","retiree"],contract_relationships:[{id:"family_contract",source_ref:"family-20261018",route:"family_network",network_members:["family","retiree"],contact_groups:{mobile:[],landline:["0502000001"],shortcode:[]}}]}],
  records: [
    {
      id: 1, contract_listing:true, contract_entity:"تعاقد اختبار", contract_entity_id:"direct_we",
      provider_id: "p1",
      name: "طبيب اختبار",
      specialty: "باطنة",
      hospital: "مستشفى اختبار",
    },
  ],
};
const directoryData=JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../data.json',import.meta.url),'utf8'));
seed.labs=directoryData.labs.filter(r=>['staff_2378','family_20261018_068'].includes(r.id)).map(r=>({...r,contract_listing:true}));
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
await service.addAdminOption(admin,"specialty",{value:"تخصص محفوظ بالمحاكي"});
assert.deepEqual((await service.adminOptions(admin)).options.specialty,["تخصص محفوظ بالمحاكي"]);
await assert.rejects(()=>service.adminOptions(member),e=>e.status===403);
const idleSessionId=createHmac("sha256","emulator-only-test-secret-1234567890abc").update(admin).digest("hex");
const initialAdminSession=await adapters.store.getSession(idleSessionId);
const idleRenewed=await service.adminActivity(admin);assert.ok(idleRenewed.expiresAt>=initialAdminSession.expiresAt);
await adapters.store.deleteSession('idle-deleted-fixture');
assert.equal(await adapters.store.renewAdminSession('idle-deleted-fixture',Date.now(),Date.now()+600000),null);
assert.equal(await adapters.store.getSession('idle-deleted-fixture'),null);
const expiredAt=Date.now()-1;
await adapters.store.saveSession('idle-expired-fixture',{role:'admin',sourceId:'admin-one',expiresAt:expiredAt});
assert.equal(await adapters.store.renewAdminSession('idle-expired-fixture',Date.now(),Date.now()+600000),null);
assert.equal((await adapters.store.getSession('idle-expired-fixture')).expiresAt,expiredAt);
const adminProfile=(await service.adminProfile(admin)).profile;
assert.equal(adminProfile.email,"fixture-admin@example.invalid");assert.ok(!JSON.stringify(adminProfile).includes("passwordHash"));
await service.putEntity(admin,"hospitals","self_contract",{entity:{name:"مستشفى اختبار مستقلة",contract_type:"independent",contract_entity:"مستشفى اختبار مستقلة",contract_entity_id:"self_contract"},expected_version:0,approve_contract:true});
assert.ok((await service.catalog(member)).catalog.hospitals.some(r=>r.id==="self_contract"));
await service.setEntityState(admin,"hospitals","self_contract",{field:"directory_visibility",value:"hidden",scope:"entity",versions:{self_contract:1}});
assert.ok(!(await service.catalog(member)).catalog.hospitals.some(r=>r.id==="self_contract"));

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
assert.equal(ownProfile.phone,"01012345678");
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
await service.submitReview(member,{target_id:"doctor:p1",branch_id:"1",rating:3,criteria:{reception:5,waiting:2},comment:"نسخة جديدة من العضو",visited_declared:true},"edit-member");
await assert.rejects(() => service.moderateReview(admin,id,{status:"published",revision:2}), (e) => e.code === "REVIEW_CHANGED");
await service.moderateReview(admin,id,{status:"published",revision:3});
assert.equal((await service.catalog(admin)).stats["doctor:p1"].average,3);
assert.deepEqual((await service.ownReviews(member)).reviews[0].criteria,{reception:5,waiting:2});
assert.equal((await service.submitReview(member,{target_id:"doctor:p1",branch_id:"1",rating:3,criteria:{waiting:2,reception:5},comment:"نسخة جديدة من العضو",visited_declared:true},"same-criteria")).changed,false);
// Anonymous member projection uses real Firestore field selection; legacy text stays private.
let publicDetail=await service.publicReviews(member,'doctor:p1');
assert.equal(publicDetail.summary.average,3);assert.equal(publicDetail.summary.criteria.reception.average,5);assert.equal(publicDetail.comments.length,0);
const sharedReview={target_id:'doctor:p1',branch_id:'1',rating:3,criteria:{reception:5,waiting:2},comment:'مشاركة مصطنعة بالمحاكي',visited_declared:true,share_comment:true};
await service.submitReview(member,sharedReview,'public-opt-in');
await assert.rejects(()=>service.moderateReview(admin,id,{status:'published',revision:4}),e=>e.code==='PUBLIC_COMMENT_REVIEW_REQUIRED');
await service.moderateReview(admin,id,{status:'published',revision:4,confirm_public_comment:true});
publicDetail=await service.publicReviews(member,'doctor:p1');assert.equal(publicDetail.comments.length,1);
assert.deepEqual(Object.keys(publicDetail.comments[0]).sort(),['comment','criteria','rating']);assert.ok(!JSON.stringify(publicDetail).includes(id));
await service.submitReview(member,{...sharedReview,share_comment:false},'public-withdraw');
assert.equal((await service.publicReviews(member,'doctor:p1')).comments.length,0);
await service.moderateReview(admin,id,{status:'published',revision:5});
// Duplicate imported aliases: retain historical documents, count the newest
// authored experience once and edit it transactionally from either source ID.
const aliasBody={target_id:'labs:family_20261018_068',branch_id:'family_20261018_068',rating:4,comment:'تجربة فرع محلية مصطنعة',visited_declared:true};
await service.submitReview(member,aliasBody,'branch-member');
const current=(await service.ownReviews(member)).reviews.find(r=>r.target_id==='labs:staff_2378');
const currentDoc=(await ownDbForAudits.collection('medical_reviews').doc(current.id).get()).data();
const legacyId=createHmac('sha256','emulator-only-test-secret-1234567890abc').update(currentDoc.author_id+'|labs:family_20261018_068').digest('hex');
await ownDbForAudits.collection('medical_reviews').doc(current.id).update({status:'published',updated_at:Date.now()-2000});
await ownDbForAudits.collection('medical_reviews').doc(legacyId).set({...currentDoc,id:legacyId,target_id:'labs:family_20261018_068',status:'published',rating:2,updated_at:Date.now()-1000});
// Invalidate aggregate cache after deliberately seeding a legacy fixture.
await adapters.store.moderateReview(legacyId,'published','fixture',Date.now(),1);
assert.deepEqual((await service.catalog(member)).facilityStats['labs:staff_2378'],{count:1,average:2});
assert.equal((await service.ownReviews(member)).reviews.filter(r=>r.target_id.startsWith('labs:')).length,1);
await assert.rejects(()=>service.moderateReview(admin,current.id,{status:'published',revision:1}),e=>e.code==='REVIEW_CHANGED');
await service.submitReview(member,{...aliasBody,target_id:'labs:staff_2378',branch_id:'staff_2378',rating:3},'branch-edit');
assert.equal((await ownDbForAudits.collection('medical_reviews').doc(legacyId).get()).data().rating,3);
assert.equal((await ownDbForAudits.collection('medical_reviews').doc(current.id).get()).exists,true);
assert.deepEqual((await service.catalog(member)).facilityStats['labs:family_20261018_068'],{count:0,average:null});
await service.moderateReview(admin,legacyId,{status:'published',revision:2});
assert.deepEqual((await service.catalog(member)).facilityStats['labs:staff_2378'],{count:1,average:3});
// New multi-address entities and batch state changes are all-or-nothing.
const multi=await service.createEntityBranches(admin,{kind:'hospitals',entity:{id:'multi_test_hospital',name:'مستشفى فروع المحاكي',address:'عنوان رئيسي مصطنع',markaz:'المنصورة',phone:'01012345678',contract_type:'independent',contract_entity:'مستشفى فروع المحاكي',contract_entity_id:'multi_test_hospital'},branches:[{address:'عنوان فرع مصطنع',markaz:'طلخا',phone:'0502000001'}],approve_contract:true});
const created=(await service.catalog(admin)).catalog.hospitals.filter(h=>multi.created.includes(h.id));
assert.equal(created.length,2);assert.equal(created[0].organization_id,created[1].organization_id);
assert.equal(created[0].category,'مستشفى استثماري');
assert.deepEqual(created.find(r=>r.id!=='multi_test_hospital').contact_groups.mobile,[]);
const batch={field:'service_status',value:'suspended',items:created.map(r=>({kind:'hospitals',id:r.id,version:r._version}))};
await assert.rejects(()=>service.batchEntityState(admin,{...batch,items:[batch.items[0],{...batch.items[1],version:99}]}),e=>e.code==='VERSION_CONFLICT');
assert.ok((await service.catalog(admin)).catalog.hospitals.filter(h=>multi.created.includes(h.id)).every(h=>h.service_status!=='suspended'));
await service.batchEntityState(admin,batch);
assert.ok((await service.catalog(admin)).catalog.hospitals.filter(h=>multi.created.includes(h.id)).every(h=>h.service_status==='suspended'));
await assert.rejects(()=>service.batchEntityState(admin,batch),e=>e.code==='VERSION_CONFLICT');
const latestHospitals=(await service.catalog(admin)).catalog.hospitals.filter(h=>multi.created.includes(h.id));
const shared={items:latestHospitals.map(r=>({kind:'hospitals',id:r.id,version:r._version})),patch:{category:'مستشفى استثماري مراجع',network_members:['employee'],markaz:'طلخا'}};
await assert.rejects(()=>service.batchEntityData(admin,{...shared,items:[shared.items[0],{...shared.items[1],version:99}]}),e=>e.code==='VERSION_CONFLICT');
await service.batchEntityData(admin,shared);
const updatedHospitals=(await service.catalog(admin)).catalog.hospitals.filter(h=>multi.created.includes(h.id));
assert.ok(updatedHospitals.every(h=>h.category==='مستشفى استثماري مراجع'&&h.network_override===true&&h.markaz==='طلخا'));
assert.deepEqual(updatedHospitals.find(r=>r.id==='multi_test_hospital').contact_groups.mobile,['01012345678']);
assert.deepEqual(updatedHospitals.find(r=>r.id!=='multi_test_hospital').contact_groups.landline,['0502000001']);
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
await service.putEntity(admin,"records","second",{entity:{...seed.records[0],id:"second",hospital:"مستشفى أخرى"},expected_version:0});
await adapters.store.mutateEntity("records","second",{value:{...seed.records[0],id:"second",hospital:"مستشفى أخرى"},deleted:false},1,"local-test",Date.now());
// A concurrent write invalidates the group operation before any branch is changed.
await assert.rejects(()=>adapters.store.mutateEntities([
  {kind:"records",id:"1",value:{...saved,directory_visibility:"hidden"},expectedVersion:1},
  {kind:"records",id:"second",value:{...seed.records[0],id:"second",directory_visibility:"hidden"},expectedVersion:1},
],"local-test",Date.now()),e=>e.status===409);
assert.equal((await service.catalog(member)).catalog.records.length,1); // Unsourced administrative additions remain private.
await service.setEntityState(admin,"records","1",{field:"directory_visibility",value:"hidden",scope:"provider",versions:{"1":1,second:2}});
assert.equal((await service.catalog(member)).catalog.records.length,0);
assert.equal((await service.catalog(admin)).catalog.records.length,2);
await service.setEntityState(admin,"records","1",{field:"directory_visibility",value:"visible",scope:"provider",approve_contract:true,versions:{"1":2,second:3}});
await service.setEntityState(admin,"records","1",{field:"service_status",value:"suspended",scope:"entity",versions:{"1":3}});
assert.equal((await service.catalog(member)).catalog.records.find(r=>String(r.id)==="1").service_status,"suspended");
await service.deleteEntity(admin,"records","second",{expected_version:4});
await service.deleteEntity(admin, "records", "1", { expected_version: 4 });
assert.equal((await service.catalog(admin)).catalog.records.length, 0);
assert.equal(
  JSON.stringify(
    (await foreign.collection("employees").get()).docs.map((d) => d.data()),
  ),
  before,
);
await adapters.store.mutateEntity("hospitals","family_shared",{value:{id:"family_shared",name:"مستشفى اختبار مشترك",phone:"0502000002",network_members:["employee"],directory_visibility:"hidden"},deleted:false},0,"fixture",Date.now());
const retained=(await service.catalog(admin)).catalog.hospitals.find(h=>h.id==="family_shared");
assert.equal(retained.phone,"0502000002");assert.equal(retained.directory_visibility,"hidden");
assert.deepEqual(retained.network_members,["employee","family","retiree"]);
assert.equal(retained.contract_relationships[0].contact_groups.landline[0],"0502000001");
assert.ok(!(await service.catalog(member)).catalog.hospitals.some(h=>h.id==="family_shared"));
await service.deleteEntity(admin,"hospitals","family_shared",{expected_version:1});
assert.ok(!(await service.catalog(admin)).catalog.hospitals.some(h=>h.id==="family_shared"));
// Publication survives real SDK writes, while drafts and expired documents remain private.
const draft={title:"تعليمات اختبار",summary:"نص محلي مصطنع",document_type:"instruction",publication_status:"draft"};
await service.putEntity(admin,"medical_guidelines","guide_fixture",{entity:draft,expected_version:0});
assert.ok(!(await service.catalog(member)).catalog.medical_guidelines.some(r=>r.id === "guide_fixture"));
const publication={...draft,publication_status:"published",issuing_authority:"جهة اختبار",source_reference:"مرجع اختبار",verified_at:"2026-10-18"};
await service.putEntity(admin,"medical_guidelines","guide_fixture",{entity:publication,expected_version:1});
const published=(await service.catalog(member)).catalog.medical_guidelines.find(r=>r.id === "guide_fixture");
assert.equal(published.directory_update.type,"updated");assert.ok(published.directory_update.at);
await service.putEntity(admin,"medical_guidelines","guide_fixture",{entity:{...publication,expires_at:"2020-01-01"},expected_version:2});
assert.ok(!(await service.catalog(member)).catalog.medical_guidelines.some(r=>r.id === "guide_fixture"));
// Content lifecycle uses the real transactional version guard and soft-delete overlay.
const bulletin={...publication,title:'نشرة اختبار بالمحاكي',document_type:'bulletin',display_until:new Date(Date.now()+3600000).toISOString()};
await service.putEntity(admin,'medical_guidelines','bulletin_fixture',{entity:bulletin,expected_version:0});
let bulletinRow=(await service.catalog(member)).catalog.medical_guidelines.find(r=>r.id==='bulletin_fixture');
assert.equal(bulletinRow.publication_revision,1);
await service.putEntity(admin,'medical_guidelines','bulletin_fixture',{entity:{...bulletin,summary:'تصحيح مصطنع'},expected_version:1});
bulletinRow=(await service.catalog(member)).catalog.medical_guidelines.find(r=>r.id==='bulletin_fixture');assert.equal(bulletinRow.publication_revision,1);
const reposts=await Promise.allSettled([1,2].map(()=>service.putEntity(admin,'medical_guidelines','bulletin_fixture',{entity:bulletin,expected_version:2,republish:true})));
assert.equal(reposts.filter(r=>r.status==='fulfilled').length,1);assert.equal(reposts.filter(r=>r.status==='rejected' && r.reason.status===409).length,1);
assert.equal((await service.catalog(member)).catalog.medical_guidelines.find(r=>r.id==='bulletin_fixture').publication_revision,2);
await service.putEntity(admin,'medical_guidelines','bulletin_fixture',{entity:{...bulletin,publication_status:'archived'},expected_version:3});
assert.ok(!(await service.catalog(member)).catalog.medical_guidelines.some(r=>r.id==='bulletin_fixture'));
assert.ok((await service.catalog(admin)).catalog.medical_guidelines.some(r=>r.id==='bulletin_fixture'));
await service.deleteEntity(admin,'medical_guidelines','bulletin_fixture',{expected_version:4});
assert.ok(!(await service.catalog(admin)).catalog.medical_guidelines.some(r=>r.id==='bulletin_fixture'));
// Profile corrections exercise real Medical transactions without changing the source.
const editProfile=await service.profileEdit(member);
assert.ok(!('nationalId' in editProfile.values));
const profileBody={request_id:'f'.repeat(32),snapshot:editProfile.snapshot,values:{...editProfile.values,email:'profile@example.invalid',workplace:'مكان مقترح'}};
const profileRequest=await service.submitProfileRequest(member,profileBody);
assert.equal((await service.submitProfileRequest(member,profileBody)).changed,false);
const decision={version:1,fields:['email'],destination:'app',note:'موافقة جزئية مصطنعة'};
const profileDecisions=await Promise.allSettled([1,2].map(()=>service.decideProfileRequest(admin,profileRequest.id,decision)));
assert.ok(profileDecisions.every(r=>r.status==='fulfilled'));
assert.equal(profileDecisions.filter(r=>r.value.changed).length,1);
const displayedProfile=(await service.memberProfile(member)).profile;
assert.equal(displayedProfile.email,'profile@example.invalid');
assert.equal(displayedProfile.workplace,'سنترال اختبار');
const notices=await service.profileNotifications(member);
assert.equal(notices.notifications.length,1);
assert.equal((await service.profileNotifications(member,notices.version)).notModified,true);
await service.readProfileNotification(member,notices.notifications[0].id);
assert.ok((await service.profileNotifications(member)).notifications[0].readAt);
assert.equal(JSON.stringify((await foreign.collection('employees').get()).docs.map(d=>d.data())),before);
// P2 writes only the isolated scenario document with transactional deduplication.
const visitBefore=await service.catalog(member),visitFeature=(await service.adminLab(admin)).features.find(f=>f.id==='visit_workspace');
const visitCatalog=await service.labPreview(admin,'visit_workspace');assert.equal(visitCatalog.scene.mode,'directory-sandbox');
const visitGroups=(await import('../src/facility-directory.cjs')).default.organizations('labs',visitCatalog.scene.catalog.labs||[]),visitBranch=visitGroups.flatMap(g=>g.branches).find(b=>b.entries.some(r=>r.network_members?.length));
assert.ok(visitBranch,'Published fixture branch available');const visitRow=visitBranch.entries.find(r=>r.network_members?.length);
const visitInput={request_id:'a'.repeat(32),previewRevision:visitFeature.previewRevision,target_id:'labs:'+visitBranch.id,branch_id:String(visitBranch.id),network:visitRow.network_members[0],issue:'phone'};
const visitResults=await Promise.all([1,2].map(()=>service.createLabVisitReport(admin,visitInput)));assert.equal(visitResults.filter(r=>r.changed).length,1);
assert.equal((await service.createLabVisitReport(admin,{...visitInput,request_id:'b'.repeat(32)})).changed,false);
await assert.rejects(()=>service.labVisitReports(member),e=>e.status===403);
const visitCase=visitResults[0].report;
await service.decideLabVisitReport(admin,visitCase.id,{expected_version:1,previewRevision:visitFeature.previewRevision,status:'in_review',outcome:''});
const visitDone={expected_version:2,previewRevision:visitFeature.previewRevision,status:'resolved',outcome:'needs_confirmation'};
const visitClosed=await Promise.all([1,2].map(()=>service.decideLabVisitReport(admin,visitCase.id,visitDone)));assert.equal(visitClosed.filter(r=>r.changed).length,1);
assert.equal((await service.labVisitReports(admin)).reports[0].history.length,3);
assert.deepEqual(await service.catalog(member),visitBefore);
assert.equal(JSON.stringify((await foreign.collection('employees').get()).docs.map(d=>d.data())),before);
// P3–P6 private workspaces use real Firestore transactions and implicit owner paths.
const carePreview=await service.labPreview(admin,'care_companion'),careRev=carePreview.feature.previewRevision;
const careRef={target_id:'labs:'+visitBranch.id,branch_id:String(visitBranch.id),network:visitRow.network_members[0]};
const careInput={expected_version:0,previewRevision:careRev,request_id:'c'.repeat(32),operation:'follow',payload:{ref:careRef}};
const careSaves=await Promise.all([1,2].map(()=>service.saveLabWorkspace(admin,'care_companion',careInput)));assert.equal(careSaves.filter(r=>r.changed).length,1);
assert.equal((await service.labWorkspace(admin,'care_companion')).state.follows.length,1);
assert.deepEqual(await adapters.store.labWorkspaceRead('care_companion','other-admin'),{});
await assert.rejects(()=>service.labWorkspace(member,'care_companion'),e=>e.status===403);
await assert.rejects(()=>service.saveLabWorkspace(admin,'care_companion',{...careInput,request_id:'d'.repeat(32),operation:'scan',payload:{}}),e=>e.code==='LAB_WORKSPACE_CONFLICT');
const roadmapDb=getFirestore((await import('firebase-admin/app')).getApps().find(a=>a.name==='medical-data'));
const originalWorkspaceTransact=adapters.store.labWorkspaceTransact;
adapters.store.labWorkspaceTransact=async(...args)=>{await roadmapDb.collection('medical_lab_features').doc('care_companion').set({previewEnabled:false});return originalWorkspaceTransact(...args);};
try{await assert.rejects(()=>service.saveLabWorkspace(admin,'care_companion',{...careInput,expected_version:1,request_id:'e'.repeat(32),operation:'scan',payload:{}}),e=>e.code==='LAB_PAUSED');}finally{adapters.store.labWorkspaceTransact=originalWorkspaceTransact;await roadmapDb.collection('medical_lab_features').doc('care_companion').set({previewEnabled:true});}
const planningRev=(await service.labPreview(admin,'service_planning')).feature.previewRevision;
const draftInput={expected_version:0,previewRevision:planningRev,request_id:'f'.repeat(32),operation:'save_draft',payload:{id:'1'.repeat(32),title:'موعد تجريبي بالمحاكي',type:'appointment',network:'employee',source_reference:'مرجع مصطنع',source_url:'',source_date:'2020-01-01',authority:'جهة مثال',responsible:'مسؤول مثال',steps:['خطوة مصطنعة'],status:'ready',valid_from:'2020-01-01',valid_until:'',review_by:'2099-01-01',documents:['متطلب تجريبي'],submission_channel:'قناة تجربة',service_window:''}};
await service.saveLabWorkspace(admin,'service_planning',draftInput);
const caseInput={expected_version:1,previewRevision:planningRev,request_id:'2'.repeat(32),operation:'create_case',payload:{id:'3'.repeat(32),draft_id:draftInput.payload.id}};
const caseSaves=await Promise.all([1,2].map(()=>service.saveLabWorkspace(admin,'service_planning',caseInput)));assert.equal(caseSaves.filter(r=>r.changed).length,1);assert.equal(caseSaves[0].workspace.state.cases[0].bookingConfirmed,false);
const roleInput={expected_version:2,previewRevision:planningRev,request_id:'4'.repeat(32),operation:'save_role',payload:{id:'5'.repeat(32),label:'دور بالمحاكي',channel:'قناة بالمحاكي'}};
await service.saveLabWorkspace(admin,'service_planning',roleInput);
await service.saveLabWorkspace(admin,'service_planning',{...roleInput,expected_version:3,request_id:'6'.repeat(32),operation:'assign_case',payload:{id:caseInput.payload.id,role_id:roleInput.payload.id,follow_up_at:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(Date.now())}});
await service.saveLabWorkspace(admin,'service_planning',{...roleInput,expected_version:4,request_id:'7'.repeat(32),operation:'case_status',payload:{id:caseInput.payload.id,status:'review'}});
await service.saveLabWorkspace(admin,'service_planning',{...roleInput,expected_version:5,request_id:'8'.repeat(32),operation:'case_status',payload:{id:caseInput.payload.id,status:'needs_info',reason:'documents',items:[0]}});
const cancelInput={...roleInput,expected_version:6,request_id:'9'.repeat(32),operation:'case_status',payload:{id:caseInput.payload.id,status:'cancelled'}};
const cancellations=await Promise.all([1,2].map(()=>service.saveLabWorkspace(admin,'service_planning',cancelInput)));assert.equal(cancellations.filter(r=>r.changed).length,1);const frozenCase=(await service.labWorkspace(admin,'service_planning')).state.cases[0];assert.equal(frozenCase.history.length,5);assert.equal(frozenCase.procedure.source_reference,'مرجع مصطنع');assert.equal(frozenCase.bookingConfirmed,false);
const readinessReport=await service.labReadiness(admin);assert.equal(readinessReport.phases.length,7);assert.equal(readinessReport.memberEnabled,false);assert.ok(!JSON.stringify(readinessReport).includes('دور بالمحاكي'));
assert.equal((await roadmapDb.collection('medical_lab_workspaces').get()).size,2);
assert.deepEqual(await service.catalog(member),visitBefore);
assert.equal(JSON.stringify((await foreign.collection('employees').get()).docs.map(d=>d.data())),before);
// Directory import batches persist privately, deduplicate retries and never touch live overlays.
const importRevision=(await service.adminLab(admin)).features.find(f=>f.id==='catalog_staging').previewRevision;
const importBody={expected_version:0,previewRevision:importRevision,request_id:'a1'.repeat(16),operation:'analyze',payload:{kind:'labs',source:'مرجع محاكي مصطنع',rows:[{source_row:2,values:{name:'معمل محاكي خاص',address:'عنوان مصطنع مستقل',markaz:'طلخا',raw_phone:'01012345678 - 16133'}}]}};
const importSaves=await Promise.all([1,2].map(()=>service.saveLabImport(admin,importBody)));assert.equal(importSaves.filter(r=>r.changed).length,1);
await assert.rejects(()=>service.labImports(member),e=>e.status===403);assert.deepEqual(await adapters.store.labWorkspaceRead('catalog_staging','other-admin'),{});
const decisionBody={...importBody,expected_version:1,request_id:'b1'.repeat(16),operation:'decide',payload:{batch_id:importBody.request_id,rows:[2],decision:'accepted'}};
const importDecisions=await Promise.all([1,2].map(()=>service.saveLabImport(admin,decisionBody)));assert.equal(importDecisions.filter(r=>r.changed).length,1);assert.equal((await service.labImports(admin,importBody.request_id)).batch.history.length,1);
await service.saveLabImport(admin,{...decisionBody,expected_version:2,request_id:'c1'.repeat(16),operation:'undo',payload:{batch_id:importBody.request_id}});assert.equal((await service.labImports(admin,importBody.request_id)).batch.rows[0].decision,'pending');
assert.deepEqual(await service.catalog(member),visitBefore);assert.equal(JSON.stringify((await foreign.collection('employees').get()).docs.map(d=>d.data())),before);
assert.equal((await roadmapDb.collection('medical_lab_workspaces').get()).size,3);
// Lab reviews persist only in Medical and cannot change the member catalog or source.
const memberBeforeLab=await service.catalog(member),lab=(await service.adminLab(admin)).features[0];
const integrated=await service.labPreview(admin,'directory_experience');assert.equal(integrated.feature.dataMode,'directory-readonly');assert.deepEqual(integrated.scene.catalog,memberBeforeLab.catalog);
assert.ok(!('scene' in await service.labPreview(admin,'directory_experience',true)));
await assert.rejects(()=>service.labPreview(member,'directory_experience'),e=>e.status===403);

await assert.rejects(()=>service.adminLab(member),e=>e.status===403);
const labBody={expected_version:0,previewRevision:lab.previewRevision,review:'approved',note:'مراجعة تصميم مصطنعة',previewEnabled:true};
const labSaves=await Promise.all([1,2].map(()=>service.saveLabFeature(admin,lab.id,labBody)));
assert.equal(labSaves.filter(r=>r.changed).length,1);
assert.equal((await service.adminLab(admin)).features[0].version,1);
await assert.rejects(()=>service.saveLabFeature(admin,lab.id,{...labBody,review:'needs_changes'}),e=>e.code==='LAB_VERSION_CONFLICT');
await service.saveLabFeature(admin,lab.id,{...labBody,expected_version:1,previewEnabled:false});
await assert.rejects(()=>service.labPreview(admin,lab.id),e=>e.code==='LAB_PAUSED');
assert.deepEqual(await service.catalog(member),memberBeforeLab);
assert.equal(JSON.stringify((await foreign.collection('employees').get()).docs.map(d=>d.data())),before);
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
// Explicit writer path is tested only on a separate synthetic emulator record.
const writerRef=foreign.collection('employees').doc('writer-fixture');
await writerRef.set({name:'عضو مصطنع',email:'old@example.invalid',phone:'01012345678',nationalId:'private-fixture'});
const writer=profileWriterFromDb(foreign),patch={email:{sourceBefore:'old@example.invalid',value:'new@example.invalid'}};
assert.equal((await writer.updateProfile('writer-fixture',patch)).changed,true);
assert.equal((await writer.updateProfile('writer-fixture',patch)).changed,false);
await assert.rejects(()=>writer.updateProfile('writer-fixture',{email:{sourceBefore:'new@example.invalid',value:'third@example.invalid'},phone:{sourceBefore:'changed',value:'01112345678'}}),e=>e.code==='SOURCE_CHANGED');
assert.equal((await writerRef.get()).data().email,'new@example.invalid');
assert.equal((await writerRef.get()).data().nationalId,'private-fixture');
await assert.rejects(()=>writer.updateProfile('missing-fixture',patch),e=>e.code==='SOURCE_CHANGED');
await assert.rejects(()=>writer.updateProfile('writer-fixture',{nationalId:{sourceBefore:'private-fixture',value:'bad'}}),e=>e.code==='INVALID_PROFILE');
await foreign.collection("user_accounts").doc("admin-one").update({passwordHash:"a".repeat(64)});
await assert.rejects(() => service.session(admin), (e) => e.status === 403);
console.log(
  "Firestore emulator: approved legacy admin authentication, credential isolation, password-change revocation, masked source reads, persisted sessions, transactional ratings, conflict handling, soft deletion and unchanged source during app operations passed.",
);
await Promise.all([foreign.terminate()]);
process.exit(0);
