import facilities from './facility-directory.cjs';
// Only the latest authored experience per logical branch contributes. Pending/hidden
// latest versions never let an older published duplicate continue to count.
export function groupedReviewStats(groups,rows){
 return Object.fromEntries(groups.flatMap(group=>{
  const relevant=rows.filter(r=>group.targets.includes(r.target_id));
  const published=facilities.uniqueReviews(relevant,[group]).filter(r=>r.status==='published'&&Number.isInteger(r.rating)&&r.rating>=1&&r.rating<=5);
  const value={count:published.length,average:published.length?published.reduce((sum,r)=>sum+r.rating,0)/published.length:null};
  return group.targets.map(target=>[target,value]);
 }));
}
