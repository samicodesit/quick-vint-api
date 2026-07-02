import { trackEvent } from "./analytics.js";
import { getPricingPlanAction, normalizePricingPlanTier } from "../utils/pricingPlanAction.ts";

// Original Pricing Page Logic starts here
// API Base URL - Use current origin to avoid CORS issues
const API_BASE = window.location.origin;
const EXTENSION_ID = "mommklhpammnlojjobejddmidmdcalcl";
const EXTENSION_MESSAGE_TIMEOUT_MS = 900;
const SIGN_IN_REFRESH_INTERVAL_MS = 1500;
const SIGN_IN_REFRESH_MAX_ATTEMPTS = 200;

const PRICING_MESSAGES = {
  en: {
    openingSignIn: "Opening AutoLister AI...",
    popupOpened: "Sign in, then return here.",
    manualSignIn: "Open AutoLister AI from Chrome, sign in, then return.",
    signedIn: "Signed in. Choose a plan.",
  },
  fr: {
    openingSignIn: "Ouverture d'AutoLister AI...",
    popupOpened: "Connectez-vous, puis revenez ici.",
    manualSignIn: "Ouvrez AutoLister AI dans Chrome, connectez-vous, puis revenez.",
    signedIn: "Connecté. Choisissez une offre.",
  },
  de: {
    openingSignIn: "AutoLister AI wird geöffnet...",
    popupOpened: "Einloggen, dann hierher zurückkehren.",
    manualSignIn: "AutoLister AI in Chrome öffnen, einloggen, dann zurückkehren.",
    signedIn: "Eingeloggt. Wähle einen Plan.",
  },
  nl: {
    openingSignIn: "AutoLister AI openen...",
    popupOpened: "Log in en kom daarna hier terug.",
    manualSignIn: "Open AutoLister AI in Chrome, log in en kom terug.",
    signedIn: "Ingelogd. Kies een plan.",
  },
  pl: {
    openingSignIn: "Otwieranie AutoLister AI...",
    popupOpened: "Zaloguj się, potem wróć tutaj.",
    manualSignIn: "Otwórz AutoLister AI w Chrome, zaloguj się i wróć.",
    signedIn: "Zalogowano. Wybierz plan.",
  },
  es: {
    openingSignIn: "Abriendo AutoLister AI...",
    popupOpened: "Inicia sesión y vuelve aquí.",
    manualSignIn: "Abre AutoLister AI en Chrome, inicia sesión y vuelve.",
    signedIn: "Sesión iniciada. Elige un plan.",
  },
  it: {
    openingSignIn: "Apertura di AutoLister AI...",
    popupOpened: "Accedi, poi torna qui.",
    manualSignIn: "Apri AutoLister AI in Chrome, accedi e torna qui.",
    signedIn: "Accesso effettuato. Scegli un piano.",
  },
  pt: {
    openingSignIn: "A abrir o AutoLister AI...",
    popupOpened: "Inicie sessão e volte aqui.",
    manualSignIn: "Abra o AutoLister AI no Chrome, inicie sessão e volte.",
    signedIn: "Sessão iniciada. Escolha um plano.",
  },
};

// Current user state
let currentUser = null;
let currentProfile = null;
let hasExtension = false;
let isPricingStateLoading = true;
let pricingActionsBound = false;
let currentPricingOffer = null;
let signInRefreshTimer = null;

// Plan configuration
const PLAN_CONFIG = {
  free: { name: "Free", price: 0 },
  unlimited_monthly: { name: "Starter", price: 3.99 }, // Legacy support
  starter: { name: "Starter", price: 3.99 },
  pro: { name: "Pro", price: 9.99 },
  business: { name: "Business", price: 19.99 },
};

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

function normalizeTier(tier) {
  return normalizePricingPlanTier(tier);
}

function getPricingLocale() {
  const lang = document.documentElement.lang || "en";
  return PRICING_MESSAGES[lang] ? lang : lang.split("-")[0] || "en";
}

function pricingMessage(key) {
  const locale = getPricingLocale();
  return (PRICING_MESSAGES[locale] || PRICING_MESSAGES.en)[key];
}

function sendExtensionMessage(message, timeoutMs = EXTENSION_MESSAGE_TIMEOUT_MS) {
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
    } catch (e) {
      finish(null);
      return;
    }

    setTimeout(() => finish(null), timeoutMs);
  });
}

