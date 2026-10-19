import type { BrowserStorageAdapter } from "./language";
import { normalizeDraftSettings, type DraftSettings } from "./draftContracts";

const PRE_AUTH_STYLE_KEY = "autolister:pre-auth-style:v1";
interface PreAuthStyle {
  version: 1;
  id: string;
  state: "pending" | "applying";
  userId?: string;
  settings: ReturnType<typeof normalizeDraftSettings> | null;
}

function durableWrite(
  storage: BrowserStorageAdapter,
  key: string,
  value: string,
) {
  storage.setItem(key, value);
  if (storage.getItem(key) !== value)
    throw new Error("style_storage_unavailable");
}

/** Local storage survives OAuth navigation and email links opened in a new tab. */
export function readPreAuthStyle(
  storage: BrowserStorageAdapter | null,
): PreAuthStyle | null {
  try {
    const value = JSON.parse(storage?.getItem(PRE_AUTH_STYLE_KEY) || "null");
    if (
      value?.version !== 1 ||
      typeof value.id !== "string" ||
      !value.id ||
      !["pending", "applying"].includes(value.state) ||
      (value.state === "applying" &&
        (typeof value.userId !== "string" || !value.userId))
    )
      return null;
    return {
      ...value,
      settings:
        value.settings === null ? null : normalizeDraftSettings(value.settings),
    };
  } catch {
    return null;
  }
}

/** A null choice skips setup without replacing an account's existing style. */
export function savePreAuthStyle(
  storage: BrowserStorageAdapter,
  settings: DraftSettings | null,
): void {
  const resolved = settings === null ? null : normalizeDraftSettings(settings);
  durableWrite(
    storage,
    PRE_AUTH_STYLE_KEY,
    JSON.stringify({
      version: 1,
      id: crypto.randomUUID(),
      state: "pending",
      settings: resolved,
    }),
  );
}

/** Claim before writing account defaults; retries can only finish for that account. */
export function applyPreAuthStyle(
  storage: BrowserStorageAdapter,
  userId: string,
): DraftSettings | null {
  const pending = readPreAuthStyle(storage);
  if (!pending || (pending.userId && pending.userId !== userId)) return null;
  durableWrite(
    storage,
    PRE_AUTH_STYLE_KEY,
    JSON.stringify({ ...pending, state: "applying", userId }),
  );
  if (pending.settings) saveOnboardingStyle(storage, userId, pending.settings);
  else durableWrite(storage, `autolister:style-setup:v1:${userId}`, "done");
  durableWrite(
    storage,
    PRE_AUTH_STYLE_KEY,
    JSON.stringify({
      version: 1,
      id: pending.id,
      state: "applied",
      userId,
      settings: null,
    }),
  );
  return pending.settings;
}

// Existing accounts keep their current journey and saved output choices.
export const STYLE_SETUP_ACCOUNT_CUTOFF = "2026-10-15T08:37:48Z";
export function shouldOfferStyleOnboarding(
  storage: BrowserStorageAdapter,
  userId: string,
  createdAt?: string,
): boolean {
  if (
    !createdAt ||
    !Number.isFinite(Date.parse(createdAt)) ||
    Date.parse(createdAt) < Date.parse(STYLE_SETUP_ACCOUNT_CUTOFF)
  )
    return false;
  try {
    return (
      !storage.getItem(`autolister:style-setup:v1:${userId}`) &&
      !storage.getItem(`autolister:listing-defaults:${userId}`)
    );
  } catch {
    return false;
  }
}
export function saveOnboardingStyle(
  storage: BrowserStorageAdapter,
  userId: string,
  settings: DraftSettings,
): void {
  const resolved = normalizeDraftSettings(settings);
  durableWrite(
    storage,
    `autolister:listing-defaults:${userId}`,
    JSON.stringify(resolved),
  );
  durableWrite(storage, `autolister:style-setup:v1:${userId}`, "done");
}
