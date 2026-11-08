import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  getFreeTrialIpKey,
  getTrustedTrialIp,
  withFreeTrialIpKey,
} from "../../../utils/freeTrialIpQuota";

beforeEach(() => {
  vi.stubEnv("FREE_TRIAL_IP_QUOTA_ENABLED", "true");
  vi.stubEnv("FREE_TRIAL_IP_HASH_KEY", "local-fixture-secret-for-ip-quotas");
});
afterEach(() => vi.unstubAllEnvs());

it("uses Vercel's IP ahead of other headers", () => {
  expect(
    getTrustedTrialIp({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "203.0.113.10",
      "x-client-ip": "203.0.113.11",
    }),
  ).toBe("203.0.113.9");
  expect(getTrustedTrialIp({ "x-client-ip": "203.0.113.11" })).toBeUndefined();
  expect(
    getTrustedTrialIp({
      "x-vercel-forwarded-for": "invalid",
      "x-forwarded-for": "203.0.113.10",
    }),
  ).toBeUndefined();
});

it("uses the same key for equivalent IPs and different keys for distinct IPs", () => {
  const keyFor = (ip: string) =>
    getFreeTrialIpKey(getTrustedTrialIp({ "x-vercel-forwarded-for": ip }));
  const ip = keyFor("203.0.113.9");
  expect(ip).toMatch(/^[0-9a-f]{64}$/);
  expect(ip).toBe(keyFor("::ffff:203.0.113.9"));
  expect(ip).not.toBe(keyFor("203.0.113.10"));
  expect(keyFor("2001:0DB8:0:0:0:0:0:1")).toBe(keyFor("2001:db8::1"));
});

it("preserves the permanent exception and treats an unavailable key separately", () => {
  expect(getFreeTrialIpKey(undefined)).toBe("unavailable");
  expect(
    getFreeTrialIpKey(undefined, " Nadenickovao7@gmail.com "),
  ).toBeUndefined();
  vi.stubEnv("FREE_TRIAL_IP_HASH_KEY", "");
  expect(getFreeTrialIpKey("203.0.113.9")).toBe("unavailable");
  vi.stubEnv("FREE_TRIAL_IP_QUOTA_ENABLED", "false");
  expect(getFreeTrialIpKey("203.0.113.9")).toBeUndefined();
});

it("forwards the key only on the server reservation that needs it", () => {
  const query = { setHeader: vi.fn() };
  expect(withFreeTrialIpKey(query)).toBe(query);
  expect(query.setHeader).not.toHaveBeenCalled();
  expect(withFreeTrialIpKey(query, "a".repeat(64))).toBe(query);
  expect(query.setHeader).toHaveBeenCalledWith(
    "x-autolister-free-trial-ip",
    "a".repeat(64),
  );
});
