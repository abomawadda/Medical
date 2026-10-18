// Exact, owner-approved production sites. Preview deployments are not trusted.
export const productionOrigins = Object.freeze([
  "https://abomawadda.github.io",
  "https://medical-nekaba.vercel.app",
  "https://reayati-we.vercel.app",
]);

export function normalizeOrigin(value) {
  const input = String(value).trim();
  let url;
  try { url = new URL(input); } catch { throw new Error("Invalid Medical origin configuration."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash || url.hostname.includes("*"))
    throw new Error("Medical origins must be exact HTTPS site origins, without paths or wildcards.");
  return url.origin;
}

export function resolveAllowedOrigins(configured = "") {
  return [...new Set([...productionOrigins, ...String(configured).split(",").map(s => s.trim()).filter(Boolean).map(normalizeOrigin)])];
}
