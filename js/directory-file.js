/* Local bounded OOXML reader: no workbook upload, formulas, macros or external links. */
window.MedicalDirectoryFile=(()=>{
 const max=8*1024*1024,decoder=new TextDecoder('utf-8',{fatal:true});
 const fail=message=>{throw new Error(message);};
 const crc=bytes=>{let value=0xffffffff;for(const b of bytes){value^=b;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
 function archive(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);if(bytes.length>5*1024*1024||bytes.length<22)fail('حد ملف Excel خمسة ميجابايت.');
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0)fail('ملف Excel غير مكتمل.');const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count>200||start+size!==end)fail('صيغة ملف Excel غير مدعومة؛ احفظ نسخة XLSX عادية.');
  const entries=new Map();let cursor=start,total=0;
  for(let i=0;i<count;i++){
   if(cursor+46>end||view.getUint32(cursor,true)!==0x02014b50)fail('فهرس Excel غير سليم.');const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),packed=view.getUint32(cursor+20,true),length=view.getUint32(cursor+24,true),n=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true);
   if(cursor+46+n+extra+comment>end)fail('فهرس Excel غير سليم.');const name=decoder.decode(bytes.slice(cursor+46,cursor+46+n));
   if(flags&1||![0,8].includes(method)||name.includes('..')||name.includes('\\')||name.startsWith('/')||entries.has(name)||length>max||(total+=length)>20*1024*1024||local+30>start)fail('الملف مشفر أو يتجاوز حدود القراءة الآمنة.');
   entries.set(name,{flags,method,packed,length,local,crc:view.getUint32(cursor+16,true)});cursor+=46+n+extra+comment;
  }
  if(cursor!==end)fail('فهرس Excel غير سليم.');
  return async name=>{
   const entry=entries.get(name);if(!entry)fail('جزء مفقود من ملف Excel: '+name);const {local,method,packed,length}=entry;
   if(view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==entry.flags||view.getUint16(local+8,true)!==method)fail('بنية Excel غير سليمة.');const localLength=view.getUint16(local+26,true),begin=local+30+localLength+view.getUint16(local+28,true);if(decoder.decode(bytes.slice(local+30,local+30+localLength))!==name||begin+packed>start)fail('محتوى Excel غير سليم.');
   let result=bytes.slice(begin,begin+packed);
   if(method===8){if(typeof DecompressionStream==='undefined')fail('المتصفح لا يدعم قراءة XLSX؛ استخدم CSV UTF-8 أو الصق الجدول.');const reader=new Blob([result]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let read=0;try{while(true){const part=await reader.read();if(part.done)break;read+=part.value.length;if(read>length||read>max){await reader.cancel();fail('محتوى Excel أكبر من الحد الآمن.');}chunks.push(part.value);}}finally{reader.releaseLock();}result=new Uint8Array(read);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}}
   if(result.length!==length||crc(result)!==entry.crc)fail('تعذر التحقق من سلامة ملف Excel.');const text=decoder.decode(result);if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('تعريفات XML الخارجية غير مسموحة.');const xml=new DOMParser().parseFromString(text,'application/xml');if(xml.getElementsByTagName('parsererror').length)fail('محتوى XML غير سليم.');return xml;
  };
 }
 const elements=(xml,name)=>Array.from(xml.getElementsByTagNameNS('*',name));
 async function open(file){
  if(file.size>5*1024*1024)fail('حد الملف خمسة ميجابايت.');
  if(!/\.xlsx$/i.test(file.name)){if(!/\.(csv|tsv|txt)$/i.test(file.name))fail('اختر XLSX أو CSV UTF-8 أو TSV؛ لا ندعم XLS أو XLSM.');const table=window.MedicalCatalogStaging.parse(decoder.decode(await file.arrayBuffer()));return {sheets:[{name:'الجدول'}],read:async()=>table};}
  const read=archive(await file.arrayBuffer()),workbook=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');
  const targets=new Map(elements(rels,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
  const sheets=elements(workbook,'sheet').map(s=>({name:s.getAttribute('name'),target:targets.get(s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'))}));if(!sheets.length||sheets.length>30)fail('عدد أوراق العمل غير مدعوم.');let strings=null;
  return {sheets,read:async index=>{
   const target=sheets[index]?.target,path=target?.startsWith('/xl/')?target.slice(1):'xl/'+target;if(!target||!/^xl\/worksheets\/[^/]+\.xml$/.test(path))fail('ورقة العمل تحتوي على رابط غير مسموح.');const xml=await read(path);
   if(strings===null){try{strings=elements(await read('xl/sharedStrings.xml'),'si').map(s=>elements(s,'t').map(t=>t.textContent).join(''));if(strings.length>50000)fail('عدد النصوص يتجاوز الحد الآمن.');}catch(error){if(!error.message.startsWith('جزء مفقود'))throw error;strings=[];}}
   const table=[];for(const row of elements(xml,'row')){const line=Number(row.getAttribute('r'));if(!Number.isInteger(line)||line<1||line>1001||table[line-1])fail('حد القراءة المحلية 1000 صف، دون عناوين صفوف مكررة.');const cells=[];for(const cell of elements(row,'c')){const reference=cell.getAttribute('r')||'',match=/^([A-Z]{1,2})[1-9]\d{0,6}$/.exec(reference);if(!match)fail('عنوان خلية Excel غير صالح.');let col=0;for(const c of match[1])col=col*26+c.charCodeAt(0)-64;if(Number(reference.slice(match[1].length))!==line||Object.hasOwn(cells,col-1))fail('عنوان خلية مكرر أو لا يطابق صفه.');if(col>40)fail('حد الجدول 40 عمودًا؛ انسخ أعمدة الدليل فقط إلى ملف مستقل.');const type=cell.getAttribute('t'),raw=elements(cell,'v')[0]?.textContent||'';let text=elements(cell,'f').length?'=صيغة غير مسموحة':type==='e'?'=خطأ في خلية Excel':type==='s'?strings[Number(raw)]:type==='inlineStr'?elements(cell,'t').map(t=>t.textContent).join(''):raw;if(typeof text!=='string'||text.length>2000)fail('توجد خلية طويلة أو غير سليمة.');cells[col-1]=text;}table[line-1]=Array.from({length:cells.length},(_,i)=>cells[i]||'');}return Array.from({length:table.length},(_,i)=>table[i]||[]);
  }};
 }
 return Object.freeze({open});
})();
