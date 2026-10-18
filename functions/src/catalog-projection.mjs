import arabic from "./arabic-directory.cjs";
import { projectContract } from "./contract-publication.mjs";
import { withFamilyContracts } from "./family-projection.mjs";
import { kinds } from "./core.mjs";

export function mergeCatalog(seed, overlays) {
  const result = {};
  for (const kind of kinds) {
    const entries = new Map(
      (seed[kind] || []).map((e) => [String(e.id), { ...projectContract(e,e,kind), _version: 0 }]),
    );
    for (const row of overlays.filter((o) => o.kind === kind)) {
      if (row.deleted) entries.delete(row.entityId);
      else entries.set(row.entityId, { ...projectContract((seed[kind] || []).find(e=>String(e.id)===row.entityId),withFamilyContracts(entries.get(row.entityId),row.value),kind), _version: row.version });
    }
    result[kind] = [...entries.values()];
  }
  return arabic.entity(result);
}

