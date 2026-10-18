import test from 'node:test';
import assert from 'node:assert/strict';
import arabic from '../src/arabic-directory.cjs';
import criteria from '../src/review-criteria.cjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const locations=require('../../js/locations.js');

test('Arabic directory spelling fixes known words, preserves source evidence, identity keys and ambiguous proper names',()=>{
 const original={id:'اكرم',provider_id:'مستشفي',name:'اكرم الخريبى',address:'اول شارع الثوره أمام مبني الجامعه',raw_name:'اكرم الخريبى',contract_relationships:[{address:'شارع اولاد عمر'}]};
 const result=arabic.entity(original);
 assert.equal(result.name,'أكرم الخريبى');assert.equal(result.address,'أول شارع الثورة أمام مبنى الجامعة');
 assert.equal(result.id,original.id);assert.equal(result.provider_id,original.provider_id);assert.equal(result.raw_name,original.raw_name);
 assert.equal(result.contract_relationships[0].address,'شارع أولاد عمر');assert.deepEqual(arabic.entity(result),result);assert.equal(original.name,'اكرم الخريبى');
 assert.equal(arabic.correct('علي يحيى هدى عبد الله أبو النجا','name'),'علي يحيى هدى عبد الله أبو النجا');
});
test('source address separation preserves internal/external labels without inventing a map for phone-only locations',()=>{
 assert.deepEqual(locations.parts('داخلي: مستشفى السلاب | خارجي: ش بنك مصر').map(p=>p.text),['داخلي: مستشفى السلاب','خارجي: ش بنك مصر']);
 assert.equal(locations.parts('منية النصر: 01012345678')[0].mappable,false);
 assert.equal(locations.parts('د/ أحمد - شارع الجمهورية').length,1);
 assert.equal(locations.parts('شارع الجمهورية / طلخا مركز السامي').length,2);
});
test('review criteria accept only observed integer scores and canonicalize field order, while retaining legacy reviews',()=>{
 assert.equal(criteria.parse(undefined),undefined);
 assert.deepEqual(criteria.parse({service:4,reception:2}),{reception:2,service:4});
 for(const bad of [null,[],{}, {reception:0},{waiting:6},{cleanliness:'5'},{service:2.5},{medical_competence:5}])assert.throws(()=>criteria.parse(bad));
});
