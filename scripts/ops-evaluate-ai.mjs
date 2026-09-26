import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.argv[2] ?? "tests/ops/fixtures/ai/manifest.json");
const manifest = JSON.parse(readFileSync(path, "utf8"));
const examples = manifest.examples;
if (!Array.isArray(examples))
  throw new Error("Evaluation manifest needs examples");
if (process.argv.includes("--release")) {
  if (
    manifest.kind !== "owner-approved-real-garments" ||
    examples.length < 100 ||
    examples.some((example) => example.permission !== "owner-approved")
  ) {
    throw new Error(
      "Model enablement requires at least 100 owner-approved real garments",
    );
  }
}
let fields = 0;
let correct = 0;
let abstentions = 0;
let corrections = 0;
let reviewSeconds = 0;
let costMinor = 0;
for (const example of examples) {
  if (!example.id || !example.expected || !example.observed)
    throw new Error("Incomplete evaluation example");
  for (const [field, expected] of Object.entries(example.expected)) {
    fields++;
    const observed = example.observed[field] ?? null;
    if (observed === expected) correct++;
    else corrections++;
    if (observed === null) abstentions++;
  }
  reviewSeconds += Number(example.reviewSeconds ?? 0);
  costMinor += Number(example.costMinor ?? 0);
}
console.log(
  JSON.stringify({
    kind: manifest.kind,
    examples: examples.length,
    fields,
    correct,
    abstentions,
    corrections,
    reviewSeconds,
    costMinor,
    releaseEligible:
      manifest.kind === "owner-approved-real-garments" &&
      examples.length >= 100,
  }),
);
