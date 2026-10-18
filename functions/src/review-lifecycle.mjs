import { ApiError } from "./core.mjs";

export const reviewRevision = (review) => Number.isInteger(review?.revision) && review.revision > 0 ? review.revision : 1;

export function reviseReview(previous, incoming) {
  if (previous && previous.author_id !== incoming.author_id)
    throw new ApiError(403, "FORBIDDEN", "لا يمكنك تعديل تقييم عضو آخر.");
  if (previous && ["target_id", "branch_id", "rating", "comment", "visited_declared"]
    .every((field) => previous[field] === incoming[field]) &&
    JSON.stringify(previous.criteria || {}) === JSON.stringify(incoming.criteria || {}))
    return { changed: false, review: previous };
  return { changed: true, review: {
    ...incoming, status: "pending", revision: previous ? reviewRevision(previous) + 1 : 1,
    decided_revision: previous?.decided_revision || 0,
    created_at: previous?.created_at || incoming.updated_at,
  } };
}

export function decideReview(previous, status, expectedRevision, at) {
  if (!previous) throw new ApiError(404, "NOT_FOUND", "التقييم غير موجود.");
  const revision = reviewRevision(previous);
  if (expectedRevision !== revision)
    throw new ApiError(409, "REVIEW_CHANGED", "عدّل العضو تقييمه. حدّث قائمة المراجعة قبل اتخاذ القرار.");
  if (previous.status === status) return { changed: false, review: previous };
  if (status === "published" && (previous.status !== "pending" || previous.decided_revision >= revision))
    throw new ApiError(409, "REVIEW_ALREADY_DECIDED", "تمت مراجعة هذه النسخة بالفعل. لا تُعتمد مجددًا إلا بعد تعديل العضو لتقييمه.");
  return { changed: true, review: {
    ...previous, revision, status, decided_revision: revision, moderated_at: at,
  } };
}
