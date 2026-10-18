import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const PROJECT = "we-medical-dakahlia";
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}`;
const database = `${base}/databases/(default)`;
const collections = ["medical_sessions", "medical_limits"];
export function operationPlan(project) {
  if (project !== PROJECT) throw new Error("Only the independent Medical project is allowed. No source project operations are supported.");
  return {
    project, database: "(default)", location: "europe-west1",
    ttl: collections.map((collection) => ({collection, field:"expiresAt"})),
    backup: {frequency:"daily", retentionDays:7},
    note: "Plan only: no data read, no configuration changed. Backups, TTL deletes and restores may incur Google charges. A schedule is not proof of a completed backup or tested restore.",
  };
}

export async function operate({project, mode = "plan", request = fetch, accessToken}) {
  const plan = operationPlan(project);
  if (!["plan", "status", "apply"].includes(mode)) throw new Error("Unknown operation mode.");
  if (mode === "plan") return plan;
  if (!accessToken) throw new Error("A Google access token is required through the local authenticated gcloud session.");
  const call = async (url, method = "GET", body, optional = false) => {
    const response = await request(url, {
      method, headers: {Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json"},
      ...(body ? {body:JSON.stringify(body)} : {}), signal: AbortSignal.timeout(30000),
    });
    if (optional && response.status === 404) return {};
    // Do not print provider response bodies or request credentials.
    if (!response.ok) throw new Error(`Medical operations failed (HTTP ${response.status}, ${method}). Check the named Google permission in Cloud Console; no broad role is granted by this tool.`);
    return response.json();
  };
  // Guard both the fixed project and the database location before any mutation.
  const db = await call(database);
  if (db.name !== `projects/${PROJECT}/databases/(default)` || db.locationId !== "europe-west1" || db.type !== "FIRESTORE_NATIVE") throw new Error("Unexpected Medical database identity, location or type. Nothing was changed.");
  const ttl = [];
  for (const collection of collections) {
    const url = `${database}/collectionGroups/${collection}/fields/expiresAt`;
    let field = await call(url, "GET", undefined, true);
    let requested = false;
    if (mode === "apply" && !["ACTIVE", "CREATING"].includes(field.ttlConfig?.state)) {
      await call(`${url}?updateMask=ttlConfig`, "PATCH", {ttlConfig:{}});
      requested = true;
      field = await call(url, "GET", undefined, true);
    }
    ttl.push({collection, field:"expiresAt", state:field.ttlConfig?.state || "NOT_ENABLED", requested});
  }
  const schedules = [];
  let nextPageToken;
  do {
    const page = await call(`${database}/backupSchedules${nextPageToken ? `?pageToken=${encodeURIComponent(nextPageToken)}` : ""}`);
    schedules.push(...(page.backupSchedules || []));
    nextPageToken = page.nextPageToken;
  } while (nextPageToken);
  let daily = schedules.find((s) => s.dailyRecurrence);
  let created = false;
  if (!daily && mode === "apply") {
    daily = await call(`${database}/backupSchedules`, "POST", {retention:"604800s", dailyRecurrence:{}});
    created = true;
  }
  const inventory = await call(`${base}/locations/europe-west1/backups`);
  const backups = (inventory.backups || []).filter((b) => b.database === db.name).map((b) => ({
    name:b.name, state:b.state, snapshotTime:b.snapshotTime, expireTime:b.expireTime,
  }));
  return {
    project, mode, ttl,
    backup: {dailySchedulePresent:!!daily, retention:daily?.retention || null, created,
      note:"Existing schedules are preserved. Backup completion and restore must be verified separately; seven daily backups are not created immediately."},
    backups, readyBackups:backups.filter((b) => b.state === "READY").length,
    databaseContentRead:false, sourceProjectTouched:false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const mode = args[0] || "plan";
    if (args.length !== 3 || args[1] !== "--project") throw new Error("Usage: node scripts/medical-operations.mjs plan|status|apply --project we-medical-dakahlia");
    operationPlan(args[2]);
    if (!["plan", "status", "apply"].includes(mode)) throw new Error("Unknown operation mode.");
    // Token is held in memory; never placed in command arguments, files or logs.
    const accessToken = mode === "plan" ? undefined : execFileSync("gcloud", ["auth", "print-access-token"], {encoding:"utf8", stdio:["ignore", "pipe", "ignore"]}).trim();
    console.log(JSON.stringify(await operate({project:args[2], mode, accessToken}), null, 2));
  } catch (error) {
    console.error(error.code ? "Cannot use the local authenticated gcloud session. Sign in within your own Cloud Shell; do not share access tokens." : error.message);
    process.exitCode = 1;
  }
}
