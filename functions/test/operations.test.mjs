import test from "node:test";
import assert from "node:assert/strict";
import {operate, PROJECT} from "../../scripts/medical-operations.mjs";
const db = {name:`projects/${PROJECT}/databases/(default)`,locationId:"europe-west1",type:"FIRESTORE_NATIVE"};
const response = (data, status=200) => ({ok:status < 400,status,json:async()=>data});

test("operations reject source and arbitrary projects before any request; planning uses no credentials or network", async () => {
  let calls = 0;
  const request = async () => {calls++;throw new Error("Must not connect");};
  for (const project of ["nekaba2026","other-project",undefined]) await assert.rejects(()=>operate({project,mode:"apply",request,accessToken:"fixture"}));
  const plan = await operate({project:PROJECT,request});
  assert.equal(calls,0);
  assert.equal(plan.backup.retentionDays,7);
});

test("operations stop before mutation if Medical database location does not match", async () => {
  const calls=[];
  await assert.rejects(()=>operate({project:PROJECT,mode:"apply",accessToken:"fixture",request:async (url,init)=>{calls.push(init.method);return response({...db,locationId:"wrong-region"});}}), /Unexpected Medical database/);
  assert.deepEqual(calls,["GET"]);
});

test("operations preserve active TTL and an existing daily schedule, including paginated schedules", async () => {
  const calls=[];
  const result=await operate({project:PROJECT,mode:"apply",accessToken:"fixture",request:async (url,init)=>{
    calls.push([url,init.method]);
    if(url.endsWith("databases/(default)")) return response(db);
    if(url.includes("/fields/")) return response({ttlConfig:{state:"ACTIVE"}});
    if(url.endsWith("/backups")) return response({backups:[{database:db.name,name:"medical-backup",state:"READY",snapshotTime:"2026-10-18T00:00:00Z"},{database:"projects/nekaba2026/databases/(default)",name:"not-ours",state:"READY"}]});
    return response(url.includes("pageToken=") ? {backupSchedules:[{dailyRecurrence:{},retention:"1209600s"}]} : {backupSchedules:[{weeklyRecurrence:{day:"MONDAY"}}],nextPageToken:"next-page"});
  }});
  assert.ok(calls.every(([,method])=>method === "GET"));
  assert.equal(result.backup.created,false);
  assert.equal(result.backup.retention,"1209600s");
  assert.equal(result.readyBackups,1);
  assert.equal(result.backups[0].name,"medical-backup");
});

test("operations request only two expiry fields and one daily schedule without reading documents", async () => {
  const mutations=[];
  const result=await operate({project:PROJECT,mode:"apply",accessToken:"fixture",request:async (url,init)=>{
    assert.ok(url.startsWith(`https://firestore.googleapis.com/v1/projects/${PROJECT}/`));
    assert.ok(!url.includes("/documents"));
    if(init.method!=="GET") {
      mutations.push([url,init.method,JSON.parse(init.body)]);
      return response(init.method === "POST" ? {dailyRecurrence:{},retention:"604800s"} : {name:"operation"});
    }
    if(url.endsWith("databases/(default)")) return response(db);
    if(url.endsWith("backupSchedules")) return response({});
    return response({});
  }});
  assert.equal(mutations.length,3);
  assert.equal(mutations[0][1],"PATCH");
  assert.deepEqual(mutations[0][2],{ttlConfig:{}});
  assert.equal(mutations[1][1],"PATCH");
  assert.deepEqual(mutations[2][2],{retention:"604800s",dailyRecurrence:{}});
  assert.ok(result.ttl.every((v)=>v.requested && v.state === "NOT_ENABLED"));
  assert.equal(result.databaseContentRead,false);
  assert.equal(result.backup.created,true);
});

test("status mode cannot mutate and Google error bodies cannot leak tokens or private content", async () => {
  let count=0;
  await assert.rejects(()=>operate({project:PROJECT,mode:"status",accessToken:"fixture-private-token",request:async (url,init)=>{
    assert.equal(init.method,"GET");count++;
    return response({message:"fixture-private-token"},403);
  }}), (error)=>error.message.includes("HTTP 403") && !error.message.includes("fixture-private-token"));
  assert.equal(count,1);
});
