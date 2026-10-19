import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";
import { createService } from "../functions/src/core.mjs";
import { createHandler } from "../functions/src/http.mjs";
import { fixtureStore } from "../functions/test/memory-store.mjs";

const seed = JSON.parse(
  await readFile(
    new URL("../functions/seed/catalog.json", import.meta.url),
    "utf8",
  ),
);
const data = JSON.parse(
  await readFile(new URL("../data.json", import.meta.url), "utf8"),
);
const store = fixtureStore(seed);
const employee = {
  id: "fixture-member",
  jobId: "00123",
  phone: "01012345678",
  nationalId: "29901010101234",
  memberState: "نشط",
  membershipId:"UNION-123", jobTitle:"مهندس اختبار", workplace:"سنترال اختبار",
  name: "عضو الاختبار",
};
const account = {
  id: "fixture-admin",
  firebaseUid: "fixture-admin-uid",
  name: "مدير الاختبار",
  role: "admin",
  accountStatus: "active",
};
const source = Object.freeze({
  findEmployees: async (c) => (c === employee.jobId ? [employee] : []),
  getEmployee: async (id) => (id === employee.id ? employee : null),
  getMemberProfile: async (id) => (id === employee.id ? employee : null),
  findAccounts: async (uid) => (uid === account.firebaseUid ? [account] : []),
  getAccount: async (id) => (id === account.id ? account : null),
  verifyAdminIdentity: async (body) => {
    assert.equal(body.email, "admin@example.invalid");
    assert.equal(body.password, "fixture-password");
    return { uid: account.firebaseUid };
  },
});
const service = createService({
  source,
  store,
  secret: "browser-test-only-secret-1234567890-abcdefgh",
  adminAccountIds: [account.id],
  allowedStates: ["نشط"],
});
let origin;
let servedConfig = null;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/js/config.js" && servedConfig !== null) {
      res.setHeader("Content-Type", "text/javascript");
      res.end("window.MEDICAL_CONFIG=" + JSON.stringify({apiBaseUrl: servedConfig}) + ";");
      return;
    }
    if (url.pathname.startsWith("/v1/")) {
      let body = "";
      for await (const c of req) body += c;
      req.body = body ? JSON.parse(body) : {};
      req.path = url.pathname;
      req.ip = "fixture-browser";
      req.get = (k) => req.headers[k.toLowerCase()];
      req.is = (t) => req.headers["content-type"]?.startsWith(t);
      res.set = (k, v) => {
        res.setHeader(k, v);
        return res;
      };
      res.status = (n) => {
        res.statusCode = n;
        return res;
      };
      res.json = (v) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(v));
        return res;
      };
      return await createHandler({
        getService: () => service,
        origins: [origin],
      })(req, res);
    }
    const file = resolve(
      "dist",
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!file.startsWith(resolve("dist") + "/")) {
      res.statusCode = 403;
      res.end();
      return;
    }
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".webp": "image/webp",
      ".woff2": "font/woff2",
    };
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain");
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  args: ["--no-sandbox"],
});
const errors = [];
async function context(connected = true, sw = "block", storageState) {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: sw,
    ...(storageState ? { storageState } : {}),
  });
  c.on("page",page=>page.on("dialog",dialog=>dialog.accept()));
  await c.route("https://europe-west1-we-medical-dakahlia.cloudfunctions.net/**", (r) => r.abort());
  await c.route("https://abomawadda.github.io/Medical/img/providers/*", async (r) => {
    const filename = new URL(r.request().url()).pathname.split("/").pop();
    if (!["technoscan.png","el-ezaby.png","al-borg.png"].includes(filename)) return r.abort();
    await r.fulfill({contentType:"image/png",body:await readFile(resolve("img/providers",filename))});
  });
  await c.route("https://images.example.invalid/provider.png", async (r) => r.fulfill({contentType:"image/png",body:await readFile(resolve("img/icon-96.png"))}));
  await c.route("**/js/config.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: connected
        ? "window.MEDICAL_CONFIG={apiBaseUrl:'https://medical.example.invalid'};"
        : "window.MEDICAL_CONFIG={apiBaseUrl:''};",
    }),
  );
  if (connected) {
    await c.route("https://medical.example.invalid/**", async (route) => {
      const request = route.request();
      const response = await fetch(origin + new URL(request.url()).pathname, {
        method: request.method(),
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(request.headers().authorization
            ? { Authorization: request.headers().authorization }
            : {}),
        },
        ...(request.method() === "GET" ? {} : { body: request.postData() }),
      });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
  }
  c.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  return c;
}
async function memberLogin(page, remember = false) {
  await page.getByLabel("كود الموظف", { exact: true }).fill("00123");
  await page
    .getByLabel("رقم الموبايل المسجل", { exact: true })
    .fill("01012345678");
  await page
    .getByLabel("آخر ٤ أرقام من الرقم القومي", { exact: true })
    .fill("1234");
  if (remember)
    await page.getByRole("checkbox", { name: /تذكّر دخولي/ }).check();
  await page.getByRole("button", { name: "تحقق وادخل" }).click();
  await page.locator('#main[data-catalog-ready="true"]').waitFor();
}
try {
  const memberContext = await context(),
    p = await memberContext.newPage();
  const requests = [];
  p.on("request", (r) => requests.push(r.url()));
  await p.goto(origin + "/#doctors");
  await p.locator(".login-card form").waitFor();
  assert.equal(await p.locator(".login-card .brand-pair img").count(),2);
  assert.ok(await p.getByRole("heading",{name:"دليل الرعاية الطبية بالدقهلية",exact:true}).isVisible());
  assert.ok(await p.locator('.login-card a[href="tel:01550100025"]').isVisible());
  assert.equal(await p.locator(".app-footer small").first().innerText(),"تطبيق رعايتي - رعاية أقرب لك ولأسرتك · الإصدار 4.7.0");
  assert.equal(await p.locator(".login-card .login-president").innerText(),"رئيس النقابة\nالأستاذ/ محمود صالح");
  assert.equal(await p.locator('.login-card .login-links').count(),0);
  assert.equal(await p.locator('.login-card a[href="tel:123"]').count(),0);
  for (const height of [740,844]) {
    await p.setViewportSize({width:390,height});
    const bounds=await p.locator('.login-card .login-president').boundingBox();
    assert.ok(bounds.y+bounds.height<=height, "Login and president credit fit on the mobile screen");
  }
  assert.ok(!(await p.locator("body").innerText()).includes("اختر التذكّر"));
  assert.ok(!(await p.locator("body").innerText()).includes("رعايتك أقرب ·"));
  await p.getByText("الشبكة الطبية للموظفين والأسر والمعاشات",{exact:true}).waitFor();
  await p.getByText("أدخل بياناتك للدخول",{exact:true}).waitFor();
  await p.getByRole("button",{name:"عن التطبيق والخصوصية",exact:true}).click();
  await p.getByRole("heading",{name:"عن تطبيق رعايتي والخصوصية",exact:true}).waitFor();
  await p.getByRole("button",{name:"إغلاق النافذة",exact:true}).click();
  // The actual header action must open administrator credentials from the member gate.
  await p.locator(".admin-link").click();
  await p.getByRole("heading",{name:"دخول المدير",exact:true}).waitFor();
  await p.getByLabel("بريد حساب المدير أو اسم المستخدم",{exact:true}).waitFor();
  await p.getByRole("button",{name:"إغلاق النافذة",exact:true}).click();
  if(process.env.MEDICAL_SCREENSHOT_DIR) {
    await p.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"login-refined-light.png"),fullPage:true});
    await p.getByRole("button",{name:"تبديل المظهر",exact:true}).click();
    await p.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"login-refined-dark.png"),fullPage:true});
    await p.getByRole("button",{name:"تبديل المظهر",exact:true}).click();
  }
  const entrance = await p.getByRole("button",{name:"تحقق وادخل",exact:true}).boundingBox();
  assert.ok(entrance.y + entrance.height < 844,"Member entry should be reachable without scrolling on a 390x844 screen");

  assert.equal((await (await p.request.get(origin + "/manifest.json")).json()).short_name,"تطبيق رعايتي");
  const installManifest=await (await p.request.get(origin+"/manifest.json")).json();
  assert.ok(installManifest.icons.every(icon=>["img/rayati-icon-512.webp","img/rayati-icon-192.png"].includes(icon.src)));
  assert.equal(installManifest.icons[0].sizes,"512x512");
  assert.equal(await p.locator(".startup-card,.splash-screen,.loading-overlay").count(),0);

  assert.equal(await p.locator(".card").count(), 0);
  assert.ok(await p.locator("#main-nav").isHidden());
  assert.ok(!requests.some((u) => u.includes("/v1/catalog")));
  assert.equal((await p.request.get(origin + "/v1/catalog")).status(), 401);
  assert.equal((await p.request.get(origin + "/js/data.js")).status(), 404);
  await p.getByLabel("كود الموظف", { exact: true }).fill("00123");
  await p
    .getByLabel("رقم الموبايل المسجل", { exact: true })
    .fill("01012345678");
  await p
    .getByLabel("آخر ٤ أرقام من الرقم القومي", { exact: true })
    .fill("0000");
  await p.getByRole("button", { name: "تحقق وادخل" }).click();
  await p
    .locator(".form-error")
    .getByText(/تعذر التحقق/)
    .waitFor();
  await memberLogin(p, true);
  assert.ok(await p.locator("#connection-status").isHidden());
  assert.equal(await p.locator("#connection-status").textContent(), "");
  assert.ok(!(await p.locator("body").innerText()).includes("الخدمة المركزية"));
  assert.equal(await p.locator("#member-button").textContent(), "مرحبًا، عضو الاختبار");
  const saved = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("medical_remembered_session_v1")),
  );
  assert.deepEqual(
    Object.keys(saved).sort(),
    ["api", "token", "expiresAt"].sort(),
  );
  assert.ok(saved.expiresAt > Date.now() + 29 * 86400000);
  // Full profile names, not the two-word session label, drive compound-aware greetings.
  const namesContext=await context(true,"block",await memberContext.storageState());
  const named=await namesContext.newPage();
  await named.route("https://medical.example.invalid/v1/profile",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({profile:{name:"أحمد محمد أبو النجا السيد"}})}));
  await named.goto(origin+"/#home");
  await named.waitForFunction(()=>document.querySelector('#member-button')?.textContent === "مرحبًا، أحمد محمد أبو النجا");
  assert.deepEqual(await named.locator('.greeting-name-part').allTextContents(),["أحمد","محمد","أبو النجا"]);
  for(const width of [320,390]){await named.setViewportSize({width,height:844});assert.ok(await named.evaluate(()=>document.documentElement.scrollWidth)<=width,"Greeting and notification bell fit at "+width);}
  assert.ok(!(await named.evaluate(()=>JSON.stringify(localStorage))).includes("أبو النجا"));
  await namesContext.close();
  const facilitiesContext=await context(true,"block",await memberContext.storageState());
  const facility=await facilitiesContext.newPage();
  await facility.goto(origin+'/#entity='+encodeURIComponent('labs:family_20261018_068'));
  await facility.locator('.facility-group-card').waitFor();
  assert.equal(await facility.locator('.facility-group-heading h3').textContent(),'معامل ألفا');
  assert.equal(await facility.locator('[data-facility-branch="staff_2378"]').count(),1);
  assert.equal(await facility.locator('[data-facility-branch]').count(),2); // Other address is a separate branch.
  assert.doesNotMatch(await facility.locator('.facility-branches').textContent(), /\b(?:null|undefined|nan)\b/i, 'Optional branch status must not render as text below the address, including collapsed choices');
  await facility.locator('.branch-network-options').getByRole('button',{name:'الموظفون',exact:true}).click();
  assert.ok((await facility.locator('.facility-group-details').innerText()).includes('01101216191'));
  assert.equal(await facility.locator('.facility-group-details a[href="tel:16191"]').count(),0); // Hotline belongs to family source.
  await facility.locator('.branch-network-options').getByRole('button',{name:'الأسر والمعاشات',exact:true}).click();
  assert.ok(await facility.locator('.facility-group-details a[href="tel:16191"]').isVisible());
  await facility.getByRole('button',{name:'حفظ في المفضلة على هذا الجهاز',exact:true}).click();
  await facility.goto(origin+'/#favorites');
  assert.equal(await facility.locator('[data-facility-branch]').count(),0); // The merged favorite is one logical branch.
  await facility.locator('.facility-group-card').waitFor();
  assert.equal(await facility.getByRole('button',{name:'حفظ في المفضلة على هذا الجهاز',exact:true}).getAttribute('aria-pressed'),'true');
  for(const width of [320,390,1440]){await facility.setViewportSize({width,height:900});assert.ok(await facility.evaluate(()=>document.documentElement.scrollWidth)<=width);}
  if(process.env.MEDICAL_SCREENSHOT_DIR)await facility.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,'unified-facility-branch.png'),fullPage:true,style:'#toast{visibility:hidden}'});
  await facilitiesContext.close();
  const navigationContext=await context(true,'block',await memberContext.storageState());
  const browsing=await navigationContext.newPage();await browsing.goto(origin+'/#doctors');
  await browsing.locator('.doctor-card').first().waitFor();
  await browsing.locator('#search-input').fill('محمد');
  await browsing.locator('.doctor-card').first().waitFor();
  await browsing.evaluate(()=>window.scrollTo(0,650));
  const searchScroll=await browsing.evaluate(()=>window.scrollY);
  await browsing.locator('.profile-open').first().evaluate(link=>link.click());
  await browsing.locator('.doctor-profile-page').waitFor();
  await browsing.getByRole('button',{name:'العودة إلى النتائج',exact:true}).click();
  await browsing.locator('.doctor-card').first().waitFor();
  await browsing.waitForFunction(expected=>Math.abs(window.scrollY-expected)<3,searchScroll);
  assert.equal(await browsing.locator('#search-input').inputValue(),'محمد');
  await browsing.locator('.profile-open').first().evaluate(link=>link.click());await browsing.locator('.doctor-profile-page').waitFor();
  await browsing.goBack();await browsing.locator('.doctor-card').first().waitFor();
  assert.equal(await browsing.locator('#search-input').inputValue(),'محمد');
  await browsing.locator('#main-nav a[href="#services"]').click();
  await browsing.waitForFunction(()=>location.hash==='#services' && document.querySelector('#search-input').value==='' && !document.querySelector('.doctor-profile-page'));
  assert.equal(await browsing.locator('#search-input').inputValue(),'');
  await navigationContext.close();

  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await p.reload();
  await p.locator('#main[data-catalog-ready="true"]').waitFor();
  await p.waitForFunction(()=>window.scrollY === 0);
  assert.equal(await p.locator(".login-card").count(), 0);
  await p.evaluate(() => {
    const saved = JSON.parse(
      localStorage.getItem("medical_remembered_session_v1"),
    );
    saved.user = { role: "admin", name: "forged" };
    localStorage.setItem(
      "medical_remembered_session_v1",
      JSON.stringify(saved),
    );
  });
  const savedState = await memberContext.storageState();
  const reopened = await context(true, "block", savedState),
    r = await reopened.newPage();
  await r.goto(origin);
  await r.locator(".hero").waitFor();
  assert.equal(await r.locator("#member-button").textContent(), "مرحبًا، عضو الاختبار");
  assert.equal(await r.evaluate(() => MedicalAPI.session().role), "member");
  const groups = new Map();
  for (const item of seed.records) {
    if (!groups.has(item.provider_id)) groups.set(item.provider_id, []);
    groups.get(item.provider_id).push(item);
  }
  const branches = [...groups.values()].find(
    (rows) =>
      rows.length > 1 &&
      rows[0].phones[0]?.tel &&
      rows[1].phones[0]?.tel &&
      rows[0].phones[0].tel !== rows[1].phones[0].tel,
  );
  assert.ok(branches);
  const target = "doctor:" + branches[0].provider_id;
  await p.evaluate(
    (t) => (location.hash = "entity=" + encodeURIComponent(t)),
    target,
  );
  await p.locator(".branch-options").waitFor();
  assert.ok(!/null|undefined|NaN/.test(await p.locator(".doctor-card").innerText()));
  assert.equal(await p.locator(".branch-select").count(),0);
  await p.locator('[data-branch="' + branches[1].id + '"]').click();
  assert.equal(await p.locator('[data-branch="' + branches[1].id + '"]').getAttribute("aria-pressed"),"true");
  assert.ok(await p.locator(".multi-location").isVisible());
  assert.ok(!(await p.locator(".card").innerText()).includes("التغطية تحتاج"));
  assert.equal(
    await p.locator('a[href^="tel:"]').first().getAttribute("href"),
    "tel:" + branches[1].phones[0].tel,
  );
  await p.getByRole("button", { name: "قيّم الزيارة" }).click();
  await p.getByLabel("تقييم تجربة الزيارة", { exact: true }).selectOption("4");
  await p.getByLabel("الاستقبال والتعامل",{exact:true}).selectOption("5");
  await p.getByLabel("وقت الانتظار",{exact:true}).selectOption("3");
  await p
    .getByLabel("ملاحظاتك على الزيارة", { exact: true })
    .fill("ملاحظة اختبار <img src=x onerror=alert(1)>");
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "حفظ التقييم" }).click();
  await p.locator("dialog").waitFor({ state: "hidden" });
  assert.equal(store.reviews.size, 1);
  assert.deepEqual([...store.reviews.values()][0].criteria,{reception:5,waiting:3});
  assert.equal(await p.locator('#app-version').textContent(),'الإصدار 4.7.0');
  assert.ok((await p.locator('.copyright').innerText()).includes('محمود العراقي'));
  await p.goto(origin+"/#entity="+encodeURIComponent("doctor:provider_51"));
  await p.locator('.location-row').first().waitFor();
  assert.equal(await p.locator('.doctor-card').count(),1);
  assert.equal(await p.locator('.location-row').count(),2);
  const maps=await p.locator('.location-row a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).searchParams.get('query')));
  assert.ok(maps[0].includes('الرحمة') && !maps[0].includes('الإيمان'));
  assert.ok(maps[1].includes('الإيمان') && !maps[1].includes('الرحمة'));
  if(process.env.MEDICAL_SCREENSHOT_DIR)await p.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"doctor-two-addresses.png"),fullPage:true});
  const legacyContext=await context(true,"block",await memberContext.storageState());
  await legacyContext.route("https://medical.example.invalid/v1/catalog",async route=>{
    const response=await fetch(origin+'/v1/catalog',{headers:{Origin:origin,Authorization:route.request().headers().authorization}});
    const result=await response.json();delete result.reviewCriteria;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  const oldClient=await legacyContext.newPage();await oldClient.goto(origin+'/#entity='+encodeURIComponent(target));
  await oldClient.getByRole('button',{name:'قيّم الزيارة',exact:true}).click();
  assert.equal(await oldClient.locator('.review-criteria').count(),0);
  assert.ok(await oldClient.getByLabel('تقييم تجربة الزيارة',{exact:true}).isVisible());
  await legacyContext.close();
  const adminContext = await context(),
    a = await adminContext.newPage();
  await a.goto(origin + "/#admin");
  await a.locator(".admin-link").click();
  await a
    .getByLabel("بريد حساب المدير أو اسم المستخدم", { exact: true })
    .fill("admin@example.invalid");
  await a
    .getByLabel("كلمة مرور الحساب", { exact: true })
    .fill("fixture-password");
  await a.getByRole("button", { name: "دخول الإدارة" }).click();
  await a.getByRole("heading", { name: "مركز إدارة تطبيق رعايتي" }).waitFor();
  assert.ok(await a.locator("#connection-status").isVisible());
  for(const width of [320,390,600,768,1440]){
    await a.setViewportSize({width,height:844});
    assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Administration fits at "+width);
    const bounds=await a.locator('.admin-intro').boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1);
  }
  await a.setViewportSize({width:390,height:844});
  const specialty=seed.records[0].specialty;
  await a.getByLabel('التخصص الطبي',{exact:true}).selectOption(specialty);
  const ids=await a.locator('tbody tr').evaluateAll(rows=>rows.map(row=>row.dataset.adminId));
  assert.ok(ids.length>0 && ids.every(id=>seed.records.some(r=>String(r.id)===id && r.specialty===specialty)));
  await a.getByRole('button',{name:'مسح الفلاتر وعرض الكل',exact:true}).click();
  assert.equal(await a.getByLabel('نوع السجلات',{exact:true}).inputValue(),'all');
  await a.getByLabel('نوع السجلات',{exact:true}).selectOption('records');
  await a.getByLabel('قائمة العمل',{exact:true}).selectOption('pending');
  await a.locator("#member-button").click();
  await a.getByRole("heading",{name:"حساب مدير المنظومة",exact:true}).waitFor();
  await a.getByText("الصلاحية",{exact:true}).waitFor();
  await a.getByRole("button",{name:"فتح لوحة الإدارة",exact:true}).click();
  await a.getByRole("heading",{name:"مركز إدارة تطبيق رعايتي",exact:true}).waitFor();
  await a.getByRole('button',{name:'الفروع والتكرار',exact:true}).click();
  await a.getByRole('heading',{name:'مراجعة الفروع والتكرار',exact:true}).waitFor();
  assert.ok(await a.locator('.duplicate-candidate').count()>0);
  await a.getByRole('button',{name:'إغلاق النافذة',exact:true}).click();
  await a.getByLabel('نوع السجلات',{exact:true}).selectOption('labs');
  await a.getByRole('button',{name:'إضافة سجل',exact:true}).click();
  await a.getByLabel('الاسم',{exact:true}).fill('معامل ألفا');
  await a.getByLabel('المركز / المدينة',{exact:true}).selectOption('المنصورة');
  await a.getByLabel('العنوان',{exact:true}).fill('تقاطع شارع جيهان مع شارع الجمهورية');
  await a.locator('.duplicate-warning').waitFor();
  await a.getByLabel('المستفيدون',{exact:true}).selectOption('employee');
  await a.getByLabel('مسار التعاقد',{exact:true}).selectOption('direct_we');
  await a.getByRole('button',{name:'حفظ التغييرات',exact:true}).click();
  await a.locator('.form-error').getByText(/يوجد فرع مشابه/).waitFor();
  await a.getByRole('button',{name:'إغلاق النافذة',exact:true}).click();
  await a.getByLabel('نوع السجلات',{exact:true}).selectOption('records');
  // Selection applies exactly to checked rows, then can be reversed atomically.
  await a.locator('tbody tr').nth(0).locator('.batch-row-check').check();
  await a.locator('tbody tr').nth(1).locator('.batch-row-check').check();
  await a.getByRole('button',{name:'معالجة المحدد (2)',exact:true}).click();
  assert.equal(await a.locator('.batch-preview li').count(),2);
  await a.getByLabel('العملية الجماعية',{exact:true}).selectOption('pause');
  await a.getByRole('button',{name:'تطبيق على المحدد',exact:true}).click();
  await a.locator('dialog').waitFor({state:'hidden'});
  await a.locator('tbody tr').nth(0).getByRole('button',{name:'استئناف الخدمة',exact:true}).waitFor();
  await a.locator('tbody tr').nth(0).locator('.batch-row-check').check();
  await a.locator('tbody tr').nth(1).locator('.batch-row-check').check();
  await a.getByRole('button',{name:'معالجة المحدد (2)',exact:true}).click();
  await a.getByLabel('العملية الجماعية',{exact:true}).selectOption('resume');
  await a.getByRole('button',{name:'تطبيق على المحدد',exact:true}).click();
  await a.locator('dialog').waitFor({state:'hidden'});
  await a.locator('tbody tr').nth(0).getByRole('button',{name:'إيقاف مؤقت',exact:true}).waitFor();
  // New hospital defaults and independent addresses persist as two branches.
  await a.getByLabel('نوع السجلات',{exact:true}).selectOption('hospitals');
  await a.getByRole('button',{name:'إضافة سجل',exact:true}).click();
  assert.equal(await a.getByLabel('تصنيف الجهة',{exact:true}).inputValue(),'مستشفى استثماري');
  assert.equal(await a.getByLabel('القسم الرئيسي للجهة',{exact:true}).inputValue(),'hospitals');
  await a.getByLabel('الاسم',{exact:true}).fill('مستشفى فروع اختبار');
  await a.getByLabel('المركز / المدينة',{exact:true}).selectOption('المنصورة');
  await a.getByLabel('العنوان',{exact:true}).fill('عنوان رئيسي مصطنع');
  await a.getByLabel('المحمول',{exact:true}).fill('01012345678');
  await a.getByRole('button',{name:'معاينة بيانات الجهة قبل الحفظ',exact:true}).click();
  assert.ok((await a.locator('.editor-preview').innerText()).includes('مستشفى فروع اختبار'));
  await a.getByLabel('المستفيدون',{exact:true}).selectOption('all');
  await a.getByRole('button',{name:'+ إضافة عنوان / فرع',exact:true}).click();
  await a.getByLabel('اسم مختصر للفرع',{exact:true}).fill('فرع طلخا');
  await a.getByLabel('مركز الفرع',{exact:true}).selectOption('طلخا');
  await a.getByLabel('عنوان الفرع',{exact:true}).fill('عنوان فرع ثانٍ مصطنع');
  await a.getByLabel('أرضي الفرع',{exact:true}).fill('0502000001');
  await a.getByLabel('راجعت بيانات الجهة وتعاقدها وأعتمد إظهارها للأعضاء',{exact:true}).check();
  await a.getByRole('button',{name:'حفظ التغييرات',exact:true}).click();
  await a.locator('dialog').waitFor({state:'hidden'});
  const newHospitals=(await store.catalog()).hospitals.filter(h=>h.name==='مستشفى فروع اختبار');
  assert.equal(newHospitals.length,2);assert.equal(newHospitals[0].organization_id,newHospitals[1].organization_id);
  assert.equal(newHospitals[0].category,'مستشفى استثماري');
  assert.deepEqual(newHospitals[1].contact_groups.mobile,[]);
  const branchesContext=await context(true,'block',await memberContext.storageState()),bp=await branchesContext.newPage();
  await bp.goto(origin+'/#entity='+encodeURIComponent('hospitals:'+newHospitals[0].id));
  await bp.locator('.facility-group-card').waitFor();
  assert.equal(await bp.locator('[data-facility-branch]').count(),2);
  if(process.env.MEDICAL_SCREENSHOT_DIR)await bp.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,'hospital-multiple-addresses.png'),fullPage:true});
  await branchesContext.close();
  // Shared-field changes require an exact preview and leave contacts untouched.
  await a.getByLabel('قائمة العمل',{exact:true}).selectOption('all');
  for(const h of newHospitals)await a.locator('[data-admin-id="'+h.id+'"] .batch-row-check').check();
  await a.getByRole('button',{name:'معالجة المحدد (2)',exact:true}).click();
  await a.getByLabel('العملية الجماعية',{exact:true}).selectOption('edit');
  await a.getByLabel('المركز الجديد',{exact:true}).selectOption('بلقاس');
  await a.getByLabel('المستفيدون الجدد',{exact:true}).selectOption('employee');
  await a.getByRole('button',{name:'معاينة التغييرات',exact:true}).click();
  assert.equal(await a.locator('.batch-change-row').count(),2);
  await a.getByLabel('راجعت القيم الحالية والجديدة وأوافق على تطبيقها على المحدد',{exact:true}).check();
  if(process.env.MEDICAL_SCREENSHOT_DIR)await a.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,'bulk-data-preview.png'),fullPage:true});
  await a.getByRole('button',{name:'تطبيق على المحدد',exact:true}).click();
  await a.locator('dialog').waitFor({state:'hidden'});
  const edited=(await store.catalog()).hospitals.filter(h=>newHospitals.some(n=>n.id===h.id));
  assert.ok(edited.every(r=>r.markaz==='بلقاس' && r.maps_url===''));
  assert.deepEqual(edited[0].contact_groups.mobile,['01012345678']);
  await a.getByLabel('قائمة العمل',{exact:true}).selectOption('pending');

  await a.getByLabel('نوع السجلات',{exact:true}).selectOption('records');
  await a.setViewportSize({width:1440,height:1000});
  const sidebar=await a.locator('#main-nav').boundingBox();
  assert.ok(sidebar.height>700 && sidebar.width<250);
  assert.ok((await a.locator('.page-shell').boundingBox()).width>1100);
  assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=1440));
  if(process.env.MEDICAL_SCREENSHOT_DIR)await a.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"admin-desktop-workspace.png"),fullPage:false});
  await a.setViewportSize({width:390,height:844});
  // Visibility is authoritative on the API; suspension preserves the listing.
  const managed = seed.records[0], managedProvider = "doctor:" + managed.provider_id;
  const managedRows = (await store.catalog()).records.filter(r=>r.provider_id===managed.provider_id);
  await a.locator("tbody tr").first().getByRole("button",{name:"إيقاف مؤقت",exact:true}).click();
  await a.getByRole("button",{name:"تأكيد التغيير",exact:true}).click();
  await a.locator("dialog").waitFor({state:"hidden"});
  await a.locator("tbody tr").first().getByRole("button",{name:"استئناف الخدمة",exact:true}).waitFor();
  assert.equal((await store.catalog()).records.filter(r=>r.provider_id===managed.provider_id && r.service_status==="suspended").length,managedRows.length);
  await p.goto(origin+"/#entity="+encodeURIComponent(managedProvider));
  await p.reload();
  await p.getByText("موقوف مؤقتًا",{exact:true}).first().waitFor();
  await a.locator("tbody tr").first().getByRole("button",{name:"إخفاء",exact:true}).click();
  await a.getByRole("button",{name:"تأكيد التغيير",exact:true}).click();
  await a.locator("dialog").waitFor({state:"hidden"});
  await a.locator("tbody tr").first().getByRole("button",{name:"إظهار",exact:true}).waitFor();
  await p.reload();
  await p.locator('#main[data-catalog-ready="true"]').waitFor();
  assert.equal(await p.locator('[data-target="'+managedProvider+'"]').count(),0);
  await a.locator("tbody tr").first().getByRole("button",{name:"إظهار",exact:true}).click();
  await a.getByRole("button",{name:"تأكيد التغيير",exact:true}).click();
  await a.locator("dialog").waitFor({state:"hidden"});
  await a.locator("tbody tr").first().getByRole("button",{name:"إخفاء",exact:true}).waitFor();
  await a.locator("tbody tr").first().getByRole("button",{name:"استئناف الخدمة",exact:true}).click();
  await a.getByRole("button",{name:"تأكيد التغيير",exact:true}).click();
  await a.locator("dialog").waitFor({state:"hidden"});
  await a.locator("tbody tr").first().getByRole("button",{name:"إيقاف مؤقت",exact:true}).waitFor();
  await p.reload();
  await p.locator('[data-target="'+managedProvider+'"]').waitFor();
  assert.equal(await p.getByText("موقوف مؤقتًا",{exact:true}).count(),0);
  assert.equal(await a.locator(".admin-metrics article").count(),4);
  if(process.env.MEDICAL_SCREENSHOT_DIR) { await a.evaluate(()=>window.scrollTo(0,0)); await a.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"admin-redesign-mobile.png"),fullPage:false,style:"#toast{visibility:hidden}"}); }

  await a.getByRole("button",{name:"مراجعة المواقع والمواعيد",exact:true}).click();
  await a.getByRole("heading",{name:"مراجعة المواقع والمواعيد",exact:true}).waitFor();
  await a.getByText("تعارض يستلزم تصحيحًا",{exact:false}).first().waitFor();
  await a.getByRole("button",{name:"إغلاق النافذة",exact:true}).click();
  await a.goto(origin+"/#emergency");
  await a.getByText("رقم منشور بالدليل · راجع حداثة البيانات",{exact:true}).first().waitFor();
  await a.goto(origin+"/#admin");
  await a.getByRole("heading",{name:"مركز إدارة تطبيق رعايتي",exact:true}).waitFor();
  await a.getByRole("button", { name: "جودة بيانات الدليل", exact: true }).click();
  await a.getByRole("heading", { name: "جودة بيانات الدليل", exact: true }).waitFor();
  await a.getByLabel("نوع الملاحظة", {exact:true}).selectOption("missing_source");
  await a.getByLabel("القسم المراد مراجعته", {exact:true}).selectOption("records");
  assert.equal(await a.locator(".quality-item").count(), 30);
  const [qualityDownload] = await Promise.all([
    a.waitForEvent("download"),
    a.getByRole("button", {name:"تنزيل تقرير الجودة",exact:true}).click(),
  ]);
  const qualityReport = JSON.parse(await readFile(await qualityDownload.path(), "utf8"));
  assert.equal(qualityReport.total, Object.entries(await store.catalog()).filter(([kind]) => kind !== "medical_guidelines").reduce((sum, [,rows]) => sum + rows.length, 0));
  assert.ok(!JSON.stringify(qualityReport).includes("ملاحظة اختبار"));
  assert.ok(!JSON.stringify(qualityReport).includes(employee.nationalId));
  if (process.env.MEDICAL_SCREENSHOT_DIR) {
    await mkdir(process.env.MEDICAL_SCREENSHOT_DIR, {recursive:true});
    await a.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"admin-quality-mobile.png"),fullPage:true});
  }
  await a.getByRole("button", {name:"مراجعة السجل وتعديله",exact:true}).first().click();
  await a.getByRole("heading", {name:"تعديل: الأطباء والعيادات",exact:true}).waitFor();
  await a.getByRole("button", {name:"إغلاق النافذة",exact:true}).click();
  await a.getByRole("button", { name: "مراجعة التقييمات" }).click();
  await a
    .getByText("ملاحظة اختبار <img src=x onerror=alert(1)>", { exact: true })
    .waitFor();
  assert.equal(await a.locator("dialog img").count(), 0);
  let moderationRequests = 0;
  a.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/admin/reviews/")) moderationRequests++;
  });
  await adminContext.route("https://medical.example.invalid/v1/catalog", (route) =>
    route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"fixture refresh unavailable"})}));
  await a.getByRole("button", {name:"اعتماد ونشر",exact:true}).click();
  await a.locator("dialog").waitFor({state:"hidden"});
  await a.getByText(/تم اعتماد التقييم ونشره بنجاح/).waitFor();
  assert.equal(moderationRequests,1);
  await adminContext.unroute("https://medical.example.invalid/v1/catalog");
  assert.deepEqual((await store.getStats())[target], {count:1,average:4});
  await a.getByRole("button", {name:"مراجعة التقييمات",exact:true}).click();
  await a.getByText("لا توجد تقييمات بانتظار الاعتماد.", {exact:true}).waitFor();
  assert.equal(await a.getByRole("button", {name:"اعتماد ونشر",exact:true}).count(),0);
  await a.getByRole("button", {name:/تمت مراجعتها/}).click();
  await a.getByText(/معتمد ومنشور/).first().waitFor();
  assert.equal(await a.getByRole("button", {name:"اعتماد ونشر",exact:true}).count(),0);
  await adminContext.route("https://medical.example.invalid/v1/admin/reviews/*", (route) =>
    route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"تعذر حفظ التغيير التجريبي"})}));
  await a.getByRole("button", {name:"إخفاء التقييم",exact:true}).click();
  await a.getByText("تعذر حفظ التغيير التجريبي", {exact:true}).waitFor();
  assert.ok(await a.getByRole("button", {name:"إخفاء التقييم",exact:true}).isEnabled());
  await adminContext.unroute("https://medical.example.invalid/v1/admin/reviews/*");
  await a.getByRole("button", {name:"إخفاء التقييم",exact:true}).click();
  await a.locator("dialog").waitFor({state:"hidden"});
  assert.equal((await store.getStats())[target]?.count || 0,0);
  await a.getByRole("button", {name:"مراجعة التقييمات",exact:true}).click();
  await a.getByRole("button", {name:/تمت مراجعتها/}).click();
  assert.equal(await a.getByRole("button", {name:"اعتماد ونشر",exact:true}).count(),0);
  await a.getByRole("button", {name:"إغلاق النافذة"}).click();
  // The member's name opens their own profile and editing creates a new version.
  await p.getByRole("button", {name:/مرحبًا، عضو الاختبار/}).click();
  await p.getByRole("heading", {name:"بطاقتي النقابية",exact:true}).waitFor();
  await p.getByText("UNION-123", {exact:true}).waitFor();
  await p.getByText("مهندس اختبار", {exact:true}).waitFor();
  assert.ok(await p.getByText("آخر دخول إلى الدليل الطبي", {exact:true}).isVisible());
  assert.ok(!await p.locator(".member-profile").textContent().then((s) => s.includes("29901010101234")));
  if (process.env.MEDICAL_SCREENSHOT_DIR) {
    await mkdir(process.env.MEDICAL_SCREENSHOT_DIR, {recursive:true});
    await p.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"member-profile-mobile.png"),fullPage:true});
  }
  await p.getByRole("button", {name:"تعديل تقييمي",exact:true}).click();
  assert.equal(await p.getByLabel("ملاحظاتك على الزيارة",{exact:true}).inputValue(),"ملاحظة اختبار <img src=x onerror=alert(1)>");
  await p.getByLabel("ملاحظاتك على الزيارة",{exact:true}).fill("عدّل العضو تقييمه بنفسه");
  await p.getByRole("checkbox").check();
  await p.getByRole("button", {name:"حفظ التقييم",exact:true}).click();
  await p.locator("dialog").waitFor({state:"hidden"});
  await a.getByRole("button", {name:"مراجعة التقييمات",exact:true}).click();
  await a.getByRole("button", {name:"اعتماد ونشر",exact:true}).click();
  await a.locator("dialog").waitFor({state:"hidden"});
  assert.deepEqual((await store.getStats())[target], {count:1,average:4});
  // Old production functions must never receive unversioned moderation from the new UI.
  await adminContext.route("https://medical.example.invalid/v1/health", (route) =>
    route.fulfill({status:200,contentType:"application/json",body:'{"configured":true}'}));
  await a.getByRole("button", {name:"مراجعة التقييمات",exact:true}).click();
  await a.getByText(/يلزم نشر تحديث الخدمة المركزية/).waitFor();
  await a.getByRole("button", {name:/تمت مراجعتها/}).click();
  assert.ok(await a.getByRole("button", {name:"إخفاء التقييم",exact:true}).isDisabled());
  await adminContext.unroute("https://medical.example.invalid/v1/health");
  await a.getByRole("button", {name:"إغلاق النافذة"}).click();
  await a.getByRole("button", { name: "إضافة سجل", exact: true }).click();
  await a.getByRole("button",{name:"إضافة عنصر إلى التخصص",exact:true}).click();
  await a.getByLabel("اسم العنصر الجديد: التخصص",{exact:true}).fill("تخصص اختبار محفوظ");
  await a.getByRole("button",{name:"حفظ العنصر",exact:true}).click();
  await a.locator('.inline-option:not([hidden])').waitFor({state:"hidden"});
  await a.getByRole("button",{name:"إغلاق النافذة",exact:true}).click();
  await a.reload();await a.getByRole("heading",{name:"مركز إدارة تطبيق رعايتي",exact:true}).waitFor();
  await a.getByRole("button",{name:"إضافة سجل",exact:true}).click();
  assert.ok((await a.getByLabel("التخصص",{exact:true}).locator("option").allTextContents()).includes("تخصص اختبار محفوظ"));
  await a.getByLabel("الاسم", { exact: true }).fill("طبيب اختبار مضاف");
  await a.getByLabel("التخصص", { exact: true }).selectOption({index:1});
  await a.getByLabel("المركز / المدينة", {exact:true}).selectOption("المنصورة");
  await a.getByLabel("المستشفى", { exact: true }).selectOption("عيادة مستقلة");
  await a.getByLabel("المستفيدون",{exact:true}).selectOption("employee");
  await a.getByLabel("مسار التعاقد",{exact:true}).selectOption("direct_we");
  await a.getByLabel("المحمول", {exact:true}).fill("0502332691");
  await a.getByRole("button", { name: "حفظ التغييرات" }).click();
  assert.ok(await a.getByLabel("المحمول",{exact:true}).evaluate(e=>!e.validity.valid));
  await a.locator(".field-error").getByText(/أدخل رقمًا كاملًا/).waitFor();
  await a.getByLabel("المحمول", {exact:true}).fill("01013588730");
  await a.getByLabel("الأرضي", {exact:true}).fill("0502332691");
  await a.getByLabel("الأرقام المختصرة", {exact:true}).fill("19989");
  await a.locator(".editor-advanced").evaluate(e=>e.open=true);
  await a.getByLabel("رابط صورة الطبيب أو الجهة (https)", {exact:true}).fill("https://images.example.invalid/provider.png");
  await a.getByLabel("مصدر الصورة وحق استخدامها (https)", {exact:true}).fill("https://example.invalid/provider");
  await a.getByRole("checkbox", {name:/تأكدت من هوية صاحب الصورة/}).check();
  await a.getByLabel("الرسم التعبيري",{exact:true}).selectOption("doctor_female");
  await a.getByRole("button", { name: "حفظ التغييرات" }).click();
  await a.locator("dialog").waitFor({ state: "hidden" });
  const addedProvider=(await store.catalog()).records.find(x=>x.name === "طبيب اختبار مضاف");
  assert.equal(addedProvider.image_verified,true);
  assert.equal(addedProvider.avatar_type,"doctor_female");
  assert.deepEqual(addedProvider.contact_groups,{mobile:["01013588730"],landline:["0502332691"],shortcode:["19989"]});
  await a.getByRole("button",{name:"إضافة خبر",exact:true}).click();
  await a.getByLabel("عنوان النشرة",{exact:true}).fill("إعلان اختبار الشبكة");
  await a.getByLabel("الموجز",{exact:true}).fill("خبر اختبار محلي بمرجع مصطنع");
  await a.getByLabel("حالة النشر",{exact:true}).selectOption("published");
  await a.getByRole("button",{name:"حفظ التغييرات",exact:true}).click();
  await a.getByText("النشر يحتاج الجهة المصدرة ومرجعًا وتاريخ مراجعة.",{exact:true}).waitFor();
  await a.getByLabel("الجهة المصدرة",{exact:true}).fill("جهة الاختبار");
  await a.getByLabel("مرجع التعليمات أو الإعلان",{exact:true}).fill("مرجع اختبار 1");
  await a.getByLabel("تاريخ مراجعة المحتوى",{exact:true}).fill(new Date().toISOString().slice(0,10));
  await a.getByRole("button",{name:"حفظ التغييرات",exact:true}).click();
  await a.locator("dialog").waitFor({state:"hidden"});
  await p.goto(origin+"/#home");await p.reload();
  await p.locator(".update-card").getByRole("heading",{name:"إعلان اختبار الشبكة",exact:true}).waitFor();
  assert.equal(await p.locator('.update-card').filter({hasText:"طبيب اختبار مضاف"}).count(),0);
  assert.equal(await p.locator('.update-card:not(:has(.update-label.news))').count(),0);
  await p.getByRole("button",{name:/الإشعارات/}).click();
  await p.locator('.notification-item').filter({hasText:'إعلان اختبار الشبكة'}).waitFor();
  assert.equal(await p.locator('.notification-item').filter({hasText:'طبيب اختبار مضاف'}).count(),0);
  await p.getByRole('button',{name:'تحديد الإعلانات كمقروءة',exact:true}).click();
  assert.equal(await p.locator('#notifications-button .notification-count').isHidden(),true);
  await p.getByRole('button',{name:'إغلاق النافذة',exact:true}).click();
  await a.getByRole("button",{name:"جودة بيانات الدليل",exact:true}).click();
  assert.equal(await a.locator('.quality-item').filter({hasText:"طبيب اختبار مضاف"}).count(),0);
  await a.getByLabel("البحث في جميع السجلات بما فيها المحدّثة",{exact:true}).fill("طبيب اختبار مضاف");
  await a.getByLabel("نوع الملاحظة",{exact:true}).focus();
  await a.locator('.quality-item').filter({hasText:"طبيب اختبار مضاف"}).first().waitFor();
  await a.getByRole("button",{name:"إغلاق النافذة",exact:true}).click();
  await p.goto(origin + "/#entity=" + encodeURIComponent("doctor:" + addedProvider.provider_id));
  await p.reload(); // An entity created in another session requires a fresh catalog.
  await p.locator('#main[data-catalog-ready="true"]').waitFor();
  assert.equal(await p.getByRole("heading",{name:"طبيب اختبار مضاف",exact:true}).count(),0);
  assert.equal(addedProvider.contract_listing,false);
  assert.equal(await a.getByRole("row").filter({hasText:"طبيب اختبار مضاف"}).count(),0);
  await a.locator("#search-input").fill("طبيب اختبار مضاف");
  await a
    .getByRole("row")
    .filter({ hasText: "طبيب اختبار مضاف" })
    .getByRole("button", { name: "تعديل", exact: true })
    .click();
  await a.getByLabel("الاسم", { exact: true }).fill("طبيب اختبار معدل");
  await a.getByRole("button", { name: "حفظ التغييرات" }).click();
  await a.locator("dialog").waitFor({ state: "hidden" });
  await a.locator("#search-input").fill("طبيب اختبار معدل");
  await a
    .getByRole("row")
    .filter({ hasText: "طبيب اختبار معدل" })
    .getByRole("button", { name: "حذف", exact: true })
    .click();
  await a.getByRole("button", { name: "تأكيد الحذف" }).click();
  await a.locator("dialog").waitFor({ state: "hidden" });
  assert.ok(
    !(await store.catalog()).records.some((x) => x.name === "طبيب اختبار معدل"),
  );
  // Hidden source entries can now be explicitly approved by the administrator.
  await a.locator('.admin-metrics article').filter({hasText:"المخفية والمحجوبة"}).getByRole('button').click();
  const unlistedLab=a.locator('tr[data-admin-id="lab_1"]');
  await unlistedLab.getByRole('button',{name:"إظهار",exact:true}).click();
  await a.getByRole('checkbox',{name:"راجعت جهة التعاقد وأعتمد إظهار هذا السجل للأعضاء",exact:true}).check();
  await a.getByRole('button',{name:"تأكيد التغيير",exact:true}).click();
  await a.locator('dialog').waitFor({state:'hidden'});
  assert.ok((await store.catalog()).labs.find(r=>r.id==='lab_1').publication_approval);
  await a.getByLabel('حالة العرض والخدمة',{exact:true}).selectOption('visible');
  await a.locator('#search-input').fill('معامل المختبر');
  await a.locator('tr[data-admin-id="lab_1"]').getByRole('button',{name:'إخفاء',exact:true}).click();
  await a.getByRole('button',{name:'تأكيد التغيير',exact:true}).click();await a.locator('dialog').waitFor({state:'hidden'});
  await a.getByLabel('حالة العرض والخدمة',{exact:true}).selectOption('');
  await a.locator('#search-input').fill('');
  await a.getByLabel('نوع السجلات',{exact:true}).selectOption('records');
  await a.getByRole('button',{name:'إضافة سجل',exact:true}).click();
  await a.getByLabel('الاسم',{exact:true}).fill('طبيب مرتبط للاختبار');
  await a.getByLabel('التخصص',{exact:true}).selectOption('تخصص اختبار محفوظ');
  await a.getByLabel('المركز / المدينة',{exact:true}).selectOption('المنصورة');
  await a.getByLabel('المستفيدون',{exact:true}).selectOption('employee');
  await a.getByLabel('مسار التعاقد',{exact:true}).selectOption('hospital');
  await a.getByRole('button',{name:'إضافة عنصر إلى المستشفى',exact:true}).click();
  await a.getByLabel('اسم العنصر الجديد: المستشفى',{exact:true}).fill('مستشفى اختبار جديدة مستقلة');
  await a.getByRole('checkbox',{name:'راجعت التعاقد وأعتمد إظهار المستشفى الجديدة',exact:true}).check();
  await a.getByRole('button',{name:'حفظ العنصر',exact:true}).click();
  await a.locator('.inline-option:not([hidden])').waitFor({state:'hidden'});
  await a.getByRole('checkbox',{name:'راجعت بيانات الجهة وتعاقدها وأعتمد إظهارها للأعضاء',exact:true}).check();
  await a.getByRole('button',{name:'حفظ التغييرات',exact:true}).click();
  await a.locator('dialog').waitFor({state:'hidden'});
  const parentCreated=(await store.catalog()).hospitals.find(r=>r.name==='مستشفى اختبار جديدة مستقلة');
  assert.equal(parentCreated.contract_entity_id,parentCreated.id);assert.equal(parentCreated.contract_listing,true);
  const childCreated=(await store.catalog()).records.find(r=>r.name==='طبيب مرتبط للاختبار');
  assert.equal(childCreated.contract_entity_id,parentCreated.id);assert.equal(childCreated.contract_listing,true);
  const guestContext = await context(),
    g = await guestContext.newPage();
  await g.goto(origin + "/#entity=" + encodeURIComponent(target));
  await g.locator(".login-card form").waitFor();
  assert.equal(await g.locator(".card").count(), 0);
  await memberLogin(g);
  await g.goto(origin+"/#services");
  await g.locator(".network-tabs").getByRole("button",{name:"الأسر والمعاشات",exact:true}).click();
  const familyOnly=seed.records.find(r=>r.source_ref === "family-20261018" && r.source_row===36);
  await g.goto(origin+"/#entity="+encodeURIComponent("doctor:"+familyOnly.provider_id));
  await g.locator(".anime-doctor_male").waitFor();
  assert.ok((await g.locator(".provider-profile").innerText()).includes("شبكة الأسر والمعاشات"));
  assert.equal(await g.getByText("موقوف مؤقتًا",{exact:true}).count(),0);
  await g.goto(origin+"/#entity="+encodeURIComponent("hospitals:hosp_kheir"));
  await g.locator('[data-contact-type="landline"] a[href="tel:0502504066"]').waitFor();
  assert.equal(await g.locator('.facility-card [data-contact-type="mobile"]').count(),0);
  await g.goto(origin+"/#services");
  await g.locator(".network-tabs").getByRole("button",{name:"الموظفون",exact:true}).click();
  assert.equal(await g.locator('[data-target="pharmacies:family_20261018_010"]').count(),0);
  await g.goto(origin+"/#entity="+encodeURIComponent("hospitals:hosp_kheir"));
  // This shared hospital has the same phone in both sheets; its address differs.
  await g.locator('.facility-card').getByText("شارع قناة السويس",{exact:true}).waitFor();
  assert.equal(await g.locator('.facility-card').getByText("153 شارع قناة السويس",{exact:true}).count(),0);
  await g.goto(origin+"/#services");
  await g.locator(".network-tabs").getByRole("button",{name:"كل الشبكات",exact:true}).click();
  // Home searches all authorized provider categories, not just physicians.
  await g.goto(origin+"/#home");
  await g.locator(".care-districts").getByRole("button",{name:"طلخا",exact:true}).click();
  assert.equal(new URL(g.url()).hash,"#district-network");
  await g.locator('.active-filters').getByText('المركز: طلخا',{exact:true}).waitFor();
  await g.locator('#main-nav').getByRole('link',{name:'الرئيسية',exact:true}).click();
  await g.locator(".care-home-search input").fill("داوي");
  await g.locator(".care-home-search").getByRole("button",{name:"ابحث",exact:true}).click();
  await g.getByRole("heading",{name:"نتائج البحث في الدليل",exact:true}).waitFor();
  await g.locator('[data-target="specialized_centers:family_20261018_047"]').waitFor();
  await g.locator("#search-input").fill("مركز داوى متخصص");
  await g.locator('[data-target="specialized_centers:family_20261018_047"]').waitFor();
  await g.locator("#search-input").fill("دواي");
  await g.locator('.search-suggestions').waitFor();
  await g.locator('[data-target="specialized_centers:family_20261018_047"]').waitFor();
  await g.locator('.search-suggestions').getByRole("button",{name:"عيادات داوي",exact:true}).click();
  assert.equal(await g.locator("#search-input").inputValue(),"عيادات داوي");
  await g.locator("#main-nav").getByRole("link",{name:"الأطباء",exact:true}).click();
  await g.getByRole("heading",{name:"الأطباء والعيادات",exact:true}).waitFor();
  assert.equal(await g.locator("#search-input").inputValue(),"");
  // Section navigation clears hidden search, district and service filters.
  await g.goto(origin+"/#doctors");
  await g.locator("#search-input").fill("عبارة اختبار لا تطابق أحدًا");
  await g.locator("#filter-panel summary").click();
  await g.getByLabel("المركز / المدينة",{exact:true}).selectOption("طلخا");
  await g.locator("#main-nav").getByRole("link",{name:"الخدمات",exact:true}).click();
  await g.getByRole("heading",{name:"الخدمات الطبية",exact:true}).waitFor();
  assert.equal(await g.locator("#search-input").inputValue(),"");
  assert.equal(await g.getByLabel("المركز / المدينة",{exact:true}).inputValue(),"");
  assert.ok((await g.locator(".facility-card").count())>0);
  await g.getByRole("button",{name:"الصيدليات",exact:true}).click();
  await g.locator('[data-target^="pharmacies:"]').first().waitFor();
  await g.locator("#main-nav").getByRole("link",{name:"الأطباء",exact:true}).click();
  await g.getByRole("heading",{name:"الأطباء والعيادات",exact:true}).waitFor();
  assert.ok((await g.locator(".doctor-card").count())>0);
  await g.locator("#main-nav").getByRole("link",{name:"الخدمات",exact:true}).click();
  await g.locator('[data-target^="labs:"]').first().waitFor();
  assert.equal(await g.locator('.active-filters').count(),0);
  await g.locator("#main-nav").getByRole("link",{name:"التعليمات",exact:true}).click();
  await g.getByRole("heading",{name:"تعليمات الحصول على الخدمة",exact:true}).waitFor();
  assert.equal(await g.locator(".instruction-card").count(),0); // legacy texts are unapproved
  await g.goto(origin + "/#districts");
  await g.locator(".district-card").first().waitFor();
  assert.equal(await g.locator(".district-card").count(),17);
  if(process.env.MEDICAL_SCREENSHOT_DIR) await g.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"districts-mobile.png"),fullPage:false});
  await g.locator(".district-card").filter({hasText:"طلخا"}).click();
  await g.getByRole("heading",{name:"الشبكة الطبية · طلخا",exact:true}).waitFor();
  assert.ok((await g.locator(".card").count())>0);
  await g.locator("#filter-panel summary").click();
  await g.getByRole("button",{name:"مسح الفلاتر",exact:true}).click();
  await g.goto(origin + "/#services");
  await g.getByRole("button",{name:"الأسنان",exact:true}).click();
  await g.locator('[data-target="specialized_centers:staff_2745"]').waitFor();
  assert.equal(await g.locator('[data-target="specialized_centers:spec_center_5"]').count(),0); // Not supplied in an approved contract workbook.
  await g.goto(origin+"/#emergency");
  await g.locator('a[href="tel:16133"]').waitFor();
  await g.locator('a[href="tel:19104"]').waitFor();
  assert.ok(!(await g.locator("#main").innerText()).includes("راجع حداثة"));
  assert.ok(!(await g.locator("#main").innerText()).includes("لم يُعثر"));
  const careBottom=await g.locator(".care-hotlines").evaluate(n=>n.getBoundingClientRect().bottom);
  const ambulanceTop=await g.locator(".ambulance-call").evaluate(n=>n.getBoundingClientRect().top);
  assert.ok(careBottom < ambulanceTop);
  await g.getByRole("heading",{name:"الطوارئ العامة بالدولة",exact:true}).waitFor();
  assert.equal(await g.locator('.public-emergency [data-emergency]').count(),28);
  await g.locator('.public-emergency [data-emergency="em_mans_intl_hosp"]').waitFor();
  assert.equal(await g.locator('.public-emergency [data-emergency="em_mans_kheir_cath"]').count(),0);
  assert.equal(await g.locator('[data-emergency="em_gm"]').count(),0);
  await g.locator('[data-emergency="em_mans_kheir_cath"]').getByText("استقبال الطوارئ على مدار 24 ساعة",{exact:true}).waitFor();
  if(process.env.MEDICAL_SCREENSHOT_DIR) await g.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"emergency-refined-mobile.png"),fullPage:false});
  await g.goto(origin+"/#entity="+encodeURIComponent("hospitals:staff_754"));
  await g.getByText("شارع الجمهورية - المنصورة",{exact:true}).waitFor();
  const resolvedMap=await g.getByRole("link",{name:"البحث عن العنوان",exact:true}).getAttribute("href");
  assert.ok(new URL(resolvedMap).searchParams.get("query").includes("شارع الجمهورية"));
  assert.ok(!/null|undefined|NaN/.test(await g.locator(".facility-card").innerText()));
  await g.goto(origin+"/#doctors");
  await g.getByRole("heading",{name:"الأطباء والعيادات",exact:true}).waitFor();
  assert.equal(await g.locator(".provider-profile").count(),0);
  assert.equal(await g.locator(".profile-open").count(),await g.locator(".doctor-card").count());
  await g.locator(".profile-open").first().click();
  await g.locator(".provider-profile").waitFor();
  assert.ok(!/null|undefined|NaN/.test(await g.locator(".provider-profile").innerText()));
  await g.goto(origin+"/#entity="+encodeURIComponent("doctor:provider_127"));
  await g.locator(".external-score").waitFor();
  assert.ok((await g.locator(".external-score").innerText()).includes("459"));
  assert.ok((await g.locator(".external-source").innerText()).includes("يوليو 2018"));
  await g.getByText("المستفيدون",{exact:true}).first().waitFor();
  if(process.env.MEDICAL_SCREENSHOT_DIR) await g.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"doctor-profile-mobile.png"),fullPage:true});

  assert.ok(!(await g.locator("#main").innerText()).includes("مسؤول الرعاية الطبية"));
  await g.goto(origin+"/#services");
  await g.getByRole("button",{name:"الصيدليات",exact:true}).click();
  await g.locator(".facility-card").first().waitFor();
  assert.ok(!(await g.locator("#main").innerText()).includes("اتصل لمعرفة المواعيد"));
  await g.goto(origin+"/#doctors");
  await g.goto(origin+"/#entity="+encodeURIComponent("doctor:provider_7"));
  await g.locator('.provider-profile[data-target="doctor:provider_7"] .anime-doctor_female').waitFor();
  assert.equal(await g.locator(".anime-doctor_male").count(),0);
  await g.goto(origin+"/#entity="+encodeURIComponent("doctor:provider_1"));
  await g.locator('.provider-profile[data-target="doctor:provider_1"] .anime-doctor_male').waitFor();
  assert.equal(await g.locator(".anime-doctor_female,.anime-doctor_team").count(),0);
  await g.goto(origin + "/#hospitals");
  if (!await g.locator("#filter-panel").evaluate(n=>n.open)) await g.locator("#filter-panel summary").click();
  const districtOptions = await g.getByLabel("المركز / المدينة",{exact:true}).locator("option").allTextContents();
  for (const district of ["الجمالية","تمي الأمديد","محلة دمنة","ميت سلسيل","نبروه"]) assert.ok(districtOptions.includes(district));
  await g.getByLabel("الشبكة",{exact:true}).selectOption("family");
  assert.equal(await g.locator('[data-target="hospitals:hosp_hekma"]').count(),0);
  assert.equal(await g.locator('[data-target="hospitals:hosp_sellab"]').count(),1);
  await g.getByRole("button", {name:"مسح الفلاتر",exact:true}).click();
  await g.locator("#filter-panel summary").click();
  await g.goto(origin + "/#entity=" + encodeURIComponent("radiology:staff_761"));
  await g.getByRole("heading",{name:"مركز تكنوسكان",exact:true}).waitFor();
  assert.equal(await g.locator('[data-contact-type="shortcode"] a[href^="tel:"]').getAttribute("href"),"tel:19989");
  assert.equal(await g.locator('[data-contact-type="mobile"] a[href^="tel:"]').getAttribute("href"),"tel:01012221036");
  assert.equal(await g.locator('[data-contact-type="landline"]').count(),0);
  await g.locator(".anime-clinic").waitFor();
  await guestContext.route("https://medical.example.invalid/v1/catalog", async (route) => {
    const result=await fetch(origin + "/v1/catalog", {headers:{Origin:origin,Authorization:route.request().headers().authorization}});
    const body=await result.json();
    body.stats["radiology:staff_761"]={count:1,average:null};
    Object.assign(body.catalog.radiology.find(r=>r.id==="staff_761"),{working_hours:"null",address:"undefined",markaz:"NaN"});
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
  });
  await g.reload();
  await g.getByText("لا يوجد تقييم متاح بعد · شارك تجربتك",{exact:true}).waitFor();
  assert.ok(!/null|NaN/.test(await g.locator(".card").innerText()));
  assert.equal(await g.locator(".image-source,.phone-source,.data-note").count(),0);
  await guestContext.unroute("https://medical.example.invalid/v1/catalog");
  await g.goto(origin + "/#doctors");
  await g.locator(".card").first().waitFor();
  await g.evaluate((name) => {
    window.scrollTo(0,document.body.scrollHeight);
    const input=document.querySelector("#search-input");
    input.value=name;
    input.dispatchEvent(new Event("input",{bubbles:true}));
  },branches[0].name);
  await g.waitForFunction(()=>window.scrollY === 0);
  await g.locator("#clear-search").click();
  if (process.env.MEDICAL_SCREENSHOT_DIR) await g.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"staff-provider-mobile.png"),fullPage:true});
  await g.goto(origin + "/#entity=" + encodeURIComponent(target));
  await g.getByText("1 تقييم منشور", { exact: true }).waitFor();
  assert.equal(
    await g.evaluate(() =>
      localStorage.getItem("medical_remembered_session_v1"),
    ),
    null,
  );
  await g.reload();
  await g.getByText("1 تقييم منشور", { exact: true }).waitFor(); // tab-only session survives reload
  const dimensions = [];
  for (const width of [320, 390, 768, 1440]) {
    await g.setViewportSize({ width, height: 900 });
    await g.goto(origin + "/#home");
    await g.locator(".hero").waitFor();
    const scrollWidth = await g.evaluate(
      () => document.documentElement.scrollWidth,
    );
    dimensions.push({ width, scrollWidth });
    assert.ok(scrollWidth <= width);
    if(process.env.MEDICAL_SCREENSHOT_DIR)await g.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,`rayati-home-${width}.png`),fullPage:true});
  }
  const pilotContext = await context(), pilot = await pilotContext.newPage();
  await pilot.goto(origin + "/?experience=companion");
  await pilot.locator(".login-card form").waitFor();
  assert.equal(await pilot.locator(".companion-welcome").count(), 0);
  await memberLogin(pilot);
  await pilot.goto(origin + "/?experience=companion");
  await pilot.getByRole("heading", {name:"مرحبًا، عضو الاختبار",exact:true}).waitFor();
  await pilot.getByRole("button", {name:/بطاقتي وتقييماتي/}).click();
  await pilot.getByText("UNION-123", {exact:true}).waitFor();
  await pilot.getByRole("button", {name:"العودة للرئيسية",exact:true}).click();
  await pilot.getByLabel("ابحث عن طبيب أو جهة أو تخصص", {exact:true}).fill(branches[0].name);
  await pilot.getByRole("button", {name:"ابحث الآن",exact:true}).click();
  await pilot.locator(".card").first().waitFor();
  await pilot.locator(".before-visit summary").first().click();
  assert.equal(await pilot.getByText("راجع تفاصيل هذا المقر قبل الزيارة.", {exact:true}).count(),0);
  await pilot.locator('[data-branch="' + branches[1].id + '"]').first().click();
  await pilot.locator(".before-visit summary").first().click();
  assert.ok((await pilot.locator(".before-visit").first().textContent()).includes(branches[1].address));
  assert.equal(await pilot.locator('a[href^="tel:"]').first().getAttribute("href"), "tel:" + branches[1].phones[0].tel);
  await pilot.goto(origin + "/?experience=companion#entity=" + encodeURIComponent(target));
  await pilot.locator(".card").first().waitFor();
  const pilotWidths=[];
  for (const width of [320,390,768,1440]) {
    await pilot.setViewportSize({width,height:844});
    const measured=await pilot.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(measured <= width, "Preview entity overflow at " + width);
    pilotWidths.push({width,scrollWidth:measured});
  }
  if (process.env.MEDICAL_SCREENSHOT_DIR) {
    await pilot.setViewportSize({width:390,height:844});
    await pilot.locator(".before-visit summary").first().click();
    await pilot.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"companion-entity-mobile.png"),fullPage:true});
    await pilot.goto(origin + "/?experience=companion#account");
    await pilot.getByText("UNION-123", {exact:true}).waitFor();
    await pilot.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"companion-account-mobile.png"),fullPage:true});
    await pilot.goto(origin + "/?experience=companion#home");
    await pilot.locator(".companion-welcome").waitFor();
    await pilot.screenshot({path:resolve(process.env.MEDICAL_SCREENSHOT_DIR,"companion-home-mobile.png"),fullPage:true});
  }
  await pilot.goto(origin + "/?experience=companion#home");
  await pilot.locator(".companion-welcome").waitFor();
  await pilot.getByLabel("ابحث عن طبيب أو جهة أو تخصص",{exact:true}).fill("داوي");
  await pilot.getByRole("button",{name:"ابحث الآن",exact:true}).click();
  await pilot.locator('[data-target="specialized_centers:family_20261018_047"]').waitFor();
  await pilot.goto(origin+"/?experience=companion#home");
  await pilot.locator(".companion-welcome").waitFor();
  for (const width of [320,390,768,1440]) {
    await pilot.setViewportSize({width,height:844});
    assert.ok(await pilot.evaluate(() => document.documentElement.scrollWidth) <= width, "Preview home overflow at " + width);
  }
  assert.ok(await pilot.locator(".preview-notice").isHidden());
  await pilot.goto(origin + "/#home");
  await pilot.locator(".hero").waitFor();
  assert.equal(await pilot.locator(".companion-welcome").count(),0);
  assert.ok(!pilot.url().includes("experience=companion"));
  const fonts = await g.evaluate(async () => {
    await document.fonts.ready;
    return {
      body: document.fonts.check("16px Cairo", "دليل"),
      heading: document.fonts.check("700 16px Tajawal", "دليل"),
    };
  });
  assert.deepEqual(fonts, { body: true, heading: true });
  // Reclassify one facility without moving storage identity, reviews, favorites or siblings.
  const sectionMemberContext=await context(true,'block',await memberContext.storageState());
  const sectionMember=await sectionMemberContext.newPage();
  const sectionId=String(newHospitals[0].id),canonicalTarget='hospitals:'+sectionId;
  await sectionMember.goto(origin+'/#entity='+encodeURIComponent(canonicalTarget));
  await sectionMember.locator('[data-target="'+canonicalTarget+'"]').waitFor();
  await sectionMember.getByRole('button',{name:'حفظ في المفضلة على هذا الجهاز',exact:true}).click();
  await sectionMember.getByRole('button',{name:'قيّم الزيارة',exact:true}).click();
  await sectionMember.getByLabel('تقييم تجربة الزيارة',{exact:true}).selectOption('4');
  await sectionMember.getByLabel('ملاحظاتك على الزيارة',{exact:true}).fill('مراجعة اصطناعية للتحقق من ثبات التصنيف');
  await sectionMember.getByRole('checkbox').check();
  await sectionMember.getByRole('button',{name:'حفظ التقييم',exact:true}).click();
  await sectionMember.locator('dialog').waitFor({state:'hidden'});
  const sectionReview=[...store.reviews.values()].find(r=>r.target_id===canonicalTarget);
  assert.ok(sectionReview);
  const beforeSection=(await store.catalog()).hospitals.find(r=>String(r.id)===sectionId);
  await a.goto(origin+'/#admin');
  await a.getByRole('button',{name:'مسح الفلاتر وعرض الكل',exact:true}).click();
  await a.locator('#search-input').fill('مستشفى فروع اختبار');
  await a.locator('[data-admin-id="'+sectionId+'"]').getByRole('button',{name:'تعديل',exact:true}).click();
  assert.ok(await a.getByLabel('القسم الرئيسي للجهة',{exact:true}).isEnabled());
  await a.getByLabel('القسم الرئيسي للجهة',{exact:true}).selectOption('specialized_centers');
  await a.getByRole('button',{name:'حفظ التغييرات',exact:true}).click();
  await a.locator('.form-error').getByText(/راجع معاينة تغيير القسم/).waitFor();
  await a.getByLabel('راجعت تغيير قسم هذا السجل مع الحفاظ على بياناته وتقييماته',{exact:true}).check();
  await a.getByRole('button',{name:'حفظ التغييرات',exact:true}).click();
  await a.locator('dialog').waitFor({state:'hidden'});
  const afterSection=(await store.catalog()).hospitals.find(r=>String(r.id)===sectionId);
  assert.equal(afterSection.category,'مركز متخصص');
  assert.equal(afterSection.id,beforeSection.id);assert.equal(afterSection.organization_id,beforeSection.organization_id);
  assert.equal(afterSection.contract_entity_id,beforeSection.contract_entity_id);
  assert.equal(afterSection.phone,beforeSection.phone);
  assert.equal((await store.catalog()).specialized_centers.some(r=>String(r.id)===sectionId),false);
  assert.deepEqual(store.reviews.get(sectionReview.id),sectionReview);
  await a.getByLabel('نوع السجلات',{exact:true}).selectOption('specialized_centers');
  await a.locator('[data-admin-id="'+sectionId+'"]').waitFor();
  await sectionMember.reload();
  await sectionMember.locator('[data-target="'+canonicalTarget+'"]').waitFor();
  assert.equal(await sectionMember.getByRole('button',{name:'حفظ في المفضلة على هذا الجهاز',exact:true}).getAttribute('aria-pressed'),'true');
  await sectionMember.goto(origin+'/#hospitals');
  await sectionMember.getByRole('heading',{name:'المستشفيات',exact:true}).waitFor();
  assert.equal(await sectionMember.locator('[data-target="'+canonicalTarget+'"]').count(),0);
  await sectionMember.goto(origin+'/#services');
  await sectionMember.getByRole('button',{name:'المراكز المتخصصة',exact:true}).click();
  await sectionMember.locator('[data-target="'+canonicalTarget+'"]').waitFor();
  await sectionMember.goto(origin+'/#entity='+encodeURIComponent('specialized_centers:'+sectionId));
  await sectionMember.locator('[data-target="'+canonicalTarget+'"]').waitFor();
  await a.locator('[data-admin-id="'+sectionId+'"]').getByRole('button',{name:'تعديل',exact:true}).click();
  assert.equal(await a.getByLabel('القسم الرئيسي للجهة',{exact:true}).inputValue(),'specialized_centers');
  await a.getByLabel('القسم الرئيسي للجهة',{exact:true}).selectOption('hospitals');
  await a.getByLabel('راجعت تغيير قسم هذا السجل مع الحفاظ على بياناته وتقييماته',{exact:true}).check();
  await a.getByRole('button',{name:'حفظ التغييرات',exact:true}).click();
  await a.locator('dialog').waitFor({state:'hidden'});
  assert.equal((await store.catalog()).hospitals.find(r=>String(r.id)===sectionId).category,'مستشفى استثماري');
  assert.deepEqual(store.reviews.get(sectionReview.id),sectionReview);
  assert.equal((await store.catalog()).hospitals.find(r=>String(r.id)===String(newHospitals[1].id)).category,'مستشفى استثماري');
  await sectionMemberContext.close();
  // Active editing survives the original absolute deadline; only real inactivity logs out.
  const idleContext=await context();
  const savedAdmin=await a.evaluate(()=>JSON.parse(sessionStorage.getItem('medical_session_v1')));
  await idleContext.addInitScript(({saved,host})=>{if(location.origin===host)sessionStorage.setItem('medical_session_v1',JSON.stringify(saved));},{saved:savedAdmin,host:origin});
  const idlePage=await idleContext.newPage();const idleStart=Date.now();let activityRequests=0;
  await idlePage.clock.install({time:idleStart});
  await idlePage.route('https://medical.example.invalid/v1/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({name:'مدير الاختبار',role:'admin',expiresAt:idleStart+600000,lastActivityAt:idleStart,idleTimeoutMs:600000})}));
  await idlePage.route('https://medical.example.invalid/v1/admin/activity',async route=>{
    activityRequests++;const at=await idlePage.evaluate(()=>Date.now());
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({expiresAt:at+600000,lastActivityAt:at,idleTimeoutMs:600000})});
  });
  await idlePage.goto(origin+'/#admin');await idlePage.getByRole('heading',{name:'مركز إدارة تطبيق رعايتي',exact:true}).waitFor();
  await idlePage.bringToFront();
  assert.equal(await idlePage.evaluate(()=>document.hidden),false);
  await idlePage.getByRole('button',{name:'إضافة سجل',exact:true}).click();
  for(let minute=1;minute<=12;minute++){
    await idlePage.clock.fastForward(60000);
    await idlePage.getByLabel('الاسم',{exact:true}).fill('مسودة نشاط اختبار '+minute);
    await idlePage.waitForFunction(()=>JSON.parse(sessionStorage.getItem('medical_session_v1')).expiresAt>Date.now()+550000);
  }
  assert.ok(await idlePage.getByLabel('الاسم',{exact:true}).isVisible());
  assert.ok(activityRequests>=12 && activityRequests<=14);
  const beforeIdleRequests=activityRequests;
  await idlePage.clock.fastForward(540000);
  await idlePage.locator('.admin-idle-banner:visible').waitFor({state:'visible'});
  assert.equal(activityRequests,beforeIdleRequests);
  await idlePage.getByRole('button',{name:'متابعة العمل',exact:true}).click();
  await idlePage.waitForFunction(()=>JSON.parse(sessionStorage.getItem('medical_session_v1')).expiresAt>Date.now()+550000);
  const afterContinueRequests=activityRequests;
  await idlePage.evaluate(()=>window.dispatchEvent(new Event('input')));
  await idlePage.clock.fastForward(600001);
  await idlePage.locator('.login-card').waitFor();
  assert.equal(activityRequests,afterContinueRequests);
  assert.equal(await idlePage.evaluate(()=>sessionStorage.getItem('medical_session_v1')),null);
  await idleContext.close();
  // Sign out clears the remembered token and invalidates copies on the server.
  await r.locator("#member-button").click();
  await r.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await r.locator(".login-card form").waitFor();
  assert.equal(
    await r.evaluate(() =>
      localStorage.getItem("medical_remembered_session_v1"),
    ),
    null,
  );
  await p.reload();
  await p.locator(".login-card form").waitFor();
  assert.equal(await p.locator(".card").count(), 0);
  const forged = await context(),
    f = await forged.newPage();
  await f.goto(origin);
  await f.evaluate(
    (base) =>
      localStorage.setItem(
        "medical_remembered_session_v1",
        JSON.stringify({
          api: base,
          token: "x".repeat(43),
          expiresAt: Date.now() + 86400000,
          user: { role: "admin" },
        }),
      ),
    "https://medical.example.invalid",
  );
  await f.reload();
  await f.locator(".login-card form").waitFor();
  assert.ok(await f.locator("#main-nav").isHidden());
  assert.equal(
    await f.evaluate(() =>
      localStorage.getItem("medical_remembered_session_v1"),
    ),
    null,
  );
  const offlineConfig = await context(false),
    u = await offlineConfig.newPage();
  await u.goto(origin);
  await u.locator(".login-card form").waitFor();
  assert.ok(await u.getByRole("button", { name: "تحقق وادخل" }).isDisabled());
  assert.equal(
    await u.locator(".login-card input:not([type=checkbox])").count(),
    3,
  );
  if (process.env.MEDICAL_SCREENSHOT_DIR) {
    await mkdir(process.env.MEDICAL_SCREENSHOT_DIR, { recursive: true });
    await u.screenshot({
      path: resolve(
        process.env.MEDICAL_SCREENSHOT_DIR,
        "required-login-mobile.png",
      ),
      fullPage: true,
    });
    await g.setViewportSize({ width: 390, height: 844 });
    await g.goto(origin + "/#doctors");
    await g.locator(".card").first().waitFor();
    await g.screenshot({
      path: resolve(
        process.env.MEDICAL_SCREENSHOT_DIR,
        "cairo-directory-mobile.png",
      ),
      fullPage: false,
    });
  }
  const tabSaved = await g.evaluate(() =>
    JSON.parse(sessionStorage.getItem("medical_session_v1")),
  );
  store.sessions.get(
    createHmac("sha256", "browser-test-only-secret-1234567890-abcdefgh")
      .update(tabSaved.token)
      .digest("hex"),
  ).expiresAt = Date.now() - 1;
  await g.reload();
  await g.locator(".login-card form").waitFor();
  assert.equal(
    await g.evaluate(() => sessionStorage.getItem("medical_session_v1")),
    null,
  );
  const pwa = await context(false, "allow"),
    w = await pwa.newPage();
  servedConfig = "";
  await w.goto(origin + "/not-found");
  await w.evaluate(() => caches.open("another-application-cache"));
  await w.goto(origin);
  await w.evaluate(() => navigator.serviceWorker.ready);
  await w.waitForFunction(() => !!navigator.serviceWorker.controller);
  await pwa.unroute("**/js/config.js*");
  servedConfig = "https://updated-config.example.invalid";
  await w.reload();
  assert.equal(await w.evaluate(() => window.MEDICAL_CONFIG.apiBaseUrl), servedConfig);
  assert.ok(
    (await w.evaluate(() => caches.keys())).includes(
      "another-application-cache",
    ),
  );
  await pwa.setOffline(true);
  await w.reload();
  await w.locator(".login-card form").waitFor();
  assert.equal(await w.evaluate(() => window.MEDICAL_CONFIG.apiBaseUrl), servedConfig);
  assert.equal(await w.locator(".card").count(), 0);
  assert.ok(await w.locator("#connection-status").isHidden());
  await w.evaluate(() => document.fonts.ready);
  assert.ok(await w.evaluate(() => document.fonts.check("16px Cairo", "دليل")));
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        loginRequired: true,
        catalogRequiresServerSession: true,
        rememberedSessionRestored: true,
        tabSessionRestored: true,
        credentialsNotStored: true,
        forgedSessionRejected: true,
        logoutRevokesRememberedSession: true,
        deepLinksProtected: true,
        fonts,
        offlineGate: true,
        foreignCachePreserved: true,
        publicConfigurationRefreshedOnlineAndAvailableOffline: true,
        moderationSuccessClosesDialogAndReviewedItemsLeaveQueue: true,
        personalProfileAndAuthorOnlyReviewEditing: true,
        incompatibleBackendModerationBlocked: true,
        optInCompanionPreviewAuthenticatedAndResponsive: true,
        moderationSavedDespiteDirectoryRefreshFailure: true,
        dimensions,
        runtimeErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
