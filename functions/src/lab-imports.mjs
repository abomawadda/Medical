import {createHash} from 'node:crypto';
import {ApiError} from './core.mjs';
import model from './catalog-staging.cjs';
import {importFeature as feature} from './lab-import-policy.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const guard=(saved,revision)=>{if(revision&&revision!==feature.previewRevision)fail(409,'LAB_REVISION_CHANGED','تغير إصدار مركز الجودة؛ حدّث التطبيق.');if(saved.previewEnabled===false)fail(409,'LAB_PAUSED','مركز الجودة موقوف من معمل التطوير.');};
const fingerprint=row=>hash([row.status,row.before,row.after,row.candidates,row.candidateCount,row.sourceVersion]);
const counts=batch=>Object.fromEntries(['pending','accepted','rejected'].map(key=>[key,batch.rows.filter(r=>r.decision===key).length]));
const summary=batch=>({id:batch.id,kind:batch.kind,source:batch.source,createdAt:batch.createdAt,discarded:batch.discarded,rows:batch.rows.length,counts:counts(batch)});
const project=(saved,id)=>({audience:'admin',memberEnabled:false,productionWriteSupported:false,previewRevision:feature.previewRevision,version:saved.version||0,batches:(saved.state?.batches||[]).map(summary),batch:id?(saved.state?.batches||[]).find(b=>b.id===id)||null:null});
function validateRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>model.limits.rows)fail(400,'INVALID_IMPORT','الدفعة من صف واحد إلى 30 صفًا.');
 const lineNumbers=new Set();for(const r of rows){if(!exact(r,['source_row','values'])||!Number.isSafeInteger(r.source_row)||r.source_row<2||r.source_row>1001||lineNumbers.has(r.source_row)||!exact(r.values,Object.keys(model.fields))||!Object.keys(r.values).length||Object.entries(r.values).some(([k,v])=>!model.clean(v)||v!==v.trim()||k==='id'&&!/^[\p{L}\p{N}_:-]{1,100}$/u.test(v)))fail(400,'INVALID_IMPORT','راجع صفوف الدليل؛ لا تُرسل حقول أعضاء أو أعمدة إضافية أو خلايا غير آمنة.');lineNumbers.add(r.source_row);}
}
function analyzeRows(kind,rows,catalog){const result=rows.map(r=>model.analyze(kind,r,catalog));for(const r of result){const key=model.fold(r.after.name)+'|'+model.fold(r.after.address),repeated=result.filter(other=>other!==r&&((r.input.id&&other.input.id===r.input.id)||key===model.fold(other.after.name)+'|'+model.fold(other.after.address)));if(repeated.length){r.status='possible_duplicate';r.issues.push('صف مشابه أو معرّف مكرر داخل الدفعة؛ افصل الفروع أو صحح الملف');}r.fingerprint=fingerprint(r);}return result;}
export function importLabService({store,authorize,now}){return {
 async labImports(token,id){const actor=await authorize(token,'admin');guard(await store.labRead(feature.id));const saved=await store.labWorkspaceRead(feature.id,actor.sourceId),view=project(saved,id);if(id&&!view.batch)fail(404,'IMPORT_NOT_FOUND','الدفعة غير موجودة في مساحة حسابك.');return view;},
 async saveLabImport(token,body){
  const actor=await authorize(token,'admin');guard(await store.labRead(feature.id),body?.previewRevision);
  if(!exact(body,['previewRevision','expected_version','request_id','operation','payload'])||body.previewRevision!==feature.previewRevision||!Number.isSafeInteger(body.expected_version)||body.expected_version<0||!/^[a-f0-9]{32}$/.test(body.request_id)||!['analyze','decide','undo','discard','remove'].includes(body.operation)||!exact(body.payload,Object.keys(body.payload||{})))fail(400,'INVALID_IMPORT','طلب مراجعة الدفعة غير صالح.');
  const p=body.payload,op=body.operation;
  if(op==='analyze'){if(!exact(p,['kind','source','rows'])||!Object.hasOwn(model.kinds,p.kind)||!model.clean(p.source)||p.source.trim().length<3||p.source.length>180)fail(400,'INVALID_IMPORT','اختر القسم وأضف مرجعًا واضحًا لملف الجهات.');validateRows(p.rows);}
  else if(!exact(p,op==='decide'?['batch_id','rows','decision']:['batch_id'])||!/^[a-f0-9]{32}$/.test(p.batch_id)||op==='decide'&&(!Array.isArray(p.rows)||!p.rows.length||p.rows.length>30||new Set(p.rows).size!==p.rows.length||p.rows.some(n=>!Number.isSafeInteger(n))||!['accepted','rejected','pending'].includes(p.decision)))fail(400,'INVALID_IMPORT','راجع الدفعة والصفوف المحددة.');
  const catalog=['analyze','decide'].includes(op)?await store.catalog():null,intent=hash(body),id=op==='analyze'?body.request_id:p.batch_id;
  return store.labWorkspaceTransact(feature.id,actor.sourceId,(saved,currentFeature)=>{
   guard(currentFeature,body.previewRevision);const seen=(saved.requests||[]).find(r=>r.id===body.request_id);if(seen){if(seen.intent!==intent)fail(409,'LAB_REQUEST_REUSED','معرف العملية مستخدم لقيم مختلفة.');return {changed:false,workspace:project(saved,id)};}
   if((saved.version||0)!==body.expected_version)fail(409,'LAB_WORKSPACE_CONFLICT','حُفظ قرار أحدث؛ حدّث الدفعات قبل إعادة القرار.');
   const state=structuredClone(saved.state||{batches:[]});let batch=state.batches.find(b=>b.id===id);
   if(op==='analyze'){if(state.batches.length>=model.limits.batches)fail(409,'LAB_SPACE_LIMIT','حد المساحة خمس دفعات؛ احذف دفعة مستبعدة لإضافة أخرى.');batch={id,kind:p.kind,source:p.source.trim(),createdAt:now(),discarded:false,rows:analyzeRows(p.kind,p.rows,catalog),history:[]};state.batches.push(batch);}
   else{
    if(!batch)fail(404,'IMPORT_NOT_FOUND','الدفعة غير موجودة في مساحة حسابك.');
    if(op==='remove'){if(!batch.discarded)fail(409,'IMPORT_NOT_DISCARDED','استبعد الدفعة أولًا قبل حذف نسختها الخاصة.');state.batches=state.batches.filter(b=>b.id!==id);}
    else if(batch.discarded)fail(409,'IMPORT_DISCARDED','هذه الدفعة مستبعدة؛ لا يمكن اعتمادها.');
    else if(op==='discard'){batch.discarded=true;}
    else if(op==='undo'){const last=batch.history.pop();if(!last)fail(409,'IMPORT_NO_HISTORY','لا يوجد قرار للتراجع عنه.');for(const old of last.rows)batch.rows.find(r=>r.source_row===old.source_row).decision=old.decision;}
    else{
     const selected=p.rows.map(n=>batch.rows.find(r=>r.source_row===n));if(selected.some(r=>!r))fail(400,'INVALID_IMPORT','صف غير موجود في الدفعة.');
     if(p.decision==='accepted'){
      const fresh=analyzeRows(batch.kind,batch.rows.map(r=>({source_row:r.source_row,values:r.input})),catalog);
      for(const r of selected){if(!['new','update'].includes(r.status))fail(409,'IMPORT_BLOCKED','الاعتماد الخاص متاح للصفوف الجديدة أو المعدلة السليمة فقط.');if(fresh.find(n=>n.source_row===r.source_row)?.fingerprint!==r.fingerprint)fail(409,'IMPORT_SOURCE_CHANGED','تغيرت بيانات الجهة أو تطابقاتها منذ الفحص؛ أنشئ دفعة جديدة من الملف قبل القرار.');}
     }
     const changed=selected.filter(r=>r.decision!==p.decision);if(!changed.length)return {changed:false,workspace:project(saved,id)};
     if(batch.history.length>=30)fail(409,'IMPORT_HISTORY_LIMIT','وصل سجل الدفعة إلى 30 قرارًا؛ احتفظ به وابدأ دفعة جديدة.');batch.history.push({at:now(),rows:changed.map(r=>({source_row:r.source_row,decision:r.decision})),decision:p.decision});for(const r of changed)r.decision=p.decision;
    }
   }
   if(Buffer.byteLength(JSON.stringify(state))>700000)fail(409,'LAB_SPACE_LIMIT','مساحة المعاينة ممتلئة؛ لا نحذف دفعاتك تلقائيًا.');
   const next={state,version:(saved.version||0)+1,updatedAt:now(),requests:[...(saved.requests||[]),{id:body.request_id,intent}].slice(-40)};return {changed:true,next,workspace:project(next,op==='remove'?undefined:id)};
  });
 }
};}