function showStatusMessage(message, type = "info") {
  let messageBox = document.getElementById("pricing-status-message");
  if (!messageBox) {
    messageBox = document.createElement("div");
    messageBox.id = "pricing-status-message";
    messageBox.setAttribute("role", "status");
    messageBox.style.maxWidth = "760px";
    messageBox.style.margin = "0 auto 24px";
    messageBox.style.padding = "14px 18px";
    messageBox.style.borderRadius = "14px";
    messageBox.style.fontWeight = "700";
    messageBox.style.textAlign = "center";
    messageBox.style.boxShadow = "0 10px 24px rgba(15, 23, 42, 0.08)";

    const pricingGrid = document.querySelector(".grid");
    if (pricingGrid?.parentNode) {
      pricingGrid.parentNode.insertBefore(messageBox, pricingGrid);
    } else {
      document.body.prepend(messageBox);
    }
  }

  const palette =
    type === "error"
      ? { background: "#fef2f2", border: "#fecaca", color: "#991b1b" }
      : type === "success"
        ? { background: "#ecfdf5", border: "#a7f3d0", color: "#065f46" }
        : { background: "#eef2ff", border: "#c7d2fe", color: "#3730a3" };

  messageBox.textContent = message;
  messageBox.style.background = palette.background;
  messageBox.style.border = `1px solid ${palette.border}`;
  messageBox.style.color = palette.color;
}

function openExternalWindow() {
  try {
    return window.open("about:blank", "_blank");
  } catch (error) {
    return null;
  }
}

function sendExternalWindowToUrl(pendingWindow, url) {
  if (pendingWindow && !pendingWindow.closed) {
    pendingWindow.location.href = url;
  } else {
    window.location.href = url;
  }
}

function closeExternalWindow(pendingWindow) {
  if (pendingWindow && !pendingWindow.closed) {
    pendingWindow.close();
  }
}

// Check if extension is installed
async function checkExtensionInstalled() {
  const response = await sendExtensionMessage({ type: "PING" });
  return response?.installed === true || response === true || Boolean(response);
}

// Get user data from extension
async function getUserFromExtension() {
  if (!hasExtension) return null;
  return sendExtensionMessage({ type: "GET_USER_PROFILE" }, 1200);
}

async function openExtensionSignInPopup() {
  if (!hasExtension) return false;
  const response = await sendExtensionMessage(
    { type: "OPEN_SIGNIN_POPUP" },
    1200,
  );
  return response?.ok === true;
}

function stopSignInRefreshPolling() {
  if (!signInRefreshTimer) return;
  window.clearInterval(signInRefreshTimer);
  signInRefreshTimer = null;
}

async function refreshUserFromExtension() {
  if (!hasExtension) return false;
  const userData = await getUserFromExtension();
  if (!userData) return false;

  const wasSignedOut = !currentUser;
  applyExtensionUserData(userData);
  updateButtonStates();

  return wasSignedOut && Boolean(currentUser?.email);
}

function startSignInRefreshPolling() {
  stopSignInRefreshPolling();

  let attempts = 0;
  signInRefreshTimer = window.setInterval(async () => {
    attempts += 1;

    if (await refreshUserFromExtension()) {
      stopSignInRefreshPolling();
      showStatusMessage(
        pricingMessage("signedIn"),
        "success",
      );
      return;
    }

    if (attempts >= SIGN_IN_REFRESH_MAX_ATTEMPTS) {
      stopSignInRefreshPolling();
    }
  }, SIGN_IN_REFRESH_INTERVAL_MS);
}

// Utility functions for token handling
function decodeUserData(token) {
  try {
    const jsonString = atob(token);
    const data = JSON.parse(jsonString);

    // Validate token freshness (within 10 minutes)
    if (data.timestamp && Date.now() - data.timestamp > 10 * 60 * 1000) {
      console.warn("Token expired");
      return null;
    }

    // Validate required fields
    if (data.source !== "extension") {
      console.warn("Invalid token source");
      return null;
    }

    return data;
  } catch (e) {
    console.error("Failed to decode token:", e);
    return null;
  }
}

