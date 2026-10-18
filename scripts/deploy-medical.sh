#!/usr/bin/env bash
set -euo pipefail

# This helper can deploy only Medical. Never change the source project's IAM,
# Firebase Auth, Firestore rules, or documents from this script.
cd "$(dirname "$0")/.."
export MEDICAL_DEPLOY_PROJECT=we-medical-dakahlia
export MYNEKABA_PROJECT_ID=nekaba2026
export GCLOUD_PROJECT="$MEDICAL_DEPLOY_PROJECT"
deploy_env="functions/.env.$MEDICAL_DEPLOY_PROJECT"

if [[ "${1:-}" == --existing-config ]]; then
  if [[ $# -gt 2 || ( $# -eq 2 && "$2" != --prepare-only ) ]]; then
    echo 'Use --existing-config optionally followed by --prepare-only.' >&2
    exit 1
  fi
  prepare_saved="${2:-}"
  deploy_env="functions/.env.$MEDICAL_DEPLOY_PROJECT"
  if [[ ! -f "$deploy_env" ]]; then
    echo 'Saved Medical configuration is missing. Supply the approved admin ID and public Web API key.' >&2
    exit 1
  fi
  mapfile -t saved_config < <(node --input-type=module - "$deploy_env" <<'JS'
import { readFileSync } from 'node:fs';
const lines = readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
for (const key of ['MYNEKABA_ADMIN_ACCOUNT_IDS', 'MYNEKABA_AUTH_API_KEY']) {
  const line = lines.find((line) => line.startsWith(key + '='));
  if (!line) process.exit(1);
  process.stdout.write(line.slice(key.length + 1).trim() + '\n');
}
JS
  )
  if [[ -n "$prepare_saved" ]]; then
    set -- "${saved_config[@]}" "$prepare_saved"
  else
    set -- "${saved_config[@]}"
  fi
fi

if [[ $# -lt 2 || $# -gt 3 || ( $# -eq 3 && "$3" != --prepare-only ) ]]; then
  echo 'Usage: bash scripts/deploy-medical.sh ADMIN_DOCUMENT_ID SOURCE_WEB_API_KEY [--prepare-only], or --existing-config' >&2
  exit 1
fi
if [[ ! "$1" =~ ^[a-zA-Z0-9_-]{1,128}$ || ! "$2" =~ ^AIza[a-zA-Z0-9_-]{35}$ ]]; then
  echo 'Invalid admin document ID or Firebase Web API key.' >&2
  exit 1
fi
node scripts/assert-medical-project.mjs
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22 or newer is required."); process.exit(1); }'

# Only non-secret configuration is written here, and this file is Git-ignored.
# The two private secrets must already exist in Medical Secret Manager.
# Retain any configured sites while including the approved production origins.
allowed_origins=$(node --input-type=module - "$deploy_env" <<'JS'
import { existsSync, readFileSync } from 'node:fs';
import { resolveAllowedOrigins } from './functions/src/origins.mjs';
const path = process.argv[2];
const line = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/).find(s => s.startsWith('MEDICAL_ALLOWED_ORIGINS=')) : '';
const saved = line ? line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2') : '';
console.log(resolveAllowedOrigins([saved, process.env.MEDICAL_ALLOWED_ORIGINS].filter(Boolean).join(',')).join(','));
JS
)
umask 077
cat > "functions/.env.$MEDICAL_DEPLOY_PROJECT" <<EOF
MEMBER_ACCESS_POLICY=all_registered
MEMBER_ALLOWED_STATES=[]
MYNEKABA_ADMIN_ACCOUNT_IDS=$1
MYNEKABA_AUTH_API_KEY=$2
MEDICAL_ALLOWED_ORIGINS=$allowed_origins
EOF
node scripts/prepare-seed.mjs
if [[ "${3:-}" == --prepare-only ]]; then
  echo 'Configuration prepared locally. Nothing has been deployed.'
  exit 0
fi

npm ci --prefix functions
npm test
npx --yes firebase-tools@15.34.0 deploy \
  --project "$MEDICAL_DEPLOY_PROJECT" \
  --only functions:medical,firestore:rules

MEDICAL_RELEASE_ORIGINS="$allowed_origins" node --input-type=module <<'JS'
const response = await fetch('https://europe-west1-we-medical-dakahlia.cloudfunctions.net/medicalApi/v1/health', {
  cache: 'no-store', signal: AbortSignal.timeout(30000),
});
const health = await response.json();
if (!response.ok || !health.configured || !['member-profile', 'review-revisions', 'staff-directory', 'provider-images', 'provider-illustrations', 'directory-state-v1', 'family-directory-v1', 'directory-content-v1', 'contract-directory-v1', 'public-emergency-v1', 'admin-workspace-v1', 'review-criteria-v1', 'facility-branches-v1', 'admin-batch-v1', 'structured-branches-v1'].every((c) => health.capabilities?.includes(c))) {
  throw new Error('Deployment finished, but the updated API capabilities could not be confirmed. Do not declare the release complete.');
}
console.log('Published API confirmed: member profiles, revision-safe moderation, staff directory, admin workspace and measured review criteria enabled.');
for (const origin of process.env.MEDICAL_RELEASE_ORIGINS.split(',')) {
  const response = await fetch('https://europe-west1-we-medical-dakahlia.cloudfunctions.net/medicalApi/v1/member/session', {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type,Authorization' },
    cache: 'no-store', signal: AbortSignal.timeout(30000),
  });
  if (response.status !== 204 || response.headers.get('access-control-allow-origin') !== origin)
    throw new Error('Deployment completed, but an approved site failed its CORS preflight. Do not declare login repaired.');
  console.log('Published site connection verified: ' + origin);
}
JS

echo 'Deployment command finished. Verify the API and real login before configuring the public site.'
echo 'No frontend API URL has been changed by this helper.'
