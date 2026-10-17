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
  await c.route("https://europe-west1-we-medical-dakahlia.cloudfunctions.net/**", (r) => r.abort());
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
  await page
    .getByText("متصل · بيانات الدليل والتقييمات من الخدمة المركزية.")
    .waitFor();
}
try {
  const memberContext = await context(),
    p = await memberContext.newPage();
  const requests = [];
  p.on("request", (r) => requests.push(r.url()));
  await p.goto(origin + "/#doctors");
  await p.locator(".login-card form").waitFor();
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
  assert.equal(await p.locator("#member-button").textContent(), "عضو الاختبار");
  const saved = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("medical_remembered_session_v1")),
  );
  assert.deepEqual(
    Object.keys(saved).sort(),
    ["api", "token", "expiresAt"].sort(),
  );
  assert.ok(saved.expiresAt > Date.now() + 29 * 86400000);
  await p.reload();
  await p
    .getByText("متصل · بيانات الدليل والتقييمات من الخدمة المركزية.")
    .waitFor();
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
  assert.equal(await r.locator("#member-button").textContent(), "عضو الاختبار");
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
  await p.locator(".branch-select").waitFor();
  await p.locator(".branch-select").selectOption(String(branches[1].id));
  assert.equal(
    await p.locator('a[href^="tel:"]').first().getAttribute("href"),
    "tel:" + branches[1].phones[0].tel,
  );
  await p.getByRole("button", { name: "قيّم الزيارة" }).click();
  await p.getByLabel("تقييم تجربة الزيارة", { exact: true }).selectOption("4");
  await p
    .getByLabel("ملاحظاتك على الزيارة", { exact: true })
    .fill("ملاحظة اختبار <img src=x onerror=alert(1)>");
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "حفظ التقييم" }).click();
  await p.locator("dialog").waitFor({ state: "hidden" });
  assert.equal(store.reviews.size, 1);
  const adminContext = await context(),
    a = await adminContext.newPage();
  await a.goto(origin + "/#admin");
  await a.getByRole("button", { name: "دخول المدير", exact: true }).click();
  await a
    .getByLabel("بريد حساب المدير", { exact: true })
    .fill("admin@example.invalid");
  await a
    .getByLabel("كلمة مرور الحساب", { exact: true })
    .fill("fixture-password");
  await a.getByRole("button", { name: "دخول الإدارة" }).click();
  await a.getByRole("heading", { name: "لوحة إدارة الدليل" }).waitFor();
  await a.getByRole("button", { name: "مراجعة التقييمات" }).click();
  await a
    .getByText("ملاحظة اختبار <img src=x onerror=alert(1)>", { exact: true })
    .waitFor();
  assert.equal(await a.locator("dialog img").count(), 0);
  await a.getByRole("button", { name: "نشر", exact: true }).click();
  await a.getByText(/منشور/).first().waitFor();
  assert.deepEqual((await store.getStats())[target], { count: 1, average: 4 });
  await a.getByRole("button", { name: "إغلاق النافذة" }).click();
  await a.getByRole("button", { name: "إضافة سجل", exact: true }).click();
  await a.getByLabel("الاسم", { exact: true }).fill("طبيب اختبار مضاف");
  await a.getByLabel("التخصص", { exact: true }).fill("اختبار");
  await a.getByLabel("المستشفى", { exact: true }).fill("مستشفى اختبار");
  await a.getByRole("button", { name: "حفظ التغييرات" }).click();
  await a.locator("dialog").waitFor({ state: "hidden" });
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
  const guestContext = await context(),
    g = await guestContext.newPage();
  await g.goto(origin + "/#entity=" + encodeURIComponent(target));
  await g.locator(".login-card form").waitFor();
  assert.equal(await g.locator(".card").count(), 0);
  await memberLogin(g);
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
  }
  const fonts = await g.evaluate(async () => {
    await document.fonts.ready;
    return {
      body: document.fonts.check("16px Cairo", "دليل"),
      heading: document.fonts.check("700 16px Tajawal", "دليل"),
    };
  });
  assert.deepEqual(fonts, { body: true, heading: true });
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
  assert.ok(
    (await w.locator("#connection-status").textContent()).includes("دون اتصال"),
  );
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
