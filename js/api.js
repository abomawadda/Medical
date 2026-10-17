window.MedicalAPI = (() => {
  const base = String(window.MEDICAL_CONFIG?.apiBaseUrl || "").replace(
    /\/$/,
    "",
  );
  const rememberedKey = "medical_remembered_session_v1",
    tabKey = "medical_session_v1";
  let current = null,
    remembered = false,
    notice = "";
  const configured = (() => {
    try {
      return new URL(base).protocol === "https:";
    } catch {
      return false;
    }
  })();
  const changed = () =>
    window.dispatchEvent(new Event("medical-session-invalidated"));
  function erase() {
    for (const [area, key] of [
      ["localStorage", rememberedKey],
      ["sessionStorage", tabKey],
    ]) {
      try {
        window[area].removeItem(key);
      } catch {}
    }
  }
  function forget(notify = true) {
    current = null;
    remembered = false;
    erase();
    if (notify) changed();
  }
  function readSaved() {
    for (const [area, key, keep] of [
      ["sessionStorage", tabKey, false],
      ["localStorage", rememberedKey, true],
    ]) {
      try {
        const saved = JSON.parse(window[area].getItem(key));
        if (
          saved?.api === base &&
          /^[A-Za-z0-9_-]{43}$/.test(saved.token) &&
          Number.isFinite(saved.expiresAt) &&
          saved.expiresAt > Date.now()
        ) {
          remembered = keep;
          return { token: saved.token, expiresAt: saved.expiresAt, user: null };
        }
        if (saved) window[area].removeItem(key);
      } catch {
        try {
          window[area].removeItem(key);
        } catch {}
      }
    }
    return null;
  }
  function persist() {
    notice = "";
    try {
      window[remembered ? "sessionStorage" : "localStorage"].removeItem(
        remembered ? tabKey : rememberedKey,
      );
    } catch {}
    try {
      window[remembered ? "localStorage" : "sessionStorage"].setItem(
        remembered ? rememberedKey : tabKey,
        JSON.stringify({
          api: base,
          token: current.token,
          expiresAt: current.expiresAt,
        }),
      );
    } catch {
      notice =
        "تعذر الاحتفاظ بالدخول على هذا الجهاز؛ ستحتاج تسجيل الدخول بعد إعادة فتح الصفحة.";
    }
  }
  function session() {
    if (current && current.expiresAt <= Date.now()) {
      forget(false);
      queueMicrotask(changed);
    }
    return current?.user ? { ...current.user } : null;
  }
  async function request(
    path,
    { method = "GET", body, protectedRequest = false, restoring = false } = {},
  ) {
    if (!configured)
      throw new Error(
        "خدمة التحقق قيد التجهيز. سيتم إتاحة الدخول بعد تفعيل الاتصال المركزي.",
      );
    if (protectedRequest && !(restoring ? current?.token : session()))
      throw new Error("يرجى تسجيل الدخول مجددًا.");
    let response;
    try {
      response = await fetch(base + "/v1" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(protectedRequest
            ? { Authorization: "Bearer " + current.token }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error("تعذر الاتصال بالخدمة. تحقق من الإنترنت وحاول مجددًا.");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (protectedRequest && [401, 403].includes(response.status)) forget();
      const error = new Error(payload.message || "تعذر إكمال العملية.");
      error.code = payload.code;
      throw error;
    }
    return payload;
  }
  async function restore() {
    if (session()) return session();
    current ||= readSaved();
    if (!current) return null;
    const user = await request("/session", {
      protectedRequest: true,
      restoring: true,
    });
    if (
      !["member", "admin"].includes(user.role) ||
      !Number.isFinite(user.expiresAt) ||
      user.expiresAt <= Date.now()
    ) {
      forget();
      throw new Error("انتهت الجلسة. يرجى تسجيل الدخول مجددًا.");
    }
    current = {
      token: current.token,
      expiresAt: user.expiresAt,
      user: { name: user.name, role: user.role },
    };
    persist();
    return session();
  }
  async function login(kind, body) {
    const result = await request("/" + kind + "/session", {
      method: "POST",
      body,
    });
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(result.token || "") ||
      !["member", "admin"].includes(result.user?.role) ||
      !Number.isFinite(result.expiresAt)
    )
      throw new Error("استجابة الدخول غير صالحة.");
    current = result;
    remembered = kind === "member" && body.remember === true;
    persist();
    return session();
  }
  window.addEventListener("storage", (e) => {
    if (e.key === rememberedKey && remembered && current && e.newValue === null)
      forget();
  });
  return Object.freeze({
    configured,
    session,
    restore,
    request,
    login,
    get persistenceNotice() {
      return notice;
    },
    async logout() {
      try {
        if (current?.token)
          await request("/logout", {
            method: "POST",
            body: {},
            protectedRequest: true,
            restoring: true,
          });
      } finally {
        forget();
      }
    },
    catalog: () => request("/catalog", { protectedRequest: true }),
    health: () => request("/health"),
    profile: () => request("/profile", { protectedRequest: true }),
    review: (body) =>
      request("/reviews", { method: "POST", body, protectedRequest: true }),
    myReviews: () => request("/reviews/mine", { protectedRequest: true }),
    adminReviews: () => request("/admin/reviews", { protectedRequest: true }),
    moderate: (id, status, revision) =>
      request("/admin/reviews/" + encodeURIComponent(id), {
        method: "PATCH",
        body: { status, revision },
        protectedRequest: true,
      }),
    save: (kind, entity, version) =>
      request(
        "/admin/entities/" +
          encodeURIComponent(kind) +
          "/" +
          encodeURIComponent(entity.id),
        {
          method: "PUT",
          body: { entity, expected_version: version },
          protectedRequest: true,
        },
      ),
    remove: (kind, entity) =>
      request(
        "/admin/entities/" +
          encodeURIComponent(kind) +
          "/" +
          encodeURIComponent(entity.id),
        {
          method: "DELETE",
          body: { expected_version: entity._version || 0 },
          protectedRequest: true,
        },
      ),
  });
})();
