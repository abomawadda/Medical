// Trusted seed provenance wins over editable overlay claims. No record is deleted.
export function projectContract(seed, entity, kind) {
  if (["medical_guidelines", "emergency_services"].includes(kind)) return entity;
  const valid = value => typeof value === "string" && !!value.trim() && !/^(null|undefined|unknown|غير محدد)$/i.test(value.trim());
  const approved = seed?.contract_listing === true;
  return {...entity, contract_listing: approved && valid(entity.contract_entity) && valid(entity.contract_entity_id)};
}
