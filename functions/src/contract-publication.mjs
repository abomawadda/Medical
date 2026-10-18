// Publication follows source provenance or a server-authored administrator approval. No record is deleted.
export function projectContract(seed, entity, kind) {
  if (kind === "medical_guidelines") return entity;
  if (kind === "emergency_services") return {...entity,contract_listing:seed?.contract_listing === true || entity.publication_approval?.status === "approved",contract_parent_id:seed?.contract_parent_id || null,emergency_group:seed?.emergency_group && seed.emergency_group !== "unlisted" ? seed.emergency_group : entity.publication_approval?.status === "approved" ? "public_hotline" : "unlisted"};
  const valid = value => typeof value === "string" && !!value.trim() && !/^(null|undefined|unknown|غير محدد)$/i.test(value.trim());
  const approved = seed?.contract_listing === true || entity.publication_approval?.status === "approved";
  return {...entity, contract_listing: approved && valid(entity.contract_entity) && valid(entity.contract_entity_id)};
}
