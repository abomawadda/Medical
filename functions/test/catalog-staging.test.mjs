import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import M from '../src/catalog-staging.cjs';
import {importLabService} from '../src/lab-imports.mjs';
import {importFeature as feature} from '../src/lab-import-policy.mjs';
import {fixtureStore} from './memory-store.mjs';
import {ApiError} from '../src/core.mjs';
const row=(id='one',extra={})=>({id,name:'معمل تجريبي',address:'عنوان مصطنع أول',markaz:'طلخا',raw_phone:'01012345678',directory_visibility:'hidden',service_status:'suspended',_version:2,...extra});
const input=(extra={})=>({source_row:2,values:{name:'معمل جديد مصطنع',address:'عنوان تجريبي',markaz:'طلخا',raw_phone:'01012345678 - 0502345678 - 16133',...extra}});
function fixture(){const catalog={labs:[row()]},store=fixtureStore(catalog);store.catalog=async()=>structuredClone(catalog);let revoked=false;const service=importLabService({store,now:()=>Date.UTC(2026,9,21),authorize:async token=>{if(!token)throw new ApiError(401,'UNAUTHORIZED','');if(token==='member'||revoked)throw new ApiError(403,'FORBIDDEN','');return {sourceId:token};}});const body=async(operation,payload,extra={})=>({expected_version:(await service.labImports('admin')).version,previewRevision:feature.previewRevision,request_id:randomBytes(16).toString('hex'),operation,payload,...extra});const save=async(op,payload,extra={})=>service.saveLabImport('admin',await body(op,payload,extra));const analyze=async(rows=[input()])=>(await save('analyze',{kind:'labs',source:'مرجع جهات مصطنع',rows})).workspace.batch;return {store,catalog,service,body,save,analyze,revoke:()=>{revoked=true;}};}
const reject=(fn,code)=>assert.rejects(fn,e=>e.code===code);
test('local CSV/TSV reader preserves source lines, quoted addresses and phone zeros; mapping rejects identity headers and ignores unmapped columns',()=>{
 const table=M.parse('\ufeffالاسم,العنوان,المركز,محمول,أرضي,إضافي\r\n"معمل، مثال","عنوان, فرعي",طلخا,01012345678,0502345678,غير مرسل\r\n\r\nثان,شارع,طلخا,01112345678,,');
 const mapped=M.mapped(table,0,['name','address','markaz','raw_phone','raw_phone','']);assert.equal(mapped.length,2);assert.equal(mapped[1].source_row,4);assert.equal(mapped[0].values.address,'عنوان, فرعي');assert.equal(mapped[0].values.raw_phone,'01012345678 - 0502345678');assert.ok(!JSON.stringify(mapped).includes('غير مرسل'));
 assert.deepEqual(M.parse('الاسم\tالمركز\nمثال\tطلخا')[1],['مثال','طلخا']);assert.throws(()=>M.parse('"غير مكتمل'));assert.throws(()=>M.mapped([['الاسم','الرقم القومي'],['مثال','123']],0,['name','']),/حساسة/);assert.throws(()=>M.mapped(table,0,['name','name']),/عمودين/);
 assert.equal(M.mapped([['الاسم'],['=HYPERLINK("https://example.invalid")']],0,['name'])[0].issues.length,1);assert.equal(M.clean('٢٩٠١٠١٠١٢٣٤٥٦٧'),false);assert.throws(()=>M.parse('x'.repeat(1048577)),/ميجابايت/);
});
test('staging separates phone classes, blocks malformed values, preserves originals and proposes conservative Arabic corrections',()=>{
 const r=M.analyze('labs',input({name:'احمد التجريبي',address:'امام الجامعه'}),{});assert.equal(r.after.name,'أحمد التجريبي');assert.equal(r.input.name,'احمد التجريبي');assert.equal(r.after.address,'أمام الجامعة');assert.deepEqual(r.contacts.mobile,['01012345678']);assert.deepEqual(r.contacts.landline,['0502345678']);assert.deepEqual(r.contacts.shortcode,['16133']);assert.equal(r.status,'new');
 for(const raw_phone of ['1012345678','رقم غير مدرج'])assert.equal(M.analyze('labs',input({raw_phone}),{}).status,'blocked');
});
test('matching never merges same-name branches, shared reception phones or different kinds; explicit IDs are required for updates',()=>{
 const catalog={labs:[row(),row('two',{name:'معمل آخر',raw_phone:'01012345678'})],pharmacies:[row('different-kind')]};
 const branch=M.analyze('labs',input({name:'معمل تجريبي',address:'عنوان مصطنع ثان'}),catalog);assert.equal(branch.status,'new');assert.equal(branch.candidates.length,1);assert.ok(branch.notes.some(n=>n.includes('فرع')));
 assert.equal(M.analyze('labs',input({name:'معمل تجريبي',address:'عنوان مصطنع أول'}),catalog).status,'possible_duplicate');
 const update=M.analyze('labs',input({id:'one',name:'معمل تجريبي'}),catalog);assert.equal(update.status,'update');assert.ok(update.notes.some(n=>n.includes('الإخفاء')));assert.ok(update.notes.some(n=>n.includes('الإيقاف')));assert.equal(update.sourceVersion.version,2);assert.ok(!Object.hasOwn(update.after,'directory_visibility'));
 assert.equal(M.analyze('labs',input({id:'missing'}),catalog).status,'blocked');assert.equal(M.analyze('labs',input({id:'one'}),{labs:[row(),row()]}).status,'ambiguous');
});
test('imports require live administrator access on every read and write, isolate owners and never change directory or members',async()=>{
 const f=fixture(),before=await f.store.catalog();for(const token of ['', 'member']){await assert.rejects(()=>f.service.labImports(token),e=>e.status===(token?403:401));await assert.rejects(()=>f.service.saveLabImport(token,{}),e=>e.status===(token?403:401));}
 const batch=await f.analyze(),view=await f.service.labImports('admin',batch.id);assert.equal(view.audience,'admin');assert.equal(view.memberEnabled,false);assert.equal(view.productionWriteSupported,false);assert.equal((await f.service.labImports('other')).batches.length,0);await reject(()=>f.service.labImports('other',batch.id),'IMPORT_NOT_FOUND');
 await f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});assert.deepEqual(await f.store.catalog(),before);for(const key of ['reviews','overlays','profileNotes'])assert.equal(f.store[key].size,0);assert.ok(!JSON.stringify(f.store.audit).includes('معمل'));f.revoke();await assert.rejects(()=>f.service.labImports('admin'),e=>e.status===403);
});
test('analyze and decisions are transactional, version-guarded and retry-safe with immutable request intents',async()=>{
 const f=fixture(),body=await f.body('analyze',{kind:'labs',source:'مصدر مصطنع',rows:[input()]});const results=await Promise.all([1,2].map(()=>f.service.saveLabImport('admin',body)));assert.equal(results.filter(r=>r.changed).length,1);assert.equal((await f.service.labImports('admin')).batches.length,1);await reject(()=>f.service.saveLabImport('admin',{...body,payload:{...body.payload,source:'مصدر مختلف'}}),'LAB_REQUEST_REUSED');
 const batch=results[0].workspace.batch;await reject(()=>f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'},{expected_version:0}),'LAB_WORKSPACE_CONFLICT');
 const decide=await f.body('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});const accepted=await Promise.all([1,2].map(()=>f.service.saveLabImport('admin',decide)));assert.equal(accepted.filter(r=>r.changed).length,1);assert.equal(accepted[0].workspace.batch.history.length,1);assert.equal((await f.service.saveLabImport('admin',decide)).changed,false);
});
test('acceptance rejects changed source data, visibility, disappearance and newly appearing duplicates',async()=>{
 for(const mutate of [c=>{c.labs[0].address='عنوان تغير';},c=>{c.labs[0].directory_visibility='visible';},c=>{c.labs=[];},c=>{c.labs.push(row('three',{name:'معمل جديد مصطنع',address:'عنوان تجريبي'}));}]){
  const f=fixture(),batch=await f.analyze([input({id:'one'})]);mutate(f.catalog);await reject(()=>f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'}),'IMPORT_SOURCE_CHANGED');assert.equal((await f.service.labImports('admin',batch.id)).batch.rows[0].decision,'pending');
 }
 const f=fixture(),batch=await f.analyze();f.catalog.labs.push(row('new',{name:'معمل جديد مصطنع',address:'عنوان تجريبي'}));await reject(()=>f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'}),'IMPORT_SOURCE_CHANGED');
});
test('ambiguous, invalid, matching and within-file duplicate rows cannot be accepted; batch decisions are all-or-nothing',async()=>{
 const f=fixture();const batch=await f.analyze([input(),{source_row:3,values:{name:'ناقص'}}]);await reject(()=>f.save('decide',{batch_id:batch.id,rows:[2,3],decision:'accepted'}),'IMPORT_BLOCKED');assert.equal((await f.service.labImports('admin',batch.id)).batch.rows[0].decision,'pending');
 const duplicate=await f.analyze([input(),{...input(),source_row:4}]);assert.ok(duplicate.rows.every(r=>r.status==='possible_duplicate'));await reject(()=>f.save('decide',{batch_id:duplicate.id,rows:[2],decision:'accepted'}),'IMPORT_BLOCKED');
 const exact=await f.analyze([{source_row:2,values:M.sourceRow(f.catalog.labs[0])}]);assert.equal(exact.rows[0].status,'unchanged');await reject(()=>f.save('decide',{batch_id:exact.id,rows:[2],decision:'accepted'}),'IMPORT_BLOCKED');
});
test('undo restores complete prior row decisions; discarded private batches cannot be used and may be deleted without live rollback',async()=>{
 const f=fixture(),batch=await f.analyze([input(),{source_row:3,values:{name:'ناقص'}}]);await f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});await f.save('decide',{batch_id:batch.id,rows:[2,3],decision:'rejected'});
 let w=(await f.save('undo',{batch_id:batch.id})).workspace;assert.deepEqual(w.batch.rows.map(r=>r.decision),['accepted','pending']);await f.save('undo',{batch_id:batch.id});await reject(()=>f.save('undo',{batch_id:batch.id}),'IMPORT_NO_HISTORY');await reject(()=>f.save('remove',{batch_id:batch.id}),'IMPORT_NOT_DISCARDED');
 await f.save('discard',{batch_id:batch.id});await reject(()=>f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'}),'IMPORT_DISCARDED');w=(await f.save('remove',{batch_id:batch.id})).workspace;assert.equal(w.batches.length,0);assert.equal(w.batch,null);
});
test('pause is checked inside transactions; revision and payload allowlists prevent activation or injected data',async()=>{
 const f=fixture(),transact=f.store.labWorkspaceTransact;f.store.labWorkspaceTransact=(...args)=>{f.store.labRows.set(feature.id,{previewEnabled:false});return transact(...args);};await reject(()=>f.analyze(),'LAB_PAUSED');f.store.labWorkspaceTransact=transact;await reject(()=>f.service.labImports('admin'),'LAB_PAUSED');f.store.labRows.clear();
 await reject(()=>f.save('analyze',{kind:'labs',source:'مصدر مصطنع',rows:[input()]},{previewRevision:'old'}),'LAB_REVISION_CHANGED');
 for(const extra of [{nationalId:'private'},{directory_visibility:'visible'},{contract_listing:true},{name:'<script>'},{raw_phone:'٢٩٠١٠١٠١٢٣٤٥٦٧'}])await reject(()=>f.analyze([input(extra)]),'INVALID_IMPORT');
 await reject(()=>f.save('publish',{}),'INVALID_IMPORT');await reject(()=>f.save('analyze',{kind:'employees',source:'مصدر',rows:[input()]}),'INVALID_IMPORT');assert.equal(f.store.labWorkspaces.size,0);
});
test('batch and decision history limits preserve saved reviews rather than silently evicting them',async()=>{
 const f=fixture();for(let i=0;i<5;i++)await f.analyze();await reject(()=>f.analyze(),'LAB_SPACE_LIMIT');assert.equal((await f.service.labImports('admin')).batches.length,5);
 const g=fixture(),batch=await g.analyze();for(let i=0;i<30;i++)await g.save('decide',{batch_id:batch.id,rows:[2],decision:i%2?'rejected':'accepted'});await reject(()=>g.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'}),'IMPORT_HISTORY_LIMIT');assert.equal((await g.service.labImports('admin',batch.id)).batch.history.length,30);
});

test('truncated display of candidate branches never hides an exact duplicate later in the directory',()=>{
 const labs=Array.from({length:10},(_,i)=>row(String(i),{address:'عنوان آخر '+i}));labs[9].address='عنوان تجريبي';const found=M.analyze('labs',input({name:'معمل تجريبي'}),{labs});assert.equal(found.candidates.length,8);assert.equal(found.candidateCount,10);assert.equal(found.status,'possible_duplicate');
 assert.throws(()=>M.parse(Array.from({length:41},()=> 'x').join(',')),/40/);assert.throws(()=>M.parse(Array.from({length:1002},()=> 'x').join('\n')),/1000/);
});
