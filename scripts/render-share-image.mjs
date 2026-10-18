import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
let html;
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/img/')){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',path.endsWith('.woff2')?'font/woff2':'image/png');res.end(await readFile(join(root,path)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const asset=name=>origin+'/'+name;
html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><style>@font-face{font-family:Cairo;src:url('${asset('img/fonts/6c9f4bab97d6bc5f.woff2')}');font-weight:400 900}*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}body{font-family:Cairo,sans-serif;background:radial-gradient(ellipse at 85% 0,#8a50b3,transparent 65%),linear-gradient(135deg,#32134f,#552785);color:white}.layout{height:100%;padding:65px 65px;display:flex;align-items:center;gap:42px}.text{flex:1}.eyebrow{font-size:27px;color:#ddc5f2}h1{font-size:72px;font-weight:850;line-height:1.6;margin:5px 0}p{font-size:32px;margin:0;color:#efddfc}.chips{display:flex;gap:12px;margin:26px 0}.chips span{font-size:22px;border:1px solid #d4b1ec66;background:#ffffff10;padding:8px 19px;border-radius:30px}.credit{font-size:22px;color:#d9bde9;line-height:1.9}.logo{width:395px;height:395px;object-fit:contain;filter:drop-shadow(0 25px 25px #17072435)}</style><div class="layout"><div class="text"><div class="eyebrow">دليل الرعاية الطبية بالدقهلية</div><h1>تطبيق رعايتي</h1><p>شبكتك الطبية.. بين يديك</p><div class="chips"><span>الموظفون</span><span>الأُسَر والمعاشات</span></div><div class="credit">النقابة العامة بالدقهلية<br>بتنفيذ محمود العراقي</div></div><img class="logo" src="${asset('img/rayati-app.png')}" alt="شعار تطبيق رعايتي"></div>`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--allow-file-access-from-files']});
try{const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});await page.goto(origin);await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:join(root,'img/rayati-share.png')});}finally{await browser.close();server.close();}
console.log('Rayati social preview rendered at 1200x630.');
