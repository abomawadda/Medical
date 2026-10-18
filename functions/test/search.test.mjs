import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {match,normalize}=createRequire(import.meta.url)('../../js/search.js');
const dawi={name:'عيادات داوي',tags:['مراكز متخصصة'],details:['المنصورة']};
test('Arabic directory search handles spelling, punctuation, unordered words and provider categories',()=>{
 for(const query of ['داوي','داوى','عِيادات دَاوِي','مركز داوي متخصص','متخصصة داوي مراكز','عايز عياده داوي في المنصوره'])assert.ok(match(query,dawi).score>0,query);
 assert.equal(normalize('إشـعَة ٠٥٠'),'اشعه 050');
 assert.ok(match('علي',{name:'د/ علي السيد',tags:['أطباء']}).score>0);
 assert.ok(match('عايز دكتور سنان',{name:'طبيب اختبار',tags:['أطباء','أسنان']}).score>0);
 assert.ok(match('مختبر تحليل',{name:'ألفا',tags:['معامل التحاليل']}).score>0);
});
test('limited typo and transposition suggestions rank below exact matches and never invent a missing term',()=>{
 assert.equal(match('دواي',dawi).approximate,true);
 assert.equal(match('داووي',dawi).approximate,true);
 assert.ok(match('داوي',dawi).score>match('دواي',dawi).score);
 assert.equal(match('داوي طنطا',dawi).score,0);
 assert.equal(match('داوي قلب',{...dawi,tags:['مراكز متخصصة']}).score,0);
 assert.equal(match('01550100024',{name:'جهة',details:['01550100025']}).score,0);
 assert.equal(match('عايز في',{name:'جهة'}).score,0);
 assert.equal(match('زززززز',dawi).score,0);
 assert.equal(match('دواي',{name:'طبيب اختبار',details:['بجوار المستشفى الدولي']}).score,0);
 assert.ok(match('دواي',dawi).score>match('دواي',{name:'مستشفى الجزيرة الدولي بالمنصورة'}).score);
});
