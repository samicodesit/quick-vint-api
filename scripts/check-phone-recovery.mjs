// Local fixed-fixture comparison. No provider credentials or network calls.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import vm from "node:vm";
import { performance } from "node:perf_hooks";
import { transformSync } from "esbuild";

const require = createRequire(import.meta.url);
const baselineRef = process.argv[2] || "eb7e16e";
const output = process.argv[3];
const sessionId = "550e8400-e29b-41d4-a716-446655440099";
const uploaderId = "11111111-1111-4111-8111-111111111111";
const delay = () => new Promise((resolve) => setTimeout(resolve, 2));
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function load(source, storage) {
  const sandbox = {
    module: { exports: {} },
    exports: {},
    Buffer,
    Blob,
    console,
    setTimeout,
    clearTimeout,
    require(name) {
      if (name.endsWith("supabaseClient"))
        return { supabase: { storage: { from: () => storage } } };
      if (name.endsWith("incidents/phone"))
        return { registerPhoneEvidenceOwner: async () => {} };
      if (name.endsWith("incidents/service"))
        return { continueIncidentWork() {} };
      if (name.endsWith("criticalEndpointAlert"))
        return { reportCriticalEndpointFailure() {} };
      if (name.endsWith("phoneUploadErrors"))
        return load(
          readFileSync("utils/phoneUploadErrors.ts", "utf8"),
          storage,
        );
      return require(name);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(
    transformSync(source, { loader: "ts", format: "cjs", target: "node20" })
      .code,
    sandbox,
  );
  return sandbox.module.exports;
}
async function measure(source, action) {
  let calls = 0;
  let objects;
  const storage = {
    async update(path, data) {
      calls++;
      await delay();
      if (!objects.has(path))
        return { error: { status: 404, statusCode: "NoSuchKey" } };
      objects.set(path, data.toString());
      return { error: null };
    },
    async download(path) {
      calls++;
      await delay();
      return { data: new Blob([objects.get(path)]), error: null };
    },
    async list() {
      calls++;
      await delay();
      return {
        data: [...objects.keys()].map((path) => ({
          name: path.split("/").at(-1),
        })),
        error: null,
      };
    },
    async upload(path, data) {
      calls++;
      await delay();
      objects.set(path, data.toString());
      return { error: null };
    },
  };
  const handler = load(source, storage).default;
  const times = [];
  const callCounts = [];
  for (let i = 0; i < 30; i++) {
    objects = new Map([
      [
        `${sessionId}/_session.json`,
        JSON.stringify({
          v: 2,
          ownerId: "fixture-owner",
          mode: "single",
          source: "phone",
          status: "uploading",
          expectedCount: 2,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      ],
      [`${sessionId}/000000-upload.jpg`, "photo"],
      [`${sessionId}/000001-upload.jpg`, "photo"],
    ]);
    calls = 0;
    const res = {
      statusCode: 200,
      setHeader() {},
      getHeader() {},
      status(n) {
        this.statusCode = n;
        return this;
      },
      json() {
        return this;
      },
    };
    const started = performance.now();
    await handler(
      {
        method: "POST",
        headers: {},
        body: { expectedCount: 2, orders: [0, 1] },
        query: { action, v: "2", sessionId, uploaderId, expectedCount: "2" },
      },
      res,
    );
    if (res.statusCode !== 200)
      throw new Error(`Healthy fixture returned ${res.statusCode}`);
    times.push(performance.now() - started);
    callCounts.push(calls);
  }
  return {
    samples: times.length,
    medianMs: Number(median(times).toFixed(3)),
    storageCalls: [...new Set(callCounts)],
  };
}
const baseline = execFileSync(
  "git",
  ["show", `${baselineRef}:api/phone-upload.ts`],
  { encoding: "utf8" },
);
const current = readFileSync("api/phone-upload.ts", "utf8");
const report = {
  fixture:
    "Two photos, 2ms simulated delay per storage call. Local measurements, not production latency.",
  baselineRef,
  result: {},
};
for (const action of ["prepare", "complete"]) {
  report.result[action] = {
    baseline: await measure(baseline, action),
    current: await measure(current, action),
    addedBackoffMs: 0,
  };
  if (
    JSON.stringify(report.result[action].baseline.storageCalls) !==
    JSON.stringify(report.result[action].current.storageCalls)
  )
    throw new Error(`${action} added storage calls`);
}
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
