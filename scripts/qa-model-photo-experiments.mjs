// Explicit paid comparisons against private local fixtures. Never writes customer records.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { resolve, join } from "node:path";
const arg = (key) => process.argv[process.argv.indexOf(key) + 1];
if (!process.argv.includes("--confirmed-budget"))
  throw Error("Budget approval required");
const prior = JSON.parse(readFileSync(arg("--prior-ledger")));
const priorUsd =
  prior.priorUsd +
  prior.calls.reduce((sum, c) => sum + (c.costUsd ?? c.reservedUsd), 0);
const out = resolve(arg("--out"));
mkdirSync(out, { recursive: true });
const ledgerPath = join(out, "ledger.json");
const ledger = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath))
  : { priorUsd, capUsd: 3, calls: [], cases: [] };
const persist = () =>
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
const total = () =>
  ledger.priorUsd +
  ledger.calls.reduce((sum, c) => sum + (c.costUsd ?? c.reservedUsd), 0);
const env = readFileSync(arg("--env-file"), "utf8");
process.env.VERCEL_APP_OPENAI_API_KEY ||= env
  .match(/^VERCEL_APP_OPENAI_API_KEY=(.*)$/m)?.[1]
  .trim()
  .replace(/^['"]|['"]$/g, "");
if (!process.env.VERCEL_APP_OPENAI_API_KEY) throw Error("Missing provider key");
const bundle = await build({
  stdin: {
    contents:
      'export * from "./utils/listingPhotoGeneration"; export * from "./utils/userModelGeneration";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const context = new AsyncLocalStorage();
const providerFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const row = context.getStore();
  if (!row || !String(url).startsWith("https://api.openai.com/"))
    return providerFetch(url, options);
  const body = JSON.parse(options.body);
  if (row.kind === "check") body.model = row.model;
  if (row.kind === "image") {
    body.model = row.model;
    body.quality = row.quality;
    if (row.prompt) body.prompt = row.prompt;
  }
  const response = await providerFetch(url, {
    ...options,
    body: JSON.stringify(body),
  });
  const data = await response.clone().json();
  if (data.usage) {
    row.usage = data.usage;
    row.costUsd = api.photoCost(row.kind, data.usage, row.model);
  }
  row.providerStatus = response.status;
  persist();
  return response;
};
async function call(name, kind, fn, config = {}) {
  if (ledger.calls.some((c) => c.name === name))
    throw Error("Refusing duplicate or unknown call " + name);
  const reservedUsd =
    kind === "image"
      ? config.quality && config.quality !== "medium"
        ? 0.25
        : 0.12
      : 0.07;
  if (total() + reservedUsd > ledger.capUsd - 0.1) throw Error("Budget guard");
  const row = {
    name,
    kind,
    reservedUsd,
    model:
      kind === "image"
        ? config.model || api.IMAGE_MODEL
        : config.model || api.LISTING_PHOTO_CHECK_MODEL,
    quality: config.quality || "medium",
    prompt: config.prompt,
    status: "dispatched",
  };
  ledger.calls.push(row);
  persist();
  const start = Date.now();
  try {
    const result = await context.run(row, fn);
    row.status = "completed";
    row.durationMs = Date.now() - start;
    if (result.quality) row.verdict = result.quality;
    if (result.accepted !== undefined) row.accepted = result.accepted;
    persist();
    console.log(
      JSON.stringify({
        name,
        model: row.model,
        costUsd: row.costUsd,
        durationMs: row.durationMs,
        accepted: row.accepted,
        totalUsd: total(),
      }),
    );
    return result;
  } catch (e) {
    row.status = "unknown_or_failed";
    row.durationMs = Date.now() - start;
    row.error = e.name;
    persist();
    throw e;
  }
}
const image = (path) =>
  "data:image/jpeg;base64," + readFileSync(path).toString("base64");
for (const c of JSON.parse(readFileSync(arg("--cases")))) {
  if (ledger.cases.some((x) => x.name === c.name)) continue;
  const record = { name: c.name, startedAt: new Date().toISOString() };
  ledger.cases.push(record);
  persist();
  try {
    if (c.basePrompt) {
      const generated = await call(
        c.name,
        "image",
        () =>
          api.generateModelImage({
            user_id: "private-quality-test",
            preferences: c.preferences,
            scene: c.scene,
          }),
        { ...c, prompt: c.basePrompt },
      );
      const path = join(out, c.name + ".jpg");
      writeFileSync(path, generated.bytes);
      record.path = path;
      const checked = await call(
        c.name + "-check",
        "check",
        () => api.checkModelImage(generated.bytes),
        { model: api.CHECK_MODEL },
      );
      record.quality = checked.quality;
      record.status = Object.values(checked.quality).every(Boolean)
        ? "generated_for_visual_review"
        : "base_check_rejected";
    } else {
      const sources = c.sources.map(image);
      if (!c.plan) {
        const classified = await call(
          c.name + "-classify",
          "check",
          () => api.classifyListingPhotos(sources),
          { model: api.CHECK_MODEL },
        );
        c.plan = classified.plan;
        record.plan = c.plan;
        if (!c.plan.eligible) {
          record.status = "skipped";
          persist();
          continue;
        }
      }
      record.views = await Promise.all(
        ["primary", "secondary"].map(async (slot) => {
          const pose = image(slot === "primary" ? c.front : c.rear);
          const indices = api.photoReferenceIndices(c.plan, slot);
          const generated = c.checkOnly?.[slot]
            ? { bytes: readFileSync(c.checkOnly[slot]) }
            : await call(
                c.name + "-" + slot,
                "image",
                () =>
                  api.editListingPhoto(
                    "private-quality-test",
                    [pose, ...indices.map((i) => sources[i])],
                    api.photoPrompt(c.plan, slot),
                  ),
                c,
              );
          const path = join(out, c.name + "-" + slot + ".jpg");
          writeFileSync(path, generated.bytes);
          const checked = await call(
            c.name + "-" + slot + "-check",
            "check",
            () =>
              api.checkListingPhoto(
                pose,
                generated.bytes,
                c.plan,
                slot,
                false,
                indices.map((i) => sources[i]),
              ),
            { model: c.checkModel },
          );
          return {
            slot,
            path,
            accepted: checked.accepted,
            quality: checked.quality,
          };
        }),
      );
      record.status = record.views.every((v) => v.accepted)
        ? "checker_accepted"
        : "checker_rejected";
    }
  } catch (e) {
    record.status = "failed";
    record.error = e.message;
  }
  persist();
}
console.log(
  JSON.stringify({
    totalUsd: total(),
    remainingUsd: ledger.capUsd - total(),
    cases: ledger.cases,
  }),
);
