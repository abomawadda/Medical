import {insightsFields,insightsLimit} from './lab-insights-policy.mjs';
export function reviewInsightsStore(db){return {
 async reviewInsightsRead(){
  // Read all statuses before deduplication: a new pending revision must shadow its old published copy.
  const result=await db.collection('medical_reviews').orderBy('__name__').select(...insightsFields).limit(insightsLimit+1).get();
  return {complete:result.size<=insightsLimit,rows:result.docs.slice(0,insightsLimit).map(doc=>({id:doc.id,...Object.fromEntries(insightsFields.filter(k=>Object.hasOwn(doc.data(),k)).map(k=>[k,doc.data()[k]]))}))};
 }
};}
