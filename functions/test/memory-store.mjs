import { ApiError, kinds } from "../src/core.mjs";
import { reviseReview, decideReview, reviewRevision } from "../src/review-lifecycle.mjs";
export function fixtureStore(seed) {
  const sessions = new Map(),
    limits = new Map(),
    reviews = new Map(),
    overlays = new Map(),
    audit = [], activity = new Map();
  const base = structuredClone(seed);
  for (const k of kinds) base[k] ||= [];
  const store = {
    sessions,
    reviews,
    overlays,
    audit,
    async consumeLimit(id, max) {
      const n = (limits.get(id) || 0) + 1;
      limits.set(id, n);
      return n <= max;
    },
    async saveSession(id, data) {
      sessions.set(id, structuredClone(data));
      if (data.role === "member") activity.set(data.subject, {
        lastLoginAt: data.loginAt, previousLoginAt: activity.get(data.subject)?.lastLoginAt || null,
      });
    },
    async getMemberActivity(subject) {
      return activity.get(subject) || {};
    },
    async getSession(id) {
      return sessions.get(id);
    },
    async deleteSession(id) {
      sessions.delete(id);
    },
    async catalog() {
      const out = structuredClone(base);
      for (const k of kinds) {
        const map = new Map(
          out[k].map((e) => [String(e.id), { ...e, _version: 0 }]),
        );
        for (const row of overlays.values())
          if (row.kind === k) {
            if (row.deleted) map.delete(row.entityId);
            else map.set(row.entityId, { ...row.value, _version: row.version });
          }
        out[k] = [...map.values()];
      }
      return out;
    },
    async getStats() {
      const out = {};
      for (const r of reviews.values())
        if (r.status === "published") {
          const v = (out[r.target_id] ||= { count: 0, sum: 0 });
          v.count++;
          v.sum += r.rating;
        }
      return Object.fromEntries(
        Object.entries(out).map(([k, v]) => [
          k,
          { count: v.count, average: v.sum / v.count },
        ]),
      );
    },
    async mutateEntities(changes,actor,at) {
      for (const c of changes) if ((overlays.get(c.kind+":"+c.id)?.version || 0) !== c.expectedVersion)
        throw new ApiError(409,"VERSION_CONFLICT","تعارض");
      for (const c of changes) overlays.set(c.kind+":"+c.id,{kind:c.kind,entityId:c.id,value:structuredClone(c.value),deleted:false,version:c.expectedVersion+1});
      audit.push({action:"entity.state",actor,at});
    },
    async mutateEntity(kind, id, change, expected, actor, at) {
      const k = kind + ":" + id;
      const previous = overlays.get(k);
      if ((previous?.version || 0) !== expected)
        throw new ApiError(409, "VERSION_CONFLICT", "تعارض");
      overlays.set(k, { kind, entityId: id, ...change, version: expected + 1 });
      audit.push({ kind, id, actor, at });
    },
    async saveReview(r) {
      const next = reviseReview(reviews.get(r.id), r);
      if (next.changed) reviews.set(r.id, structuredClone(next.review));
      return { changed: next.changed, status: next.review.status, revision: reviewRevision(next.review) };
    },
    async listReviews(filter) {
      return [...reviews.values()]
        .filter((r) => !filter.author_id || filter.author_id === r.author_id)
        .map(({ author_id, ...rest }) => ({...rest, revision: reviewRevision(rest)}));
    },
    async moderateReview(id, status, actor, at, expectedRevision) {
      const r = reviews.get(id);
      if (!r) throw new ApiError(404, "NOT_FOUND", "غير موجود");
      const decision = decideReview(r, status, expectedRevision, at);
      if (decision.changed) {
        reviews.set(id, decision.review);
        audit.push({ id, status, actor, revision: reviewRevision(r) });
      }
      return { changed: decision.changed, status, revision: reviewRevision(r) };
    },
  };
  return store;
}
