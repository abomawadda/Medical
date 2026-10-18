(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MedicalLocations=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  // Separate only explicit source separators; keep contract/review IDs unchanged.
  function parts(address){return String(address || '').split(/\s*\|\s*|\s+\/\s+/).map(s=>s.trim()).filter(Boolean).map(text=>{
    const phone=text.match(/01[0125]\d{8}/)?.[0];
    const rest=text.replace(/01[0125]\d{8}/g,'').replace(/^[^:]+:\s*/,'').replace(/[\s:،.-]/g,'');
    return {text,phone:phone || null,mappable:rest.length>2};
  });}
  return Object.freeze({parts});
});
