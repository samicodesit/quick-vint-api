const KNOWN_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];

function getUtmParams() {
  const params = new URLSearchParams(window.location.search);
  return KNOWN_UTM_KEYS.reduce((utm, key) => {
    const value = params.get(key);
    if (value) utm[key] = value;
    return utm;
  }, {});
}

const eventQueue = [];
let eventFlushTimer = null;

function sendEventPayload(events) {
  const body = JSON.stringify({ events });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/events/track",
      new Blob([body], { type: "application/json" }),
    );
    return;
  }

  fetch("/api/events/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function flushTrackedEvents() {
  if (eventFlushTimer) {
    clearTimeout(eventFlushTimer);
    eventFlushTimer = null;
  }
  if (!eventQueue.length) return;

  sendEventPayload(eventQueue.splice(0, eventQueue.length));
}

export function trackEvent(event, properties = {}) {
  if (!event) return;

  const payload = {
    event,
    source: "website",
    page: window.location.pathname,
    utm: getUtmParams(),
    ...properties,
  };

  if (typeof window.gtag === "function") {
    window.gtag("event", event, payload);
  }

  eventQueue.push(payload);
  if (eventQueue.length >= 6) {
    flushTrackedEvents();
    return;
  }

  if (!eventFlushTimer) {
    eventFlushTimer = setTimeout(flushTrackedEvents, 700);
  }
}

function appendUtmToChromeLink(link) {
  if (!link.href.includes("chromewebstore.google.com")) return;

  const url = new URL(link.href);
  if (!url.searchParams.has("utm_source")) {
    url.searchParams.set("utm_source", "autolister_site");
    url.searchParams.set("utm_medium", "website");
    url.searchParams.set("utm_campaign", "website_cta");
    url.searchParams.set(
      "utm_content",
      link.dataset.trackContext || "site_cta",
    );
  }
  link.href = url.toString();
}

function bindTrackedClicks() {
  document.querySelectorAll("a[href]").forEach(appendUtmToChromeLink);
  document.querySelectorAll("[data-track-event]").forEach((element) => {
    if (element.dataset.trackBound === "true") return;
    element.dataset.trackBound = "true";
    element.addEventListener("click", () => {
      const context = element.dataset.trackCopyVersion
        ? {
            source: element.dataset.trackContext || null,
            heroCopyVersion: element.dataset.trackCopyVersion,
          }
        : element.dataset.trackContext || null;

      trackEvent(element.dataset.trackEvent, {
        context,
        plan: element.dataset.trackPlan || null,
      });
    });
  });
}

bindTrackedClicks();
document.addEventListener("astro:page-load", bindTrackedClicks);
window.addEventListener("pagehide", flushTrackedEvents);