// Update button states based on user context
function updateButtonStates() {
  const buttons = {
    free: document.getElementById("btn-free"),
    starter: document.getElementById("btn-starter"),
    pro: document.getElementById("btn-pro"),
    business: document.getElementById("btn-business"),
  };

  const storedTier = normalizeTier(currentProfile?.subscription_tier || "free");
  const isActive = currentProfile?.subscription_status === "active";
  const currentTier = isActive ? storedTier : "free";

  Object.entries(buttons).forEach(([plan, button]) => {
    if (!button) return;

    const textSpan = button.querySelector(".btn-text");
    const statusSpan = button.querySelector(".btn-status");

    // Remove all state classes
    button.classList.remove(
      "state-download",
      "state-signin",
      "state-current",
      "state-disabled",
    );

    button.disabled = isPricingStateLoading;

    if (isPricingStateLoading) {
      textSpan.textContent = "Checking...";
      statusSpan.textContent = "";
      return;
    }

    if (!hasExtension) {
      textSpan.textContent = "Get AutoLister AI";
      statusSpan.textContent = "";
      button.classList.add("state-download");
    } else if (!currentUser) {
      textSpan.textContent = "Sign in to continue";
      statusSpan.textContent = "";
      button.classList.add("state-signin");
    } else if (
      isActive &&
      (currentTier === plan ||
        (currentTier === "unlimited_monthly" && plan === "starter"))
    ) {
      textSpan.textContent = "Current Plan";
      statusSpan.textContent = "";
      button.classList.add("state-current");
    } else {
      if (plan === "free" && currentTier !== "free") {
        textSpan.textContent = "Downgrade";
        statusSpan.textContent = "";
        button.classList.add("state-disabled");
      } else if (plan === "free") {
        textSpan.textContent = "Current Plan";
        button.classList.add("state-current");
      } else {
        const planConfig = PLAN_CONFIG[plan];
        const currentPlanConfig = PLAN_CONFIG[currentTier] || PLAN_CONFIG.free;
        textSpan.textContent =
          planConfig.price > currentPlanConfig.price
            ? `Upgrade to ${planConfig.name}`
            : `Switch to ${planConfig.name}`;
        statusSpan.textContent = "";
      }
    }
  });
}

function applyExtensionUserData(userData) {
  if (!userData) return false;

  hasExtension = true;
  currentUser = userData.user || null;
  currentProfile = userData.profile || null;
  return true;
}

async function applyPricingOfferToken(token) {
  try {
    const response = await fetch(
      `${API_BASE}/api/pricing/offer?token=${encodeURIComponent(token)}`,
    );
    const data = await response.json();

    if (!response.ok) {
      console.warn("Pricing offer token rejected:", data);
      return false;
    }

    hasExtension = true;
    currentUser = data.user || null;
    currentProfile = data.profile || null;
    currentPricingOffer = data.offer || null;
    return Boolean(currentUser?.email && currentProfile);
  } catch (error) {
    console.error("Failed to apply pricing offer token:", error);
    return false;
  }
}

function bindPricingActions() {
  if (pricingActionsBound) return;
  pricingActionsBound = true;

  document
    .getElementById("btn-free")
    ?.addEventListener("click", () => handlePlanClick("free"));
  document
    .getElementById("btn-starter")
    ?.addEventListener("click", () => handlePlanClick("starter"));
  document
    .getElementById("btn-pro")
    ?.addEventListener("click", () => handlePlanClick("pro"));
  document
    .getElementById("btn-business")
    ?.addEventListener("click", () => handlePlanClick("business"));
  document
    .getElementById("btn-credit-pack")
    ?.addEventListener("click", handleCreditPackClick);
}

// Handle button clicks
async function handlePlanClick(planName) {
  trackEvent("pricing_plan_click", {
    plan: planName,
    context: hasExtension
      ? currentUser
        ? "signed_in_extension"
        : "signed_out_extension"
      : "no_extension",
  });

  const button = document.getElementById(`btn-${planName}`);
  const textSpan = button.querySelector(".btn-text");
  const originalText = textSpan.textContent;

  // Show loading state
  button.disabled = true;
  textSpan.textContent = "Loading...";

  try {
    if (!hasExtension) {
      // Download extension
      showStatusMessage(
        "Install AutoLister AI to start free or choose a plan.",
        "info",
      );
      trackEvent("pricing_install_required", { plan: planName });
      downloadExtension();
      return;
    }

    if (!currentUser) {
      showStatusMessage(pricingMessage("openingSignIn"), "info");
      trackEvent("pricing_signin_required", { plan: planName });
      const popupOpened = await openExtensionSignInPopup();
      showStatusMessage(
        popupOpened
          ? pricingMessage("popupOpened")
          : pricingMessage("manualSignIn"),
        "info",
      );
      startSignInRefreshPolling();
      return;
    }

    if (planName === "free") {
      // Already on free or trying to downgrade
      const currentTier = currentProfile?.subscription_status === "active"
        ? normalizeTier(currentProfile?.subscription_tier)
        : "free";
      if (currentTier === "free") {
        showStatusMessage("You are already on the Free plan.", "info");
        return;
      } else {
        // Redirect to customer portal to cancel
        await openCustomerPortal();
        return;
      }
    }

    // Handle paid plan selection
    const planAction = getPricingPlanAction(currentProfile, planName);

    if (planAction === "current_portal") {
      // Already on this plan - open customer portal
      await openCustomerPortal();
    } else if (planAction === "subscription_portal") {
      // Existing paid subscribers must update the current subscription, not
      // start a second Checkout subscription.
      await openCustomerPortal();
    } else {
      // Upgrade/switch plan
      await handlePaidPlanSelection(planName);
    }
  } catch (error) {
    console.error("Plan selection error:", error);
    showStatusMessage("Something went wrong while selecting that plan. Please try again.", "error");
  } finally {
    // Reset button state
    button.disabled = false;
    textSpan.textContent = originalText;
  }
}

