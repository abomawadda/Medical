window.MedicalAPI = (() => {
  const base = String(window.MEDICAL_CONFIG?.apiBaseUrl || "").replace(
    /\/$/,
    "",
  );
  let current = null;
  const configured = (() => {
    try {
      return new URL(base).protocol === "https:";
    } catch {
      return false;
    }
  })();
  function session() {
    if (current && current.expiresAt <= Date.now()) current = null;
    return current ? { ...current.user } : null;
  }
  async function request(
    path,
    { method = "GET", body, protectedRequest = false } = {},
  ) {
    if (!configured)
      throw new Error(
        "خدمة الدخول والحفظ المركزي قيد التجهيز. يمكنك تصفح الدليل الآن.",
      );
    if (protectedRequest && !session())
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
      if (response.status === 401 && protectedRequest) current = null;
      throw new Error(payload.message || "تعذر إكمال العملية.");
    }
    return payload;
  }
  async function login(kind, body) {
    const result = await request("/" + kind + "/session", {
      method: "POST",
      body,
    });
    if (!result.token || !result.user || !Number.isFinite(result.expiresAt))
      throw new Error("استجابة الدخول غير صالحة.");
    current = result;
    return session();
  }
  return Object.freeze({
    configured,
    session,
    request,
    login,
    async logout() {
      try {
        if (current)
          await request("/logout", {
            method: "POST",
            body: {},
            protectedRequest: true,
          });
      } finally {
        current = null;
      }
    },
    catalog: () => request("/catalog"),
    review: (body) =>
      request("/reviews", { method: "POST", body, protectedRequest: true }),
    myReviews: () => request("/reviews/mine", { protectedRequest: true }),
    adminReviews: () => request("/admin/reviews", { protectedRequest: true }),
    moderate: (id, status) =>
      request("/admin/reviews/" + encodeURIComponent(id), {
        method: "PATCH",
        body: { status },
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
