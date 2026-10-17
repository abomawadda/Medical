import { createHash } from "node:crypto";
import {
  initializeApp,
  cert,
  getApps,
  applicationDefault,
} from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { ApiError, kinds } from "./core.mjs";
import { createAdminIdentityVerifier, legacyAdminState } from "./admin-identity.mjs";
import { reviseReview, decideReview, reviewRevision } from "./review-lifecycle.mjs";

const key = (value) => createHash("sha256").update(value).digest("hex");
export function mergeCatalog(seed, overlays) {
  const result = {};
  for (const kind of kinds) {
    const entries = new Map(
      (seed[kind] || []).map((e) => [String(e.id), { ...e, _version: 0 }]),
    );
    for (const row of overlays.filter((o) => o.kind === kind)) {
      if (row.deleted) entries.delete(row.entityId);
      else entries.set(row.entityId, { ...row.value, _version: row.version });
    }
    result[kind] = [...entries.values()];
  }
  return result;
}

export function firebaseAdapters({
  medicalProjectId,
  sourceCredentials,
  sourceApiKey,
  adminAccountIds = [],
  bindingSecret,
  seed,
}) {
  if (
    !medicalProjectId ||
    !sourceCredentials.project_id ||
    medicalProjectId === sourceCredentials.project_id
  )
    throw new Error(
      "Separate Medical and membership source projects are required",
    );
  const own =
    getApps().find((a) => a.name === "medical-data") ||
    initializeApp(
      { projectId: medicalProjectId, credential: applicationDefault() },
      "medical-data",
    );
  const foreign =
    getApps().find((a) => a.name === "membership-read-only") ||
    initializeApp(
      {
        projectId: sourceCredentials.project_id,
        credential: cert(sourceCredentials),
      },
      "membership-read-only",
    );
  const db = getFirestore(own),
    sourceDb = getFirestore(foreign);
  const employeeFields = [
    "name",
    "jobId",
    "phone",
    "nationalId",
    "memberState",
  ];
  const accountFields = ["name", "firebaseUid", "accountStatus", "role"];
  const decode = (snap) =>
    snap.exists ? { ...snap.data(), id: snap.id } : null;
  const approvedIds = [...new Set(adminAccountIds)];
  if (approvedIds.length > 20 || approvedIds.some((id) => typeof id !== "string" || !id || id.includes("/")))
    throw new Error("Invalid approved administrator IDs");
  const credentialFields = [...accountFields, "email", "username", "authMode",
    "credentialAuthority", "registrationState", "passwordSalt", "passwordHash"];
  async function readCredentials(ids) {
    if (!ids.length) return [];
    return (await sourceDb.getAll(
      ...ids.map((id) => sourceDb.collection("user_accounts").doc(id)),
      { fieldMask: credentialFields },
    )).map(decode).filter(Boolean);
  }
  const verifyAdminIdentity = createAdminIdentityVerifier({
    readApprovedAccounts: () => readCredentials(approvedIds),
    bindingSecret,
    verifyToken: (token) => getAuth(foreign).verifyIdToken(token),
    async signInPassword(email, password) {
      if (!sourceApiKey) throw new Error("Admin sign-in not configured");
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(sourceApiKey)}`,
        {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw new Error("Admin sign-in rejected");
      return (await response.json()).idToken;
    },
  });
  // Expose only reads. This identity must also have read-only IAM permissions.
  const source = Object.freeze({
    async findEmployees(employeeCode) {
      const base = sourceDb.collection("employees");
      // Query bounded canonical variants, without downloading the member list.
      const variants = new Set([
        employeeCode,
        employeeCode.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]),
        employeeCode.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]),
      ]);
      if (
        /^(0|[1-9]\d*)$/.test(employeeCode) &&
        Number.isSafeInteger(Number(employeeCode))
      )
        variants.add(Number(employeeCode));
      const queries = [...variants].map((value) =>
        base
          .where("jobId", "==", value)
          .select(...employeeFields)
          .limit(2)
          .get(),
      );
      const rows = (await Promise.all(queries)).flatMap((s) =>
        s.docs.map(decode),
      );
      return [...new Map(rows.map((r) => [r.id, r])).values()];
    },
    async getEmployee(id) {
      return decode(
        (
          await sourceDb.getAll(sourceDb.collection("employees").doc(id), {
            fieldMask: employeeFields,
          })
        )[0],
      );
    },
    async getMemberProfile(id) {
      return decode((await sourceDb.getAll(sourceDb.collection("employees").doc(id), {
        fieldMask: ["name", "jobId", "membershipId", "jobTitle", "workplace"],
      }))[0]);
    },
    async findAccounts(uid) {
      const s = await sourceDb
        .collection("user_accounts")
        .where("firebaseUid", "==", uid)
        .select(...accountFields)
        .limit(2)
        .get();
      return s.docs.map(decode);
    },
    async getAccount(id) {
      return decode(
        (
          await sourceDb.getAll(sourceDb.collection("user_accounts").doc(id), {
            fieldMask: accountFields,
          })
        )[0],
      );
    },
    async getLegacyAdminState(id) {
      if (!approvedIds.includes(id)) return null;
      return legacyAdminState((await readCredentials([id]))[0], bindingSecret);
    },
    verifyAdminIdentity,
  });
  const sessions = db.collection("medical_sessions"),
    limits = db.collection("medical_limits"),
    entities = db.collection("medical_entities"),
    reviews = db.collection("medical_reviews"),
    stats = db.collection("medical_review_stats"),
    audit = db.collection("medical_audit");
  const activity = db.collection("medical_member_activity");
  function adjustStats(current, old, next) {
    let count = current?.count || 0,
      sum = current?.sum || 0;
    if (old?.status === "published") {
      count--;
      sum -= old.rating;
    }
    if (next?.status === "published") {
      count++;
      sum += next.rating;
    }
    return {
      target_id: next.target_id,
      count: Math.max(0, count),
      sum: Math.max(0, sum),
    };
  }
  return {
    source,
    store: {
      async consumeLimit(id, max, expiry) {
        const ref = limits.doc(id);
        return db.runTransaction(async (tx) => {
          const old = await tx.get(ref);
          const count = (old.data()?.count || 0) + 1;
          if (count > max) return false;
          tx.set(ref, { count, expiresAt: Timestamp.fromMillis(expiry) });
          return true;
        });
      },
      async saveSession(id, data) {
        const sessionData = { ...data, expiresAt: Timestamp.fromMillis(data.expiresAt) };
        if (data.role !== "member") return sessions.doc(id).create(sessionData);
        await db.runTransaction(async (tx) => {
          const ref = activity.doc(data.subject);
          const old = (await tx.get(ref)).data();
          tx.set(ref, { lastLoginAt: data.loginAt, previousLoginAt: old?.lastLoginAt || null });
          tx.create(sessions.doc(id), sessionData);
        });
      },
      async getMemberActivity(subject) {
        return (await activity.doc(subject).get()).data() || {};
      },
      async getSession(id) {
        const s = await sessions.doc(id).get();
        return s.exists
          ? { ...s.data(), expiresAt: s.data().expiresAt.toMillis() }
          : null;
      },
      async deleteSession(id) {
        await sessions.doc(id).delete();
      },
      async catalog() {
        return mergeCatalog(
          seed,
          (await entities.get()).docs.map((s) => s.data()),
        );
      },
      async getStats() {
        return Object.fromEntries(
          (await stats.get()).docs.map((s) => {
            const v = s.data();
            return [
              v.target_id,
              { count: v.count, average: v.count ? v.sum / v.count : null },
            ];
          }),
        );
      },
      async mutateEntity(kind, id, change, expectedVersion, actor, at) {
        const ref = entities.doc(key(`${kind}:${id}`)),
          log = audit.doc();
        await db.runTransaction(async (tx) => {
          const old = await tx.get(ref);
          const version = old.data()?.version || 0;
          if (version !== expectedVersion)
            throw new ApiError(
              409,
              "VERSION_CONFLICT",
              "تم تعديل السجل من جلسة أخرى. حدّث الصفحة وأعد المحاولة.",
            );
          tx.set(ref, {
            kind,
            entityId: id,
            ...change,
            version: version + 1,
            updated_at: at,
          });
          tx.create(log, {
            action: change.deleted ? "entity.delete" : "entity.save",
            kind,
            entityId: id,
            actor,
            at,
          });
        });
      },
      async saveReview(review) {
        const ref = reviews.doc(review.id),
          stat = stats.doc(key(review.target_id));
        return db.runTransaction(async (tx) => {
          const [old, totals] = await Promise.all([tx.get(ref), tx.get(stat)]);
          const previous = old.data();
          const next = reviseReview(previous, review);
          if (!next.changed) return { changed: false, status: previous.status, revision: reviewRevision(previous) };
          tx.set(ref, next.review);
          tx.set(stat, adjustStats(totals.data(), previous, next.review));
          return { changed: true, status: next.review.status, revision: next.review.revision };
        });
      },
      async listReviews(filter) {
        const query = filter.author_id
          ? reviews.where("author_id", "==", filter.author_id)
          : reviews.orderBy("updated_at", "desc");
        const snapshot = await query.limit(500).get();
        return snapshot.docs.map((s) => {
          const { author_id, ...publicFields } = s.data();
          return { ...publicFields, revision: reviewRevision(publicFields) };
        });
      },
      async moderateReview(id, status, actor, at, expectedRevision) {
        if (!/^[a-f0-9]{64}$/.test(id))
          throw new ApiError(400, "INVALID_REVIEW", "معرف التقييم غير صالح.");
        const ref = reviews.doc(id),
          log = audit.doc();
        return db.runTransaction(async (tx) => {
          const old = await tx.get(ref);
          if (!old.exists)
            throw new ApiError(404, "NOT_FOUND", "التقييم غير موجود.");
          const previous = old.data(),
            stat = stats.doc(key(previous.target_id));
          const decision = decideReview(previous, status, expectedRevision, at);
          if (!decision.changed) return { changed: false, status, revision: reviewRevision(previous) };
          const totals = await tx.get(stat);
          const next = decision.review;
          tx.set(ref, next);
          tx.set(stat, adjustStats(totals.data(), previous, next));
          tx.create(log, {
            action: "review.moderate",
            reviewId: id,
            status,
            actor,
            at,
            revision: next.revision,
          });
          return { changed: true, status, revision: next.revision };
        });
      },
    },
  };
}
