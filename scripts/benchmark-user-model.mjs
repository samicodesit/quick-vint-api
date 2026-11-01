// Explicit, opt-in provider benchmark. Does not connect to Supabase or create accounts.
import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
if (!args.includes("--confirm-small-spend"))
  throw new Error(
    "This calls the paid image API. Pass --confirm-small-spend only with explicit authorization.",
  );
const value = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--out"))
  throw new Error("Provide --out for the benchmark evidence.");
if (!process.env.VERCEL_APP_OPENAI_API_KEY && args.includes("--env-file")) {
  const content = await readFile(value("--env-file"), "utf8");
  const line = content
    .split(/\r?\n/)
    .find((line) => line.startsWith("VERCEL_APP_OPENAI_API_KEY="));
  if (line)
    process.env.VERCEL_APP_OPENAI_API_KEY = line
      .slice(line.indexOf("=") + 1)
      .replace(/^['"]|['"]$/g, "");
}
if (!process.env.VERCEL_APP_OPENAI_API_KEY)
  throw new Error("OpenAI key unavailable.");
const bundle = await build({
  stdin: {
    contents:
      'export * from "./utils/userModelGeneration"; export * from "./utils/userModelCatalog";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  generateModelImage,
  checkModelImage,
  resolveModelScene,
  compileModelPrompt,
  estimatedModelCost,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const out = resolve(value("--out"));
await mkdir(out, { recursive: true });
const cases = [
  {
    name: "female-average",
    preferences: {
      gender: "female",
      hair: "brown",
      heightCm: 170,
      build: "average",
      skinTone: "tone_3",
    },
  },
  {
    name: "male-tall",
    preferences: {
      gender: "male",
      hair: "black",
      heightCm: 188,
      build: "slim",
      skinTone: "tone_5",
    },
  },
  {
    name: "female-plus",
    preferences: {
      gender: "female",
      hair: "red",
      heightCm: 158,
      build: "plus_size",
      skinTone: "tone_1",
    },
  },
];
const results = [];
for (const item of cases) {
  const scene = resolveModelScene("implementation-validation-" + item.name);
  const job = {
    id: "benchmark",
    user_id: "local-model-benchmark",
    operation_id: "benchmark",
    lease_token: "benchmark",
    attempt_count: 1,
    prompt_version: 1,
    catalog_version: 1,
    preferences: item.preferences,
    scene,
  };
  const start = Date.now();
  const generated = await generateModelImage(job);
  const checked = await checkModelImage(generated.bytes);
  const result = {
    name: item.name,
    preferences: item.preferences,
    scene,
    generationMs: generated.durationMs,
    checkMs: checked.durationMs,
    totalMs: Date.now() - start,
    quality: checked.quality,
    imageUsage: generated.usage,
    checkUsage: checked.usage,
    estimatedCostUsd: estimatedModelCost(generated.usage, checked.usage),
  };
  results.push(result);
  await writeFile(resolve(out, item.name + ".jpg"), generated.bytes);
  await writeFile(
    resolve(out, item.name + "-prompt.txt"),
    compileModelPrompt(item.preferences, scene),
  );
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      name: item.name,
      generationMs: result.generationMs,
      checkMs: result.checkMs,
      totalMs: result.totalMs,
      quality: result.quality,
      estimatedCostUsd: result.estimatedCostUsd,
    }),
  );
}
console.log(
  JSON.stringify({
    totalEstimatedCostUsd: results.reduce(
      (sum, r) => sum + r.estimatedCostUsd,
      0,
    ),
    artifacts: pathToFileURL(out).pathname,
  }),
);
