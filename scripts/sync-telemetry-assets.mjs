import { readFileSync, writeFileSync } from "node:fs";
import { format } from "prettier";
import { resolve } from "node:path";

// Explicit coordinated-release preparation. Neither production build reaches into
// the other repository. Both repositories ship their checked-in runtime assets.
const frontend = resolve(process.argv[2] || "../quick-vint");
const registry = JSON.parse(
  readFileSync("utils/incidents/registry.json", "utf8"),
);
const policy = JSON.parse(
  readFileSync("utils/incidents/context-policy.json", "utf8"),
);
const generated = await format(
  `// Generated from quick-vint-api/utils/incidents/registry.json. Do not edit.\nglobalThis.AutoListerEventRegistry = ${JSON.stringify(registry, null, 2)};\nglobalThis.AutoListerContextPolicy = ${JSON.stringify(policy, null, 2)};\n`,
  { parser: "babel" },
);
writeFileSync(resolve(frontend, "lib/telemetry-registry.js"), generated);
writeFileSync("public/telemetry-registry.js", generated);
for (const name of [
  "telemetry-core.js",
  "telemetry-client.js",
  "phone-upload-recovery.js",
]) {
  const source = await format(
    readFileSync(resolve(frontend, "lib", name), "utf8"),
    { parser: "babel" },
  );
  writeFileSync(resolve(frontend, "lib", name), source);
  writeFileSync(`public/${name}`, source);
}
