const INSTALL_PLAN_INTENT_KEY = "autolister_pending_install_plan";
const INSTALL_PLAN_INTENT_TTL_MS = 60 * 60 * 1000;
const PAID_PLANS = new Set(["starter", "pro", "business"]);
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

function sanitizeUtm(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return UTM_KEYS.reduce<Record<string, string>>((utm, key) => {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === "string" && item) utm[key] = item;
    return utm;
  }, {});
}

export function saveInstallPlanIntent(
  storage: Pick<Storage, "removeItem" | "setItem">,
  plan: string,
  options: { now?: number; utm?: unknown } = {},
) {
  try {
    if (!PAID_PLANS.has(plan)) {
      storage.removeItem(INSTALL_PLAN_INTENT_KEY);
      return;
    }
    storage.setItem(
      INSTALL_PLAN_INTENT_KEY,
      JSON.stringify({
        plan,
        createdAt: options.now ?? Date.now(),
        utm: sanitizeUtm(options.utm),
      }),
    );
  } catch {
    // Storage is optional; the normal install flow still works without it.
  }
}

export function readInstallPlanIntent(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
) {
  try {
    const value = JSON.parse(
      storage.getItem(INSTALL_PLAN_INTENT_KEY) || "null",
    );
    const age = now - value?.createdAt;
    if (
      !PAID_PLANS.has(value?.plan) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > INSTALL_PLAN_INTENT_TTL_MS
    ) {
      storage.removeItem(INSTALL_PLAN_INTENT_KEY);
      return null;
    }
    return {
      createdAt: value.createdAt as number,
      plan: value.plan as "starter" | "pro" | "business",
      utm: sanitizeUtm(value.utm),
    };
  } catch {
    try {
      storage.removeItem(INSTALL_PLAN_INTENT_KEY);
    } catch {}
    return null;
  }
}

export function clearInstallPlanIntent(storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(INSTALL_PLAN_INTENT_KEY);
  } catch {}
}
