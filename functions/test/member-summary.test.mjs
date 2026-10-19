import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {summary}=createRequire(import.meta.url)('../../js/member-summary.js');
test('header affiliation follows recorded membership type and retirement, without changing membership data',()=>{
  for(const type of ['عضو جمعية عمومية','عضو مجلس إدارة','عضو مجلس','رئيس المجلس','الأمين العام','أمين الصندوق','نائب الرئيس']){
    const profile={fields:{membershipStatus:type,workplace:'مكان عمل مصطنع'},memberState:'نشط'},before=JSON.stringify(profile);
    assert.deepEqual(summary(profile),{workplace:'مكان عمل مصطنع',affiliation:'نقابة عامة'});assert.equal(JSON.stringify(profile),before);
  }
  assert.equal(summary({membershipType:'نقابة مستقلة'}).affiliation,'نقابة مستقلة');
  assert.equal(summary({membershipType:'مستقلة',memberState:'معاش'}).affiliation,'معاش');
  assert.equal(summary({membershipType:'عضو مجلس إدارة',workState:'معاش'}).affiliation,'معاش');
  assert.equal(summary({fields:{memberState:'متقاعد',membershipStatus:'عضو جمعية عمومية'}}).affiliation,'معاش');
  assert.deepEqual(summary({}),{workplace:'',affiliation:''});
  assert.deepEqual(summary({workplace:'null',membershipType:'undefined'}),{workplace:'',affiliation:''});
  assert.equal(summary({membershipType:'صفة أخرى مسجلة'}).affiliation,'صفة أخرى مسجلة');
});
