import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
const root = new URL("../", import.meta.url);
const data = JSON.parse(await readFile(new URL("data.json", root), "utf8"));
assert.ok(!("employees_directory" in data), "Do not publish employee records.");
const datasetScript = await readFile(new URL("js/data.js", root), "utf8");
const publicData = JSON.parse(
  datasetScript
    .slice(datasetScript.indexOf("=") + 1)
    .trim()
    .replace(/;$/, ""),
);
assert.ok(
  !("employees_directory" in publicData),
  "Employee records cannot be in the browser bundle.",
);
assert.deepEqual(
  publicData.records,
  data.records,
  "Rebuild data.json and js/data.js together.",
);
assert.ok(
  data.records.every((r) => r.provider_id),
  "Every record needs a stable provider ID.",
);
assert.ok(
  data.doctors.every((d) => !("rating" in d) && !("reviews_count" in d)),
  "Do not generate synthetic ratings.",
);
for (const k of [
  "records",
  "doctors",
  "labs",
  "radiology",
  "pharmacies",
  "specialized_centers",
  "emergency_services",
]) {
  const ids = data[k].map((r) => r.id ?? r.doctor_id);
  assert.equal(new Set(ids).size, ids.length, `${k}: duplicate IDs`);
}
const config = await readFile(new URL("js/config.js", root), "utf8");
assert.ok(
  !/private_key|BEGIN PRIVATE KEY|client_email/.test(config),
  "Credentials cannot appear in public config.",
);
const html = await readFile(new URL("dist/index.html", root), "utf8");
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!/^(https?:|tel:)/.test(match[1]))
    await readFile(new URL("dist/" + match[1], root));
}
const top = await readdir(new URL("dist/", root));
assert.deepEqual(
  top.sort(),
  ["css", "img", "index.html", "js", "manifest.json", "sw.js"].sort(),
);
const js = await readFile(new URL("dist/js/app.js", root), "utf8");
assert.ok(
  !js.includes(".innerHTML"),
  "Application data must be rendered as text.",
);
const sw = await readFile(new URL("dist/sw.js", root), "utf8");
assert.ok(!sw.includes("__BUILD_ID__"));
console.log(
  "Public data, IDs, static assets and deployment boundaries validated.",
);
