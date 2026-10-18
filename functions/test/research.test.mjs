import test from 'node:test';
import assert from 'node:assert/strict';
import research from '../../js/directory-research.js';
test('external doctor opinions require the matching name, specialty and provider, and never become local review aggregates',()=>{
 const p={id:'provider_127',name:'د/ هديل البنهاوي',specialty:'الجلدية والتناسلية'};
 const facts=research.doctor(p);
 assert.equal(facts.source,'فيزيتا');assert.equal(facts.reviewDate,'يوليو 2018');
 assert.equal(research.doctor({...p,name:'طبيب آخر'}),null);
 assert.equal(research.doctor({...p,specialty:'العظام'}),null);
 assert.equal(research.doctor({...p,id:'unknown'}),null);
 assert.equal(new URL(facts.url).protocol,'https:');
});
test('unknown emergency hours remain unknown and facility opening cannot be labeled as emergency reception',()=>{
 assert.equal(research.urgent({id:'em_aga_central',name:'مستشفى أجا المركزي'}),null);
 const r={id:'em_dikirnis_general',name:'مستشفى دكرنس العام'};
 assert.equal(research.urgent(r).scope,'facility');
 assert.ok(!research.urgent(r).hours.includes('استقبال الطوارئ'));
 assert.equal(research.urgent({...r,name:'مستشفى أخرى'}),null);
 assert.equal(research.hospital({id:'staff_754',name:'مستشفى غير مرتبطة'}),null);
});
