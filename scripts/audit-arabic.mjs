import {readFile,writeFile} from 'node:fs/promises';
import arabic from '../functions/src/arabic-directory.cjs';
const data=JSON.parse(await readFile(new URL('../data.json',import.meta.url),'utf8'));
const rows=[];
for(const kind of ['records','hospitals','labs','radiology','pharmacies','specialized_centers','emergency_services']){
 for(const r of Array.isArray(data[kind])?data[kind]:Object.values(data[kind] || {})){
  const after=arabic.entity(r);
  for(const field of ['name','display_name','address','specialty','category'])if(r[field]!==after[field])rows.push({kind,id:r.id,field,before:r[field],after:after[field]});
 }
}
console.log(JSON.stringify({correctedFields:rows.length,affectedEntities:new Set(rows.map(r=>r.kind+':'+r.id)).size}));
if(process.argv[2]==='--report'&&process.argv[3])await writeFile(process.argv[3],JSON.stringify(rows,null,2)+'\n');
