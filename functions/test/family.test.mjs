import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withFamilyContracts} from '../src/family-projection.mjs';
import {validateEntity} from '../src/core.mjs';
const imported=JSON.parse(await readFile(new URL('../../imports/family-20261018.json',import.meta.url),'utf8'));
const data=JSON.parse(await readFile(new URL('../../data.json',import.meta.url),'utf8'));
test('family import uses all 106 refined rows, keeps shared IDs and does not translate Offline into suspension',()=>{
 assert.equal(imported.entries.length,106);assert.equal(imported.summary.shared_facility_rows,19);
 assert.equal(imported.summary.doctor_cards,13);
 for(const {kind,entity}of imported.entries){const checked=validateEntity(kind,entity,entity);assert.ok(!Object.hasOwn(checked,'service_status'));assert.ok(entity.network_members.includes('family'));assert.equal(entity.coverage_verified,false);}
 assert.equal(imported.entries.filter(e=>e.entity.provider_id==='provider_10').length,1);
 assert.equal(imported.entries.find(e=>e.entity.source_row===45).entity.provider_id,'provider_133');
 for(const id of ['hosp_kheir','hosp_sellab'])assert.equal(Object.values(data.hospitals).filter(h=>h.id===id).length,1);
 assert.ok(data.records.filter(r=>r.source_ref==='family-20261018').every(r=>r.id.startsWith('family_20261018_')));
});
test('new family facts survive an older admin override without changing its phone, address, visibility or status',()=>{
 const seed=Object.values(data.hospitals).find(h=>h.id==='hosp_kheir');
 const override={id:seed.id,name:seed.name,phone:'0502000000',address:'عنوان إداري',network_members:['employee'],directory_visibility:'hidden',service_status:'suspended'};
 const merged=withFamilyContracts(seed,override);
 assert.equal(merged.phone,override.phone);assert.equal(merged.address,override.address);
 assert.equal(merged.directory_visibility,'hidden');assert.equal(merged.service_status,'suspended');
 assert.deepEqual(merged.network_members,['employee','family','retiree']);
 assert.equal(merged.contract_relationships.filter(r=>r.source_ref==='family-20261018').length,1);
 assert.deepEqual(withFamilyContracts(seed,merged),merged);
 const family=merged.contract_relationships.find(r=>r.route==='family_network');
 assert.ok(family.contact_groups.landline.includes('0502504066'));
 assert.ok(!family.contact_groups.landline.includes(override.phone));
});
