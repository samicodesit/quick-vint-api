import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { isRegisteredBusiness } from "../../../../utils/incidents/contract";

it("ships the style-setup business event in both browser and backend registries", () => {
  const runtime: {
    AutoListerEventRegistry?: Record<string, { kind: string }>;
  } = {};
  runInNewContext(
    readFileSync("public/telemetry-registry.js", "utf8"),
    runtime,
  );
  expect(isRegisteredBusiness("web_style_setup")).toBe(true);
  expect(runtime.AutoListerEventRegistry?.web_style_setup?.kind).toBe(
    "business",
  );
});
