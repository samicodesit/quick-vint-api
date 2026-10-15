import type { BrowserStorageAdapter } from "./language";
import { normalizeDraftSettings, type DraftSettings } from "./draftContracts";

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
  storage.setItem(
    `autolister:listing-defaults:${userId}`,
    JSON.stringify(resolved),
  );
  storage.setItem(`autolister:style-setup:v1:${userId}`, "done");
}
