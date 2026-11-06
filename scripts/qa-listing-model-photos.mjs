// Explicit paid QA using production functions. No account/database mutations.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
const arg = (n) => process.argv[process.argv.indexOf(n) + 1];
if (!process.argv.includes("--confirmed-budget"))
  throw new Error("Explicit budget authorization required");
const out = resolve(arg("--out"));
mkdirSync(out, { recursive: true });
const prior = process.argv.includes("--spent-usd")
    ? Number(arg("--spent-usd"))
    : 1.59862125,
  cap = 3;
if (!Number.isFinite(prior) || prior < 0 || prior >= cap)
  throw Error("Invalid prior spend");
if (!process.env.VERCEL_APP_OPENAI_API_KEY) {
  const env = readFileSync(arg("--env-file"), "utf8");
  const line = env
    .split(/\r?\n/)
    .find((l) => l.startsWith("VERCEL_APP_OPENAI_API_KEY="));
  if (line)
    process.env.VERCEL_APP_OPENAI_API_KEY = line
      .slice(line.indexOf("=") + 1)
      .replace(/^['"]|['"]$/g, "");
}
if (!process.env.VERCEL_APP_OPENAI_API_KEY)
  throw new Error("Provider key missing");
const bundle = await build({
  stdin: {
    contents: 'export * from "./utils/listingPhotoGeneration";',
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
const ledgerFile = join(out, "ledger.json");
const ledger = existsSync(ledgerFile)
  ? JSON.parse(readFileSync(ledgerFile))
  : { priorUsd: prior, capUsd: cap, calls: [], cases: [] };
const persist = () =>
  writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2));
const total = () =>
  prior + ledger.calls.reduce((s, c) => s + (c.costUsd ?? c.reservedUsd), 0);
const activeCall = new AsyncLocalStorage();
const providerFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  if (
    process.argv.includes("--reasoning-low") &&
    String(args[0]).endsWith("/responses")
  ) {
    const body = JSON.parse(args[1].body);
    body.reasoning = { effort: "low" };
    body.max_output_tokens = 1600;
    args[1] = {
      ...args[1],
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    };
  }
  const response = await providerFetch(...args);
  const row = activeCall.getStore();
  if (row && String(args[0]).startsWith("https://api.openai.com/")) {
    const data = await response.clone().json();
    row.model = JSON.parse(args[1].body).model;
    row.serviceTier = data.service_tier || null;
    if (data.usage) {
      row.usage = data.usage;
      row.costUsd = api.photoCost(
        row.kind,
        data.usage,
        row.model,
        row.serviceTier,
      );
    }
    row.providerStatus = data.status || response.status;
    row.responseText = data.output
      ?.flatMap((o) => o.content || [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("");
    persist();
  }
  return response;
};
async function call(name, kind, fn) {
  if (ledger.calls.some((c) => c.name === name))
    throw new Error("Refusing duplicate/unknown operation " + name);
  const reservedUsd = kind === "image" ? 0.12 : 0.06;
  if (total() + reservedUsd > cap - 0.1)
    throw new Error("Testing budget guard");
  const row = {
    name,
    kind,
    model:
      kind === "check" && !name.endsWith("-classify")
        ? api.LISTING_PHOTO_CHECK_MODEL
        : undefined,
    reservedUsd,
    status: "dispatched",
    startedAt: new Date().toISOString(),
  };
  ledger.calls.push(row);
  persist();
  try {
    const r = await activeCall.run(row, fn);
    row.costUsd = api.photoCost(kind, r.usage, row.model, row.serviceTier);
    row.usage = r.usage;
    row.durationMs = r.durationMs;
    row.status = "completed";
    if (r.quality) row.quality = r.quality;
    if (r.accepted !== undefined) row.accepted = r.accepted;
    persist();
    console.log(
      JSON.stringify({
        name,
        costUsd: row.costUsd,
        durationMs: r.durationMs,
        totalUsd: total(),
        accepted: r.accepted,
      }),
    );
    return r;
  } catch (e) {
    row.status = "unknown_or_failed";
    row.error = String(e.message);
    persist();
    throw e;
  }
}
const image = (path) => {
  const bytes = readFileSync(path);
  return (
    "data:image/" +
    (bytes.toString("ascii", 0, 4) === "RIFF" ? "webp" : "jpeg") +
    ";base64," +
    bytes.toString("base64")
  );
};
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const cases = JSON.parse(readFileSync(arg("--cases"), "utf8"));
const rearCache = new Map();
for (const c of cases) {
  if (ledger.cases.some((x) => x.name === c.name)) {
    console.log("Already recorded " + c.name);
    continue;
  }
  const record = {
    name: c.name,
    model: c.front,
    sources: c.sources,
    sourceHashes: c.sources.map(hash),
    startedAt: new Date().toISOString(),
  };
  ledger.cases.push(record);
  persist();
  const start = Date.now();
  try {
    const sources = c.sources.map(image),
      front = image(c.front);
    const classified = c.plan
      ? { plan: c.plan }
      : await call(c.name + "-classify", "check", () =>
          api.classifyListingPhotos(sources),
        );
    record.plan = classified.plan;
    persist();
    if (c.classifyOnly) {
      record.status = "classification_only";
      continue;
    }
    if (!classified.plan.eligible) {
      record.status = "skipped";
      continue;
    }
    if (c.expectSkip) {
      record.status = "exclusion_failure";
      continue;
    }
    let rearPath =
      c.rear || rearCache.get(c.front) || join(out, c.modelName + "-rear.jpg");
    if (!existsSync(rearPath)) {
      const rear = await call(c.modelName + "-rear", "image", () =>
        api.editListingPhoto(
          "local-quality-qa",
          [front],
          api.rearPosePrompt,
          true,
        ),
      );
      writeFileSync(rearPath, rear.bytes);
      const check = await call(c.modelName + "-rear-check", "check", () =>
        api.checkListingPhoto(
          front,
          rear.bytes,
          classified.plan,
          "secondary",
          true,
        ),
      );
      writeFileSync(rearPath + ".check.json", JSON.stringify(check, null, 2));
      if (!check.accepted)
        throw new Error("Rear pose rejected. No automatic retry.");
    } else if (
      existsSync(rearPath + ".check.json") &&
      !JSON.parse(readFileSync(rearPath + ".check.json")).accepted
    ) {
      if (!c.recheckRear) throw new Error("Rear pose previously rejected");
      const check = await call(c.name + "-rear-recheck", "check", () =>
        api.checkListingPhoto(
          front,
          readFileSync(rearPath),
          classified.plan,
          "secondary",
          true,
        ),
      );
      writeFileSync(rearPath + ".recheck.json", JSON.stringify(check, null, 2));
      if (!check.accepted) throw new Error("Rear recheck rejected");
    }
    rearCache.set(c.front, rearPath);
    record.rear = rearPath;
    const rear = image(rearPath);
    const plan = classified.plan;
    record.views = await Promise.all(
      ["primary", "secondary"].map(async (slot) => {
        const pose =
          slot === "secondary" || plan.category === "backpack" ? rear : front;
        const indices = api.photoReferenceIndices(plan, slot);
        const prompt = api.photoPrompt(plan, slot);
        writeFileSync(join(out, c.name + "-" + slot + "-prompt.txt"), prompt);
        const generated = c.checkOnly
          ? { bytes: readFileSync(c.checkOnly[slot]), durationMs: 0 }
          : await call(c.name + "-" + slot, "image", () =>
              api.editListingPhoto(
                "local-quality-qa",
                [pose, ...indices.map((i) => sources[i])],
                prompt,
              ),
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
              plan,
              slot,
              false,
              indices.map((i) => sources[i]),
            ),
        );
        return {
          slot,
          path,
          indices,
          generationMs: generated.durationMs,
          checkMs: checked.durationMs,
          accepted: checked.accepted,
          quality: checked.quality,
        };
      }),
    );
    record.status = record.views.every((v) => v.accepted)
      ? "checker_accepted"
      : "checker_rejected";
  } catch (e) {
    record.status = "failed";
    record.error = e.message;
    console.log(JSON.stringify({ name: c.name, error: e.message }));
  } finally {
    record.totalMs = Date.now() - start;
    record.costUsd = ledger.calls
      .filter((x) => x.name.startsWith(c.name + "-"))
      .reduce((s, c) => s + (c.costUsd ?? c.reservedUsd), 0);
    ledger.totalUsd = total();
    persist();
  }
}
console.log(
  JSON.stringify({
    totalUsd: total(),
    remainingUsd: cap - total(),
    cases: ledger.cases.map((c) => ({
      name: c.name,
      status: c.status,
      totalMs: c.totalMs,
      costUsd: c.costUsd,
    })),
  }),
);
