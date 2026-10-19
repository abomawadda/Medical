import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../src/content-policy.cjs';
const row={id:'news',publication_status:'published',document_type:'news',issuing_authority:'جهة اختبار',source_reference:'مرجع',verified_at:'2026-10-19',publication_revision:1};
test('content windows and Cairo date boundaries are consistent in browser and service',()=>{
 const now=Date.parse('2026-10-19T09:00:00.000Z');
 assert.equal(C.status({...row,display_from:'2026-10-19T09:01:00.000Z'},now),'scheduled');
 assert.equal(C.status({...row,display_until:'2026-10-19T09:00:00.000Z'},now),'expired');
 assert.equal(C.status({...row,expires_at:'2026-10-19'},Date.parse('2026-10-19T21:00:00.000Z')),'expired');
 assert.equal(C.status({...row,publication_status:'archived'},now),'archived');
 assert.equal(C.status({...row,issuing_authority:''},now),'incomplete');
 assert.equal(C.visible(row,now),true);
});
test('Cairo form conversion works independent of machine timezone with daylight saving',()=>{
 assert.equal(C.cairoISO('2026-10-19T12:00'),'2026-10-19T09:00:00.000Z');
 assert.equal(C.cairoISO('2026-01-19T12:00'),'2026-01-19T10:00:00.000Z');
 assert.equal(C.cairoInput('2026-10-19T09:00:00.000Z'),'2026-10-19T12:00');
 assert.throws(()=>C.cairoISO('2026-02-30T10:00'));
});
test('ordinary edits preserve notification identity; explicit republication changes it',()=>{
 assert.equal(C.key(row),C.key({...row,title:'عنوان جديد',summary:'تصحيح',directory_update:{at:'later'}}));
 assert.notEqual(C.key(row),C.key({...row,publication_revision:2}));
 assert.equal(C.announcement({...row,document_type:'bulletin'}),true);assert.equal(C.announcement({...row,document_type:'instruction'}),false);
});
