/* Curated public-source observations, 2026-10-18. Never membership or private reviews. */
(function(root,factory){const api=factory();if(typeof module === "object" && module.exports) module.exports=api;else root.MedicalResearch=api;})(typeof globalThis !== "undefined" ? globalThis : this,function(){
  const checkedAt="2026-10-18";
  const hospitals={
    hosp_hekma:{originalMap:"https://maps.app.goo.gl/ubKrgja2Y7Ugt6gPA?g_st=aw",name:"الحكمة",mapStatus:"matched",addressSource:"https://www.findglocal.com/EG/Mansoura/130441677594939/مستشفى-الحكمة",hours:"خدمة المستشفى على مدار 24 ساعة",scope:"facility",hoursSource:"https://www.findhealthclinics.org/EG/Mansoura/130441677594939/مستشفى-الحكمة"},
    hosp_sellab:{originalMap:"https://maps.app.goo.gl/UKjgsQzWdUHKm4rf6?g_st=aw",name:"الجزيرة",mapStatus:"matched",addressSource:"https://healtheg.com/ar/Item/2657/مستشفى-الجزيرة-الدولى---السلاب",note:"العنوان المنشور: 17 برج السلاب، شارع عاطف المنجى، أمام جزيرة الورد. لم تُثبت مواعيد استقبال الطوارئ من مصدر حديث."},
    hosp_kheir:{originalMap:"https://maps.app.goo.gl/jnwqjWPZ34WjXsrt9?g_st=aw",name:"الخير",mapStatus:"matched",hours:"استقبال الطوارئ على مدار 24 ساعة",scope:"emergency",hoursSource:"https://blog.elkheirhospital.com/",addressSource:"https://tmc.eg/ar/المستشفيات/مستشفى-الخير/"},
    staff_746:{originalMap:"https://maps.app.goo.gl/6GQt8DYhAB38ay3r9?g_st=aw",name:"الحياة",mapStatus:"conflict",note:"الرابط المحفوظ ينتهي بمركز حياه الطبي في الخيارية، ولا يثبت موقع مركز الكلى بشارع قناة السويس. استُبدل في عرض العضو ببحث بالعنوان، دون اعتماد دبوس مختلف."},
    staff_747:{originalMap:"https://maps.google.com/?cid=16409942332621051850&entry=gps&g_st=aw",name:"العسكري",mapStatus:"unresolved",note:"رابط CID فتح دون إظهار اسم/عنوان يمكن مطابقته؛ لا يعد تحققًا مكانيًا."},
    staff_753:{originalMap:"https://maps.app.goo.gl/wYT1Jfnz2QL5W3JM9?g_st=aw",name:"جلور",mapStatus:"matched",addressSource:"https://env.mans.edu.eg/services/medicare-fund/301-contact-data/s-b-services/medicalcareunitcategory/2839-contractedhospitals"},
    staff_754:{originalMap:"https://maps.app.goo.gl/WYMcDmijVVWJcqgW9?g_st=aw",name:"الباطنة",address:"شارع الجمهورية - المنصورة",originalAddress:"شارع جيهان",mapStatus:"conflict",note:"خريطة المستشفى ودليل جامعة المنصورة يذكران شارع الجمهورية، بينما الملف يسجل شارع جيهان. يلزم توحيد العنوان لدى الإدارة؛ لا يُعرض الرابط المتعارض كدبوس معتمد.",addressSource:"https://env.mans.edu.eg/services/medicare-fund/301-contact-data/s-b-services/medicalcareunitcategory/2839-contractedhospitals"},
    staff_755:{originalMap:"https://maps.app.goo.gl/23H4n6rH1mAZH28h7?g_st=aw",name:"الأورام",mapStatus:"matched",scheduleSource:"https://ocmu.mans.edu.eg/index.php/component/content/article/341-clinics-6/4931-clinic-table?Itemid=716"},
    staff_756:{originalMap:"https://maps.app.goo.gl/geNvbjNLFtMpeN5dA?g_st=aw",name:"الجهاز",mapStatus:"matched"},
    staff_757:{originalMap:"https://maps.app.goo.gl/tsUdFg9dXCr8u4VG7?g_st=aw",name:"اورام",mapStatus:"conflict",note:"الخريطة تنتهي بمستشفى أورام ميت غمر؛ النص المكتوب «أمام إدارة مرور الدقهلية» لم يثبت مطابقته لهذا الموقع. لا يُستنتج نقل المستشفى إلى المنصورة."},
    staff_764:{originalMap:"https://maps.app.goo.gl/iGwCaFmmDegYkPv46?g_st=aw",name:"العيون",mapStatus:"unresolved",note:"الاسم على الخريطة يطابق المركز الجامعي، لكن اسم الشارع في الملف لم يتأكد. مواعيد الاستقبال بالموقع الرسمي مقسمة بحسب فئة المتردد ولا تعمم على أعضاء النقابة.",scheduleSource:"https://ophc.mans.edu.eg/index.php/component/content/article/266-units-departments-ar/2052-reception-and-emergency"},
    staff_765:{originalMap:"https://maps.app.goo.gl/1DyfwKoCZkcyvu6n7?g_st=aw",name:"الأكاديمية",mapStatus:"matched"},
    staff_774:{originalMap:"https://maps.app.goo.gl/oHPcxAqQR1HdpAde9",name:"نيو",mapStatus:"unresolved",note:"اسم المركز/المدينة متوافقان، ولم تثبت تفاصيل البرج والدور من رابط الخريطة وحده."},
    staff_2326:{originalMap:"https://maps.app.goo.gl/6npac2ANjcaE3rKQ7",name:"المركز الطبي",mapStatus:"unresolved",note:"الرابط ينتهي بعيادة د. سيد رشدي محجوب؛ العلاقة بالاسم الإداري للمركز غير محسومة."},
    staff_2433:{originalMap:"https://maps.app.goo.gl/ThkdMaydWzPLL3fV8",name:"نبض الحياة",mapStatus:"matched"}
  };
  // Facility opening hours are NOT an assertion of round-the-clock emergency specialties.
  const emergency={
    em_mans_kheir_cath:{originalName:"طوارئ قسطرة القلب 24س - مستشفى الخير - متعاقد WE",hospital:"hosp_kheir"},em_mans_hekma_priv:{originalName:"استقبال مستشفى الحكمة التخصصي - متعاقد WE",hospital:"hosp_hekma"},em_mans_sellab_priv:{originalName:"طوارئ مستشفى الجزيرة الدولي (السلاب) - متعاقد WE",hospital:"hosp_sellab"},
    em_dikirnis_general:{originalName:"مستشفى دكرنس العام",hours:"ساعات عمل المنشأة: يوميًا على مدار 24 ساعة",scope:"facility",hoursSource:"https://www.bizmideast.com/EG/مستشفى-دكرنس-العام-|-dikirnis-general-0100-402-6611"},
    em_simbillawein_general:{originalName:"مستشفى السنبلاوين العام",hours:"ساعات عمل المنشأة: يوميًا على مدار 24 ساعة",scope:"facility",hoursSource:"https://www.bizmideast.com/EG/%D9%85%D8%B3%D8%AA%D8%B4%D9%81%D9%8A-%D8%A7%D9%84%D8%B3%D9%86%D8%A8%D9%84%D8%A7%D9%88%D9%8A%D9%86-%D8%A7%D9%84%D8%B9%D8%A7%D9%85_1U"},
    em_matariyya_central:{originalName:"مستشفى المطرية المركزي",hours:"ساعات عمل المنشأة: يوميًا على مدار 24 ساعة",scope:"facility",hoursSource:"https://www.bizmideast.com/EG/el-matareya-central-hospital_1W-050-7750343"},
    em_temay_amdid_central:{originalName:"مستشفى تمي الأمديد المركزي",hours:"ساعات عمل المنشأة: يوميًا على مدار 24 ساعة",scope:"facility",hoursSource:"https://www.bizmideast.com/EG/temay-el-amdid-central-hospital-050-6850767"},
    em_mahalat_damanah_central:{originalName:"مستشفى محلة دمنة المركزي",hours:"ساعات عمل المنشأة: يوميًا على مدار 24 ساعة",scope:"facility",hoursSource:"https://www.bizmideast.com/EG/مستشفى-محلة-دمنه"},
    em_mans_fever_hosp:{originalName:"مستشفى حميات المنصورة",hours:"ساعات عمل المنشأة: يوميًا على مدار 24 ساعة",scope:"facility",hoursSource:"https://www.bizmideast.com/EG/مستشفى-حميات-المنصورة-050-2245602"},
    em_talkha_central:{originalName:"مستشفى طلخا المركزي",hours:"ساعات عمل المنشأة: يوميًا على مدار 24 ساعة",scope:"facility",hoursSource:"https://arbudi.com/mansoura/company/مستشفى-طلخا-المركزي/"}
  };
  const doctors={
    provider_127:{name:"هديل البنهاوي",specialty:"الجلدية",source:"فيزيتا",url:"https://www.vezeeta.com/ar/dr/مركز-هديل-عمر-البنهاوي--امراض-جلدية-وتناسلية",average:4.5,count:459,reviewSummary:"رأي منشور يشيد بالطبيبة ونظافة العيادة.",reviewDate:"يوليو 2018",location:"المنصورة · ميدان الهابي لاند"},
    provider_10:{name:"ضياء السيد",specialty:"العظام",source:"الموقع التعريفي للطبيب",url:"https://dr-diaa-elsayed.com/contact/",location:"المنصورة · ميدان المحطة · برج الكوثر · الدور الرابع",addressSource:"https://dr-diaa-elsayed.com/contact/",reviewUrl:"https://www.vezeeta.com/ar/dr/دكتور-ضياء-السيد-عظام",note:"فيزيتا لا يعرض تقييمًا حديثًا له؛ لم يستنتج متوسط أو عدد تقييمات."},
    provider_167:{name:"نورا عبد المنعم",specialty:"الجلدية",source:"طبيبتي",url:"https://tabebaty.me/doctors/64e741306b6e2ef1509fe254",note:"الملف العام يذكر عيادات برايم بالمنصورة. لا يضاف هذا المقر كتعاقد نقابي ولا يُعتمد بدل مقر مستشفى الخير."}
  };
  const normalize=x=>String(x||"").replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[\u064B-\u065F]/g,"");
  function hospital(r){const facts=hospitals[r.id];return facts && normalize(r.name).includes(normalize(facts.name)) ? {...facts,checkedAt} : null;}
  function urgent(r){const facts=emergency[r.id];if(!facts || normalize(r.name) !== normalize(facts.originalName))return null;return {...(facts.hospital ? hospitals[facts.hospital] : facts),checkedAt};}
  function doctor(p){const facts=doctors[p.id];return facts && normalize(p.name).includes(normalize(facts.name)) && normalize(p.specialty).includes(normalize(facts.specialty)) ? {...facts,checkedAt} : null;}
  return Object.freeze({checkedAt,hospital,urgent,doctor});
});
