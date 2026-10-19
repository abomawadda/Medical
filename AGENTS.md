# Medical project working instructions

Before any task, read `/workspace/medical/APP_AGREEMENT_AR.md` (or `APP_AGREEMENT_AR.md` relative to this repository root). It is the owner's unified product agreement and the primary reference for scope, priorities, privacy, design, and rollout.

- Follow the latest user instruction first. Update the agreement when an authorized decision materially changes scope; do not invent an approval requirement or ask again for already authorized work.
- New roadmap features default to an administrator-only preview with server-verified authorization. Keep the current member experience until the owner explicitly activates a feature or phase after review; deploying code is not audience approval. Follow `docs/PHASED_PREVIEW_ROADMAP_AR.md`, and do not treat the legacy preview query parameter as an authorization mechanism.
- A material lab specimen or layout change must bump the shared preview revision in `functions/src/development-lab.mjs` and `js/development-lab.js`; keep compatibility checks and require fresh review. Never reuse an old approval for a different design.
- Read the relevant linked operational documentation before deployment or authentication changes.
- Keep the MyNekaba membership reader and its credential read-only. The owner explicitly authorized an optional, separate profile writer on 19 October 2026: only selected approved basic fields of an existing employee may be updated, with source-value conflict checks. This exception never permits source IAM, Auth, code, rules, member creation/deletion, or reuse of the reader identity for writing. Default approval remains Medical-only until the separate writer is connected.
- Never commit or publish employee records, private credentials, login inputs, profile responses, or real review comments. Keep secrets in Secret Manager and opaque session metadata in browser storage only.
- Preserve author-only review editing, revision checks, idempotent moderation, private-by-default comments (only author-opted-in and moderated notes may appear anonymously in the app), and mandatory authenticated directory access.
- Use Cairo/Tajawal, Arabic RTL, accessible mobile layouts, truthful coverage labels, and real data. Do not invent company procedures, medical eligibility, appointments, counters, or unsupported actions.
- Test the changed journey, build the static site before publishing frontend assets, and distinguish GitHub Pages deployment from Firebase deployment and external connection activation.
- Keep `docs/review-2026-10-17/` untracked unless the owner explicitly requests publishing the original audit artifacts.
