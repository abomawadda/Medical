# النشر الآلي وفحص صحة Medical

## ما جُهّز وما لم يُفعّل

- `.github/workflows/firebase.yml`: مسار نشر وظيفة Medical وقواعده من main بعد الاختبارات، بهوية Google قصيرة العمر عبر Workload Identity Federation، دون ملف مفتاح خدمة طويل العمر في GitHub.
- لا يحاول المسار النشر قبل وجود إعداداته المطلوبة. تظهر خطوة readiness أنه غير مفعل عند غيابها، بدل إيهام المالك بنجاح نشر لم يحدث.
- يبدأ النشر لتغييرات الخلفية والقواعد وبيانات الدليل الأساسية وأدوات النشر ذات الصلة فقط. تعديل الواجهة وحده لا يستدعي نشر Firebase.
- `.github/workflows/health.yml`: فحص عام للقراءة فقط كل ست ساعات أو يدويًا، دون دخول عضو أو قراءة ملف خاص أو حفظ تقييم. تختبر خمس طلبات التهيئة وقدرات الخدمة، ورفض الدليل والجلسة دون رمز، وCORS. جدولة GitHub قد تتأخر أو تُعطل وفق سياسة الحساب؛ ليست مراقبة مضمونة لحظة بلحظة.
- `scripts/check-live.mjs`: الفحص نفسه ويمكن تشغيله بـ`node scripts/check-live.mjs`. يحترم إعدادات عميل Node للشبكة؛ في بيئة المساعد المعتمدة على proxy استُخدم Node 24 مع `NODE_USE_ENV_PROXY=1`، ولا تُلغى إعدادات proxy أو الثقة بالشهادات.
- نجح الفحص المباشر للقدرات والحماية على الخدمة المنشورة بتاريخ 18 أكتوبر 2026. هذا لا يثبت إعداد IAM الخاص بالنشر الآلي أو صلاحيات الفوترة أو وجود نسخ احتياطية.

حساب Google غير متصل بجلسة المساعد، وواجهة GitHub المتاحة تعيد 403 لإدارة متغيرات Actions وأسراره. لذلك الربط الخارجي الآتي خطوة إعداد واحدة لدى المالك؛ لا ندعي أنه فُعّل لمجرد حفظ ملفات workflow. مسار Cloud Shell الحالي يستمر حتى نجاح أول نشر WIF فعلي.

## حدود الثقة المطلوبة في Google

المشروع الوحيد الذي يستقبل هوية النشر هو `we-medical-dakahlia`، رقمه `1013831084756`. لا يُمنح حساب النشر أي دور جديد في `nekaba2026`، ولا يُستخدم حساب قراءة العضويات كحساب نشر.

يُنشأ حساب مخصص مثل `medical-github-deployer@we-medical-dakahlia.iam.gserviceaccount.com`، وWorkload Identity Pool ومزوّد GitHub. يربط المزوّد claims رقم المستودع ورقم المالك والفرع والـworkflow؛ نموذج شرط الثقة:

```text
assertion.repository_id == '1421107833' &&
assertion.repository_owner_id == '67769028' &&
assertion.ref == 'refs/heads/main' &&
assertion.workflow_ref == 'abomawadda/Medical/.github/workflows/firebase.yml@refs/heads/main'
```

يجب تضمين `google.subject=assertion.sub` وحقول repository_id/repository_owner_id/ref اللازمة في attribute mapping. يُمنح principalSet المقيد برقم هذا المستودع دور `roles/iam.workloadIdentityUser` على حساب النشر المحدد فقط. فرع main يحتاج حماية مناسبة وصلاحيات دمج معلومة، لأن تغيير كود الخدمة المنشور صلاحية حساسة.

تُحدد أدوار النشر داخل Medical فقط بما تحتاجه عملية تحديث الوظيفة وقواعد Firestore والبناء وحزمة المصدر، مع `iam.serviceAccountUser` على هوية تشغيل Medical المقصودة. يجب مراجعة احتياج Cloud Functions وCloud Run وFirebase Rules وArtifact Registry وCloud Build والوصول إلى بيانات إعداد الأسرار؛ لا نعالج فشل إذن بمنح Owner/Editor أو بنقل حساب قراءة المصدر إلى مشروع النشر. هوية التشغيل تظل صاحبة صلاحية قراءة سرّي الخدمة، وهوية النشر لا تحتاج قراءة بيانات الأعضاء نفسها. تختلف التفاصيل حسب هوية البناء وحاويات المصدر الحالية، ويُثبت حد الصلاحيات بعملية نشر اختبار فعلية قبل اعتبار الربط مكتملًا.

المراجع الرسمية للإعداد ومراجعة الأذونات:

- https://github.com/google-github-actions/auth
- https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines
- https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-google-cloud-platform
- https://firebase.google.com/docs/cli

## إعدادات مستودع abomawadda/Medical

من Settings → Secrets and variables → Actions يضبط المالك:

| النوع | الاسم | القيمة المطلوبة |
|---|---|---|
| Variable | `MEDICAL_WIF_PROVIDER` | مسار المزوّد الكامل `projects/1013831084756/locations/global/workloadIdentityPools/.../providers/...` |
| Variable | `MEDICAL_DEPLOY_SERVICE_ACCOUNT` | حساب النشر المخصص داخل مشروع Medical فقط |
| Secret | `MEDICAL_ADMIN_ACCOUNT_ID` | معرف مستند المدير المعتمد سابقًا؛ نخفيه من سجل التنفيذ ولا نضعه في الكود العام |
| Variable | `MYNEKABA_WEB_API_KEY` | مفتاح Firebase Web API العام الصحيح لمشروع النقابة |

لا يُضاف JSON حساب قراءة المصدر إلى GitHub؛ يظل في Secret Manager الخاص بـMedical. ولا يُستخدم `firebase login:ci` أو كلمة مرور المدير لتفويض النشر.

## إثبات التفعيل

1. بعد ضبط الثقة والأدوار والإعدادات، يُشغل Deploy Medical Firebase يدويًا على main مرة واحدة.
2. تنجح اختبارات الوحدة والمتصفح والبناء قبل الحصول على هوية Google.
3. تنجح مرحلة المصادقة دون تدخل بشري، ثم نشر functions:medical وقواعد Medical فقط.
4. ينجح فحص API ويحفظ artifact اسمه medical-api-health، دون بيانات خاصة.
5. يسجل نجاح أول نشر WIF وتاريخه في اتفاقية المشروع. بعد ذلك تنشر تغييرات الخلفية ذات الصلة تلقائيًا.

فشل readiness أو تجاوز مرحلة deploy بسبب نقص الإعدادات لا يعني أن الخدمة نُشرت. رسائل فشل IAM تُراجع وفق الإذن المحدد، وتبقى قاعدة الفصل عن مشروع النقابة سارية.

## فحص الصحة وحدوده

يعرض التقرير وقت الفحص وحالات HTTP وزمن كل طلب. لا يثبت الفحص العام دخول حساب فعلي أو اعتماد تقييم حقيقي أو صحة كل سجل في الدليل. تبقى اختبارات المتصفح المعزولة وتجربة القبول المصرح بها لازمة بحسب التغيير. سياسة تنبيهات GitHub للحساب هي التي تحدد إشعارات فشل المهام؛ لم يُرسل هذا الإعداد رسائل مخصصة لأي شخص.

الفحص الدوري لا يفحص الفواتير ولا ينشئ تنبيهات ميزانية أو سياسات نسخ احتياطي أو TTL. هذه أعمال مستقلة ضمن O03 وO04 في الاتفاقية.
