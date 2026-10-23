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
        return res.json({ configured: true, capabilities: ["member-profile", "review-revisions", "staff-directory", "provider-images", "provider-illustrations", "directory-state-v1", "family-directory-v1", "directory-content-v1", "contract-directory-v1", "public-emergency-v1", "admin-workspace-v1", "review-criteria-v1", "facility-branches-v1", "admin-batch-v1", "admin-batch-data-v1", "structured-branches-v1", "admin-idle-v1", "content-lifecycle-v1", "public-review-details-v1", "review-recommendations-v1", "profile-management-v1", "development-lab-v1", "development-directory-v1", "development-visit-v1", "development-roadmap-v1", "development-service-workflow-v1", "development-catalog-staging-v1", "development-catalog-plans-v1", "development-admin-inbox-v1"] });
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
      else if (req.method === "PATCH" && path === "/v1/admin/batch-data")data=await service.batchEntityData(token,body);
      else if (req.method === "PATCH" && path === "/v1/admin/batch")data=await service.batchEntityState(token,body);
      else if (req.method === "POST" && path === "/v1/admin/branches")data=await service.createEntityBranches(token,body);
      else if (req.method === "POST" && path === "/v1/admin/activity")data=await service.adminActivity(token);
      else if(req.method==='GET' && path==='/v1/admin/lab/inbox')data=await service.labInbox(token,req.query?.status==='1');
      else if(req.method==='PATCH' && path==='/v1/admin/lab/inbox')data=await service.saveLabInbox(token,body);
      else if(req.method==='GET' && path==='/v1/admin/lab/imports')data=await service.labImports(token);
      else if(req.method==='POST' && path==='/v1/admin/lab/imports')data=await service.saveLabImport(token,body);
      else if(req.method==='GET' && /^\/v1\/admin\/lab\/imports\/[a-f0-9]{32}\/plan$/.test(path))data=await service.labImportPlan(token,path.split('/').at(-2));
      else if(req.method==='GET' && /^\/v1\/admin\/lab\/imports\/[a-f0-9]{32}$/.test(path))data=await service.labImports(token,path.split('/').pop());
      else if(req.method==='GET' && path==='/v1/admin/lab/readiness')data=await service.labReadiness(token,req.query?.status==='1');
      else if(req.method==='GET' && /^\/v1\/admin\/lab\/workspaces\/[a-z_]+$/.test(path))data=await service.labWorkspace(token,path.split('/').pop());
      else if(req.method==='PATCH' && /^\/v1\/admin\/lab\/workspaces\/[a-z_]+$/.test(path))data=await service.saveLabWorkspace(token,path.split('/').pop(),body);
      else if(req.method==='GET' && path==='/v1/admin/lab/visit-reports')data=await service.labVisitReports(token);
      else if(req.method==='POST' && path==='/v1/admin/lab/visit-reports')data=await service.createLabVisitReport(token,body);
      else if(req.method==='PATCH' && /^\/v1\/admin\/lab\/visit-reports\/[a-f0-9]{32}$/.test(path))data=await service.decideLabVisitReport(token,path.split('/').pop(),body);
      else if(req.method==='GET' && path==='/v1/admin/lab')data=await service.adminLab(token);
      else if(req.method==='GET' && /^\/v1\/admin\/lab\/preview\/[a-z_]+$/.test(path))data=await service.labPreview(token,path.split('/').pop(),req.query?.status==='1');
      else if(req.method==='PATCH' && /^\/v1\/admin\/lab\/features\/[a-z_]+$/.test(path))data=await service.saveLabFeature(token,path.split('/').pop(),body);
      else if (req.method === "GET" && path === "/v1/admin/profile")
        data=await service.adminProfile(token);
      else if (req.method === "GET" && path === "/v1/admin/options")
        data=await service.adminOptions(token);
      else if (req.method === "PUT" && /^\/v1\/admin\/options\/[a-z_]+$/.test(path))
        data=await service.addAdminOption(token,path.split('/').pop(),body);
      else if(req.method==='GET' && path==='/v1/profile/edit')data=await service.profileEdit(token);
      else if(req.method==='GET' && path==='/v1/profile/requests')data=await service.ownProfileRequests(token);
      else if(req.method==='POST' && path==='/v1/profile/requests')data=await service.submitProfileRequest(token,body);
      else if(req.method==='GET' && path==='/v1/profile/notifications')data=await service.profileNotifications(token,req.query?.version===undefined?undefined:Number(req.query.version));
      else if(req.method==='PATCH' && /^\/v1\/profile\/notifications\/[a-f0-9]{64}_decision$/.test(path))data=await service.readProfileNotification(token,path.split('/').pop());
      else if(req.method==='PATCH' && /^\/v1\/profile\/requests\/[a-f0-9]{64}$/.test(path))data=await service.cancelProfileRequest(token,path.split('/').pop(),body);
      else if(req.method==='GET' && path==='/v1/admin/profile-requests')data=await service.adminProfileRequests(token);
      else if(req.method==='PATCH' && /^\/v1\/admin\/profile-requests\/[a-f0-9]{64}$/.test(path))data=await service.decideProfileRequest(token,path.split('/').pop(),body);
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
      else if (req.method === 'GET' && /^\/v1\/reviews\/public\/[^/]+$/.test(path))
        data=await service.publicReviews(token,decodeURIComponent(path.split('/').pop()),req.query?.page===undefined?0:Number(req.query.page));
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