// Handle paid plan selection (upgrade/switch)
async function handlePaidPlanSelection(planName) {
  const pendingWindow = openExternalWindow();

  try {
    trackEvent("checkout_start", { plan: planName, context: "pricing_page" });
    const response = await fetch(`${API_BASE}/api/stripe/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: currentUser.email,
        tier: planName,
        source: "pricing_page",
        utm: getUtmParams(),
      }),
    });

    const data = await response.json();

    if (response.ok && data.url) {
      showStatusMessage("Opening secure Stripe Checkout.", "success");
      trackEvent("checkout_opened", { plan: planName, context: "pricing_page" });
      sendExternalWindowToUrl(pendingWindow, data.url);
    } else {
      closeExternalWindow(pendingWindow);
      console.error("Checkout error:", data);
      showStatusMessage(data.error || "Unable to open Stripe Checkout. Please try again.", "error");
    }
  } catch (error) {
    closeExternalWindow(pendingWindow);
    console.error("Checkout error:", error);
    showStatusMessage("Connection issue while opening checkout. Please try again.", "error");
  }
}

async function handleCreditPackClick() {
  trackEvent("credit_pack_click", {
    context: hasExtension
      ? currentUser
        ? "signed_in_extension"
        : "signed_out_extension"
      : "no_extension",
  });

  const button = document.getElementById("btn-credit-pack");
  const textSpan = button?.querySelector(".btn-text");
  const originalText = textSpan?.textContent || "Buy credits";

  if (button) button.disabled = true;
  if (textSpan) textSpan.textContent = "Loading...";

  let pendingWindow = null;

  try {
    if (!hasExtension) {
      showStatusMessage(
        "Install AutoLister AI to start free, choose a plan, or buy credits.",
        "info",
      );
      trackEvent("pricing_install_required", { plan: "credit_pack" });
      downloadExtension();
      return;
    }

    if (!currentUser?.email) {
      showStatusMessage(pricingMessage("openingSignIn"), "info");
      trackEvent("pricing_signin_required", { plan: "credit_pack" });
      const popupOpened = await openExtensionSignInPopup();
      showStatusMessage(
        popupOpened
          ? pricingMessage("popupOpened")
          : pricingMessage("manualSignIn"),
        "info",
      );
      startSignInRefreshPolling();
      return;
    }

    pendingWindow = openExternalWindow();

    const response = await fetch(`${API_BASE}/api/stripe/create-credit-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: currentUser.email,
        source: "pricing_page",
        utm: getUtmParams(),
      }),
    });

    const data = await response.json();

    if (response.ok && data.url) {
      showStatusMessage("Opening secure Stripe Checkout.", "success");
      trackEvent("checkout_opened", {
        plan: "credit_pack",
        context: "pricing_page",
      });
      sendExternalWindowToUrl(pendingWindow, data.url);
    } else {
      closeExternalWindow(pendingWindow);
      console.error("Credit checkout error:", data);
      showStatusMessage(
        data.error || "Unable to open Stripe Checkout. Please try again.",
        "error",
      );
    }
  } catch (error) {
    closeExternalWindow(pendingWindow);
    console.error("Credit checkout error:", error);
    showStatusMessage("Connection issue while opening checkout. Please try again.", "error");
  } finally {
    if (button) button.disabled = false;
    if (textSpan) textSpan.textContent = originalText;
  }
}

