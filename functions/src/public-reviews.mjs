import facilities from './facility-directory.cjs';
import criteria from './review-criteria.cjs';

export function approvedExperiences(rows,group){
  return facilities.uniqueReviews(rows.filter(r=>group.targets.includes(r.target_id)),[group])
    .filter(r=>r.status==='published' && Number.isInteger(r.rating) && r.rating>=1 && r.rating<=5);
}
export function reviewSummary(rows){
  const values=rows.map(r=>r.rating);
  return {count:values.length,average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,
    criteria:Object.fromEntries(criteria.items.map(({id})=>{const values=rows.map(r=>r.criteria?.[id]).filter(n=>Number.isInteger(n)&&n>=1&&n<=5);return [id,{count:values.length,average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null}];}))};
}
function sharedText(r){
  let text=String(r.comment || '').trim();
  // Do not publish known account names, email addresses or numeric identifiers.
  // Human moderation remains necessary for names/health details inside free text.
  const name=String(r.author_name || '').trim();
  if(name)text=text.split(name).join('[اسم محجوب]');
  return text.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[بريد محجوب]')
    .replace(/[+\d٠-٩۰-۹][\d٠-٩۰-۹\s().-]{6,}[\d٠-٩۰-۹]/g,'[رقم محجوب]');
}
export function publicReviewPage(rows,page=0){
  const shared=rows.filter(r=>r.share_comment===true && String(r.comment || '').trim())
    .sort((a,b)=>Number(b.updated_at)-Number(a.updated_at)||String(b.id).localeCompare(String(a.id)));
  return {comments:shared.slice(page*20,(page+1)*20).map(r=>({comment:sharedText(r),rating:r.rating,
    criteria:Object.fromEntries(criteria.items.filter(i=>Number.isInteger(r.criteria?.[i.id]) && r.criteria[i.id]>=1 && r.criteria[i.id]<=5).map(i=>[i.id,r.criteria[i.id]])),
  })),page,hasMore:shared.length>(page+1)*20,commentCount:shared.length};
}
