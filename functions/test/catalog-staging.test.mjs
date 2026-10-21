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
 const exact=await f.analyze([{source_row:2,values:Object.fromEntries(Object.entries(M.sourceRow(f.catalog.labs[0])).filter(([,v])=>v))}]);assert.equal(exact.rows[0].status,'unchanged');await reject(()=>f.save('decide',{batch_id:exact.id,rows:[2],decision:'accepted'}),'IMPORT_BLOCKED');
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

test('private row correction repairs blocked phones, preserves the uploaded original and invalidates only affected decisions',async()=>{
 const f=fixture(),batch=await f.analyze([input({raw_phone:'1012345678'}),{source_row:3,values:{name:'معمل ثان تجريبي',address:'عنوان ثان',markaz:'طلخا',raw_phone:'01112345678'}}]);
 await f.save('decide',{batch_id:batch.id,rows:[3],decision:'accepted'});
 let view=(await f.save('amend',{batch_id:batch.id,source_row:2,values:input().values,confirm_identity:false})).workspace;
 assert.equal(view.batch.rows[0].status,'new');assert.equal(view.batch.rows[0].decision,'pending');assert.equal(view.batch.rows[0].originalInput.raw_phone,'1012345678');assert.equal(view.batch.rows[0].input.raw_phone,input().values.raw_phone);assert.equal(view.batch.rows[1].decision,'accepted');
 await f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});
 view=(await f.save('amend',{batch_id:batch.id,source_row:2,values:input({address:'عنوان منقح'}).values,confirm_identity:false})).workspace;assert.equal(view.batch.rows[0].decision,'pending');assert.equal(view.batch.rows[1].decision,'accepted');assert.equal(view.batch.lastAnalysis.decisionsReset,1);
 view=(await f.save('undo',{batch_id:batch.id})).workspace;assert.equal(view.batch.rows[0].decision,'accepted');assert.equal(view.batch.rows[0].input.address,'عنوان تجريبي');assert.equal(view.batch.rows[0].originalInput.raw_phone,'1012345678');
});
test('explicit identity confirmation resolves duplicates without auto-merging branches or modifying live identifiers',async()=>{
 const f=fixture(),before=await f.store.catalog(),batch=await f.analyze([input({name:'معمل تجريبي',address:'عنوان مصطنع أول'})]);assert.equal(batch.rows[0].status,'possible_duplicate');
 const update=input({id:'one',name:'معمل تجريبي',address:'عنوان مصطنع أول',raw_phone:'01112345678'}).values;
 await reject(()=>f.save('amend',{batch_id:batch.id,source_row:2,values:update,confirm_identity:false}),'IMPORT_IDENTITY_CONFIRMATION');
 let view=(await f.save('amend',{batch_id:batch.id,source_row:2,values:update,confirm_identity:true})).workspace;assert.equal(view.batch.rows[0].status,'update');assert.equal(view.batch.rows[0].before.id,'one');assert.equal(view.batch.rows[0].originalInput.id,undefined);
 assert.ok(view.batch.rows[0].notes.some(note=>note.includes('الإخفاء')));assert.ok(view.batch.rows[0].notes.some(note=>note.includes('الإيقاف')));
 await f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});const plan=await f.service.labImportPlan('admin',batch.id);assert.equal(plan.items[0].existingId,'one');assert.equal(plan.items[0].operation,'propose_update');assert.deepEqual(plan.items[0].contacts.mobile,['01112345678']);assert.equal(Object.hasOwn(plan.items[0].after,'service_status'),false);assert.equal(Object.hasOwn(plan.items[0].after,'directory_visibility'),false);assert.deepEqual(await f.store.catalog(),before);
 await reject(()=>f.save('amend',{batch_id:batch.id,source_row:2,values:input().values,confirm_identity:false}),'IMPORT_IDENTITY_CONFIRMATION');
});
test('editing one row rechecks duplicates across its whole batch and invalidates decisions when another row becomes identical',async()=>{
 const f=fixture(),batch=await f.analyze([input(),{source_row:3,values:input({name:'اسم ثان مختلف'}).values}]);await f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});
 const view=(await f.save('amend',{batch_id:batch.id,source_row:3,values:input().values,confirm_identity:false})).workspace;
 assert.ok(view.batch.rows.every(row=>row.status==='possible_duplicate'));assert.equal(view.batch.rows[0].decision,'pending');await reject(()=>f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'}),'IMPORT_BLOCKED');
});
test('rescan refreshes source values and undo cannot resurrect acceptance of a changed directory snapshot',async()=>{
 const f=fixture(),batch=await f.analyze([input({id:'one'})]);await f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});await f.save('decide',{batch_id:batch.id,rows:[2],decision:'rejected'});
 f.catalog.labs[0].address='عنوان غُيّر في الدليل';
 let view=(await f.save('undo',{batch_id:batch.id})).workspace;assert.equal(view.batch.rows[0].decision,'pending');assert.equal(view.batch.rows[0].before.address,f.catalog.labs[0].address);
 await f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});f.catalog.labs[0]._version++;
 await reject(()=>f.service.labImportPlan('admin',batch.id),'IMPORT_SOURCE_CHANGED');view=(await f.save('rescan',{batch_id:batch.id})).workspace;assert.equal(view.batch.rows[0].decision,'pending');assert.equal(view.batch.lastAnalysis.decisionsReset,1);
 await f.save('undo',{batch_id:batch.id});assert.equal((await f.service.labImports('admin',batch.id)).batch.rows[0].decision,'pending');
});
test('legacy batches require explicit rescan and old decisions remain historical even after undo through legacy journal entries',async()=>{
 const f=fixture(),batch=await f.analyze();await f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});await f.save('decide',{batch_id:batch.id,rows:[2],decision:'rejected'});
 const stored=await f.store.labWorkspaceRead(feature.id,'admin');delete stored.state.batches[0].analysisRevision;stored.state.batches[0].history=[{at:1,rows:[{source_row:2,decision:'pending'}]},{at:2,rows:[{source_row:2,decision:'accepted'}]}];delete stored.state.batches[0].rows[0].originalInput;f.store.labWorkspaces.set(feature.id+'|admin',stored);
 assert.equal((await f.service.labImports('admin',batch.id)).batch.requiresRescan,true);await reject(()=>f.service.labImportPlan('admin',batch.id),'IMPORT_RESCAN_REQUIRED');await reject(()=>f.save('amend',{batch_id:batch.id,source_row:2,values:input().values,confirm_identity:false}),'IMPORT_RESCAN_REQUIRED');
 let view=(await f.save('rescan',{batch_id:batch.id})).workspace;assert.equal(view.batch.requiresRescan,false);assert.equal(view.batch.rows[0].decision,'pending');assert.deepEqual(view.batch.rows[0].originalInput,input().values);
 await f.save('undo',{batch_id:batch.id});await f.save('undo',{batch_id:batch.id});view=await f.service.labImports('admin',batch.id);assert.equal(view.batch.rows[0].decision,'pending');
});
test('private proposal downloads require fresh live administrator access and include only accepted provider fields',async()=>{
 const f=fixture(),before=await f.store.catalog(),batch=await f.analyze([input(),{source_row:3,values:{name:'ناقص'}}]);
 await reject(()=>f.service.labImportPlan('admin',batch.id),'IMPORT_NO_ACCEPTED_ROWS');await f.save('decide',{batch_id:batch.id,rows:[2],decision:'accepted'});
 for(const token of ['','member'])await assert.rejects(()=>f.service.labImportPlan(token,batch.id),e=>e.status===(token?403:401));await reject(()=>f.service.labImportPlan('other',batch.id),'IMPORT_NOT_FOUND');
 const plan=await f.service.labImportPlan('admin',batch.id);assert.equal(plan.items.length,1);assert.equal(plan.scope,'private-proposals-only');assert.equal(plan.memberEnabled,false);assert.equal(plan.productionWriteSupported,false);assert.equal(plan.items[0].operation,'propose_add');assert.equal('history'in plan,false);assert.equal('originalInput'in plan.items[0],false);assert.equal(plan.planFingerprint.length,64);assert.deepEqual(await f.store.catalog(),before);
 f.store.labRows.set(feature.id,{previewEnabled:false});await reject(()=>f.service.labImportPlan('admin',batch.id),'LAB_PAUSED');f.store.labRows.clear();f.revoke();await assert.rejects(()=>f.service.labImportPlan('admin',batch.id),e=>e.status===403);
});
test('corrections and rescans keep concurrency, immutable request intents and the pause gate inside the transaction',async()=>{
 const f=fixture(),batch=await f.analyze(),body=await f.body('amend',{batch_id:batch.id,source_row:2,values:input({address:'عنوان معدل'}).values,confirm_identity:false});
 const result=await Promise.all([1,2].map(()=>f.service.saveLabImport('admin',body)));assert.equal(result.filter(r=>r.changed).length,1);assert.equal(result[0].workspace.batch.history.length,1);
 await reject(()=>f.service.saveLabImport('admin',{...body,payload:{...body.payload,values:input().values}}),'LAB_REQUEST_REUSED');await reject(()=>f.save('amend',body.payload,{expected_version:1}),'LAB_WORKSPACE_CONFLICT');
 for(const values of [{...input().values,nationalId:'private'},{...input().values,contract_listing:true},{...input().values,raw_phone:''}])await reject(()=>f.save('amend',{...body.payload,values}),'INVALID_IMPORT');
 const transact=f.store.labWorkspaceTransact;f.store.labWorkspaceTransact=(...args)=>{f.store.labRows.set(feature.id,{previewEnabled:false});return transact(...args);};await reject(()=>f.save('rescan',{batch_id:batch.id}),'LAB_PAUSED');
});
test('CSV proposal export quotes cells, neutralizes spreadsheet formulas and preserves phone and identifier leading zeros',()=>{
 const plan={audience:'admin',memberEnabled:false,productionWriteSupported:false,scope:'private-proposals-only',items:[{source_row:2,operation:'propose_update',existingId:'00123',after:{name:'=HYPERLINK("https://example.invalid")',address:'\t@SUM(1)',markaz:'طلخا',specialty:'مختبر',schedule:'سطر\nثان'},contacts:{mobile:['01012345678'],landline:['0502345678'],shortcode:['16133']}}]};
 const csv=M.planCSV(plan);assert.match(csv,/"'00123"/);assert.match(csv,/"'01012345678"/);assert.match(csv,/"'=HYPERLINK/);assert.match(csv,/"'\t@SUM/);assert.match(csv,/"سطر\nثان"/);assert.throws(()=>M.planCSV({...plan,memberEnabled:true}));
});

test('common spelling corrections still reveal potential duplicates without rewriting source identity',()=>{
 const original=row('pharmacy',{name:'صيدليه المثال'}),found=M.analyze('pharmacies',input({name:'صيدلية المثال',address:original.address}),{pharmacies:[original]});assert.equal(found.status,'possible_duplicate');assert.equal(found.candidates[0].id,original.id);assert.equal(original.name,'صيدليه المثال');
});
test('snapshot journal size limits reject the whole operation and preserve prior decisions without silent eviction',async()=>{
 const f=fixture(),rows=Array.from({length:20},(_,i)=>({source_row:i+2,values:{name:'معمل اختبار '+i,address:'ع'.repeat(500),markaz:'طلخا',raw_phone:'01012345678'}})),batch=await f.analyze(rows);
 let limit=false;
 for(let i=0;i<30;i++){const before=await f.service.labImports('admin',batch.id);try{await f.save('decide',{batch_id:batch.id,rows:rows.map(row=>row.source_row),decision:i%2?'rejected':'accepted'});}catch(error){assert.equal(error.code,'LAB_SPACE_LIMIT');assert.deepEqual(await f.service.labImports('admin',batch.id),before);limit=true;break;}}
 assert.equal(limit,true);
});
