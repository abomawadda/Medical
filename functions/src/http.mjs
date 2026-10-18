import { ApiError } from "./core.mjs";

export function createHandler({ getService, origins, logger = console }) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    const origin = req.get("origin");
    if (origin && !origins.includes(origin))
      return res.status(403).json({
        code: "ORIGIN_DENIED",
        message: "الطلب غير متاح من هذا الموقع.",
      });
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    res.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    res.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    const path = req.path.replace(/\/$/, "");
    if (req.method === "GET" && path === "/v1/health") {
      try {
        getService();
        return res.json({ configured: true, capabilities: ["member-profile", "review-revisions", "staff-directory", "provider-images", "provider-illustrations", "directory-state-v1", "family-directory-v1", "directory-content-v1", "contract-directory-v1", "public-emergency-v1"] });
      } catch {
        return res.status(503).json({
          configured: false,
          message: "الخدمة المركزية غير مفعلة حاليًا.",
        });
      }
    }
    try {
      if (req.method !== "GET" && !req.is("application/json"))
        throw new ApiError(
          415,
          "JSON_REQUIRED",
          "الطلب يجب أن يكون بصيغة JSON.",
        );
      if (
        Number(req.get("content-length") || 0) > 32768 ||
        Buffer.byteLength(JSON.stringify(req.body || {})) > 32768
      )
        throw new ApiError(
          413,
          "BODY_TOO_LARGE",
          "الطلب أكبر من الحجم المسموح.",
        );
      const service = getService(),
        body = req.body || {},
        token = (req.get("authorization") || "").replace(/^Bearer /, ""),
        ip = req.ip || "unknown";
      let data;
      if (req.method === "GET" && path === "/v1/catalog")
        data = await service.catalog(token);
      else if (req.method === "GET" && path === "/v1/profile")
        data = await service.memberProfile(token);
      else if (req.method === "GET" && path === "/v1/session")
        data = await service.session(token);
      else if (req.method === "POST" && path === "/v1/member/session")
        data = await service.memberLogin(body, ip);
      else if (req.method === "POST" && path === "/v1/admin/session")
        data = await service.adminLogin(body, ip);
      else if (req.method === "POST" && path === "/v1/logout")
        data = await service.logout(token);
      else if (req.method === "POST" && path === "/v1/reviews")
        data = await service.submitReview(token, body, ip);
      else if (req.method === "GET" && path === "/v1/reviews/mine")
        data = await service.ownReviews(token);
      else if (req.method === "GET" && path === "/v1/admin/reviews")
        data = await service.adminReviews(token);
      else if (
        req.method === "PATCH" &&
        /^\/v1\/admin\/reviews\/[a-f0-9]{64}$/.test(path)
      )
        data = await service.moderateReview(token, path.split("/").pop(), body);
      else if (req.method === "PATCH" && /^\/v1\/admin\/entities\/[^/]+\/[^/]+$/.test(path)) {
        const [,kind,id]=path.match(/\/entities\/([^/]+)\/([^/]+)$/);
        data=await service.setEntityState(token,decodeURIComponent(kind),decodeURIComponent(id),body);
      }
      else if (
        ["PUT", "DELETE"].includes(req.method) &&
        /^\/v1\/admin\/entities\/[^/]+\/[^/]+$/.test(path)
      ) {
        const [, kind, id] = path.match(/\/entities\/([^/]+)\/([^/]+)$/);
        data = await service[
          req.method === "PUT" ? "putEntity" : "deleteEntity"
        ](token, decodeURIComponent(kind), decodeURIComponent(id), body);
      } else throw new ApiError(404, "NOT_FOUND", "المسار غير موجود.");
      return res.json(data);
    } catch (error) {
      if (error instanceof ApiError)
        return res
          .status(error.status)
          .json({ code: error.code, message: error.message });
      // Never log request bodies, credentials, source documents or full exceptions.
      logger.error("medical_api_failed", { code: "SERVICE_UNAVAILABLE" });
      return res.status(503).json({
        code: "SERVICE_UNAVAILABLE",
        message: "تعذر الاتصال بالخدمة المركزية. يرجى المحاولة لاحقًا.",
      });
    }
  };
}
