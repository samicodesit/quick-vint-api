import { getMobilePaywall } from "./paywallPolicy";
import {
  openMobilePortal,
  startMobileCheckout,
  rememberMobileBillingReturn,
  type MobileBillingTier,
} from "./billing";
import { trackMobileEvent } from "./analytics";
import type { MobileUsage } from "./generationClient";

const support =
  "mailto:support@autolister.app?subject=AutoLister%20AI%20account%20review";
const names = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  credit_pack: "One-time credits",
};

export function mountMobilePaywall(
  root: HTMLElement,
  options: {
    userId: () => string | undefined;
    flush: () => Promise<void>;
  },
) {
  const dialog = document.createElement("dialog");
  dialog.className = "mobile-paywall";
  dialog.setAttribute("aria-labelledby", "mobile-paywall-title");
  dialog.innerHTML = `<div class="mobile-paywall-heading"><img src="/favicon-96x96.png" width="40" height="40" alt="" /><div><span class="mobile-paywall-brand">AutoLister AI</span><h2 id="mobile-paywall-title"></h2></div><button type="button" aria-label="Close paid options">×</button></div><div class="mobile-paywall-body"><p data-paywall-copy></p><div data-paywall-options role="group" aria-label="Paid options"></div><p role="status" data-paywall-status hidden></p><a data-paywall-support href="${support}" hidden>Contact support</a></div><div class="mobile-paywall-footer"><button type="button" class="mobile-primary-button" data-paywall-continue hidden></button><p class="mobile-paywall-trust" data-paywall-trust></p></div>`;
  root.append(dialog);
  const find = (selector: string) =>
    dialog.querySelector<HTMLElement>(selector)!;
  let previous: HTMLElement | null = null;
  let overflow = "";
  let busy = false;
  let disposed = false;
  let revision = 0;
  let selectedTier: MobileBillingTier | undefined;
  const proceed = find("[data-paywall-continue]") as HTMLButtonElement;
  const continueLabel = () =>
    selectedTier === "credit_pack"
      ? "Continue with one-time credits"
      : selectedTier
        ? `Continue with ${names[selectedTier]}`
        : "Continue to checkout";
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
  const checkout = async (tier: MobileBillingTier | "manage") => {
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
      "[data-paywall-options] input, [data-paywall-options] button, [data-paywall-continue]",
    );
    busy = true;
    controls.forEach((control) => (control.disabled = true));
    proceed.textContent = "Opening Stripe…";
    proceed.setAttribute("aria-busy", "true");
    const status = find("[data-paywall-status]");
    status.hidden = true;
    try {
      await options.flush();
      if (!active()) return;
      void trackMobileEvent(
        "checkout_start",
        tier === "manage" ? { target: "manage" } : { tier },
      );
      const session =
        tier === "manage"
          ? await openMobilePortal(userId)
          : await startMobileCheckout(tier, userId);
      if (active()) {
        rememberMobileBillingReturn(userId);
        window.location.assign(session.url);
      }
    } catch {
      if (active()) {
        status.textContent =
          "Could not open checkout. Please try again. Your drafts are saved.";
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
    show(usage: MobileUsage, requested?: string): boolean {
      const policy = getMobilePaywall(usage, requested);
      if (!policy || disposed || busy) return false;
      revision++;
      selectedTier = undefined;
      proceed.hidden = true;
      find("h2").textContent = policy.title;
      find("[data-paywall-copy]").textContent = policy.message;
      find("[data-paywall-trust]").textContent = policy.trust;
      find("[data-paywall-support]").hidden = !policy.support;
      find("[data-paywall-status]").hidden = true;
      const list = find("[data-paywall-options]");
      list.replaceChildren();
      policy.options.forEach((tier) => {
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
          if (radio.checked) selectedTier = tier as MobileBillingTier;
          radio.addEventListener("change", () => {
            if (!radio!.checked || busy) return;
            selectedTier = tier as MobileBillingTier;
            proceed.textContent = continueLabel();
            find("[data-paywall-trust]").textContent =
              tier === "credit_pack"
                ? "Secure checkout by Stripe. One-time purchase."
                : policy.trust;
          });
          button.classList.add("mobile-paywall-choice");
          button.append(radio);
          proceed.hidden = false;
        }
        const label = tier === "manage" ? "Update payment" : names[tier];
        const price =
          tier === "manage"
            ? null
            : tier === "credit_pack"
              ? (usage.pricing?.creditPack as { price?: number } | undefined)
                  ?.price
              : (
                  usage.pricing?.tiers as
                    | Record<string, { monthly?: number }>
                    | undefined
                )?.[tier]?.monthly;
        const title = document.createElement("strong");
        const displayLabel = tier === "manage" ? label : names[tier];
        title.textContent = displayLabel;
        const copy = document.createElement("span");
        copy.className = "mobile-paywall-option-copy";
        copy.append(title);
        const plan = (
          usage.pricing?.tiers as
            | Record<string, { dailyLimit?: number; monthlyLimit?: number }>
            | undefined
        )?.[tier];
        const credits = (
          usage.pricing?.creditPack as { credits?: number } | undefined
        )?.credits;
        const limits =
          tier === "credit_pack" && typeof credits === "number"
            ? `${credits} extra listings`
            : plan &&
                typeof plan.dailyLimit === "number" &&
                typeof plan.monthlyLimit === "number"
              ? `${plan.dailyLimit}/day · ${plan.monthlyLimit}/month`
              : "";
        (radio || button).setAttribute(
          "aria-label",
          [
            label,
            typeof price === "number"
              ? `€${price.toFixed(2)}${tier === "credit_pack" ? " once" : " per month"}`
              : "",
            limits,
          ]
            .filter(Boolean)
            .join(", "),
        );
        if (tier === "pro") {
          const badge = document.createElement("small");
          badge.className = "mobile-paywall-badge";
          badge.textContent = "Popular";
          copy.append(badge);
        } else if (tier === "credit_pack") {
          const badge = document.createElement("small");
          badge.textContent = "No commitment";
          copy.append(badge);
        }
        button.append(copy);
        const side = document.createElement("span");
        side.className = "mobile-paywall-option-side";
        if (typeof price === "number" && Number.isFinite(price)) {
          const amount = document.createElement("span");
          amount.textContent = `€${price.toFixed(2)}${tier === "credit_pack" ? " once" : "/month"}`;
          side.append(amount);
        }
        if (limits) {
          const detail = document.createElement("small");
          detail.textContent = limits;
          side.append(detail);
        }
        button.append(side);
        if (tier === "credit_pack") {
          const count = (
            usage.pricing?.creditPack as { credits?: number } | undefined
          )?.credits;
          if (typeof count === "number")
            button.title = `${count} extra listings`;
        }
        list.append(button);
      });
      proceed.textContent = continueLabel();
      if (!dialog.open) {
        previous =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialog.showModal();
        void trackMobileEvent("web_paywall_view", {
          errorCode: requested || usage.blockedReason || "paid_options",
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
