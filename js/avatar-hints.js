/* Presentation hints only: these names choose a generic drawing, never an identity field. */
(function(root,factory) {
  const api=factory();
  if (typeof module === "object" && module.exports) module.exports=api;
  else root.MedicalAvatarHints=api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const normalize=value=>String(value || "").replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/[\u064B-\u065F]/g,"").trim();
  // Reviewed against the current provider directory. Some names are shared;
  // the owner's requested hint remains overridable by an administrator.
  const female=new Set("ولاء لميس ايمان زينب فاطمة هاديل هديل مني وسام نهال ايناس مروة منال رحاب اماني نورا سارة نجوي".split(" "));
  const male=new Set("اسامة وليد اشرف عمرو احمد محمد ضياء محمود نبيل سالم ابراهيم علي ماجد جمال عمر عادل علاء رائد ابو هاني اسماعيل عبد هشام ممدوح محسن السيد مختار مسعد تامر رشدي ايهاب حسام ايمن سامر يوسف عاصم طارق طلعت كرم شكري ياسر عمار مصطفي شريف".split(" "));
  function doctor(name) {
    const text=normalize(name);
    if (/دكتورة|طبيبة|د\.ة/.test(text)) return "doctor_female";
    if (/^طبيب(?:\s|$)/.test(text)) return "doctor_male";
    const first=text.replace(/^(?:[ادب]\s*[./]\s*)+/u,"").split(/\s+/)[0];
    if (female.has(first)) return "doctor_female";
    if (male.has(first)) return "doctor_male";
    return "clinic"; // A single facility illustration when an unfamiliar name is inconclusive.
  }
  return Object.freeze({doctor});
});
