export type BrowserAttribution = {
  source: string;
  medium: string;
  campaign: string | null;
  content: string | null;
  capturedAt: string;
  referrerHost: string | null;
};

export const FIRST_TOUCH_STORAGE_KEY: string;
export function readStoredAttribution(
  storage?: Storage | { getItem: (key: string) => string | null } | null,
): BrowserAttribution | null;
export function getStoredAttribution(
  storage?: Storage | { getItem: (key: string) => string | null } | null,
): BrowserAttribution | null;
export function captureFirstTouch(options?: {
  href?: string;
  referrer?: string;
  storage?:
    | Storage
    | {
        getItem: (key: string) => string | null;
        setItem: (key: string, value: string) => void;
      }
    | null;
  now?: string;
}): BrowserAttribution | null;
