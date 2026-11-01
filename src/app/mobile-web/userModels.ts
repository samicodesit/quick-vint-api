import { fetchMobileJson } from "./api";
import { getBrowserSession } from "./auth";
import {
  MODEL_PENDING_KEY,
  claimPendingModel,
  savePendingModel,
  type ModelChoice,
} from "./userModelState";
declare global {
  interface Window {
    AutoListerModelUI?: {
      mount(container: HTMLElement, options: any): () => void;
      mirrorIcon: string;
      examples(): string;
      invitation(): string;
      t(key: string): string;
      locale(): string;
      entry(button: HTMLElement, state: any, attention: boolean): void;
      validPreferences(p: unknown): boolean;
    };
  }
}
export function mountUserModels(
  root: HTMLElement,
  getOwner: () => string | undefined,
) {
  let activeCleanup: (() => void) | undefined,
    stopped = false,
    offerTimer: ReturnType<typeof setTimeout> | undefined,
    checking = false,
    offeredOwner: string | undefined;
  const interacted = new Set<string>();
  function updateEntries(owner: string, state: any) {
    if (getOwner() !== owner || !window.AutoListerModelUI) return;
    root
      .querySelectorAll<HTMLElement>("[data-user-model-open]")
      .forEach((button) => {
        window.AutoListerModelUI!.entry(
          button,
          state,
          !interacted.has(owner) &&
            ["unseen", "seen"].includes(state.invitationState),
        );
        button.hidden = false;
      });
  }
  function acknowledge(owner: string) {
    if (interacted.has(owner)) return;
    interacted.add(owner);
    root.querySelectorAll(".um-discover").forEach((button) => {
      button.classList.remove("um-discover");
      button.querySelector(".um-entry-new")?.remove();
    });
    // Opening the preferences counts as interacting with the invitation on every client.
    void request(owner)("POST", { action: "dismiss" }).catch(() => {});
  }
  const enabled = () =>
    window.__AUTOLISTER_MOBILE_WEB_CONFIG__?.userModelsEnabled &&
    window.AutoListerModelUI;
  const request =
    (owner: string) =>
    async (method = "GET", body?: object) => {
      const result = await fetchMobileJson<any>(
        "/api/user/model",
        {
          method,
          ...(body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        },
        { expectedUserId: owner },
      );
      if ((await getBrowserSession())?.user.id !== owner) {
        close();
        throw new Error("Your account changed. Reopen your model.");
      }
      if (result && "invitationState" in result) updateEntries(owner, result);
      return result;
    };
  function close() {
    activeCleanup?.();
    activeCleanup = undefined;
  }
  function open(
    owner: string,
    initialPreferences?: ModelChoice,
    invite = false,
  ) {
    if (!enabled() || getOwner() !== owner) return;
    close();
    const dialog = document.createElement("dialog");
    dialog.className = "um-modal";
    dialog.setAttribute(
      "aria-label",
      window.AutoListerModelUI!.t("Your model"),
    );
    const view = document.createElement("div");
    dialog.append(view);
    document.body.append(dialog);
    let dispose = () => {};
    const end = () => {
      dispose();
      dialog.close();
      dialog.remove();
      if (activeCleanup === end) activeCleanup = undefined;
    };
    activeCleanup = end;
    const leave = () => {
      void request(owner)("POST", { action: "dismiss" }).catch(() => {});
      localStorage.removeItem(MODEL_PENDING_KEY);
      end();
    };
    const form = () => {
      acknowledge(owner);
      dispose();
      dispose = window.AutoListerModelUI!.mount(view, {
        request: request(owner),
        initialPreferences,
        onClose: leave,
        onSkip: leave,
        backLabel: "Close",
      });
    };
    if (invite && !initialPreferences) {
      view.className = "um-view";
      view.lang = window.AutoListerModelUI!.locale();
      view.innerHTML = window.AutoListerModelUI!.invitation();
      view.querySelector(".um-primary")!.addEventListener("click", form);
      view.querySelector(".um-secondary")!.addEventListener("click", leave);
    } else form();
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      leave();
    });
    dialog.showModal();
    dialog.querySelector<HTMLElement>("button,input")?.focus();
  }
  function settings(event: Event) {
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-user-model-open]",
    );
    if (!button || !enabled()) return;
    event.preventDefault();
    event.stopPropagation();
    const owner = getOwner();
    if (!owner) return;
    acknowledge(owner);
    const panel = button.closest<HTMLElement>(".draft-popover-panel");
    if (!panel) {
      open(owner);
      return;
    }
    close();
    const view = document.createElement("section");
    view.className = "um-settings-view";
    panel.append(view);
    panel.classList.add("um-subview-active");
    let dispose = () => {};
    const details = panel.closest("details");
    const back = () => {
      dispose();
      panel.classList.remove("um-subview-active");
      view.remove();
      details?.removeEventListener("toggle", toggle);
      if (activeCleanup === back) activeCleanup = undefined;
      button.focus();
    };
    const toggle = () => {
      if (!details?.open) back();
    };
    activeCleanup = back;
    details?.addEventListener("toggle", toggle);
    dispose = window.AutoListerModelUI!.mount(view, {
      request: request(owner),
      onClose: back,
      backLabel: "Settings",
    });
  }
  root.addEventListener("click", settings);
  const accountChanged = () => {
    void getBrowserSession()
      .then((session) => {
        if (session?.user.id !== getOwner()) {
          close();
          clearTimeout(offerTimer);
          offeredOwner = undefined;
        }
      })
      .catch(() => close());
  };
  window.addEventListener("storage", accountChanged);
  function isBusy() {
    return Array.from(
      document.querySelectorAll(
        'dialog[open], [aria-modal="true"], .draft-settings[open], [data-draft-queue]:not([hidden]), [aria-busy="true"]',
      ),
    ).some((element) => element.getClientRects().length > 0);
  }
  async function offer(owner: string) {
    if (
      stopped ||
      !enabled() ||
      checking ||
      offeredOwner === owner ||
      getOwner() !== owner
    )
      return;
    // Load the settings entry even while settings are open. Only the automatic
    // invitation below is deferred by other work or an open dialog.
    checking = true;
    try {
      const state = await request(owner)();
      if (stopped || getOwner() !== owner) return;
      const pending = claimPendingModel(localStorage, owner);
      if (pending) {
        if (pending.preferences === null) {
          await request(owner)("POST", { action: "dismiss" });
          localStorage.removeItem(MODEL_PENDING_KEY);
          offeredOwner = owner;
          return;
        }
        if (!window.AutoListerModelUI!.validPreferences(pending.preferences)) {
          localStorage.removeItem(MODEL_PENDING_KEY);
          return;
        }
        if (!state.model) {
          if (isBusy()) {
            offerTimer = setTimeout(() => void offer(owner), 3000);
            return;
          }
          offeredOwner = owner;
          open(owner, pending.preferences);
          return;
        }
        localStorage.removeItem(MODEL_PENDING_KEY);
      }
      if (state.invitationState !== "unseen" || state.model) {
        offeredOwner = owner;
        return;
      }
      if (isBusy()) {
        offerTimer = setTimeout(() => void offer(owner), 3000);
        return;
      }
      const invitation = await request(owner)("POST", { action: "invite" });
      if (!stopped && getOwner() === owner && invitation.claimed) {
        offeredOwner = owner;
        open(owner, undefined, true);
      }
    } catch {
      /* Optional invitation must never block listing work. Settings allow another attempt. */
    } finally {
      checking = false;
    }
  }
  return {
    offer,
    preferences(done: () => void) {
      if (!enabled()) {
        done();
        return;
      }
      close();
      const host = document.createElement("section");
      host.className = "um-preauth";
      root.querySelector(".mobile-workspace-main")?.prepend(host);
      root
        .querySelector<HTMLElement>('[data-mobile-web="auth-card"]')
        ?.setAttribute("hidden", "");
      const dispose = window.AutoListerModelUI!.mount(host, {
        mode: "preferences",
        onContinue: (preferences: ModelChoice | null) => {
          try {
            savePendingModel(localStorage, preferences);
          } catch (e) {
            const p = document.createElement("p");
            p.setAttribute("role", "alert");
            p.textContent = (e as Error).message;
            host.append(p);
            return;
          }
          close();
          done();
        },
      });
      activeCleanup = () => {
        dispose();
        host.remove();
      };
    },
    reset() {
      close();
      clearTimeout(offerTimer);
      offeredOwner = undefined;
      root
        .querySelectorAll<HTMLElement>("[data-user-model-open]")
        .forEach((button) => {
          button.hidden = true;
        });
    },
    dispose() {
      stopped = true;
      close();
      clearTimeout(offerTimer);
      root.removeEventListener("click", settings);
      window.removeEventListener("storage", accountChanged);
    },
  };
}
