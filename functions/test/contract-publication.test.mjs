import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {projectContract} from '../src/contract-publication.mjs';
import {mergeCatalog} from '../src/catalog-projection.mjs';
import {memberCatalog,targets} from '../src/core.mjs';
const approved={id:'listed',name:'جهة اختبار',contract_listing:true,contract_entity:'تعاقد الشركة',contract_entity_id:'direct_we'};
test('seed source approval cannot be fabricated or removed by old administrative overlays',()=>{
 const seed={hospitals:[approved]};
 const overlays=[{kind:'hospitals',entityId:'listed',version:1,value:{...approved,contract_listing:false,name:'تعديل إداري'}},
 {kind:'hospitals',entityId:'invented',version:1,value:{...approved,id:'invented',source_ref:'staff-20261018'}}];
 const all=mergeCatalog(seed,overlays), visible=memberCatalog(all);
 assert.equal(all.hospitals.length,2);
 assert.deepEqual(visible.hospitals.map(r=>r.id),['listed']);
 assert.equal(visible.hospitals[0].name,'تعديل إداري');
 assert.equal(targets(visible).has('hospitals:invented'),false);
 assert.equal(projectContract(approved,{...approved,contract_entity:'null'},'hospitals').contract_listing,false);
 assert.equal(projectContract(approved,{...approved,contract_entity_id:''},'hospitals').contract_listing,false);
 assert.equal(projectContract(undefined,approved,'hospitals').contract_listing,false);
});
test('withholding preserves admin rows, hidden state, suspension and tombstones; dependent doctors are protected',()=>{
 const seed={hospitals:[approved],records:[{...approved,id:1,provider_id:'p1',contract_entity_id:'listed',contract_type:'hospital'}]};
 const invalid=mergeCatalog(seed,[{kind:'hospitals',entityId:'listed',version:1,value:{...approved,contract_entity:''}}]);
 assert.equal(invalid.records.length,1);assert.equal(memberCatalog(invalid).records.length,0);
 const hidden=mergeCatalog(seed,[{kind:'hospitals',entityId:'listed',version:1,value:{...approved,directory_visibility:'hidden'}}]);
 assert.equal(memberCatalog(hidden).hospitals.length,0);assert.equal(memberCatalog(hidden).records.length,0);
 const stopped=mergeCatalog(seed,[{kind:'hospitals',entityId:'listed',version:1,value:{...approved,service_status:'suspended'}}]);
 assert.equal(memberCatalog(stopped).records[0].service_status,'suspended');
 const deleted=mergeCatalog(seed,[{kind:'hospitals',entityId:'listed',version:1,deleted:true}]);
 assert.equal(deleted.hospitals.length,0);assert.equal(memberCatalog(deleted).records.length,0);
});
test('prepared production seed keeps supplied hospital doctors and imported contracts, withholding 24 unsupported facilities',async()=>{
 execFileSync(process.execPath,[fileURLToPath(new URL('../../scripts/prepare-seed.mjs',import.meta.url))]);
 const seed=JSON.parse(await readFile(new URL('../seed/catalog.json',import.meta.url),'utf8'));
 const all=mergeCatalog(seed,[]), visible=memberCatalog(all);
 assert.equal(visible.records.length,185);
 assert.equal(visible.emergency_services.length,34);
 assert.equal(all.emergency_services.length-visible.emergency_services.length,1);
 assert.ok(visible.emergency_services.some(r=>r.id==='em_mans_intl_hosp' && r.emergency_group==='public_state'));
 assert.equal(visible.emergency_services.filter(r=>r.emergency_group==='public_state').length,27);
 assert.ok(!visible.emergency_services.some(r=>r.id==='em_gm'));
 const hospital=seed.hospitals.find(r=>r.id==='hosp_hekma');
 const hidden=memberCatalog(mergeCatalog(seed,[{kind:'hospitals',entityId:'hosp_hekma',version:1,value:{...hospital,directory_visibility:'hidden'}}]));
 assert.equal(hidden.emergency_services.filter(r=>r.emergency_group==='public_state').length,27);
 assert.ok(!hidden.emergency_services.some(r=>r.id==='em_mans_hekma_priv'));
 assert.ok(visible.emergency_services.some(r=>r.id==='em_1'));
 const government=seed.emergency_services.find(r=>r.id==='em_mans_intl_hosp');
 const edited=mergeCatalog(seed,[{kind:'emergency_services',entityId:government.id,version:1,value:{...government,emergency_group:'contracted'}}]);
 assert.equal(edited.emergency_services.find(r=>r.id===government.id).emergency_group,'public_state');
 assert.equal(edited.emergency_services.find(r=>r.id===government.id).number,government.number);
 const hiddenGovernment=memberCatalog(mergeCatalog(seed,[{kind:'emergency_services',entityId:government.id,version:1,value:{...government,directory_visibility:'hidden'}}]));
 assert.ok(!hiddenGovernment.emergency_services.some(r=>r.id===government.id));
 const counts={hospitals:17,labs:36,radiology:7,pharmacies:70,specialized_centers:20};
 for(const [kind,count] of Object.entries(counts))assert.equal(visible[kind].length,count,kind);
 const providers=['records',...Object.keys(counts)];
 assert.equal(providers.reduce((n,k)=>n+all[k].length-visible[k].length,0),24);
});

test('emergency hospital cards inherit parent restrictions; public helplines cannot be spoofed in an overlay',()=>{
 const seed={hospitals:[approved],emergency_services:[{id:'linked',name:'استقبال اختبار',contract_listing:true,contract_parent_id:'listed'},{id:'public_line',name:'خط اختبار',contract_listing:true}]};
 const all=mergeCatalog(seed,[{kind:'hospitals',entityId:'listed',version:1,value:{...approved,directory_visibility:'hidden'}},{kind:'emergency_services',entityId:'invented',version:1,value:{id:'invented',name:'غير مسند',contract_listing:true,contract_parent_id:'listed',emergency_group:'public_state'}}]);
 assert.deepEqual(memberCatalog(all).emergency_services.map(r=>r.id),['public_line']);
 assert.equal(all.emergency_services.length,3);
});
