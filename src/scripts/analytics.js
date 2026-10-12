import "../../public/telemetry-registry.js";
import "../../public/telemetry-core.js";
import "../../public/telemetry-client.js";
import "../../public/telemetry-website.js";
import { captureFirstTouch } from "./attribution.js";
import { getWebAnalyticsContext } from "./webAnalyticsContext";
import {
  HOMEPAGE_EXPERIMENT,
  readHomepageAssignment,
} from "./homepageExperiment";

const KNOWN_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];

captureFirstTouch();
// Wake the isolated extension bridge if site capture finished after its first
// read. The event carries no data; the bridge reads only the first-touch key.
if (typeof document.dispatchEvent === "function") {
  document.dispatchEvent(new Event("autolister:attribution-ready"));
}

function getUtmParams() {
  const params = new URLSearchParams(window.location.search);
  return KNOWN_UTM_KEYS.reduce((utm, key) => {
    const value = params.get(key);
    if (value) utm[key] = value;
    return utm;
  }, {});
}

function trackEventUnsafe(event, properties) {
  if (!event) return;

  const payload = {
    event,
    source: "website",
    page: window.location.pathname,
    utm: getUtmParams(),
    ...properties,
  };

  if (
    ["web_app_click", "chrome_store_click", "home_hero_exposure"].includes(
      event,
    )
  ) {
    payload.context = {
      ...(typeof payload.context === "object"
        ? payload.context
        : { source: payload.context }),
      ...getWebAnalyticsContext(),
    };
  }
  if (typeof window.gtag === "function") {
    window.gtag("event", event, payload);
  }

  return globalThis.AutoListerWebsiteTelemetry.track(event, payload);
}

export function trackEvent(event, properties = {}) {
  try {
    return trackEventUnsafe(event, properties);
  } catch {}
}

function appendUtmToChromeLink(link) {
  const url = new URL(link.href);
  if (url.hostname !== "chromewebstore.google.com") return;

  const incoming = getUtmParams();
  const existingSource = url.searchParams.get("utm_source");
  if (
    incoming.utm_source &&
    (!existingSource || existingSource === "autolister_site")
  ) {
    // Preserve the acquisition campaign at the store boundary. Keep content
    // as the CTA label so store reports can still distinguish placements.
    for (const key of KNOWN_UTM_KEYS.filter((key) => key !== "utm_content")) {
      url.searchParams.delete(key);
      if (incoming[key]) url.searchParams.set(key, incoming[key]);
    }
    if (!url.searchParams.has("utm_content")) {
      url.searchParams.set(
        "utm_content",
        link.dataset.trackContext || "site_cta",
      );
    }
  }
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
    element.addEventListener("click", (click) => {
      const context = element.dataset.trackCopyVersion
        ? {
            source: element.dataset.trackContext || null,
            heroCopyVersion: element.dataset.trackCopyVersion,
          }
        : element.dataset.trackContext || null;

      const queued = trackEvent(element.dataset.trackEvent, {
        context,
        plan: element.dataset.trackPlan || null,
      });
      if (
        element.dataset.trackEvent === "web_app_click" &&
        element instanceof HTMLAnchorElement &&
        click.button === 0 &&
        !click.ctrlKey &&
        !click.metaKey &&
        !click.shiftKey &&
        !click.altKey &&
        element.target !== "_blank"
      ) {
        click.preventDefault();
        // Give the existing local queue at most one frame to commit. Never
        // wait for delivery or leave entry blocked by unavailable storage.
        void Promise.race([
          Promise.resolve(queued),
          new Promise((resolve) => setTimeout(resolve, 16)),
        ]).finally(() => window.location.assign(element.href));
      }
    });
  });
}

bindTrackedClicks();
document.addEventListener("astro:page-load", bindTrackedClicks);

// One durable exposure per assigned browser, not one event per page render.
try {
  const assignment = readHomepageAssignment();
  const key = `${HOMEPAGE_EXPERIMENT.key}.exposed`;
  if (
    assignment &&
    document.querySelector("[data-home-hero]") &&
    window.matchMedia("(max-width: 767px)").matches &&
    !localStorage.getItem(key)
  ) {
    const queued = trackEvent("home_hero_exposure", {
      context: { source: "home_hero" },
    });
    if (queued)
      void Promise.resolve(queued)
        .then((result) => {
          if (result?.queued) localStorage.setItem(key, "1");
        })
        .catch(() => {});
  }
} catch {
  /* No exposure claimed when browser storage is unavailable. */
}
