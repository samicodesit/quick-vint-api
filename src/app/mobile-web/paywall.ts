import { normalizeSiteLocale } from "../../i18n/site";
import type { DraftFiveOffer } from "./draftFiveOffer";
import { getUiLocale, localizeUiFragment, uiText } from "./ui";
import { getMobilePaywall } from "./paywallPolicy";
import {
  openMobilePortal,
  startMobileCheckout,
  startMobileCreditCheckout,
  rememberMobileBillingReturn,
  type MobileBillingTier,
} from "./billing";
import { trackMobileEvent } from "./analytics";
import type { MobileUsage } from "./generationClient";
import {
  proIntroPriceCents,
  CREDIT_PACK_CONFIGS,
  getCreditPackConfig,
  TIER_CONFIGS,
  type CreditPackId,
} from "../../../utils/tierConfig";
import { getBillingCopy, formatPrice } from "../../utils/billingDisplay";

const support =
  "mailto:support@autolister.app?subject=AutoLister%20AI%20account%20review";
const names = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

export type MobilePaywallEntryPoint =
  | "profile_menu"
  | "draft_five_offer"
  | "feature_lock"
  | "plans_link"
  | "generation_limit"
  | "unknown";

export function mountMobilePaywall(
  root: HTMLElement,
  options: {
    getProOffer?: () => Promise<DraftFiveOffer | null>;
    userId: () => string | undefined;
    flush: () => Promise<void>;
  },
) {
  const locale = getUiLocale();
  const billingCopy = getBillingCopy(locale);
  const dialog = document.createElement("dialog");
  dialog.className = "mobile-paywall combined-pricing";
  dialog.setAttribute("aria-labelledby", "mobile-paywall-title");
  dialog.innerHTML = `<div class="mobile-paywall-heading"><img src="/favicon-96x96.png" width="40" height="40" alt="" /><div><span class="mobile-paywall-brand">AutoLister AI</span><h2 id="mobile-paywall-title" tabindex="-1"></h2></div><button type="button" aria-label="Close paid options">×</button></div><div class="mobile-paywall-body"><p data-paywall-copy></p><div data-paywall-options role="group" aria-label="Paid options"></div><p role="status" data-paywall-status hidden></p><a data-paywall-support href="${support}" hidden>Contact support</a></div><div class="mobile-paywall-footer"><p class="mobile-paywall-trust" data-paywall-trust></p></div>`;
  const compare = document.createElement("a");
  compare.className = "paywall-compare";
  compare.textContent = billingCopy.compareFeatures;
  const siteLocale = normalizeSiteLocale(locale);
  compare.href = siteLocale === "en" ? "/pricing" : `/${siteLocale}/pricing`;
  compare.target = "_blank";
  compare.rel = "noopener noreferrer";
  compare.hidden = true;
  dialog.querySelector(".mobile-paywall-footer")!.append(compare);
  localizeUiFragment(dialog);
  root.append(dialog);
  const find = (selector: string) =>
    dialog.querySelector<HTMLElement>(selector)!;
  let previous: HTMLElement | null = null;
  let overflow = "";
  let busy = false;
  let repaintWhenIdle: (() => void) | undefined;
  let disposed = false;
  let revision = 0;
  let paywallContext: {
    reason: string;
    entryPoint: MobilePaywallEntryPoint;
    method: "combined_pricing";
  } = {
    reason: "paid_options",
    entryPoint: "unknown",
    method: "combined_pricing",
  };
  const restore = () => {
    if (dialog.open) return;
    document.body.style.overflow = overflow;
    previous?.focus({ preventScroll: true });
  };
  const close = () => {
    revision++;
    dialog.close();
    restore();
  };
  const checkout = async (
    tier: MobileBillingTier | CreditPackId | "manage",
    option: HTMLButtonElement,
    proOffer?: DraftFiveOffer | null,
  ) => {
    if (busy || disposed || !dialog.open) return;
    const userId = options.userId();
    if (!userId) return;
    const attempt = revision;
    const active = () =>
      !disposed &&
      dialog.open &&
      revision === attempt &&
      options.userId() === userId;
    const controls = dialog.querySelectorAll<HTMLButtonElement>(
      "[data-paywall-options] button",
    );
    busy = true;
    controls.forEach((control) => (control.disabled = true));
    option.setAttribute("aria-busy", "true");
    const status = find("[data-paywall-status]");
    status.hidden = true;
    try {
      await options.flush();
      if (!active()) return;
      const pack = getCreditPackConfig(tier);
      const session =
        tier === "manage"
          ? await openMobilePortal(userId)
          : pack
            ? await startMobileCreditCheckout(pack.id, userId, paywallContext)
            : await startMobileCheckout(
                tier as MobileBillingTier,
                userId,
                paywallContext,
                proOffer?.offerToken,
              );
      if (active()) {
        rememberMobileBillingReturn(userId);
        window.location.assign(session.url);
      }
    } catch {
      if (active()) {
        status.textContent = billingCopy.checkoutError;
        status.hidden = false;
        status.scrollIntoView({ block: "nearest" });
      }
    } finally {
      busy = false;
      if (!disposed) {
        option.removeAttribute("aria-busy");
        controls.forEach(
          (control) =>
            (control.disabled = control.dataset.pricePending === "true"),
        );
        if (repaintWhenIdle && active()) {
          const message = status.hidden ? "" : status.textContent;
          repaintWhenIdle();
          if (message) {
            status.textContent = message;
            status.hidden = false;
          }
        }
        repaintWhenIdle = undefined;
        if (active() && !status.hidden)
          find(`button[value="${tier}"]`)?.focus({ preventScroll: true });
      }
    }
  };
  find("button").addEventListener("click", close);
  find("button").setAttribute("aria-label", billingCopy.closePaywall);
  dialog.addEventListener("click", (event) => {
    const box = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    )
      close();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  return {
    show(
      usage: MobileUsage,
      requested?: string,
      entryPoint: MobilePaywallEntryPoint = "unknown",
    ): boolean {
      const policy = getMobilePaywall(usage, requested, locale);
      if (!policy || disposed || busy) return false;
      paywallContext = {
        reason: requested || usage.blockedReason || "paid_options",
        entryPoint,
        method: "combined_pricing",
      };
      dialog.querySelector<HTMLImageElement>(
        ".mobile-paywall-heading img",
      )!.src =
        paywallContext.reason === "account_paused"
          ? "/account-paused-paywall.webp"
          : "/favicon-96x96.png";
      const showing = ++revision;
      const owner = options.userId();
      const reason = paywallContext.reason;
      const hasPlans = policy.options.some(
        (tier) => tier === "starter" || tier === "pro" || tier === "business",
      );
      const allowsPacks = policy.options.includes("credit_pack");
      compare.hidden = !hasPlans;
      find("[data-paywall-copy]").hidden = [
        "plans",
        "credits",
        "feature",
        "free_lifetime_limit",
      ].includes(reason);
      find("[data-paywall-trust]").hidden = !policy.support && hasPlans;
      let proOffer: DraftFiveOffer | null = null;
      let failed = false;
      let checking = Boolean(
        policy.options.includes("pro") &&
        options.getProOffer &&
        usage.plan?.tier === "free" &&
        usage.remaining?.freeLifetime === 0 &&
        usage.blockedReason === "free_lifetime_limit",
      );
      find("h2").textContent =
        reason === "plans" || reason === "credits"
          ? billingCopy.title
          : policy.title;
      find("[data-paywall-copy]").textContent = policy.message;
      find("[data-paywall-trust]").textContent = policy.trust;
      find("[data-paywall-support]").hidden = !policy.support;
      find("[data-paywall-status]").hidden = true;
      const list = find("[data-paywall-options]");
      const render = () => {
        const focusedTier =
          document.activeElement instanceof HTMLButtonElement &&
          list.contains(document.activeElement)
            ? document.activeElement.value
            : null;
        list.replaceChildren();
        find("[data-paywall-status]").hidden = true;
        const group = (heading: string, terms: string, kind: string) => {
          const section = document.createElement("section");
          section.className = "price-group " + kind;
          const title = document.createElement("h3");
          title.textContent = heading;
          const description = document.createElement("p");
          description.textContent = terms;
          const items = document.createElement("div");
          items.className = "price-group-items";
          section.append(title, description, items);
          list.append(section);
          return items;
        };
        const monthly = hasPlans
          ? group(
              billingCopy.monthlyPlans,
              billingCopy.monthlyTerms,
              "subscriptions",
            )
          : list;
        const packs = allowsPacks
          ? group(
              billingCopy.oneTimeListingCredits,
              billingCopy.creditValidity,
              "credit-packs",
            )
          : list;
        const choices = policy.options.flatMap((tier) =>
          tier === "credit_pack"
            ? CREDIT_PACK_CONFIGS.map((pack) => pack.id)
            : [tier],
        );
        choices.forEach((tier) => {
          if (tier === "support") {
            const link = document.createElement("a");
            link.href =
              "mailto:support@autolister.app?subject=AutoLister%20AI%20tailored%20limits";
            link.textContent = uiText("Contact us for tailored limits");
            list.append(link);
            return;
          }
          const button = document.createElement("button");
          button.type = "button";
          button.value = tier;
          button.className = "mobile-paywall-option";
          const discount = tier === "pro" ? proOffer : null;
          button.disabled = tier === "pro" && checking;
          if (button.disabled) button.dataset.pricePending = "true";
          button.addEventListener("click", () => {
            if (
              tier === "pro" &&
              (failed ||
                (discount && Date.parse(discount.expiresAt) <= Date.now()))
            ) {
              refreshProPrice();
              return;
            }
            void checkout(tier, button, discount);
          });
          const pack = getCreditPackConfig(tier);
          const fallbackPlan = ["starter", "pro", "business"].includes(tier)
            ? TIER_CONFIGS[tier as "starter" | "pro" | "business"]
            : null;
          const label =
            tier === "manage"
              ? uiText("Update payment")
              : pack
                ? billingCopy.creditCount.replace(
                    "{credits}",
                    String(pack.credits),
                  )
                : names[tier as keyof typeof names];
          const price =
            tier === "manage"
              ? null
              : pack
                ? pack.priceEur
                : ((
                    usage.pricing?.tiers as
                      | Record<string, { monthly?: number }>
                      | undefined
                  )?.[tier]?.monthly ?? fallbackPlan?.monthlyPrice);
          const title = document.createElement("strong");
          title.textContent = label;
          const copy = document.createElement("span");
          copy.className = "mobile-paywall-option-copy";
          copy.append(title);
          const plan =
            (
              usage.pricing?.tiers as
                | Record<string, { dailyLimit?: number; monthlyLimit?: number }>
                | undefined
            )?.[tier] ??
            (fallbackPlan
              ? {
                  dailyLimit: fallbackPlan.limits.daily,
                  monthlyLimit: fallbackPlan.limits.monthly,
                }
              : undefined);
          const limits = pack
            ? ""
            : plan &&
                typeof plan.dailyLimit === "number" &&
                typeof plan.monthlyLimit === "number"
              ? billingCopy.limits
                  .replace("{daily}", String(plan.dailyLimit))
                  .replace("{monthly}", String(plan.monthlyLimit))
              : "";
          let amountText = "";
          let detailText = "";
          if (typeof price === "number" && Number.isFinite(price)) {
            const regular = formatPrice(price, locale);
            if (button.disabled) amountText = "…";
            else if (tier === "pro" && failed) amountText = uiText("Try again");
            else if (discount) {
              amountText = billingCopy.firstMonthPrice.replace(
                "{price}",
                formatPrice(proIntroPriceCents(price) / 100, locale),
              );
              detailText = billingCopy.renewalPrice.replace("{price}", regular);
            } else {
              amountText = pack ? regular : regular + billingCopy.perMonth;
            }
          }
          button.setAttribute(
            "aria-label",
            [label, amountText, discount && detailText, limits]
              .filter(Boolean)
              .join(", "),
          );
          if (limits) {
            const detail = document.createElement("small");
            detail.textContent = limits;
            copy.append(detail);
          }
          button.append(copy);
          const side = document.createElement("span");
          side.className = "mobile-paywall-option-side";
          if (amountText) {
            const amount = document.createElement("span");
            amount.textContent = amountText;
            side.append(amount);
            if (detailText) {
              const detail = document.createElement("small");
              detail.textContent = detailText;
              side.append(detail);
            }
          }
          const arrow = document.createElement("span");
          arrow.className = "mobile-paywall-option-arrow";
          arrow.setAttribute("aria-hidden", "true");
          arrow.textContent = "›";
          button.append(side, arrow);
          (pack ? packs : monthly).append(button);
        });
        if (focusedTier)
          Array.from(list.querySelectorAll<HTMLButtonElement>("button"))
            .find((button) => button.value === focusedTier && !button.disabled)
            ?.focus({ preventScroll: true });
      };
      function refreshProPrice() {
        if (!options.getProOffer) return;
        checking = true;
        failed = false;
        proOffer = null;
        render();
        const stillOpen = () =>
          !disposed && revision === showing && options.userId() === owner;
        void options
          .getProOffer()
          .then((offer) => {
            if (stillOpen()) proOffer = offer;
          })
          .catch(() => {
            if (stillOpen()) failed = true;
          })
          .finally(() => {
            if (!stillOpen()) return;
            checking = false;
            if (busy) repaintWhenIdle = render;
            else render();
          });
      }
      if (checking) refreshProPrice();
      else render();
      if (!dialog.open) {
        previous =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialog.showModal();
        const focusTarget =
          (requested === "credits" &&
            list.querySelector<HTMLElement>(".credit-packs button")) ||
          find("h2");
        focusTarget.focus();
        void trackMobileEvent("web_paywall_view", {
          ...paywallContext,
          tier: usage.plan?.tier,
        });
      }
      return true;
    },
    dispose() {
      disposed = true;
      if (dialog.open) close();
      dialog.remove();
    },
  };
}
