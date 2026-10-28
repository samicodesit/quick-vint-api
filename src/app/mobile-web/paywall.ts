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
  CREDIT_PACK_CONFIGS,
  getCreditPackConfig,
  TIER_CONFIGS,
  type CreditPackId,
} from "../../../utils/tierConfig";
import {
  getBillingCopy,
  formatPrice,
  formatUnitPrice,
} from "../../utils/billingDisplay";

const support =
  "mailto:support@autolister.app?subject=AutoLister%20AI%20account%20review";
const names = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  credit_pack: "One-time credits",
};

export type MobilePaywallEntryPoint =
  | "profile_menu"
  | "feature_lock"
  | "plans_link"
  | "generation_limit"
  | "unknown";

export function mountMobilePaywall(
  root: HTMLElement,
  options: {
    userId: () => string | undefined;
    flush: () => Promise<void>;
  },
) {
  const locale = navigator.language || "en";
  const billingCopy = getBillingCopy(locale);
  const dialog = document.createElement("dialog");
  dialog.className = "mobile-paywall";
  dialog.setAttribute("aria-labelledby", "mobile-paywall-title");
  dialog.innerHTML = `<div class="mobile-paywall-heading"><img src="/favicon-96x96.png" width="40" height="40" alt="" /><div><span class="mobile-paywall-brand">AutoLister AI</span><h2 id="mobile-paywall-title" tabindex="-1"></h2></div><button type="button" aria-label="Close paid options">×</button></div><div class="mobile-paywall-body"><p data-paywall-copy></p><div data-paywall-options role="group" aria-label="Paid options"></div><p role="status" data-paywall-status hidden></p><a data-paywall-support href="${support}" hidden>Contact support</a></div><div class="mobile-paywall-footer"><button type="button" class="mobile-primary-button" data-paywall-continue hidden></button><p class="mobile-paywall-trust" data-paywall-trust></p></div>`;
  root.append(dialog);
  const tabs = document.createElement("div");
  tabs.className = "mobile-paywall-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", billingCopy.title);
  for (const mode of ["monthly", "once"] as const) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.dataset.billingMode = mode;
    tab.textContent =
      mode === "monthly" ? billingCopy.monthly : billingCopy.oneTime;
    tabs.append(tab);
  }
  dialog.querySelector("[data-paywall-options]")!.before(tabs);
  const billingNote = document.createElement("p");
  billingNote.className = "mobile-paywall-unit-note";
  dialog.querySelector("[data-paywall-options]")!.after(billingNote);
  const find = (selector: string) =>
    dialog.querySelector<HTMLElement>(selector)!;
  let previous: HTMLElement | null = null;
  let overflow = "";
  let busy = false;
  let disposed = false;
  let revision = 0;
  let selectedTier: MobileBillingTier | CreditPackId | undefined;
  let paywallContext: { reason: string; entryPoint: MobilePaywallEntryPoint } =
    {
      reason: "paid_options",
      entryPoint: "unknown",
    };
  const proceed = find("[data-paywall-continue]") as HTMLButtonElement;
  const continueLabel = () => {
    const pack = getCreditPackConfig(selectedTier ?? null);
    return pack
      ? billingCopy.buy.replace("{credits}", String(pack.credits))
      : selectedTier === "credit_pack"
        ? billingCopy.buyCredits
        : selectedTier
          ? billingCopy.continueWith.replace(
              "{plan}",
              names[selectedTier as MobileBillingTier],
            )
          : "";
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
    const controls = dialog.querySelectorAll<
      HTMLInputElement | HTMLButtonElement
    >(
      "[data-paywall-options] input, [data-paywall-options] button, [data-paywall-continue], [data-billing-mode]",
    );
    busy = true;
    controls.forEach((control) => (control.disabled = true));
    proceed.textContent = billingCopy.openingCheckout;
    proceed.setAttribute("aria-busy", "true");
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
        proceed.textContent = continueLabel();
        proceed.removeAttribute("aria-busy");
        controls.forEach((control) => (control.disabled = false));
      }
    }
  };
  proceed.addEventListener("click", () => {
    if (selectedTier) void checkout(selectedTier);
  });
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
      };
      dialog.querySelector<HTMLImageElement>(
        ".mobile-paywall-heading img",
      )!.src =
        paywallContext.reason === "account_paused"
          ? "/account-paused-paywall.webp"
          : "/favicon-96x96.png";
      revision++;
      proceed.hidden = true;
      find("h2").textContent = policy.title;
      find("[data-paywall-copy]").textContent = policy.message;
      find("[data-paywall-trust]").textContent = policy.trust;
      find("[data-paywall-support]").hidden = !policy.support;
      find("[data-paywall-status]").hidden = true;
      const list = find("[data-paywall-options]");
      const allowsPacks = policy.options.includes("credit_pack");
      let mode: "monthly" | "once" =
        requested === "credits" ||
        (allowsPacks &&
          !policy.options.some((tier) =>
            ["starter", "pro", "business"].includes(tier),
          ))
          ? "once"
          : "monthly";
      tabs.hidden = !allowsPacks;
      const render = () => {
        selectedTier = undefined;
        proceed.hidden = true;
        list.replaceChildren();
        billingNote.hidden =
          !allowsPacks &&
          !policy.options.some((tier) =>
            ["starter", "pro", "business"].includes(tier),
          );
        billingNote.textContent =
          mode === "once" ? billingCopy.terms : billingCopy.qualifier;
        find("[data-paywall-trust]").textContent =
          mode === "once" ? billingCopy.oneTimeTrust : policy.trust;
        find("[data-paywall-status]").hidden = true;
        tabs.querySelectorAll<HTMLButtonElement>("button").forEach((tab) => {
          const selected = tab.dataset.billingMode === mode;
          tab.setAttribute("aria-selected", String(selected));
          tab.tabIndex = selected ? 0 : -1;
        });
        const choices =
          mode === "once"
            ? [
                ...CREDIT_PACK_CONFIGS.map((pack) => pack.id),
                ...policy.options.filter((tier) => tier === "support"),
              ]
            : policy.options.filter((tier) => tier !== "credit_pack");
        choices.forEach((tier) => {
          if (tier === "support") {
            const link = document.createElement("a");
            link.href =
              "mailto:support@autolister.app?subject=AutoLister%20AI%20tailored%20limits";
            link.textContent = "Contact us for tailored limits";
            list.append(link);
            return;
          }
          const button = document.createElement(
            tier === "manage" ? "button" : "label",
          );
          button.className = "mobile-paywall-option";
          let radio: HTMLInputElement | undefined;
          if (button instanceof HTMLButtonElement) {
            button.type = "button";
            button.addEventListener("click", () => void checkout("manage"));
          } else {
            radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "mobile-paywall-tier";
            radio.value = tier;
            radio.checked = !selectedTier;
            if (radio.checked)
              selectedTier = tier as MobileBillingTier | CreditPackId;
            radio.addEventListener("change", () => {
              if (!radio!.checked || busy) return;
              selectedTier = tier as MobileBillingTier | CreditPackId;
              proceed.textContent = continueLabel();
              find("[data-paywall-trust]").textContent = getCreditPackConfig(
                tier,
              )
                ? billingCopy.oneTimeTrust
                : policy.trust;
            });
            button.classList.add("mobile-paywall-choice");
            button.append(radio);
            proceed.hidden = false;
          }
          const pack = getCreditPackConfig(tier);
          const fallbackPlan = ["starter", "pro", "business"].includes(tier)
            ? TIER_CONFIGS[tier as "starter" | "pro" | "business"]
            : null;
          const label =
            tier === "manage"
              ? "Update payment"
              : pack
                ? billingCopy.pack.replace("{credits}", String(pack.credits))
                : names[tier as MobileBillingTier];
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
          (radio || button).setAttribute(
            "aria-label",
            [
              label,
              typeof price === "number"
                ? `${formatPrice(price, locale)} ${pack ? billingCopy.oneTime : billingCopy.perMonth}`
                : "",
              limits,
            ]
              .filter(Boolean)
              .join(", "),
          );
          if (tier === "pro") {
            const badge = document.createElement("small");
            badge.className = "mobile-paywall-badge";
            badge.textContent = billingCopy.popular;
            copy.append(badge);
          }
          if (limits) {
            const detail = document.createElement("small");
            detail.textContent = limits;
            copy.append(detail);
          }
          button.append(copy);
          const side = document.createElement("span");
          side.className = "mobile-paywall-option-side";
          if (typeof price === "number" && Number.isFinite(price)) {
            const amount = document.createElement("span");
            amount.textContent = `${formatPrice(price, locale)} ${pack ? billingCopy.oneTime : billingCopy.perMonth}`;
            side.append(amount);
            const quantity = pack?.credits ?? plan?.monthlyLimit;
            if (quantity) {
              const unit = document.createElement("small");
              unit.textContent = `≈${formatUnitPrice(price, quantity, locale)} ${billingCopy.perListing}`;
              side.append(unit);
            }
          }
          button.append(side);
          list.append(button);
        });
        proceed.textContent = continueLabel();
      };
      tabs.querySelectorAll<HTMLButtonElement>("button").forEach((tab) => {
        const select = (next: "monthly" | "once") => {
          if (!busy) {
            mode = next;
            render();
          }
        };
        tab.onclick = () =>
          select(tab.dataset.billingMode as "monthly" | "once");
        tab.onkeydown = (event) => {
          if (
            !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
            busy
          )
            return;
          event.preventDefault();
          select(
            event.key === "Home"
              ? "monthly"
              : event.key === "End"
                ? "once"
                : mode === "monthly"
                  ? "once"
                  : "monthly",
          );
          tabs
            .querySelector<HTMLButtonElement>('[aria-selected="true"]')
            ?.focus();
        };
      });
      render();
      if (!dialog.open) {
        previous =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialog.showModal();
        find("h2").focus({ preventScroll: true });
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
