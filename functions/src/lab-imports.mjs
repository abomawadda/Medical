import {createHash} from 'node:crypto';
import {ApiError} from './core.mjs';
import model from './catalog-staging.cjs';
import {importFeature as feature} from './lab-import-policy.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const guard=(saved,revision)=>{
 if(revision&&revision!==feature.previewRevision)fail(409,'LAB_REVISION_CHANGED','تغير إصدار مركز الجودة؛ حدّث التطبيق.');
 if(saved.previewEnabled===false)fail(409,'LAB_PAUSED','مركز الجودة موقوف من معمل التطوير.');
};
const needsRescan=batch=>batch.analysisRevision!==feature.previewRevision;
const counts=batch=>Object.fromEntries(['pending','accepted','rejected'].map(key=>[key,batch.rows.filter(row=>row.decision===key).length]));
const summary=batch=>({id:batch.id,kind:batch.kind,source:batch.source,createdAt:batch.createdAt,discarded:batch.discarded,requiresRescan:needsRescan(batch),rows:batch.rows.length,counts:counts(batch)});
const batchView=batch=>batch?{...batch,requiresRescan:needsRescan(batch),rows:batch.rows.map(row=>({...row,originalInput:row.originalInput||row.input}))}:null;
const project=(saved,id)=>({audience:'admin',memberEnabled:false,productionWriteSupported:false,privatePlanSupported:true,previewRevision:feature.previewRevision,version:saved.version||0,batches:(saved.state?.batches||[]).map(summary),batch:batchView((saved.state?.batches||[]).find(batch=>batch.id===id))});
function validateRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>model.limits.rows)fail(400,'INVALID_IMPORT','الدفعة من صف واحد إلى 30 صفًا.');
 const numbers=new Set();
 for(const row of rows){
  if(!exact(row,['source_row','values'])||!Number.isSafeInteger(row.source_row)||row.source_row<2||row.source_row>1001||numbers.has(row.source_row)||!exact(row.values,Object.keys(model.fields))||!Object.keys(row.values).length||Object.entries(row.values).some(([key,value])=>!model.clean(value)||!value.trim()||value!==value.trim()||key==='id'&&!/^[\p{L}\p{N}_:-]{1,100}$/u.test(value)))fail(400,'INVALID_IMPORT','راجع صفوف الدليل؛ لا تُرسل حقول أعضاء أو أعمدة إضافية أو خلايا غير آمنة.');
  numbers.add(row.source_row);
 }
}
function analyzeRows(kind,inputs,catalog,originals=new Map()){
 const result=inputs.map(input=>model.analyze(kind,input,catalog));
 for(const row of result){
  const key=model.fold(row.after.name)+'|'+model.fold(row.after.address);
  const repeated=result.some(other=>other!==row&&((row.input.id&&other.input.id===row.input.id)||key===model.fold(other.after.name)+'|'+model.fold(other.after.address)));
  if(repeated){row.status='possible_duplicate';row.issues.push('صف مشابه أو معرّف مكرر داخل الدفعة؛ افصل الفروع أو صحح الملف');}
  // Include every candidate, even those outside the eight displayed suggestions.
  const matches=(catalog[kind]||[]).filter(source=>String(source.id)===row.input.id||model.nameKey(source.name||source.display_name)===model.nameKey(row.after.name)).map(source=>[String(source.id),model.sourceRow(source),source._version||0,source.directory_visibility||'visible',source.service_status||'',source.contract_listing??null]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
  row.originalInput=structuredClone(originals.get(row.source_row)||row.input);
  row.fingerprint=hash([row.input,row.status,row.before,row.after,row.sourceVersion,matches]);
 }
 return result;
}
const snapshot=batch=>({kind:'snapshot',analysisRevision:batch.analysisRevision||'legacy',rows:batch.rows.map(row=>({source_row:row.source_row,input:row.input,fingerprint:row.fingerprint,decision:row.decision}))});
function history(batch,operation,at){
 if(batch.history.length>=30)fail(409,'IMPORT_HISTORY_LIMIT','وصل سجل الدفعة إلى 30 قرارًا؛ تراجع عن قرار أو ابدأ دفعة جديدة دون حذف السجل القديم.');
 batch.history.push({...snapshot(batch),operation,at});
}
function refresh(batch,inputs,catalog,at,forcePending=false){
 const old=new Map(batch.rows.map(row=>[row.source_row,row])),originals=new Map(batch.rows.map(row=>[row.source_row,row.originalInput||row.input]));
 const rows=analyzeRows(batch.kind,inputs,catalog,originals);let changed=0,reset=0;
 for(const row of rows){const previous=old.get(row.source_row),different=forcePending||row.fingerprint!==previous?.fingerprint;if(different)changed++;row.decision=different?'pending':previous.decision;if(different&&previous.decision!=='pending')reset++;}
 batch.rows=rows;batch.analysisRevision=feature.previewRevision;batch.checkedAt=at;batch.lastAnalysis={changed,decisionsReset:reset};return changed;
}
function restore(batch,entry,catalog,at){
 const previous=new Map(batch.rows.map(row=>[row.source_row,row]));
 const saved=new Map(entry.rows.map(row=>[row.source_row,row]));
 const inputs=batch.rows.map(row=>({source_row:row.source_row,values:saved.get(row.source_row)?.input||row.input}));
 refresh(batch,inputs,catalog,at);
 for(const row of batch.rows){const prior=saved.get(row.source_row)||previous.get(row.source_row),fingerprint=prior.fingerprint||previous.get(row.source_row)?.fingerprint;row.decision=row.fingerprint===fingerprint?prior.decision:'pending';}
 // Old revision approvals are historical, even if their values still match.
 if(entry.analysisRevision&&entry.analysisRevision!==feature.previewRevision)for(const row of batch.rows)row.decision='pending';
}
function requireBatch(saved,id){const batch=(saved.state?.batches||[]).find(batch=>batch.id===id);if(!batch)fail(404,'IMPORT_NOT_FOUND','الدفعة غير موجودة في مساحة حسابك.');return batch;}
function current(batch){if(needsRescan(batch))fail(409,'IMPORT_RESCAN_REQUIRED','هذه الدفعة من إصدار سابق؛ أعد فحصها قبل التحرير أو القرار أو تنزيل المقترحات.');}
export function importLabService({store,authorize,now}){return {
 async labImports(token,id){
  const actor=await authorize(token,'admin');guard(await store.labRead(feature.id));const saved=await store.labWorkspaceRead(feature.id,actor.sourceId);
  if(id)requireBatch(saved,id);return project(saved,id);
 },
 async labImportPlan(token,id){
  const actor=await authorize(token,'admin');guard(await store.labRead(feature.id));const saved=await store.labWorkspaceRead(feature.id,actor.sourceId),batch=requireBatch(saved,id);
  if(batch.discarded)fail(409,'IMPORT_DISCARDED','هذه الدفعة مستبعدة.');current(batch);
  const accepted=batch.rows.filter(row=>row.decision==='accepted');if(!accepted.length)fail(409,'IMPORT_NO_ACCEPTED_ROWS','اقبل صفًا سليمًا للمراجعة قبل تنزيل المقترحات.');
  const catalog=await store.catalog(),fresh=analyzeRows(batch.kind,batch.rows.map(row=>({source_row:row.source_row,values:row.input})),catalog);
  for(const row of accepted){if(!['new','update'].includes(row.status)||row.fingerprint!==fresh.find(next=>next.source_row===row.source_row)?.fingerprint)fail(409,'IMPORT_SOURCE_CHANGED','تغيرت بيانات الجهة أو تطابقاتها؛ أعد فحص الدفعة وراجع القرارات قبل تنزيل المقترحات.');}
  const items=accepted.map(row=>({source_row:row.source_row,operation:row.status==='new'?'propose_add':'propose_update',existingId:row.input.id||null,before:row.before,after:row.after,changes:row.changes,contacts:Object.fromEntries(['mobile','landline','shortcode'].map(key=>[key,row.contacts[key]]))}));
  return {audience:'admin',memberEnabled:false,productionWriteSupported:false,previewRevision:feature.previewRevision,workspaceVersion:saved.version,batchId:batch.id,kind:batch.kind,source:batch.source,checkedAt:now(),scope:'private-proposals-only',items,planFingerprint:hash([batch.id,saved.version,items])};
 },
 async saveLabImport(token,body){
  const actor=await authorize(token,'admin');guard(await store.labRead(feature.id),body?.previewRevision);
  if(!exact(body,['previewRevision','expected_version','request_id','operation','payload'])||body.previewRevision!==feature.previewRevision||!Number.isSafeInteger(body.expected_version)||body.expected_version<0||!/^[a-f0-9]{32}$/.test(body.request_id)||!['analyze','decide','amend','rescan','undo','discard','remove'].includes(body.operation)||!exact(body.payload,Object.keys(body.payload||{})))fail(400,'INVALID_IMPORT','طلب مراجعة الدفعة غير صالح.');
  const payload=body.payload,operation=body.operation;
  if(operation==='analyze'){
   if(!exact(payload,['kind','source','rows'])||!Object.hasOwn(model.kinds,payload.kind)||!model.clean(payload.source)||payload.source.trim().length<3||payload.source.length>180)fail(400,'INVALID_IMPORT','اختر القسم وأضف مرجعًا واضحًا لملف الجهات.');validateRows(payload.rows);
  }else{
   const keys=operation==='decide'?['batch_id','rows','decision']:operation==='amend'?['batch_id','source_row','values','confirm_identity']:['batch_id'];
   if(!exact(payload,keys)||!/^[a-f0-9]{32}$/.test(payload.batch_id))fail(400,'INVALID_IMPORT','راجع الدفعة والصفوف المحددة.');
   if(operation==='decide'&&(!Array.isArray(payload.rows)||!payload.rows.length||payload.rows.length>30||new Set(payload.rows).size!==payload.rows.length||payload.rows.some(number=>!Number.isSafeInteger(number))||!['accepted','rejected','pending'].includes(payload.decision)))fail(400,'INVALID_IMPORT','راجع الصفوف المحددة وقرار المراجعة.');
   if(operation==='amend'){validateRows([{source_row:payload.source_row,values:payload.values}]);if(typeof payload.confirm_identity!=='boolean')fail(400,'INVALID_IMPORT','أكد قرار الربط بمعرّف السجل صراحة.');}
  }
  const catalog=['analyze','decide','amend','rescan','undo'].includes(operation)?await store.catalog():null,intent=hash(body),id=operation==='analyze'?body.request_id:payload.batch_id;
  return store.labWorkspaceTransact(feature.id,actor.sourceId,(saved,currentFeature)=>{
   guard(currentFeature,body.previewRevision);
   const seen=(saved.requests||[]).find(request=>request.id===body.request_id);
   if(seen){if(seen.intent!==intent)fail(409,'LAB_REQUEST_REUSED','معرف العملية مستخدم لقيم مختلفة.');return {changed:false,workspace:project(saved,id)};}
   if((saved.version||0)!==body.expected_version)fail(409,'LAB_WORKSPACE_CONFLICT','حُفظ قرار أحدث؛ حدّث الدفعات قبل إعادة القرار.');
   const state=structuredClone(saved.state||{batches:[]});let batch=state.batches.find(batch=>batch.id===id);
   if(operation==='analyze'){
    if(state.batches.length>=model.limits.batches)fail(409,'LAB_SPACE_LIMIT','حد المساحة خمس دفعات؛ احذف دفعة مستبعدة لإضافة أخرى.');
    batch={id,kind:payload.kind,source:payload.source.trim(),createdAt:now(),checkedAt:now(),analysisRevision:feature.previewRevision,discarded:false,rows:analyzeRows(payload.kind,payload.rows,catalog),history:[]};state.batches.push(batch);
   }else{
    if(!batch)fail(404,'IMPORT_NOT_FOUND','الدفعة غير موجودة في مساحة حسابك.');
    if(operation==='remove'){
     if(!batch.discarded)fail(409,'IMPORT_NOT_DISCARDED','استبعد الدفعة أولًا قبل حذف نسختها الخاصة.');state.batches=state.batches.filter(batch=>batch.id!==id);
    }else if(batch.discarded)fail(409,'IMPORT_DISCARDED','هذه الدفعة مستبعدة؛ لا يمكن اعتمادها.');
    else if(operation==='discard')batch.discarded=true;
    else if(operation==='rescan'||operation==='amend'){
     if(operation==='amend')current(batch);
     const inputs=batch.rows.map(row=>({source_row:row.source_row,values:row.input}));
     if(operation==='amend'){
      const index=inputs.findIndex(row=>row.source_row===payload.source_row);if(index<0)fail(400,'INVALID_IMPORT','صف غير موجود في الدفعة.');
      if((inputs[index].values.id||'')!==(payload.values.id||'')&&!payload.confirm_identity)fail(409,'IMPORT_IDENTITY_CONFIRMATION','تغيير ربط المعرّف أو إلغاؤه يحتاج تأكيدك؛ الاسم وحده لا يثبت هوية الجهة.');
      inputs[index].values=payload.values;
     }
     if(needsRescan(batch))batch.history=batch.history.map(entry=>({...entry,analysisRevision:entry.analysisRevision||batch.analysisRevision||'legacy'}));
     const previous=snapshot(batch),changed=refresh(batch,inputs,catalog,now(),needsRescan(batch));
     if(!changed)return {changed:false,workspace:project(saved,id)};
     if(batch.history.length>=30)fail(409,'IMPORT_HISTORY_LIMIT','وصل سجل الدفعة إلى 30 قرارًا؛ تراجع أو ابدأ دفعة جديدة.');batch.history.push({...previous,operation,at:now()});
    }else{
     current(batch);
     if(operation==='undo'){
      const entry=batch.history.pop();if(!entry)fail(409,'IMPORT_NO_HISTORY','لا يوجد قرار للتراجع عنه.');restore(batch,entry,catalog,now());
     }else{
      const selected=payload.rows.map(number=>batch.rows.find(row=>row.source_row===number));if(selected.some(row=>!row))fail(400,'INVALID_IMPORT','صف غير موجود في الدفعة.');
      if(payload.decision==='accepted'){
       const fresh=analyzeRows(batch.kind,batch.rows.map(row=>({source_row:row.source_row,values:row.input})),catalog);
       for(const row of selected){if(!['new','update'].includes(row.status))fail(409,'IMPORT_BLOCKED','الاعتماد الخاص متاح للصفوف الجديدة أو المعدلة السليمة فقط.');if(fresh.find(next=>next.source_row===row.source_row)?.fingerprint!==row.fingerprint)fail(409,'IMPORT_SOURCE_CHANGED','تغيرت بيانات الجهة أو تطابقاتها؛ أعد فحص الدفعة قبل القرار.');}
      }
      if(selected.every(row=>row.decision===payload.decision))return {changed:false,workspace:project(saved,id)};
      history(batch,operation,now());for(const row of selected)row.decision=payload.decision;
     }
    }
   }
   if(Buffer.byteLength(JSON.stringify(state))>700000)fail(409,'LAB_SPACE_LIMIT','مساحة المعاينة ممتلئة؛ لا نحذف دفعاتك تلقائيًا.');
   const next={state,version:(saved.version||0)+1,updatedAt:now(),requests:[...(saved.requests||[]),{id:body.request_id,intent}].slice(-40)};
   return {changed:true,next,workspace:project(next,operation==='remove'?undefined:id)};
  });
 }
};}
