window.MedicalAPI = (() => {
  const base = String(window.MEDICAL_CONFIG?.apiBaseUrl || "").replace(
    /\/$/,
    "",
  );
  const rememberedKey = "medical_remembered_session_v1",
    tabKey = "medical_session_v1";
  let current = null,
    remembered = false,
    notice = "",
    adminIdleSupported=false;
  const idleSignal=detail=>window.dispatchEvent(new CustomEvent("medical-admin-idle",{detail}));
  const idle=window.MedicalAdminIdle.create({
    renew:async()=>{
      if(current?.user?.role!=="admin")return;
      const token=current?.token;
      const result=await request("/admin/activity",{method:"POST",body:{},protectedRequest:true});
      if(!Number.isFinite(result.expiresAt) || result.expiresAt<=Date.now())throw new Error("تعذر تمديد جلسة الإدارة.");
      if(current?.token===token){current.expiresAt=result.expiresAt;persist();}
    },
    expire:()=>{forget();idleSignal({expired:true});},
    warn:seconds=>idleSignal({seconds}),
    failure:()=>idleSignal({networkError:true}),
  });
  function configureIdle(data){
    idle.stop();adminIdleSupported=current?.user?.role==="admin" && data.idleTimeoutMs===600000;
    if(adminIdleSupported)idle.start(Number.isFinite(data.lastActivityAt)?data.lastActivityAt:data.expiresAt-600000);
  }
  for(const event of ["pointerdown","keydown","input","wheel","touchstart"])window.addEventListener(event,e=>{if(e.isTrusted && !document.hidden && adminIdleSupported)void idle.activity();},{passive:true});
  setInterval(()=>{if(adminIdleSupported)void idle.tick(!document.hidden);},15000);
  document.addEventListener("visibilitychange",()=>{if(adminIdleSupported)void idle.tick(false);});
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
    idle.stop();adminIdleSupported=false;
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
    if(adminIdleSupported && idle.check())return null;
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
    const requestToken=protectedRequest?current.token:null;
    let response;
    try {
      response = await fetch(base + "/v1" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(protectedRequest
            ? { Authorization: "Bearer " + requestToken }
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
      if (protectedRequest && [401, 403].includes(response.status) && current?.token===requestToken) forget();
      const error = new Error(payload.message || "تعذر إكمال العملية.");
      error.code = payload.code;
      error.status = response.status;
      throw error;
    }
    if(protectedRequest && current?.token!==requestToken){const error=new Error("تغيرت جلسة الدخول؛ أعد المحاولة من حسابك الحالي.");error.code="SESSION_CHANGED";throw error;}
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
    configureIdle(user);persist();
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
    current = result;configureIdle(result);
    remembered = kind === "member" && body.remember === true;
    persist();
    return session();
  }
  window.addEventListener("storage", (e) => {
    if (e.key === rememberedKey && remembered && current && e.newValue === null)
      forget();
  });
  return Object.freeze({
    get adminIdleSupported(){return adminIdleSupported;},
    continueAdminSession:()=>idle.activity(true),
    batchData:body=>request('/admin/batch-data',{method:'PATCH',body,protectedRequest:true}),
    batchState:body=>request('/admin/batch',{method:'PATCH',body,protectedRequest:true}),
    createBranches:body=>request('/admin/branches',{method:'POST',body,protectedRequest:true}),
    configured,
    session,
    restore,
    request,
    login,
    get persistenceNotice() {
      return notice;
    },
    async logout() {
      const logoutToken=current?.token;
      try {
        if (current?.token)
          await request("/logout", {
            method: "POST",
            body: {},
            protectedRequest: true,
            restoring: true,
          });
      } finally {
        if(current?.token===logoutToken)forget();
      }
    },
    catalog: () => request("/catalog", { protectedRequest: true }),
    health: () => request("/health"),
    adminProfile:()=>request("/admin/profile",{protectedRequest:true}),
    labWorkspace:id=>request('/admin/lab/workspaces/'+encodeURIComponent(id),{protectedRequest:true}),
    saveLabWorkspace:(id,body)=>request('/admin/lab/workspaces/'+encodeURIComponent(id),{method:'PATCH',body,protectedRequest:true}),
    labVisitReports:()=>request('/admin/lab/visit-reports',{protectedRequest:true}),
    createLabVisitReport:body=>request('/admin/lab/visit-reports',{method:'POST',body,protectedRequest:true}),
    decideLabVisitReport:(id,body)=>request('/admin/lab/visit-reports/'+encodeURIComponent(id),{method:'PATCH',body,protectedRequest:true}),
    developmentLab:()=>request('/admin/lab',{protectedRequest:true}),
    labPreview:(id,statusOnly=false)=>request('/admin/lab/preview/'+encodeURIComponent(id)+(statusOnly?'?status=1':''),{protectedRequest:true}),
    saveLabFeature:(id,body)=>request('/admin/lab/features/'+encodeURIComponent(id),{method:'PATCH',body,protectedRequest:true}),
    adminOptions:()=>request("/admin/options",{protectedRequest:true}),
    addOption:(key,value)=>request("/admin/options/"+encodeURIComponent(key),{method:"PUT",body:{value},protectedRequest:true}),
    profile: () => request("/profile", { protectedRequest: true }),
    checkSession:()=>request('/session',{protectedRequest:true}),
    profileEdit:()=>request('/profile/edit',{protectedRequest:true}),
    profileRequests:()=>request('/profile/requests',{protectedRequest:true}),
    submitProfileRequest:body=>request('/profile/requests',{method:'POST',body,protectedRequest:true}),
    cancelProfileRequest:(id,version)=>request('/profile/requests/'+encodeURIComponent(id),{method:'PATCH',body:{version},protectedRequest:true}),
    adminProfileRequests:()=>request('/admin/profile-requests',{protectedRequest:true}),
    decideProfileRequest:(id,body)=>request('/admin/profile-requests/'+encodeURIComponent(id),{method:'PATCH',body,protectedRequest:true}),
    profileNotifications:version=>request('/profile/notifications'+(version===undefined?'':'?version='+version),{protectedRequest:true}),
    readProfileNotification:id=>request('/profile/notifications/'+encodeURIComponent(id),{method:'PATCH',body:{},protectedRequest:true}),
    review: (body) =>
      request("/reviews", { method: "POST", body, protectedRequest: true }),
    publicReviews:(target,page=0)=>request("/reviews/public/"+encodeURIComponent(target)+"?page="+page,{protectedRequest:true}),
    myReviews: () => request("/reviews/mine", { protectedRequest: true }),
    adminReviews: () => request("/admin/reviews", { protectedRequest: true }),
    moderate: (id, status, revision, confirmPublicComment=false) =>
      request("/admin/reviews/" + encodeURIComponent(id), {
        method: "PATCH",
        body: { status, revision, confirm_public_comment:confirmPublicComment },
        protectedRequest: true,
      }),
    setState: (kind,id,body) => request("/admin/entities/"+encodeURIComponent(kind)+"/"+encodeURIComponent(id),{method:"PATCH",body,protectedRequest:true}),
    save: (kind, entity, version, approveContract=false, republish=false) =>
      request(
        "/admin/entities/" +
          encodeURIComponent(kind) +
          "/" +
          encodeURIComponent(entity.id),
        {
          method: "PUT",
          body: { entity, expected_version: version, approve_contract:approveContract, republish },
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
