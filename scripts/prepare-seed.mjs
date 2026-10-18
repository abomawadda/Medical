import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
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
// Approval comes from the supplied import ledgers and original hospital workbook,
// never from a caller-provided source_ref in an administrative overlay.
const approved = new Set();
for (const file of ["staff-20261018", "family-20261018"]) {
  const imported=JSON.parse(await readFile(resolve(root, "imports/"+file+".json"), "utf8"));
  for (const row of imported.entries) approved.add(row.kind+":"+row.entity.id);
}
// These stable physician-location IDs were parsed from the original workbook.
const original=JSON.parse(await readFile(resolve(root,"imports/hospital-contracts-original.json"),"utf8"));
if(createHash("sha256").update(await readFile(resolve(root,original.source_file))).digest("hex") !== original.source_sha256)
  throw new Error("The original hospital contract workbook changed; review its publication ledger first.");
for (const id of original.record_ids) approved.add("records:"+id);
for (const kind of keys.filter(k=>!["medical_guidelines","emergency_services"].includes(k)))
  for (const r of catalog[kind]) r.contract_listing=approved.has(kind+":"+r.id);
// Hospital cards in emergency views follow the same source restriction.
// National ambulance/health coordination and the owner's care lines remain utilities.
const emergencyParents={em_mans_sellab_priv:"hosp_sellab",em_mans_kheir_cath:"hosp_kheir",em_mans_hekma_priv:"hosp_hekma"};
const publicHelplines=new Set(["em_1","em_moh_icu","em_we_employee","em_we_family"]);
for (const r of catalog.emergency_services) {
  r.contract_parent_id=emergencyParents[r.id] || null;
  r.contract_listing=publicHelplines.has(r.id) || !!r.contract_parent_id;
}
if (catalog.records.some((r) => !r.provider_id))
  throw new Error("Rebuild the public dataset before preparing the API seed.");
await mkdir(resolve(root, "functions/seed"), { recursive: true });
await writeFile(
  resolve(root, "functions/seed/catalog.json"),
  JSON.stringify(catalog),
);
console.log("Medical-only API seed prepared; no employees included.");
