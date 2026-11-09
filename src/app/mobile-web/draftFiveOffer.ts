import { trackMobileEvent } from "./analytics";
import { fetchMobileJson } from "./api";
import { rememberMobileBillingReturn, startMobileCheckout } from "./billing";
import type { MobileUsage } from "./generationClient";
import { getUiLocale, uiFormat, uiText } from "./ui";
import { formatPrice } from "../../utils/billingDisplay";
import { TIER_CONFIGS } from "../../../utils/tierConfig";

type Offer = { eligible: true; expiresAt: string; offerToken: string };
const context = {
  entryPoint: "draft_five_offer",
  reason: "free_lifetime_limit",
};

export function mountDraftFiveOffer(
  root: HTMLElement,
  userId: string,
  flush: () => Promise<void>,
  getMore?: () => void,
) {
  const meter = root.querySelector<HTMLElement>("[data-draft-free-meter]");
  const label = meter?.querySelector<HTMLElement>("[data-draft-free-label]");
  const ticks = meter?.querySelectorAll(".draft-free-ticks i");
  const more = meter?.querySelector<HTMLButtonElement>("[data-draft-get-more]");
  const region = root.querySelector<HTMLElement>("[data-draft-five-offer]");
  const button = region?.querySelector<HTMLButtonElement>("button");
  const terms = region?.querySelector<HTMLElement>("[data-draft-five-terms]");
  const status = region?.querySelector<HTMLElement>(
    "[data-draft-five-checkout-status]",
  );
  let offer: Offer | null = null;
  let isResult = false;
  let eligible = false;
  let request = 0;
  let checked = false;
  let shown = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  const render = () => {
    if (!region || !terms) return;
    const showOffer =
      eligible && isResult && offer && Date.parse(offer.expiresAt) > Date.now();
    region.hidden = !showOffer;
    if (!showOffer || !offer) return;
    const locale = getUiLocale();
    const expiry = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(offer.expiresAt));
    terms.textContent = uiFormat("Then {0}/month. Offer ends {1}.", [
      formatPrice(TIER_CONFIGS.pro.monthlyPrice, locale),
      expiry,
    ]);
    if (!shown) {
      shown = true;
      void trackMobileEvent(
        "web_paywall_view",
        { ...context, tier: "pro" },
        userId,
      );
    }
  };

  const checkout = async () => {
    if (!button || !status || !offer || !eligible || button.disabled) return;
    const selected = offer;
    const attempt = request;
    if (Date.parse(selected.expiresAt) <= Date.now()) {
      render();
      return;
    }
    button.disabled = true;
    status.hidden = true;
    try {
      await flush();
      if (request !== attempt) return;
      const session = await startMobileCheckout(
        "pro",
        userId,
        context,
        selected.offerToken,
      );
      if (request !== attempt) return;
      rememberMobileBillingReturn(userId);
      window.location.assign(session.url);
    } catch {
      if (request !== attempt) return;
      status.textContent = uiText("Could not open checkout. Try again.");
      status.hidden = false;
    } finally {
      button.disabled = false;
    }
  };
  button?.addEventListener("click", checkout);
  if (getMore) more?.addEventListener("click", getMore);

  return {
    setResult(visible: boolean) {
      isResult = visible;
      render();
    },
    updateUsage(usage: MobileUsage) {
      if (meter && label && ticks) {
        const freeRemaining = usage.remaining?.freeLifetime;
        const limit = usage.limits?.freeLifetime;
        if (
          usage.plan?.tier === "free" &&
          limit === ticks.length &&
          typeof freeRemaining === "number" &&
          Number.isFinite(freeRemaining)
        ) {
          const remaining = Math.max(0, Math.min(limit, freeRemaining));
          ticks.forEach((tick, index) =>
            tick.toggleAttribute("data-available", index < remaining),
          );
          const text = remaining
            ? uiFormat("{0} of {1} free drafts left", [remaining, limit])
            : uiText("No free drafts left");
          if (label.textContent !== text) label.textContent = text;
          meter.hidden = false;
        } else {
          meter.hidden = true;
        }
      }
      if (!region) return;
      const canSeeOffer =
        usage.plan?.tier === "free" &&
        usage.remaining?.freeLifetime === 0 &&
        usage.blockedReason === "free_lifetime_limit";
      if (canSeeOffer !== eligible) {
        request++;
        checked = false;
        offer = null;
        eligible = canSeeOffer;
        clearTimeout(expiryTimer);
      }
      render();
      if (!eligible || checked) return;
      checked = true;
      const attempt = request;
      void fetchMobileJson<Offer | { eligible: false }>(
        "/api/user/limit-followup-offer?surface=web",
        {},
        { expectedUserId: userId, retryOn401: true },
      )
        .then((result) => {
          if (request !== attempt || !result.eligible) return;
          const delay = Date.parse(result.expiresAt) - Date.now();
          if (!Number.isFinite(delay) || delay <= 0 || !result.offerToken)
            return;
          offer = result;
          expiryTimer = setTimeout(render, delay);
          render();
        })
        .catch(() => {
          if (request === attempt) checked = false;
        });
    },
    dispose() {
      request++;
      clearTimeout(expiryTimer);
      button?.removeEventListener("click", checkout);
      if (getMore) more?.removeEventListener("click", getMore);
      if (meter) meter.hidden = true;
      if (region) region.hidden = true;
    },
  };
}
