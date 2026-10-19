import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../../js/directory-preview-model.js'),facilities=require('../src/facility-directory.cjs'),search=require('../../js/search.js'),contacts=require('../src/contacts.cjs');
const shared={contract_listing:true,network_members:['employee','family','retiree'],markaz:'طلخا',service_status:'active'};
const row=(id,more={})=>({...shared,id,name:'مركز اختبار',address:'عنوان اختبار',raw_phone:'01012345678 - 0502000001 - 16133',...more});
const create=catalog=>M.create({catalog,stats:{},facilityStats:{}},{facilities,search,contacts});
test('integrated preview searches all sections, normalizes intent and preserves distinct provider identities',()=>{
 const model=create({records:[row('d1',{provider_id:'one',name:'طبيب اختبار',specialty:'باطنة'}),row('d2',{provider_id:'one',name:'طبيب اختبار',markaz:'المنصورة',specialty:'باطنة'}),row('d3',{provider_id:'two',name:'طبيب اختبار',specialty:'باطنة'})],specialized_centers:[row('c1',{name:'عيادات داوي مركز متخصص',category:'مركز متخصص'})],labs:[],pharmacies:[]});
 assert.equal(model.providers.filter(p=>p.source==='records').length,2);assert.equal(model.byId.get('doctor:one').branches.length,2);
 assert.equal(model.find({query:'داوي'})[0].provider.id,'specialized_centers:c1');assert.equal(model.find({query:'دكتور باطنة في طلخا'}).length,2);
 assert.equal(model.find({query:'داوي',kind:'records'}).length,0);
 assert.equal(model.find({specialty:'باطنة',markaz:'المنصورة'})[0].v.city,'المنصورة');
});
test('branch network variants keep family and employee contacts separate; dental centers are discoverable',()=>{
 const r=row('a',{network_members:['employee','family','retiree'],organization_id:'fixture',organization_name:'معمل مصطنع',contract_relationships:[{route:'family_network',network_members:['family','retiree'],contact_groups:{mobile:[],landline:['0502000002'],shortcode:['19104']}}]});
 const model=create({records:[],labs:[r,row('b',{organization_id:'fixture',organization_name:'معمل مصطنع',address:'مقر ثانٍ',markaz:'المنصورة'})],specialized_centers:[row('dental',{name:'مركز اختبار للأسنان',specialty:'null',category:'أسنان'})]});
 const p=model.providers.find(p=>p.source==='labs');assert.equal(p.branches.length,2);const employee=model.select(p,'a','employee'),family=model.select(p,'a','family');
 assert.deepEqual(employee.v.phones.shortcode,['16133']);assert.deepEqual(family.v.phones.shortcode,['19104']);assert.deepEqual(family.v.phones.landline,['0502000002']);assert.equal(family.v.phones.mobile.length,0);
 assert.equal(model.find({specialty:'الأسنان'}).length,1);assert.equal(model.find({specialty:'الأسنان'})[0].v.specialty,'الأسنان');
 assert.equal(model.find({markaz:'طلخا'}).filter(hit=>hit.provider.source==='labs').length,1);
});
test('facility reclassification retains canonical review targets and map links use the selected address',()=>{
 const model=create({records:[],hospitals:[row('moved',{category:'مركز متخصص · باطنة',maps_url:'javascript:alert(1)',address:'العنوان الأول | العنوان الثاني'})]});
 const hit=model.find({kind:'specialized_centers'})[0];assert.equal(hit.b.target,'hospitals:moved');assert.equal(model.find({kind:'hospitals'}).length,0);
 const link=model.mapLink(hit.provider,hit.v,'العنوان الثاني');assert.equal(new URL(link.href).searchParams.get('query'),'مركز اختبار العنوان الثاني طلخا الدقهلية مصر');
 assert.equal(M.text(null),'');assert.equal(M.text('null'),'');assert.equal(M.text('undefined'),'');assert.equal(model.stat(hit.provider,hit.b),null);
});
