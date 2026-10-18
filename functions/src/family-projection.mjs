// Attach newly imported contract facts to pre-import administrative overrides.
// Existing contact values, visibility, service status and deletions remain authoritative.
export function withFamilyContracts(seed,override) {
  const family=(seed?.contract_relationships || []).filter(r=>r.source_ref === 'family-20261018');
  if(!family.length)return override;
  const rels=new Map((override.contract_relationships || []).map(r=>[r.id,r]));
  for(const r of family)if(!rels.has(r.id))rels.set(r.id,r);
  return {...override,contract_relationships:[...rels.values()],network_members:[...new Set([...(override.network_members || []),...family.flatMap(r=>r.network_members)])]};
}
