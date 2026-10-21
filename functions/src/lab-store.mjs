export function labStore(db,audit){
 const collection=db.collection('medical_lab_features');
 const scenarios=db.collection('medical_lab_scenarios');
 return {
  async labScenarioRead(id){return (await scenarios.doc(id).get()).data() || {};},
  async labScenarioTransact(id,apply){return db.runTransaction(async tx=>{
   const ref=scenarios.doc(id),[row,feature]=await Promise.all([tx.get(ref),tx.get(collection.doc(id))]),result=apply(row.data() || {},feature.data() || {});
   if(result.changed){tx.set(ref,result.next);tx.create(audit.doc(),{action:'lab.scenario',featureId:id,scenarioId:result.report.id,version:result.report.version,actor:result.next.rows.find(r=>r.id===result.report.id).actor,at:result.report.updatedAt});}
   return {changed:result.changed,report:result.report};
  });},
  async labRead(id){return (await collection.doc(id).get()).data() || {};},
  async labReadAll(){return Object.fromEntries((await collection.limit(30).get()).docs.map(d=>[d.id,d.data()]));},
  async labTransact(id,apply){return db.runTransaction(async tx=>{
   const ref=collection.doc(id),row=await tx.get(ref),result=apply(row.data() || {});
   if(result.changed){tx.set(ref,result.next);tx.create(audit.doc(),{action:'lab.review',featureId:id,version:result.next.version,actor:result.next.actor,at:result.next.updatedAt});}
   return {changed:result.changed,feature:result.feature};
  });},
 };
}
