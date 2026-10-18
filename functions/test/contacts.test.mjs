import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import contacts from "../src/contacts.cjs";
import {validateEntity} from "../src/core.mjs";

test("contact categories preserve separate numbers across Arabic digits, national prefixes and area separators", () => {
  const result = contacts.parse("٠٥٠/٢٣٣٢٦٩١ - +20 10 13588730\n19989 - 050-3932601 - 01013588730");
  assert.deepEqual(result,{mobile:["01013588730"],landline:["0502332691","0503932601"],shortcode:["19989"],invalid:[]});
  assert.equal(contacts.classify("00201123927050").number,"01123927050");
  assert.equal(contacts.classify("19600").type,"shortcode");
  assert.equal(contacts.classify("0502332691").type,"landline");
  assert.deepEqual(contacts.forEntity({raw_phone:"",phones:[{tel:"01013588730"}]}),{mobile:[],landline:[],shortcode:[],invalid:[]});
});

test("damaged spreadsheet phones are quarantined without truncation or joining neighboring numbers", () => {
  const result = contacts.parse("050 233269 - 050 2332691 - 011 57057092011 - 050 57057095");
  assert.deepEqual(result.landline,["0502332691"]);
  assert.equal(result.invalid.length,3);
  assert.equal(contacts.classify("05025202111"),null);
  assert.equal(contacts.classify("050920003"),null);
});

test("entity edits regenerate callable numbers and cannot retain forged or stale contact evidence", () => {
  const previous={provider_id:"stable",contact_evidence:[{number:"0502332691",source_url:"https://example.invalid/official"}]};
  const saved=validateEntity("records",{id:"r",name:"طبيب اختبار",specialty:"اختبار",hospital:"مستشفى اختبار",raw_phone:"01013588730 - 19989 - 05025202111",phones:[{tel:"javascript:alert(1)"}],contact_evidence:[{number:"01013588730",source_url:"https://forged.invalid"}]},previous);
  assert.equal(saved.provider_id,"stable");
  assert.deepEqual(saved.contact_groups,{mobile:["01013588730"],landline:[],shortcode:["19989"]});
  assert.equal(saved.contact_review_required,true);
  assert.deepEqual(saved.contact_evidence,[]);
  assert.deepEqual(saved.phones.map(p=>p.tel),["01013588730","19989"]);
});

test("provider images need an HTTPS source and explicit administrator confirmation", () => {
  const base={id:"h",name:"مركز اختبار",image_url:"https://images.example.invalid/photo.jpg"};
  assert.throws(()=>validateEntity("hospitals",base),e=>e.code === "IMAGE_SOURCE_REQUIRED");
  assert.throws(()=>validateEntity("hospitals",{...base,image_source_url:"javascript:alert(1)",image_verified:true}),e=>e.code === "INVALID_URL");
  assert.equal(validateEntity("hospitals",{...base,image_source_url:"https://example.invalid/permission",image_verified:true}).image_verified,true);
  assert.equal(validateEntity("records",{id:"r",name:"طبيبة اختبار",specialty:"اختبار",hospital:"اختبار",avatar_type:"doctor_female"}).avatar_type,"doctor_female");
  assert.throws(()=>validateEntity("hospitals",{id:"h",name:"مركز اختبار",avatar_type:"untrusted-style"}),e=>e.code === "INVALID_ENTITY");
});

test("staff import preserves original identities, all historical review targets and local rollout boundaries", async () => {
  const data=JSON.parse(await readFile(new URL("../../data.json",import.meta.url),"utf8"));
  const imported=JSON.parse(await readFile(new URL("../../imports/staff-20261018.json",import.meta.url),"utf8"));
  assert.equal(imported.summary.source_rows,84);
  assert.equal(imported.entries.length,79);
  const sourceCodes=imported.entries.map(e=>e.entity.staff_provider_code);
  for(const excluded of ["763","2470","1499","2907","2915"]) assert.ok(!sourceCodes.includes(excluded));
  assert.ok(imported.entries.every(e=>e.entity.governorate_code === "EG-DK"));
  const allH=Object.values(data.hospitals);
  for(const id of ["hosp_hekma","hosp_sellab","hosp_kheir"]) assert.equal(allH.filter(h=>h.id===id).length,1);
  assert.deepEqual(allH.find(h=>h.id === "hosp_hekma").network_members,["employee"]);
  assert.deepEqual(allH.find(h=>h.id === "hosp_sellab").network_members,["employee","family","retiree"]);
  assert.equal(data.records.length,170);
  assert.equal(new Set(data.records.map(r=>r.id)).size,170);
  assert.ok(data.records.slice(0,169).every(r=>/^provider_\d+$/.test(r.provider_id)));
  assert.ok(imported.entries.every(e=>!e.entity.coverage_verified));
  assert.ok(!JSON.stringify(imported).includes("موقف التسجيل بالفاتوره"));
});
