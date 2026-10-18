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
const report = { checkedAt: new Date().toISOString(), project: 'we-medical-dakahlia', checks: [] };
for (const [name, path, method, origin, expected] of checks) {
  const start = performance.now();
  const response = await fetch(base + path, {
    method, headers: { Origin: origin }, cache: 'no-store', signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, expected, name + ': unexpected HTTP status');
  assert.match(response.headers.get('cache-control') || '', /no-store/, name + ': API must not be cached');
  if (origin === allowed) assert.equal(response.headers.get('access-control-allow-origin'), allowed, name + ': CORS');
  if (name === 'api-health') {
    const value = await response.json();
    assert.equal(value.configured, true, 'API is not configured');
    for (const capability of ['member-profile', 'review-revisions'])
      assert.ok(value.capabilities?.includes(capability), 'Missing API capability: ' + capability);
  } else await response.arrayBuffer();
  report.checks.push({ name, status: response.status, milliseconds: Math.round(performance.now() - start) });
}
if (process.argv.includes('--report')) await writeFile('medical-health.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
