import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const astro = fileURLToPath(
  new URL("../node_modules/astro/astro.js", import.meta.url),
);
const child = spawn(
  process.execPath,
  [astro, "dev", ...process.argv.slice(2)],
  {
    env: { ...process.env, PUBLIC_OPS_ENABLED: "1" },
    stdio: "inherit",
  },
);

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
