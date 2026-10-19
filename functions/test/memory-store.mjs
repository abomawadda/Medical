import facilities from "../src/facility-directory.cjs";
import {groupedReviewStats} from "../src/facility-review-stats.mjs";
import { projectContract } from "../src/contract-publication.mjs";
import { withFamilyContracts } from "../src/family-projection.mjs";
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
  const options=new Map();
  const store = {
    async getOptions(){return Object.fromEntries([...new Set([...options.values()].map(r=>r.key))].map(k=>[k,[...options.values()].filter(r=>r.key===k).map(r=>r.value)]));},
    async addOption(key,value,actor,at){const id=key+":"+value.normalize("NFKC").toLocaleLowerCase("ar").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه");if(!options.has(id)){options.set(id,{key,value});audit.push({action:"option.add",actor,at});}return options.get(id).value;},
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
    async renewAdminSession(id,at,expiry){
      const data=sessions.get(id);
      if(!data || data.role!=="admin" || data.expiresAt<=at)return null;
      data.expiresAt=Math.max(data.expiresAt,expiry);data.lastActivityAt=Math.max(data.lastActivityAt || at,at);
      return {expiresAt:data.expiresAt,lastActivityAt:data.lastActivityAt};
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
            else map.set(row.entityId, { ...withFamilyContracts(map.get(row.entityId),row.value), _version: row.version });
          }
        out[k] = [...map.values()].map(r=>base[k].some(e=>typeof e.contract_listing === "boolean") ? projectContract(base[k].find(e=>String(e.id)===String(r.id)),r,k) : r);
      }
      return out;
    },
    async getReview(id){return reviews.get(id)||null;},
    async getGroupedStats(groups){return groupedReviewStats(groups,[...reviews.values()]);},
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
    async mutateEntities(changes,actor,at,action='entity.state') {
      for (const c of changes) if ((overlays.get(c.kind+":"+c.id)?.version || 0) !== c.expectedVersion)
        throw new ApiError(409,"VERSION_CONFLICT","تعارض");
      for (const c of changes) overlays.set(c.kind+":"+c.id,{kind:c.kind,entityId:c.id,value:structuredClone(c.value),deleted:false,version:c.expectedVersion+1});
      audit.push({action,actor,at});
    },
    async mutateEntity(kind, id, change, expected, actor, at) {
      const k = kind + ":" + id;
      const previous = overlays.get(k);
      if ((previous?.version || 0) !== expected)
        throw new ApiError(409, "VERSION_CONFLICT", "تعارض");
      overlays.set(k, { kind, entityId: id, ...change, version: expected + 1 });
      audit.push({ kind, id, actor, at });
    },
    async saveReview(r,candidateIds=[]) {
      const previous=facilities.latest([...new Set([r.id,...candidateIds])].map(id=>reviews.get(id)).filter(Boolean));
      const incoming=previous ? {...r,id:previous.id,target_id:previous.target_id,...(candidateIds.length>1?{branch_id:previous.branch_id}:{})} : r;
      const next = reviseReview(previous, incoming);
      if (next.changed) reviews.set(next.review.id, structuredClone(next.review));
      return { changed: next.changed, status: next.review.status, revision: reviewRevision(next.review) };
    },
    async listReviews(filter) {
      return [...reviews.values()]
        .filter((r) => !filter.author_id || filter.author_id === r.author_id)
        .map(rest => ({...rest, revision: reviewRevision(rest)}));
    },
    async moderateReview(id, status, actor, at, expectedRevision,candidateIds=[]) {
      const r = reviews.get(id);
      const latest=facilities.latest([...new Set([id,...candidateIds])].map(id=>reviews.get(id)).filter(Boolean));
      if(latest && latest.id!==id)throw new ApiError(409,"REVIEW_CHANGED","تقييم أحدث");
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
