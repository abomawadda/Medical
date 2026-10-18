import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {resolveAllowedOrigins, normalizeOrigin, productionOrigins} from '../src/origins.mjs';
import {createHandler} from '../src/http.mjs';
import {ApiError} from '../src/core.mjs';

test('production site origins include the exact Vercel host even with a legacy GitHub-only environment',()=>{
 assert.deepEqual(resolveAllowedOrigins('https://abomawadda.github.io'),productionOrigins);
 assert.equal(normalizeOrigin('https://medical-nekaba.vercel.app/'),'https://medical-nekaba.vercel.app');
 assert.deepEqual(resolveAllowedOrigins('https://other.example,https://other.example/'),[...productionOrigins,'https://other.example']);
 for(const value of ['*','https://*.vercel.app','http://medical-nekaba.vercel.app','https://user:password@other.example','https://other.example/Medical','https://other.example?x=1','https://other.example#x','https://other.example:444']) assert.throws(()=>normalizeOrigin(value));
});

function result() {return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;},end(){return this;}};}
const req=(origin,method='OPTIONS',path='/v1/member/session')=>({method,path,body:{},get:k=>({origin,'content-type':'application/json'})[k],is:()=>true});
test('approved sites pass preflight; unrelated Vercel previews are denied; catalog still requires a session',async()=>{
 let calls=0;
 const handler=createHandler({origins:resolveAllowedOrigins('https://abomawadda.github.io'),getService:()=>{calls++;return {catalog:async()=>{throw new ApiError(401,'SESSION_REQUIRED','Session required');}};}});
 for(const origin of productionOrigins){
  const preflight=result();await handler(req(origin),preflight);assert.equal(preflight.statusCode,204);assert.equal(preflight.headers['Access-Control-Allow-Origin'],origin);
  const catalog=result();await handler(req(origin,'GET','/v1/catalog'),catalog);assert.equal(catalog.statusCode,401);assert.equal(catalog.headers['Access-Control-Allow-Origin'],origin);
 }
 const afterAllowed=calls;
 for(const origin of ['https://medical-nekaba-preview.vercel.app','https://medical-nekaba.vercel.app.evil.example','https://example.invalid']){
  const denied=result();await handler(req(origin),denied);assert.equal(denied.statusCode,403);assert.equal(denied.headers['Access-Control-Allow-Origin'],undefined);
 }
 assert.equal(calls,afterAllowed);
});

test('saved deployment settings preserve custom origins and reject unsafe configuration before rewriting',async()=>{
 const root=await mkdtemp(join(tmpdir(),'medical-origin-'));
 try{
  await mkdir(join(root,'scripts'));await mkdir(join(root,'functions/src'),{recursive:true});
  for(const path of ['scripts/deploy-medical.sh','scripts/assert-medical-project.mjs','functions/src/origins.mjs'])await cp(new URL('../../'+path,import.meta.url),join(root,path));
  await writeFile(join(root,'scripts/prepare-seed.mjs'),'// Local fixture: do not deploy or access any service.\n');
  const key='AIza'+'x'.repeat(35),file=join(root,'functions/.env.we-medical-dakahlia');
  const original=`MYNEKABA_ADMIN_ACCOUNT_IDS=fixture_admin\nMYNEKABA_AUTH_API_KEY=${key}\nMEDICAL_ALLOWED_ORIGINS=https://custom.example\n`;
  await writeFile(file,original);
  const run=()=>spawnSync('bash',['scripts/deploy-medical.sh','--existing-config','--prepare-only'],{cwd:root,encoding:'utf8',env:{...process.env,MEDICAL_ALLOWED_ORIGINS:''}});
  const prepared=run();assert.equal(prepared.status,0,prepared.stderr);
  const saved=await readFile(file,'utf8');assert.ok(saved.includes('MEDICAL_ALLOWED_ORIGINS='+[...productionOrigins,'https://custom.example'].join(',')));
  assert.ok(saved.includes(key));assert.ok(!prepared.stdout.includes(key));assert.ok(!prepared.stdout.includes('fixture_admin'));
  const unsafe=original.replace('https://custom.example','https://*.vercel.app');await writeFile(file,unsafe);
  assert.notEqual(run().status,0);assert.equal(await readFile(file,'utf8'),unsafe);
 }finally{await rm(root,{recursive:true,force:true});}
});
