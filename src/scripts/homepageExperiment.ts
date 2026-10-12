export const HOMEPAGE_EXPERIMENT = {
  id: "mobile-entry-v1",
  key: "autolister.home-entry.v1",
  start: Date.parse("2026-10-12T00:00:00Z"),
  enrollmentEnd: Date.parse("2026-11-02T00:00:00Z"),
  end: Date.parse("2026-11-09T00:00:00Z"),
};
/** Self-contained so Astro can inline this tiny function before the first paint. */
export function bootstrapHomepageExperiment(
  w: Window & typeof globalThis,
  config = HOMEPAGE_EXPERIMENT,
): void {
  try {
    const now = w.Date.now();
    if (
      now < config.start ||
      now >= config.end ||
      !/^\/(?:fr\/?|de\/?|nl\/?|pl\/?|es\/?|it\/?|pt\/?)?$/.test(
        w.location.pathname,
      )
    )
      return;
    const storage = w.localStorage;
    let assignment;
    try {
      assignment = JSON.parse(storage.getItem(config.key) || "null");
    } catch {
      /* Corrupt storage falls back to a fresh assignment. */
    }
    if (
      !(
        assignment?.id === config.id &&
        ["a", "b"].includes(assignment.variant) &&
        Number.isFinite(assignment.enrolledAt) &&
        assignment.enrolledAt >= config.start &&
        assignment.enrolledAt < config.enrollmentEnd &&
        assignment.enrolledAt <= now
      )
    )
      assignment = null;
    if (!assignment) {
      if (
        !w.matchMedia("(max-width: 767px)").matches ||
        now >= config.enrollmentEnd
      )
        return;
      assignment = {
        id: config.id,
        variant:
          w.crypto.getRandomValues(new w.Uint32Array(1))[0] & 1 ? "b" : "a",
        enrolledAt: now,
      };
      storage.setItem(config.key, JSON.stringify(assignment));
    }
    w.document.documentElement.dataset.homeEntryVariant = assignment.variant;
  } catch {
    /* Control stays visible when storage or crypto is unavailable. */
  }
}

export function readHomepageAssignment(
  storage?: Pick<Storage, "getItem">,
  now = Date.now(),
): { variant: "a" | "b" } | null {
  try {
    const config = HOMEPAGE_EXPERIMENT;
    if (now < config.start || now >= config.end) return null;
    const value = JSON.parse(
      (storage || window.localStorage).getItem(config.key) || "null",
    );
    return value?.id === config.id &&
      ["a", "b"].includes(value.variant) &&
      Number.isFinite(value.enrolledAt) &&
      value.enrolledAt >= config.start &&
      value.enrolledAt < config.enrollmentEnd &&
      value.enrolledAt <= now
      ? { variant: value.variant }
      : null;
  } catch {
    return null;
  }
}
