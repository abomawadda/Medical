import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const data = JSON.parse(await readFile(resolve(root, "data.json"), "utf8"));
const keys = [
  "records",
  "hospitals",
  "labs",
  "radiology",
  "pharmacies",
  "specialized_centers",
  "medical_guidelines",
  "emergency_services",
];
const catalog = Object.fromEntries(
  keys.map((k) => [
    k,
    Array.isArray(data[k]) ? data[k] : Object.values(data[k] || {}),
  ]),
);
if (catalog.records.some((r) => !r.provider_id))
  throw new Error("Rebuild the public dataset before preparing the API seed.");
await mkdir(resolve(root, "functions/seed"), { recursive: true });
await writeFile(
  resolve(root, "functions/seed/catalog.json"),
  JSON.stringify(catalog),
);
console.log("Medical-only API seed prepared; no employees included.");
