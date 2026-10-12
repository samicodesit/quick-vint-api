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
  dialog.innerHTML = `<div class="mobile-paywall-heading"><img src="/favicon-96x96.png" width="40" height="40" alt="" /><div><span class="mobile-paywall-brand">AutoLister AI</span><h2 id="mobile-paywall-title"></h2></div><button type="button" aria-label="Close paid options">×</button></div><p data-paywall-copy></p><div data-paywall-options></div><p class="mobile-paywall-trust" data-paywall-trust></p><p role="status" data-paywall-status hidden></p><a data-paywall-support href="${support}" hidden>Contact support</a>`;
  root.append(dialog);
  const find = (selector: string) =>
    dialog.querySelector<HTMLElement>(selector)!;
  let previous: HTMLElement | null = null;
  let overflow = "";
  let busy = false;
  let disposed = false;
  const restore = () => {
    if (dialog.open) return;
    document.body.style.overflow = overflow;
    previous?.focus({ preventScroll: true });
  };
  const close = () => {
    dialog.close();
    restore();
  };
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
  dialog.addEventListener("close", restore);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  return {
    show(usage: MobileUsage, requested?: string): boolean {
      const policy = getMobilePaywall(usage, requested);
      if (!policy || disposed || busy) return false;
      find("h2").textContent = policy.title;
      find("[data-paywall-copy]").textContent = policy.message;
      find("[data-paywall-trust]").textContent = policy.trust;
      find("[data-paywall-support]").hidden = !policy.support;
      find("[data-paywall-status]").hidden = true;
      const list = find("[data-paywall-options]");
      list.replaceChildren();
      policy.options.forEach((tier, index) => {
        if (tier === "support") {
          const link = document.createElement("a");
          link.href =
            "mailto:support@autolister.app?subject=AutoLister%20AI%20tailored%20limits";
          link.textContent = "Contact us for tailored limits";
          list.append(link);
          return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = `mobile-paywall-option${index === 0 ? " is-primary" : ""}`;
        const label =
          tier === "manage"
            ? "Update payment"
            : tier === "credit_pack"
              ? "Buy one-time credits"
              : `Upgrade to ${names[tier]}`;
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
        button.setAttribute("aria-label", label);
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
        button.setAttribute(
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
          badge.textContent = "Most popular";
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
        button.addEventListener("click", async () => {
          if (busy) return;
          const userId = options.userId();
          if (!userId) return;
          busy = true;
          list.querySelectorAll("button").forEach((b) => (b.disabled = true));
          title.textContent = "Opening Stripe…";
          const status = find("[data-paywall-status]");
          status.hidden = true;
          try {
            await options.flush();
            void trackMobileEvent(
              "checkout_start",
              tier === "manage" ? { target: "manage" } : { tier },
            );
            const session =
              tier === "manage"
                ? await openMobilePortal(userId)
                : await startMobileCheckout(tier as MobileBillingTier, userId);
            if (!disposed && dialog.open && options.userId() === userId) {
              rememberMobileBillingReturn(userId);
              window.location.assign(session.url);
            }
          } catch {
            if (!disposed) {
              status.textContent =
                "Could not open checkout. Please try again. Your drafts are saved.";
              status.hidden = false;
            }
          } finally {
            busy = false;
            if (!disposed) {
              title.textContent = displayLabel;
              list
                .querySelectorAll("button")
                .forEach((b) => (b.disabled = false));
            }
          }
        });
        list.append(button);
      });
      if (!dialog.open) {
        previous =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialog.showModal();
      }
      return true;
    },
    dispose() {
      disposed = true;
      if (dialog.open) close();
      dialog.removeEventListener("close", restore);
      dialog.remove();
    },
  };
}
