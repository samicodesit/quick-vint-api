import type { BrowserStorageAdapter } from "./language";
export const MODEL_PENDING_KEY = "autolister:pending-model:v1";
export type ModelChoice = {
  gender: "male" | "female";
  hair: "black" | "blonde" | "brown" | "red";
  heightCm: number;
  build: "slim" | "average" | "plus_size";
  skinTone: string;
};
type Pending = { preferences: ModelChoice | null; owner?: string };
export function savePendingModel(
  storage: BrowserStorageAdapter,
  preferences: ModelChoice | null,
) {
  const value = JSON.stringify({ preferences });
  storage.setItem(MODEL_PENDING_KEY, value);
  if (storage.getItem(MODEL_PENDING_KEY) !== value)
    throw new Error("Your preferences could not be saved. Try again.");
}
export function claimPendingModel(
  storage: BrowserStorageAdapter,
  user: string,
): Pending | null {
  let p: Pending;
  try {
    p = JSON.parse(storage.getItem(MODEL_PENDING_KEY) || "null");
  } catch {
    return null;
  }
  if (!p || !("preferences" in p) || (p.owner && p.owner !== user)) return null;
  const next = { ...p, owner: user };
  const text = JSON.stringify(next);
  storage.setItem(MODEL_PENDING_KEY, text);
  if (storage.getItem(MODEL_PENDING_KEY) !== text)
    throw new Error("Your preferences could not be loaded. Try again.");
  return next;
}
