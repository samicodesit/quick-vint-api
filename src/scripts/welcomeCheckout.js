import {
  clearInstallPlanIntent,
  readInstallPlanIntent,
} from "../utils/installPlanIntent.ts";

const EXTENSION_ID = "mommklhpammnlojjobejddmidmdcalcl";
const PROFILE_POLL_ATTEMPTS = 200;
const PROFILE_POLL_INTERVAL_MS = 1500;

function sendExtensionMessage(message, timeoutMs = 1200) {
  return new Promise((resolve) => {
    if (!window.chrome?.runtime?.sendMessage) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value || null);
    };

    try {
      chrome.runtime.sendMessage(EXTENSION_ID, message, (response) => {
        if (chrome.runtime.lastError) {
          finish(null);
          return;
        }
        finish(response);
      });
    } catch {
      finish(null);
    }

    setTimeout(() => finish(null), timeoutMs);
  });
}

function getUtmParams() {
  const params = new URLSearchParams(window.location.search);
  return [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ].reduce((utm, key) => {
    const value = params.get(key);
    if (value) utm[key] = value;
    return utm;
  }, {});
}

function trackEvent(event, plan) {
  try {
    const payload = { event, plan, source: "install_welcome" };
    if (typeof window.gtag === "function") {
      window.gtag("event", event, payload);
    } else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    }
  } catch {}
}

function format(template, plan) {
  return template.replace("{plan}", plan);
}

async function waitForSignedInUser() {
  for (let attempt = 0; attempt < PROFILE_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) =>
      setTimeout(resolve, PROFILE_POLL_INTERVAL_MS),
    );
    const userData = await sendExtensionMessage({ type: "GET_USER_PROFILE" });
    if (userData?.user?.email) return userData.user;
  }
  return null;
}

function initializeWelcomeCheckout() {
  const primaryCta = document.getElementById("welcome-primary-cta");
  const planBadge = document.getElementById("welcome-plan-badge");
  const pricingCta = document.getElementById("welcome-pricing-cta");
  const status = document.getElementById("welcome-checkout-status");
  if (!primaryCta || !planBadge || !status) return;

  let storage;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }
  const intent = readInstallPlanIntent(storage);
  if (!intent) return;
  const { plan } = intent;
  const defaultState = {
    badgeText: planBadge.textContent,
    href: primaryCta.href,
    rel: primaryCta.rel,
    target: primaryCta.target,
    text: primaryCta.textContent,
  };

  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const continueLabel = format(
    primaryCta.dataset.continuePlanTemplate,
    planLabel,
  );
  planBadge.textContent = format(
    primaryCta.dataset.selectedPlanTemplate,
    planLabel,
  );
  primaryCta.textContent = continueLabel;
  primaryCta.dataset.checkoutPlan = plan;
  primaryCta.href = "#";
  primaryCta.removeAttribute("target");
  primaryCta.removeAttribute("rel");
  const handlePricingClick = () => clearInstallPlanIntent(storage);
  pricingCta?.addEventListener("click", handlePricingClick);

  const showStatus = (message) => {
    status.textContent = message;
    status.hidden = false;
  };

  const isCurrentIntent = (candidate) =>
    candidate?.plan === intent.plan &&
    candidate?.createdAt === intent.createdAt;
  const restoreDefaultState = () => {
    planBadge.textContent = defaultState.badgeText;
    primaryCta.textContent = defaultState.text;
    primaryCta.href = defaultState.href;
    primaryCta.target = defaultState.target;
    primaryCta.rel = defaultState.rel;
    delete primaryCta.dataset.checkoutPlan;
    primaryCta.removeAttribute("aria-busy");
    primaryCta.removeEventListener("click", handleCheckout);
    pricingCta?.removeEventListener("click", handlePricingClick);
    status.hidden = true;
  };

  const handleCheckout = async (event) => {
    event.preventDefault();
    if (primaryCta.getAttribute?.("aria-busy") === "true") return;
    if (!isCurrentIntent(readInstallPlanIntent(storage))) {
      restoreDefaultState();
      return;
    }

    primaryCta.setAttribute("aria-busy", "true");
    primaryCta.textContent = primaryCta.dataset.openingSignIn;
    status.hidden = true;
    trackEvent("welcome_paid_continue_click", plan);

    try {
      let userData = await sendExtensionMessage({ type: "GET_USER_PROFILE" });
      if (!userData?.user?.email) {
        const popup = await sendExtensionMessage({ type: "OPEN_SIGNIN_POPUP" });
        if (!popup?.ok) throw new Error("signin_unavailable");
        showStatus(primaryCta.dataset.finishSignIn);
        userData = { user: await waitForSignedInUser() };
      }

      if (!userData?.user?.email) throw new Error("signin_timeout");
      if (!isCurrentIntent(readInstallPlanIntent(storage))) {
        restoreDefaultState();
        return;
      }
      primaryCta.textContent = primaryCta.dataset.openingCheckout;
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userData.user.email,
          tier: plan,
          source: "install_welcome",
          utm: { ...getUtmParams(), ...intent.utm },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.url) throw new Error("checkout_unavailable");
      if (!isCurrentIntent(readInstallPlanIntent(storage))) {
        restoreDefaultState();
        return;
      }

      trackEvent("welcome_paid_checkout_opened", plan);
      window.location.assign(data.url);
      if (isCurrentIntent(readInstallPlanIntent(storage))) {
        clearInstallPlanIntent(storage);
      }
    } catch {
      showStatus(primaryCta.dataset.checkoutError);
      primaryCta.textContent = continueLabel;
      primaryCta.setAttribute("aria-busy", "false");
    }
  };

  primaryCta.addEventListener("click", handleCheckout);
}

initializeWelcomeCheckout();
