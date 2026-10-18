import test from "node:test";
import assert from "node:assert/strict";
import "../../js/quality.js";
const audit = globalThis.MedicalQuality.audit;
const now = Date.parse("2026-10-18T12:00:00Z");
const provider = {id:"r1", provider_id:"p1", name:"طبيب اختبار", specialty:"قلب", hospital:"مستشفى اختبار", address:"عنوان أول", city:"المنصورة", phones:[{digits:"٠١٠١٢٣٤٥٦٧٨"}], source_url:"https://example.invalid/source", verified_at:"2026-10-01", coverage_verified:true, coverage_scope:"employee_only"};

test("quality audit separates legitimate branches and shared reception numbers from candidate duplicates without mutating data", () => {
  const catalog = {records:[provider, {...provider,id:"r2",address:"عنوان ثان"}, {...provider,id:"r3",specialty:"باطنة"}, {...provider,id:"r4",name:"طبيب آخر"}]};
  const before = structuredClone(catalog);
  assert.equal(audit(catalog,{now}).issues.length,0);
  catalog.records.push({...provider,id:"r5",name:"طبيب   اختبار"});
  const report = audit(catalog,{now});
  assert.equal(report.byCode.possible_duplicate,1);
  assert.equal(report.issues[0].id,"r5");
  assert.deepEqual(catalog.records.slice(0,4),before.records);
});

test("quality audit never treats a source label, future date or unknown coverage as verification", () => {
  const report = audit({records:[{...provider, id:"r2", coverage_scope:"unknown", verified_at:"2026-02-30", source_url:"javascript:alert(1)"}], emergency_services:[{id:"e1",name:"طوارئ اختبار",number:"١٢٣",city:"المنصورة",address:"عنوان",verification_source:"اسم مصدر فقط",verification_date:"2027-01-01",verified:false}]},{now});
  assert.equal(report.byCode.invalid_date,2);
  assert.equal(report.byCode.missing_source,2);
  assert.equal(report.byCode.unconfirmed,2);
  assert.equal(report.byCode.missing_contact,undefined);
});

test("quality export is built only from catalog checks and cannot include extra member or review fields", () => {
  const report = audit({records:[{...provider,id:"same",verified_at:"2025-01-01"},{...provider,id:"same"}], employees:[{nationalId:"private-fixture"}], reviews:[{comment:"private-review-fixture"}]},{now});
  assert.equal(report.byCode.duplicate_id,1);
  assert.equal(report.byCode.stale,1);
  assert.ok(!JSON.stringify(report).includes("private-"));
  assert.equal(report.total,2);
  assert.equal(report.affected,2);
});
