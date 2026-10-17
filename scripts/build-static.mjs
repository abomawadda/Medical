import { cp, mkdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist");
// Publish only application assets; keep spreadsheets, reports and tooling out.
const assets = ["index.html", "manifest.json", "sw.js", "css", "js", "img"];

// Validate inputs before replacing a previous build.
for (const asset of assets) await stat(resolve(root, asset));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of assets) {
  await cp(resolve(root, asset), resolve(output, asset), {
    recursive: true,
    filter: (source) => source !== resolve(root, "js/data.js"),
  });
}
const hash = createHash("sha256");
const fontFiles = (await readdir(resolve(root, "img/fonts")))
  .filter((n) => n.endsWith(".woff2"))
  .sort()
  .map((n) => "./img/fonts/" + n);
const initialWorker = await readFile(resolve(output, "sw.js"), "utf8");
await writeFile(
  resolve(output, "sw.js"),
  initialWorker.replace(
    /const FONT_ASSETS = \[[\s\S]*?\];/,
    "const FONT_ASSETS = " + JSON.stringify(fontFiles) + ";",
  ),
);
async function hashFiles(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await hashFiles(path);
    else {
      hash.update(path.slice(output.length));
      const bytes = await readFile(path);
      hash.update(
        path.endsWith("/sw.js")
          ? bytes
              .toString()
              .replace(/we-medical-v4-[\w]+/, "we-medical-v4-__BUILD_ID__")
          : bytes,
      );
    }
  }
}
await hashFiles(output);
const worker = await readFile(resolve(output, "sw.js"), "utf8");
const releaseWorker = worker.replace(
  /we-medical-v4-[\w]+/,
  "we-medical-v4-" + hash.digest("hex").slice(0, 16),
);
await writeFile(resolve(output, "sw.js"), releaseWorker);
// GitHub Pages currently publishes main/root; commit its matching worker too.
await writeFile(resolve(root, "sw.js"), releaseWorker);
console.log("Medical static site built in dist/; no dependencies required.");
