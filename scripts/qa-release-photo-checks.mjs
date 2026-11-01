// Explicitly budgeted replay against unchanged production checker and saved evidence.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
if (!process.argv.includes("--confirmed-budget")) throw Error("Budget approval required");
if (!process.env.VERCEL_APP_OPENAI_API_KEY) {
  const line = readFileSync("../../quick-vint-api/.env", "utf8").split(/\r?\n/).find(l => l.startsWith("VERCEL_APP_OPENAI_API_KEY="));
  if (line) process.env.VERCEL_APP_OPENAI_API_KEY = line.slice(line.indexOf("=") + 1).replace(/^['"]|['"]$/g, "");
}
if (!process.env.VERCEL_APP_OPENAI_API_KEY) throw Error("Provider key missing before any dispatch");
const out = resolve("../../reports/release-audit-20261101");
mkdirSync(out, { recursive: true });
const ledgerPath = join(out, "paid-checks.json");
if (existsSync(ledgerPath)) throw Error("Refusing to replay an existing paid run");
const prior = JSON.parse(readFileSync("../../reports/model-garment-qa-20261101/ledger.json"));
const ledger = { budgetUsd: 3, previousBudgetExcluded: true, calls: [] };
const save = () => writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
const total = () => ledger.calls.reduce((sum, c) => sum + (c.costUsd ?? c.reservedUsd), 0);
const bundle = await build({ stdin: { contents: 'export * from "./utils/listingPhotoGeneration";', resolveDir: process.cwd() }, bundle: true, platform: "node", format: "esm", write: false });
const api = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const image = p => { const b = readFileSync(p); return "data:image/" + (b.toString("ascii", 0, 4) === "RIFF" ? "webp" : "jpeg") + ";base64," + b.toString("base64"); };
const providerFetch = globalThis.fetch;
let active;
globalThis.fetch = async (...args) => {
  const response = await providerFetch(...args);
  if (active && String(args[0]).startsWith("https://api.openai.com/")) {
    const data = await response.clone().json();
    active.httpStatus = response.status;
    active.usage = data.usage;
    if (data.usage) active.costUsd = api.photoCost("check", data.usage, api.LISTING_PHOTO_CHECK_MODEL);
    save();
  }
  return response;
};
const selections = [
  ["dress-plus-final", "primary", true], ["dress-plus-final", "secondary", true],
  ["handbag-refined-final", "primary", true], ["handbag-refined-final", "secondary", true],
  ["shoes-refined", "primary", true], ["shoes-refined", "secondary", true],
  ["dress-plus", "primary", false], ["dress-plus", "secondary", false],
  ["handbag-refined", "secondary", false],
];
for (let repeat = 1; repeat <= 2; repeat++) {
  for (const [name, slot, expectedAccepted] of selections) {
    if (total() + 0.06 > ledger.budgetUsd - 0.1) throw Error("Budget guard");
    const c = prior.cases.find(c => c.name === name), view = c.views.find(v => v.slot === slot);
    const bytes = readFileSync(view.path);
    active = { name, slot, repeat, expectedAccepted, model: api.LISTING_PHOTO_CHECK_MODEL, reservedUsd: 0.06, status: "dispatched", startedAt: new Date().toISOString(), imagePath: view.path, sha256: createHash("sha256").update(bytes).digest("hex") };
    ledger.calls.push(active); save();
    const started = Date.now();
    try {
      const r = await api.checkListingPhoto(image(slot === "secondary" || c.plan.category === "backpack" ? c.rear : c.model), bytes, c.plan, slot, false, view.indices.map(i => image(c.sources[i])));
      Object.assign(active, { status: "completed", accepted: r.accepted, quality: r.quality, durationMs: Date.now() - started, costUsd: api.photoCost("check", r.usage, api.LISTING_PHOTO_CHECK_MODEL) });
    } catch(e) { Object.assign(active, {status:"unknown_or_failed", error: e.message, durationMs:Date.now()-started}); }
    save();
    console.log(JSON.stringify({name, slot, repeat, accepted:active.accepted, expectedAccepted, error:active.error, costUsd:active.costUsd, durationMs:active.durationMs}));
  }
}
ledger.totalUsd = total();
save();
console.log(JSON.stringify({totalUsd: ledger.totalUsd, capUsd: ledger.budgetUsd, calls:ledger.calls.length}));
