(() => {
  const w = window;
  if (w.AutoListerMeasurement) return;
  const key = "autolister.measurement-consent.v1";
  const sent = new Set();
  let loaded = false,
    pending = null,
    checking = false;
  const params = new URLSearchParams(w.location.search);
  const session = params.get("session_id");
  const checkoutReturn =
    w.location.pathname === "/success" ||
    w.location.pathname === "/success.html" ||
    (w.location.pathname.replace(/\/$/, "") === "/app" &&
      params.get("checkout") === "success");
  const read = (k) => {
    try {
      return w.localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const write = (k, v) => {
    try {
      w.localStorage.setItem(k, v);
    } catch {}
  };
  let consent = read(key);
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    if (arguments[0] === "event" && consent !== "accepted") return;
    w.dataLayer.push(arguments);
  };
  const denied = {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
  w.gtag("consent", "default", denied);
  w.gtag("set", "ads_data_redaction", true);
  function start() {
    if (
      consent !== "accepted" ||
      loaded ||
      w.location.hostname !== "autolister.app"
    )
      return;
    loaded = true;
    w.gtag("consent", "update", {
      ...denied,
      analytics_storage: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
    });
    w.gtag("js", new Date());
    const url = new URL(w.location.href);
    url.hash = "";
    for (const k of Array.from(url.searchParams.keys()))
      if (
        ![
          "gclid",
          "gbraid",
          "wbraid",
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "utm_term",
        ].includes(k)
      )
        url.searchParams.delete(k);
    const config = {
      page_location: url.toString(),
      page_referrer: "",
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    };
    w.gtag("config", "G-F2QL50WB6M", config);
    w.gtag("config", "AW-18434567859", config);
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=AW-18434567859";
    document.head.appendChild(tag);
  }
  function purchase(p) {
    if (
      !p ||
      !/^in_[A-Za-z0-9]+$/.test(p.transaction_id) ||
      !Number.isFinite(p.value) ||
      p.value <= 0 ||
      p.currency !== "EUR" ||
      p.new_customer !== true
    )
      return;
    pending = p;
    if (consent !== "accepted" || w.location.hostname !== "autolister.app")
      return;
    start();
    if (sent.has(p.transaction_id)) return;
    // Google deduplicates the stable invoice ID across reloads. Do not mark
    // delivery in local storage: a blocked request must be eligible for retry.
    sent.add(p.transaction_id);
    w.gtag("event", "conversion", {
      send_to: "AW-18434567859/TMdVCLelxLMdELPdpNZE",
      transaction_id: p.transaction_id,
      value: p.value,
      currency: p.currency,
      new_customer: true,
    });
  }
  async function verifyReturn() {
    if (
      checking ||
      !checkoutReturn ||
      !session ||
      !/^cs_live_[A-Za-z0-9]+$/.test(session) ||
      consent !== "accepted" ||
      w.location.hostname !== "autolister.app" ||
      params.has("preview") ||
      params.has("dev")
    )
      return;
    checking = true;
    for (let n = 0; n < 8; n++) {
      if (consent !== "accepted") return;
      try {
        const response = await fetch(
          "/api/stripe/verify-session?session_id=" +
            encodeURIComponent(session),
          { cache: "no-store", credentials: "same-origin" },
        );
        const data = await response.json();
        if (response.ok && data.valid && data.fulfilled) {
          purchase(data.purchase_conversion);
          return;
        }
        if (response.status === 400 && data.payment_status !== "unpaid") return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  function choose(value) {
    consent = value;
    write(key, value);
    document.getElementById("measurement-choice")?.remove();
    if (value === "accepted") {
      start();
      if (pending) purchase(pending);
      void verifyReturn();
    } else {
      w.gtag("consent", "update", denied);
      // Stop the already-loaded Google runtime after withdrawing permission.
      // The persisted rejection prevents it loading again on the next page.
      if (loaded) w.location.reload();
    }
  }
  function showChoice() {
    if (document.getElementById("measurement-choice")) return;
    const panel = document.createElement("section");
    panel.id = "measurement-choice";
    panel.setAttribute("aria-label", "Analytics and advertising cookies");
    panel.innerHTML =
      '<strong>Analytics &amp; ad measurement</strong><p>Allow Google cookies to measure visits and purchases from our ads?</p><div><button type="button" data-choice="rejected">Reject</button><button type="button" data-choice="accepted">Allow</button><a href="/privacy">Privacy</a></div>';
    panel.style.cssText =
      "position:fixed;bottom:16px;left:16px;right:16px;max-width:420px;box-sizing:border-box;z-index:2147483646;background:#fff;color:#172033;padding:20px;border:1px solid #cbd5e1;border-radius:16px;box-shadow:0 8px 32px #0f172a20;font:15px/1.5 system-ui,sans-serif";
    panel.querySelector("p").style.cssText = "margin:6px 0 16px";
    panel.querySelector("div").style.cssText =
      "display:flex;gap:10px;align-items:center";
    panel.querySelectorAll("button").forEach((button) => {
      button.style.cssText =
        "min-height:44px;padding:10px 22px;border:1px solid #334155;border-radius:8px;background:white;color:#172033;font:600 14px system-ui;cursor:pointer";
      button.addEventListener("click", () => choose(button.dataset.choice));
    });
    panel.querySelector("a").style.cssText =
      "margin-left:auto;color:#334155;text-decoration:underline;font-size:13px";
    document.body.appendChild(panel);
  }
  function ready() {
    const settings = document.createElement("button");
    settings.type = "button";
    settings.textContent = "Cookie settings";
    settings.id = "measurement-settings";
    settings.style.cssText =
      "display:block;margin:12px auto;min-height:44px;border:0;background:white;color:#334155;font:13px system-ui;padding:10px 16px;cursor:pointer;border-radius:6px;text-decoration:underline";
    settings.addEventListener("click", showChoice);
    document.body.appendChild(settings);
    if (consent !== "accepted" && consent !== "rejected") showChoice();
    void verifyReturn();
  }
  w.AutoListerMeasurement = { purchase };
  start();
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
})();