// Open customer portal for existing subscribers
async function openCustomerPortal() {
  const pendingWindow = openExternalWindow();

  try {
    trackEvent("billing_portal_start", { context: "pricing_page" });
    const response = await fetch(`${API_BASE}/api/stripe/create-portal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: currentUser.email }),
    });

    const data = await response.json();

    if (response.ok && data.url) {
      showStatusMessage("Opening your Stripe customer portal.", "success");
      sendExternalWindowToUrl(pendingWindow, data.url);
    } else {
      closeExternalWindow(pendingWindow);
      console.error("Portal error:", data);
      showStatusMessage(data.error || "Unable to open your subscription portal. Please try again.", "error");
    }
  } catch (error) {
    closeExternalWindow(pendingWindow);
    console.error("Portal error:", error);
    showStatusMessage("Connection issue while opening your subscription portal. Please try again.", "error");
  }
}

// Download extension
function downloadExtension() {
  trackEvent("chrome_store_click", { context: "pricing_page" });
  window.open(
    "https://chromewebstore.google.com/detail/autolister-ai-vinted-desc/mommklhpammnlojjobejddmidmdcalcl?utm_source=autolister_site&utm_medium=website&utm_campaign=pricing_cta&utm_content=pricing_page",
    "_blank",
  );
}

// Initialize page
async function initializePage() {
  bindPricingActions();
  isPricingStateLoading = true;
  updateButtonStates();

  // Check URL parameters first (they have priority if coming from extension)
  const urlParams = new URLSearchParams(window.location.search);
  const offerToken = urlParams.get("offer") || urlParams.get("offer_token");
  const token = urlParams.get("token");
  let hasTrustedExtensionContext = false;

  if (offerToken) {
    hasTrustedExtensionContext = await applyPricingOfferToken(offerToken);

    if (hasTrustedExtensionContext) {
      console.log("Initialized from pricing offer token:", {
        userPlan: currentProfile?.subscription_tier,
        offerPlan: currentPricingOffer?.targetTier,
      });
    }
  }

  if (!hasTrustedExtensionContext && token) {
    // New token-based approach
    const userData = decodeUserData(token);
    if (userData && userData.source === "extension") {
      hasExtension = true;
      hasTrustedExtensionContext = true;

      if (userData.signed_in && userData.email) {
        // Create user object from decoded token
        currentUser = { id: userData.id || null, email: userData.email };
        currentProfile = {
          subscription_tier: userData.plan,
          subscription_status:
            userData.subscription_status ||
            (userData.plan !== "free" ? "active" : "free"),
        };
      }

      console.log("Initialized from extension token:", {
        hasExtension,
        userPlan: userData.plan,
        isSignedIn: userData.signed_in,
      });
    } else {
      console.warn(
        "Invalid or expired token, falling back to extension detection",
      );
      // Fall through to extension detection
    }
  } else {
    // Legacy approach - check old-style URL parameters
    const isFromExtension = urlParams.get("source") === "extension";

    if (isFromExtension) {
      // Use URL parameters when coming from extension (legacy support)
      hasExtension = true;
      const isSignedIn = urlParams.get("signed_in") === "true";
      const userPlan = urlParams.get("plan") || "free";
      const userEmail = urlParams.get("email") || "";

      if (isSignedIn && userEmail) {
        // Create user object from URL params
        currentUser = { email: userEmail };
        currentProfile = {
          subscription_tier: userPlan,
          subscription_status: userPlan !== "free" ? "active" : "free",
        };
      }
      hasTrustedExtensionContext = true;

      console.log("Initialized from extension URL params (legacy):", {
        hasExtension,
        isSignedIn,
        userPlan,
        userEmail,
      });
    }
  }

  // If no extension context found, fallback to extension detection for direct visits
  if (!hasTrustedExtensionContext) {
    hasExtension = await checkExtensionInstalled();

    if (hasExtension) {
      // Get user data from extension
      const userData = await getUserFromExtension();
      applyExtensionUserData(userData);
    }
  }

  // Update button states
  isPricingStateLoading = false;
  updateButtonStates();
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", initializePage);

// Refresh user data when page gains focus (in case user signed in through extension)
window.addEventListener("focus", async () => {
  if (hasExtension) {
    const userData = await getUserFromExtension();
    if (userData) {
      const userChanged = currentUser?.id !== userData.user?.id;
      const profileChanged =
        JSON.stringify(currentProfile) !== JSON.stringify(userData.profile);

      if (userChanged || profileChanged) {
        currentUser = userData.user;
        currentProfile = userData.profile;
        updateButtonStates();
      }
    }
  }
});
