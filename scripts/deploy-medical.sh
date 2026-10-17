#!/usr/bin/env bash
set -euo pipefail

# This helper can deploy only Medical. Never change the source project's IAM,
# Firebase Auth, Firestore rules, or documents from this script.
cd "$(dirname "$0")/.."
export MEDICAL_DEPLOY_PROJECT=we-medical-dakahlia
export MYNEKABA_PROJECT_ID=nekaba2026
export GCLOUD_PROJECT="$MEDICAL_DEPLOY_PROJECT"

if [[ $# -lt 2 || $# -gt 3 || ( $# -eq 3 && "$3" != --prepare-only ) ]]; then
  echo 'Usage: bash scripts/deploy-medical.sh ADMIN_DOCUMENT_ID SOURCE_WEB_API_KEY [--prepare-only]' >&2
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
umask 077
cat > "functions/.env.$MEDICAL_DEPLOY_PROJECT" <<EOF
MEMBER_ACCESS_POLICY=all_registered
MEMBER_ALLOWED_STATES=[]
MYNEKABA_ADMIN_ACCOUNT_IDS=$1
MYNEKABA_AUTH_API_KEY=$2
MEDICAL_ALLOWED_ORIGINS=https://abomawadda.github.io
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

echo 'Deployment command finished. Verify the API and real login before configuring the public site.'
echo 'No frontend API URL has been changed by this helper.'
