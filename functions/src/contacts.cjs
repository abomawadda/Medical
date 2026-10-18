/* One parser for import, API validation and browser actions. No network requests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MedicalContacts = api;
})(globalThis, function () {
  "use strict";
  const digits = (v) => String(v ?? "").replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
  const areas = ["013","015","040","045","046","047","048","050","055","057","062","064","065","066","068","069","082","084","086","088","092","093","095","096","097"];
  function classify(value) {
    let n = digits(value).replace(/[^\d+]/g, "");
    if (n.startsWith("+20")) n = "0" + n.slice(3);
    else if (n.startsWith("0020")) n = "0" + n.slice(4);
    if (/^01[0125]\d{8}$/.test(n)) return {number:n,type:"mobile"};
    if (/^02\d{8}$/.test(n) || /^03\d{7}$/.test(n) || (n.length === 10 && areas.includes(n.slice(0,3)))) return {number:n,type:"landline"};
    if (/^(?:1\d{4}|[1-9]\d{2})$/.test(n)) return {number:n,type:"shortcode"};
    return null;
  }
  function parse(value) {
    const result = {mobile:[],landline:[],shortcode:[],invalid:[]};
    const seen = new Set();
    let raw = digits(value);
    // Area code separators belong to one landline, not two short numbers.
    raw = raw.replace(/\b(0(?:2|3|[4-9]\d))\s*[-/]\s*(\d{7,8})\b/g,"$1$2");
    const parts = raw.split(/[-–—،,;\n\r]+/).flatMap((p) => p.split(/\s+(?=(?:\+20|0020)?01[0125]\d{8}\b)/));
    for (const part of parts) {
      if (!/\d/.test(part)) continue;
      const found = classify(part);
      if (!found) { result.invalid.push({raw:part.trim(),reason:"صيغة أو عدد خانات غير صالح؛ لا يصحح بالتخمين"}); continue; }
      if (seen.has(found.number)) continue;
      seen.add(found.number);
      result[found.type].push(found.number);
    }
    return result;
  }
  function forEntity(entity) {
    // Derive from editable canonical inputs so a stale structured field cannot win.
    if (entity.raw_phone !== undefined) return parse(entity.raw_phone);
    const value = [entity.phone,entity.hotline,entity.number || entity.tel,entity.phone_digits].filter(Boolean).join(" - ");
    return parse(value || (entity.phones || []).map((p) => p.digits || p.tel || p.display).join(" - "));
  }
  return Object.freeze({classify,parse,forEntity});
});
