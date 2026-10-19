import { readFileSync } from "node:fs";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import {createImpersonatedProfileWriter} from "./src/profile-source-writer.mjs";
import { createService } from "./src/core.mjs";
import { firebaseAdapters } from "./src/firebase-adapters.mjs";
import { createHandler } from "./src/http.mjs";
import { resolveAllowedOrigins } from "./src/origins.mjs";

const sessionSecret = defineSecret("MEDICAL_SESSION_SECRET");
const membershipCredentials = defineSecret("MYNEKABA_READONLY_CREDENTIALS");
let service;
function getService() {
  if (service) return service;
  const sourceCredentials = JSON.parse(membershipCredentials.value());
  const allowedStates = JSON.parse(process.env.MEMBER_ALLOWED_STATES || "[]");
  const memberAccessPolicy = process.env.MEMBER_ACCESS_POLICY || "allowed_states";
  const adminAccountIds = String(process.env.MYNEKABA_ADMIN_ACCOUNT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !Array.isArray(allowedStates) ||
    !["allowed_states", "all_registered"].includes(memberAccessPolicy) ||
    (memberAccessPolicy === "allowed_states" && !allowedStates.length) ||
    !adminAccountIds.length
  )
    throw new Error(
      "Membership policy and approved admin account IDs are required",
    );
  const seed = JSON.parse(
    readFileSync(new URL("./seed/catalog.json", import.meta.url), "utf8"),
  );
  const adapters = firebaseAdapters({
    medicalProjectId: process.env.GCLOUD_PROJECT,
    sourceCredentials,
    sourceApiKey: process.env.MYNEKABA_AUTH_API_KEY,
    adminAccountIds,
    bindingSecret: sessionSecret.value(),
    seed,
  });
  service = createService({
    ...adapters,
    sourceWriter:createImpersonatedProfileWriter({account:process.env.MYNEKABA_PROFILE_WRITER_ACCOUNT || "",readOnlyAccount:sourceCredentials.client_email,sourceProject:sourceCredentials.project_id,medicalProject:process.env.GCLOUD_PROJECT}),
    secret: sessionSecret.value(),
    allowedStates,
    memberAccessPolicy,
    adminAccountIds,
  });
  return service;
}
const origins = resolveAllowedOrigins(process.env.MEDICAL_ALLOWED_ORIGINS);
export const medicalApi = onRequest(
  {
    region: "europe-west1",
    maxInstances: 5,
    timeoutSeconds: 30,
    memory: "256MiB",
    invoker: "public",
    secrets: [sessionSecret, membershipCredentials],
  },
  createHandler({ getService, origins }),
);
