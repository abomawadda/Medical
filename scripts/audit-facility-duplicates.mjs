import {readFile,writeFile} from 'node:fs/promises';
import facilities from '../functions/src/facility-directory.cjs';
const raw=JSON.parse(await readFile(new URL('../data.json',import.meta.url),'utf8'));
const policy=JSON.parse(await readFile(new URL('../imports/facility-branch-links-20261018.json',import.meta.url),'utf8'));
const confirmed=policy.groups.map(g=>({...g,rows:g.ids.map(id=>raw[g.kind].find(r=>r.id===id))}));
const pending=[],seen=new Set();
for(const kind of ['labs','pharmacies'])for(const row of raw[kind])for(const candidate of facilities.candidates(kind,row,raw[kind])){
 const ids=[row.id,candidate.row.id].sort(),key=kind+':'+ids.join('|');if(seen.has(key))continue;seen.add(key);
 if(policy.groups.some(g=>g.kind===kind&&ids.every(id=>g.ids.includes(id))))continue;
 pending.push({kind,ids,reason:candidate.reason,names:[row.name,candidate.row.name],addresses:[row.address,candidate.row.address],action:'review_only'});
}
// A shared name in one city is a review clue, never enough to merge branches.
for(const kind of ['labs','pharmacies'])for(const row of raw[kind])for(const other of raw[kind]){
 if(String(row.id)>=String(other.id) || facilities.normalize(row.markaz)!==facilities.normalize(other.markaz))continue;
 const a=facilities.brand(kind,row),b=facilities.brand(kind,other);if(a.key!==b.key || a.key===kind+':'+row.id)continue;
 const key=kind+':'+[row.id,other.id].sort().join('|');if(seen.has(key)||policy.groups.some(g=>g.kind===kind&&[row.id,other.id].every(id=>g.ids.includes(id))))continue;seen.add(key);
 pending.push({kind,ids:[row.id,other.id],reason:'same_brand_city_not_identity',names:[row.name,other.name],addresses:[row.address,other.address],action:'keep_separate'});
}
const report={schema:1,confirmed,pending,summary:{confirmedGroups:confirmed.length,redundantCards:confirmed.reduce((n,g)=>n+g.ids.length-1,0),pendingPairs:pending.filter(p=>p.action==='review_only').length,separateBranchPairs:pending.filter(p=>p.action==='keep_separate').length}};
console.log(JSON.stringify(report.summary));
if(process.argv[2]==='--report'&&process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');
