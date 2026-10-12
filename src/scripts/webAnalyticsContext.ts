const CLIENT_KEY = "autolister.web-client.v1";
const SESSION_KEY = "autolister.web-session.v1";
const SESSION_IDLE_MS = 30 * 60 * 1000;
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);

/** Pseudonymous browser/session IDs only. No device fingerprint or user content. */
export function getWebAnalyticsContext(): Record<string, string> {
  try {
    const storage = window.localStorage;
    let client = storage.getItem(CLIENT_KEY);
    if (!validId(client)) {
      client = crypto.randomUUID();
      storage.setItem(CLIENT_KEY, client);
    }
    const now = Date.now();
    let visit: { id?: string; last?: number } = {};
    try {
      visit = JSON.parse(storage.getItem(SESSION_KEY) || "{}");
    } catch {
      /* New session. */
    }
    if (
      !validId(visit?.id) ||
      typeof visit.last !== "number" ||
      now - visit.last > SESSION_IDLE_MS ||
      visit.last > now
    )
      visit = { id: crypto.randomUUID() };
    storage.setItem(SESSION_KEY, JSON.stringify({ id: visit.id, last: now }));
    return { analyticsClientId: client!, webSessionId: visit.id! };
  } catch {
    return {};
  }
}
