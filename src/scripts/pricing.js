// Original Pricing Page Logic starts here
// API Base URL - Use current origin to avoid CORS issues
const API_BASE = window.location.origin;

// Current user state
let currentUser = null;
let currentProfile = null;
let hasExtension = false;

// Plan configuration
const PLAN_CONFIG = {
  free: { name: "Free", price: 0 },
  unlimited_monthly: { name: "Starter", price: 3.99 }, // Legacy support
  starter: { name: "Starter", price: 3.99 },
  pro: { name: "Pro", price: 9.99 },
  business: { name: "Business", price: 19.99 },
};

// Check if extension is installed
async function checkExtensionInstalled() {
  return new Promise((resolve) => {
    // Try to communicate with extension
    if (window.chrome && chrome.runtime) {
      try {
        chrome.runtime.sendMessage(
          "mommklhpammnlojjobejddmidmdcalcl",
          { type: "PING" },
          (response) => {
            resolve(!!response);
          },
        );
      } catch (e) {
        resolve(false);
      }
    } else {
      resolve(false);
    }
    // Timeout after 1 second
    setTimeout(() => resolve(false), 1000);
  });
}

// Get user data from extension
async function getUserFromExtension() {
  return new Promise((resolve) => {
    if (!hasExtension) {
      resolve(null);
      return;
    }

    try {
      chrome.runtime.sendMessage(
        "mommklhpammnlojjobejddmidmdcalcl",
        { type: "GET_USER_PROFILE" },
        (response) => {
          resolve(response);
        },
      );
    } catch (e) {
      resolve(null);
    }
    // Timeout after 2 seconds
    setTimeout(() => resolve(null), 2000);
  });
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

  const currentTier = currentProfile?.subscription_tier || "free";
  const isActive = currentProfile?.subscription_status === "active";

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

    if (!hasExtension) {
      textSpan.textContent = "Download Extension";
      statusSpan.textContent = "";
      button.classList.add("state-download");
    } else if (!currentUser) {
      textSpan.textContent =
        plan === "free" ? "Sign In to Start" : "Sign In to Subscribe";
      statusSpan.textContent = "";
      button.classList.add("state-signin");
    } else if (
      isActive &&
      (currentTier === plan ||
        (currentTier === "unlimited_monthly" && plan === "starter"))
    ) {
      textSpan.textContent = "Current Plan";
      statusSpan.textContent = "✓ Active";
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
        const currentPlanConfig = PLAN_CONFIG[currentTier];
        textSpan.textContent =
          planConfig.price > currentPlanConfig.price
            ? `Upgrade to ${planConfig.name}`
            : `Switch to ${planConfig.name}`;
        statusSpan.textContent = "";
      }
    }
  });
}

// Handle button clicks
async function handlePlanClick(planName) {
  const button = document.getElementById(`btn-${planName}`);
  const textSpan = button.querySelector(".btn-text");
  const originalText = textSpan.textContent;

  // Show loading state
  button.disabled = true;
  textSpan.textContent = "Loading...";

  try {
    if (!hasExtension) {
      // Download extension
      downloadExtension();
      return;
    }

    if (!currentUser) {
      // Prompt to sign in through extension
      // IMPORTANT: Using custom modal/message box instead of alert()
      console.log(
        "User not signed in. Please sign in through the AutoLister AI extension first, then return to this page.",
      );
      // In a real app, you would show a modal here.
      return;
    }

    if (planName === "free") {
      // Already on free or trying to downgrade
      if (currentProfile?.subscription_tier === "free") {
        console.log("You are already on the free plan!");
        return;
      } else {
        // Redirect to customer portal to cancel
        await openCustomerPortal();
        return;
      }
    }

    // Handle paid plan selection
    const currentTier = currentProfile?.subscription_tier || "free";
    const isActive = currentProfile?.subscription_status === "active";

    if (
      isActive &&
      (currentTier === planName ||
        (currentTier === "unlimited_monthly" && planName === "starter"))
    ) {
      // Already on this plan - open customer portal
      await openCustomerPortal();
    } else {
      // Upgrade/switch plan
      await handlePaidPlanSelection(planName);
    }
  } catch (error) {
    console.error("Plan selection error:", error);
    // In a real app, you would show an error modal here.
  } finally {
    // Reset button state
    button.disabled = false;
    textSpan.textContent = originalText;
  }
}

// Handle paid plan selection (upgrade/switch)
async function handlePaidPlanSelection(planName) {
  try {
    const response = await fetch(`${API_BASE}/api/stripe/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: currentUser.email,
        tier: planName,
      }),
    });

    const data = await response.json();

    if (response.ok && data.url) {
      window.open(data.url, "_blank");
    } else {
      console.error("Checkout error:", data);
      // In a real app, you would show an error modal here.
    }
  } catch (error) {
    console.error("Checkout error:", error);
    // In a real app, you would show an error modal here.
  }
}

// Open customer portal for existing subscribers
async function openCustomerPortal() {
  try {
    const response = await fetch(`${API_BASE}/api/stripe/create-portal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: currentUser.email }),
    });

    const data = await response.json();

    if (response.ok && data.url) {
      window.open(data.url, "_blank");
    } else {
      console.error("Portal error:", data);
      // In a real app, you would show an error modal here.
    }
  } catch (error) {
    console.error("Portal error:", error);
    // In a real app, you would show an error modal here.
  }
}

// Download extension
function downloadExtension() {
  window.open(
    "https://chromewebstore.google.com/detail/autolister-ai/mommklhpammnlojjobejddmidmdcalcl",
    "_blank",
  );
}

// Initialize page
async function initializePage() {
  // Check URL parameters first (they have priority if coming from extension)
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  if (token) {
    // New token-based approach
    const userData = decodeUserData(token);
    if (userData && userData.source === "extension") {
      hasExtension = true;

      if (userData.signed_in && userData.email) {
        // Create user object from decoded token
        currentUser = { email: userData.email };
        currentProfile = {
          subscription_tier: userData.plan,
          subscription_status: userData.plan !== "free" ? "active" : "free",
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

      console.log("Initialized from extension URL params (legacy):", {
        hasExtension,
        isSignedIn,
        userPlan,
        userEmail,
      });
    }
  }

  // If no extension context found, fallback to extension detection for direct visits
  if (!hasExtension) {
    hasExtension = await checkExtensionInstalled();

    if (hasExtension) {
      // Get user data from extension
      const userData = await getUserFromExtension();
      if (userData) {
        currentUser = userData.user;
        currentProfile = userData.profile;
      }
    }
  }

  // Update button states
  updateButtonStates();

  // Add event listeners
  document
    .getElementById("btn-free")
    .addEventListener("click", () => handlePlanClick("free"));
  document
    .getElementById("btn-starter")
    .addEventListener("click", () => handlePlanClick("starter"));
  document
    .getElementById("btn-pro")
    .addEventListener("click", () => handlePlanClick("pro"));
  document
    .getElementById("btn-business")
    .addEventListener("click", () => handlePlanClick("business"));
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
