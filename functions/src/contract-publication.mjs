// Trusted seed provenance wins over editable overlay claims. No record is deleted.
export function projectContract(seed, entity, kind) {
  if (kind === "medical_guidelines") return entity;
  if (kind === "emergency_services") return {...entity,contract_listing:seed?.contract_listing === true,contract_parent_id:seed?.contract_parent_id || null};
  const valid = value => typeof value === "string" && !!value.trim() && !/^(null|undefined|unknown|غير محدد)$/i.test(value.trim());
  const approved = seed?.contract_listing === true;
  return {...entity, contract_listing: approved && valid(entity.contract_entity) && valid(entity.contract_entity_id)};
}
