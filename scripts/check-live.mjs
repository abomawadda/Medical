import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// Read-only public checks. Never attempt a real login or read a private record.
const base = 'https://europe-west1-we-medical-dakahlia.cloudfunctions.net/medicalApi';
const allowed = 'https://abomawadda.github.io';
const checks = [
  ['api-health', '/v1/health', 'GET', allowed, 200],
  ['catalog-requires-session', '/v1/catalog', 'GET', allowed, 401],
  ['session-requires-token', '/v1/session', 'GET', allowed, 401],
  ['browser-preflight', '/v1/member/session', 'OPTIONS', allowed, 204],
  ['foreign-origin-denied', '/v1/health', 'GET', 'https://example.invalid', 403],
];
for (const [flag, origin, label] of [
  ['--vercel','https://medical-nekaba.vercel.app','vercel'],
  ['--rayati','https://reayati-we.vercel.app','rayati'],
]) {
  if (process.argv.includes(flag))
    checks.push(['api-health-'+label,'/v1/health','GET',origin,200],[label+'-catalog-requires-session','/v1/catalog','GET',origin,401],[label+'-browser-preflight','/v1/member/session','OPTIONS',origin,204]);
}

if(process.argv.includes('--require-development-lab'))checks.push(['lab-requires-token','/v1/admin/lab','GET',allowed,401],['lab-preview-requires-token','/v1/admin/lab/preview/compact_home','GET',allowed,401]);

if(process.argv.includes('--require-profile-management'))checks.push(['profile-edit-requires-token','/v1/profile/edit','GET',allowed,401],['profile-requests-require-token','/v1/profile/requests','GET',allowed,401],['profile-notifications-require-token','/v1/profile/notifications','GET',allowed,401],['admin-profile-requests-require-token','/v1/admin/profile-requests','GET',allowed,401]);

if(process.argv.includes('--require-public-reviews'))checks.push(['public-reviews-requires-token','/v1/reviews/public/doctor%3Afixture','GET',allowed,401]);

const report = { checkedAt: new Date().toISOString(), project: 'we-medical-dakahlia', checks: [] };
for (const [name, path, method, origin, expected] of checks) {
  const start = performance.now();
  const response = await fetch(base + path, {
    method, headers: { Origin: origin, ...(method === 'OPTIONS' ? {'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type,Authorization'} : {}) }, cache: 'no-store', signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, expected, name + ': unexpected HTTP status');
  assert.match(response.headers.get('cache-control') || '', /no-store/, name + ': API must not be cached');
  if (origin !== 'https://example.invalid') assert.equal(response.headers.get('access-control-allow-origin'), origin, name + ': CORS');
  if (name.startsWith('api-health')) {
    const value = await response.json();
    assert.equal(value.configured, true, 'API is not configured');
    for (const capability of ['member-profile', 'review-revisions', ...(process.argv.includes('--require-development-lab') ? ['development-lab-v1'] : []), ...(process.argv.includes('--require-profile-management') ? ['profile-management-v1'] : []), ...(process.argv.includes('--require-recommendations') ? ['review-recommendations-v1'] : []), ...(process.argv.includes('--require-public-reviews') ? ['public-review-details-v1'] : []), ...(process.argv.includes('--require-content-lifecycle') ? ['content-lifecycle-v1'] : []), ...(process.argv.includes('--require-admin-idle') ? ['admin-idle-v1'] : []), ...(process.argv.includes('--require-admin-batch-data') ? ['admin-batch-data-v1'] : []), ...(process.argv.includes('--require-admin-batch') ? ['admin-batch-v1','structured-branches-v1'] : []), ...(process.argv.includes('--require-facility-branches') ? ['facility-branches-v1'] : []), ...(process.argv.includes('--require-review-criteria') ? ['review-criteria-v1'] : []), ...(process.argv.includes('--require-admin-workspace') ? ['admin-workspace-v1'] : []), ...(process.argv.includes('--require-public-emergency') ? ['public-emergency-v1'] : []), ...(process.argv.includes('--require-contracts') ? ['contract-directory-v1'] : []), ...(process.argv.includes('--require-content') ? ['directory-content-v1'] : []), ...(process.argv.includes('--require-family') ? ['family-directory-v1'] : []), ...(process.argv.includes('--require-staff') ? ['staff-directory','provider-images','provider-illustrations','directory-state-v1'] : [])])
      assert.ok(value.capabilities?.includes(capability), 'Missing API capability: ' + capability);
  } else await response.arrayBuffer();
  report.checks.push({ name, status: response.status, milliseconds: Math.round(performance.now() - start) });
}
if (process.argv.includes('--report')) await writeFile('medical-health.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
