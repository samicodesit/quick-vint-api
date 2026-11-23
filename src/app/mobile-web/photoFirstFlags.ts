const PENDING_KEY = "autolister:photo-first:pending:v1";
const INTENT_KEY = "autolister:photo-first:signin:v1";
const RETURNING_KEY = "autolister:photo-first:known-account:v1";

export function photoFirstWindowOpen(startAt?: string, now = Date.now()) {
  const start = Date.parse(startAt || "");
  return now >= start && now < start + 7 * 86400000;
}

export function assignPhotoFirst(
  browserId?: string,
): "control" | "photo_first" | null {
  if (!browserId || !/^[a-f0-9-]{36}$/i.test(browserId)) return null;
  return /[89a-f]$/i.test(browserId) ? "photo_first" : "control";
}

export function isPhotoFirstEntryEligible(url: URL) {
  try {
    return (
      !url.searchParams.has("signin") &&
      !url.searchParams.has("plans") &&
      !url.searchParams.has("checkout") &&
      !url.hash &&
      !window.opener &&
      !localStorage.getItem(RETURNING_KEY) &&
      !sessionStorage.getItem("autolister.session-restored.v1")
    );
  } catch {
    return false;
  }
}

export function markPhotoFirstAccountSeen() {
  try {
    localStorage.setItem(RETURNING_KEY, "1");
  } catch {}
}

export function photoFirstPendingHint() {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function setPhotoFirstPendingHint(id: string | null) {
  if (id) {
    sessionStorage.setItem(INTENT_KEY, id);
    localStorage.setItem(PENDING_KEY, id);
  } else {
    localStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(INTENT_KEY);
  }
}

export function photoFirstIntentInTab() {
  try {
    const id = photoFirstPendingHint();
    return Boolean(id && sessionStorage.getItem(INTENT_KEY) === id);
  } catch {
    return false;
  }
}
