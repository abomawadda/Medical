import { readFile, writeFile } from "node:fs/promises";
import "../js/quality.js";
import contacts from "../functions/src/contacts.cjs";
globalThis.MedicalContacts = contacts;

const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === "--report")) throw new Error("Usage: npm run audit:catalog -- [--report /private/path/report.json]");
const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));
const report = globalThis.MedicalQuality.audit(data);
console.log(JSON.stringify({ total: report.total, affected: report.affected, checks: report.byCode }, null, 2));
if (args[0] === "--report") await writeFile(args[1], JSON.stringify(report, null, 2), { mode: 0o600 });
// Findings require human verification. This command never edits or deletes directory data.
