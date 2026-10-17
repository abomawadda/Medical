import assert from "node:assert/strict";
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
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
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
async function context(connected = true, sw = "block") {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: sw,
  });
  if (connected) {
    await c.route("**/js/config.js", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: "window.MEDICAL_CONFIG={apiBaseUrl:'https://medical.example.invalid'};",
      }),
    );
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
try {
  const memberContext = await context(),
    p = await memberContext.newPage();
  await p.goto(origin);
  await p
    .getByText("متصل · بيانات الدليل والتقييمات من الخدمة المركزية.")
    .waitFor();
  await p.getByRole("button", { name: "دخول الأعضاء" }).click();
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
  await p
    .getByLabel("آخر ٤ أرقام من الرقم القومي", { exact: true })
    .fill("1234");
  await p.getByRole("button", { name: "تحقق وادخل" }).click();
  await p.locator("dialog").waitFor({ state: "hidden" });
  assert.equal(await p.locator("#member-button").textContent(), "عضو الاختبار");
  const groups = new Map();
  for (const r of seed.records) {
    if (!groups.has(r.provider_id)) groups.set(r.provider_id, []);
    groups.get(r.provider_id).push(r);
  }
  const branches = [...groups.values()].find(
    (rows) =>
      rows.length > 1 &&
      rows[0].phones[0]?.tel &&
      rows[1].phones[0]?.tel &&
      rows[0].phones[0].tel !== rows[1].phones[0].tel,
  );
  assert.ok(branches, "A real multi-branch provider must be available");
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
  assert.equal(
    [...store.reviews.values()][0].branch_id,
    String(branches[1].id),
  );
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
  const row = a.getByRole("row").filter({ hasText: "طبيب اختبار مضاف" });
  await row.getByRole("button", { name: "تعديل", exact: true }).click();
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
    !(await store.catalog()).records.some((r) => r.name === "طبيب اختبار معدل"),
  );
  // Refresh a distinct browser context; published stats must come from the shared backend.
  const guestContext = await context(),
    g = await guestContext.newPage();
  await g.goto(origin + "/#entity=" + encodeURIComponent(target));
  await g.getByText("1 تقييم منشور", { exact: true }).waitFor();
  const dimensions = [];
  for (const width of [320, 390, 768, 1440]) {
    await g.setViewportSize({ width, height: 900 });
    await g.goto(origin + "/#home");
    await g.locator(".hero").waitFor();
    const scrollWidth = await g.evaluate(
      () => document.documentElement.scrollWidth,
    );
    dimensions.push({ width, scrollWidth });
    assert.ok(
      scrollWidth <= width,
      `Horizontal overflow at ${width}px: ${scrollWidth}`,
    );
  }
  if (process.env.MEDICAL_SCREENSHOT_DIR) {
    await mkdir(process.env.MEDICAL_SCREENSHOT_DIR, { recursive: true });
    await g.setViewportSize({ width: 390, height: 844 });
    await g.screenshot({
      path: resolve(process.env.MEDICAL_SCREENSHOT_DIR, "v4-home-mobile.png"),
      fullPage: true,
    });
    await g.goto(origin + "/#doctors");
    await g.screenshot({
      path: resolve(
        process.env.MEDICAL_SCREENSHOT_DIR,
        "v4-doctors-mobile.png",
      ),
      fullPage: false,
    });
  }
  // Fresh public configuration: entry forms are honest and have no demo fallback.
  const offlineConfig = await context(false),
    u = await offlineConfig.newPage();
  await u.goto(origin);
  await u.getByRole("button", { name: "دخول الأعضاء" }).click();
  assert.ok(await u.getByRole("button", { name: "تحقق وادخل" }).isDisabled());
  assert.equal(await u.locator("dialog input").count(), 3);
  await u.keyboard.press("Escape");
  await u.locator("dialog").waitFor({ state: "hidden" });
  // Actual Service Worker/offline test, including preservation of another application's cache.
  const pwa = await context(false, "allow"),
    w = await pwa.newPage();
  await w.goto(origin + "/not-found");
  await w.evaluate(() => caches.open("another-application-cache"));
  await w.goto(origin);
  await w.evaluate(() => navigator.serviceWorker.ready);
  await w.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.ok(
    (await w.evaluate(() => caches.keys())).includes(
      "another-application-cache",
    ),
  );
  await pwa.setOffline(true);
  await w.reload();
  await w.locator(".hero").waitFor();
  assert.ok(
    (await w.locator("#connection-status").textContent()).includes("دون اتصال"),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        memberLogin: true,
        wrongCredentialsRejected: true,
        branchPhoneMatches: true,
        reviewSharedAcrossBrowsers: true,
        adminCrud: true,
        notesRenderedAsText: true,
        publishedStatsShared: true,
        offlineReload: true,
        foreignCachePreserved: true,
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
