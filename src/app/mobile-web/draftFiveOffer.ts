import { fetchMobileJson } from "./api";
import type { MobileUsage } from "./generationClient";
import { getUiLocale, uiFormat, uiLanguageTag, uiText } from "./ui";
import { formatPrice } from "../../utils/billingDisplay";
import { TIER_CONFIGS } from "../../../utils/tierConfig";

export type DraftFiveOffer = {
  eligible: true;
  expiresAt: string;
  offerToken: string;
};
export function mountDraftFiveOffer(
  root: HTMLElement,
  userId: string,
  getMore?: () => void,
  openOffer?: () => void,
) {
  const meter = root.querySelector<HTMLElement>("[data-draft-free-meter]");
  const free = meter?.querySelector<HTMLElement>("[data-draft-free-status]");
  const label = free?.querySelector<HTMLElement>("[data-draft-free-label]");
  const ticks = free?.querySelectorAll(".draft-free-ticks i");
  const credits = meter?.querySelector<HTMLElement>(
    "[data-draft-usage-credits]",
  );
  const creditsValue = credits?.querySelector<HTMLElement>(
    "[data-draft-credits-value]",
  );
  const number = new Intl.NumberFormat(uiLanguageTag());
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, value)
      : null;

  function renderMeter(usage: MobileUsage) {
    if (!meter || !free || !label || !ticks || !credits || !creditsValue)
      return;
    const plan = usage.plan;
    const subscribed =
      (plan?.isPaid === true || Boolean(plan?.tier && plan.tier !== "free")) &&
      (!plan?.status || ["active", "trialing"].includes(plan.status));
    const creditCount = count(usage.remaining?.packCredits);
    const freeLimit = count(usage.limits?.freeLifetime);
    const freeRemaining = count(usage.remaining?.freeLifetime);
    const showFree =
      !subscribed &&
      !creditCount &&
      freeLimit !== null &&
      freeRemaining !== null;

    free.hidden = !showFree;
    if (showFree) {
      const remaining = Math.min(freeLimit, freeRemaining);
      const text = remaining
        ? uiFormat("{0} of {1} free drafts left", [
            number.format(remaining),
            number.format(freeLimit),
          ])
        : uiText("No free drafts left");
      if (label.textContent !== text) label.textContent = text;
      const showTicks = freeLimit === ticks.length;
      const tickGroup = free.querySelector<HTMLElement>(".draft-free-ticks");
      if (tickGroup) tickGroup.hidden = !showTicks;
      ticks.forEach((tick, index) =>
        tick.toggleAttribute("data-available", showTicks && index < remaining),
      );
    }

    for (const [period, alias] of [
      ["daily", "day"],
      ["monthly", "month"],
    ] as const) {
      const cell = meter.querySelector<HTMLElement>(
        `[data-draft-quota="${period}"]`,
      )!;
      cell.hidden = !subscribed;
      if (!subscribed) continue;
      const limit = count(usage.limits?.[period]);
      const remaining = count(
        usage.remaining?.[period] ?? usage.remaining?.[alias],
      );
      const used =
        limit !== null && remaining !== null
          ? Math.max(0, limit - remaining)
          : null;
      const value = cell.querySelector<HTMLElement>(
        "[data-draft-quota-value]",
      )!;
      const track = cell.querySelector<HTMLElement>(".draft-usage-track")!;
      const text =
        usage.limits?.[period] === null
          ? uiText("Unlimited")
          : limit !== null && used !== null
            ? `${number.format(used)} / ${number.format(limit)}`
            : "–";
      if (value.textContent !== text) value.textContent = text;
      track.hidden = used === null || !limit;
      track.style.setProperty(
        "--draft-usage-percent",
        `${used !== null && limit ? (100 * used) / limit : 0}%`,
      );
    }

    credits.hidden = !(
      creditCount ||
      (!subscribed && !showFree && creditCount !== null)
    );
    const text = number.format(creditCount ?? 0);
    if (creditsValue.textContent !== text) creditsValue.textContent = text;
    meter.hidden = !subscribed && !showFree && credits.hidden;
  }
  const more = meter?.querySelector<HTMLButtonElement>("[data-draft-get-more]");
  const region = root.querySelector<HTMLElement>("[data-draft-five-offer]");
  const button = region?.querySelector<HTMLButtonElement>("button");
  const terms = region?.querySelector<HTMLElement>("[data-draft-five-terms]");
  let offer: DraftFiveOffer | null = null;
  let isResult = false;
  let eligible = false;
  let request = 0;
  let lookup: Promise<DraftFiveOffer | null> | undefined;
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
  };
  if (openOffer) button?.addEventListener("click", openOffer);
  if (getMore) more?.addEventListener("click", getMore);

  function getOffer(): Promise<DraftFiveOffer | null> {
    if (!lookup) {
      const attempt = request;
      lookup = fetchMobileJson<DraftFiveOffer | { eligible: false }>(
        "/api/user/limit-followup-offer?surface=web",
        {},
        { expectedUserId: userId, retryOn401: true },
      )
        .then((result) => {
          if (attempt !== request || !result.eligible) return null;
          const delay = Date.parse(result.expiresAt) - Date.now();
          if (!Number.isFinite(delay) || !result.offerToken)
            throw new Error("Invalid offer");
          if (delay <= 0) return null;
          offer = result;
          expiryTimer = setTimeout(render, delay);
          render();
          return result;
        })
        .catch((error) => {
          if (attempt === request) lookup = undefined;
          throw error;
        });
    }
    return lookup.then((result) =>
      result && Date.parse(result.expiresAt) > Date.now() ? result : null,
    );
  }

  return {
    getOffer,
    setResult(visible: boolean) {
      isResult = visible;
      render();
    },
    updateUsage(usage: MobileUsage) {
      renderMeter(usage);
      if (!region) return;
      const canSeeOffer =
        usage.plan?.tier === "free" &&
        usage.remaining?.freeLifetime === 0 &&
        usage.blockedReason === "free_lifetime_limit";
      if (canSeeOffer !== eligible) {
        request++;
        lookup = undefined;
        offer = null;
        eligible = canSeeOffer;
        clearTimeout(expiryTimer);
      }
      render();
      if (eligible) void getOffer().catch(() => {});
    },
    dispose() {
      request++;
      clearTimeout(expiryTimer);
      if (openOffer) button?.removeEventListener("click", openOffer);
      if (getMore) more?.removeEventListener("click", getMore);
      if (meter) meter.hidden = true;
      if (region) region.hidden = true;
    },
  };
}
