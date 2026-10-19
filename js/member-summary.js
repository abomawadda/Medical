/* Display-only membership summary. Never changes the source or grants access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MedicalMemberSummary=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const text=value=>typeof value==='string'&&!/^(null|undefined|none|nan|n\/a)$/i.test(value.trim())?value.trim():'';
  const normalize=value=>text(value).normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').toLowerCase();
  function summary(profile={}){
    const fields=profile.fields || {},type=text(profile.membershipType)||text(fields.membershipStatus)||text(profile.membershipStatus),state=[profile.workState,profile.memberState,fields.memberState].map(normalize);
    const normalized=normalize(type);
    let affiliation=type;
    if(state.some(value=>/معاش|متقاعد|تقاعد/.test(value)||value==='retired') || /معاش|متقاعد/.test(normalized))affiliation='معاش';
    else if(normalized.includes('مستقل'))affiliation='نقابة مستقلة';
    else if(normalized.includes('جمعيه عموميه')||['عضو مجلس اداره','عضو مجلس','رئيس المجلس','الامين العام','امين الصندوق','نائب الرئيس'].includes(normalized))affiliation='نقابة عامة';
    return {workplace:(text(profile.workplace)||text(fields.workplace)).slice(0,240),affiliation:affiliation.slice(0,160)};
  }
  return Object.freeze({summary});
});
