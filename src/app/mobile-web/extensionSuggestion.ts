import { trackMobileEvent } from "./analytics";

const extensionId = "mommklhpammnlojjobejddmidmdcalcl";
const week = 7 * 86400000;

export function canSuggestExtension(
  userAgent: string,
  width: number,
  until: number,
  now = Date.now(),
) {
  return (
    width >= 768 &&
    /Chrome\//.test(userAgent) &&
    !/Android|iPhone|iPad|Mobile|Edg\/|OPR\//.test(userAgent) &&
    Number.isFinite(until) &&
    until <= now
  );
}

async function extensionInstalled(): Promise<boolean> {
  const runtime = (window as any).chrome?.runtime;
  if (!runtime?.sendMessage) return false;
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = (value: boolean) => {
      clearTimeout(timer);
      resolve(value);
    };
    timer = setTimeout(() => finish(false), 900);
    try {
      runtime.sendMessage(
        extensionId,
        { type: "PING" },
        (response: unknown) => {
          finish(!runtime.lastError && Boolean(response));
        },
      );
    } catch {
      finish(false);
    }
  });
}

export function mountExtensionSuggestion(
  root: HTMLElement,
  userId: () => string | undefined,
) {
  let dialog: HTMLDialogElement | undefined;
  let busy = false;
  let disposed = false;
  let previous: HTMLElement | null = null;
  let overflow = "";
  let shownFor: string | undefined;
  const restore = () => {
    if (dialog?.open) return;
    document.body.style.overflow = overflow;
    previous?.focus({ preventScroll: true });
  };
  const key = (id: string) => `autolister.mobile.extension-suggestion.${id}`;
  const close = () => {
    if (!dialog?.open) return;
    if (shownFor) {
      try {
        localStorage.setItem(key(shownFor), String(Date.now() + week));
      } catch {}
    }
    dialog.close();
    restore();
  };
  const eligible = (id: string) => {
    try {
      return (
        canSuggestExtension(
          navigator.userAgent,
          window.innerWidth,
          Number(localStorage.getItem(key(id)) || 0),
        ) &&
        !document.hidden &&
        !document.querySelector(
          'dialog[open], [aria-modal="true"], details[data-draft-popover][open], [data-mobile-web="profile-menu"]:not([hidden])',
        ) &&
        !(
          document.activeElement instanceof HTMLElement &&
          document.activeElement.matches(
            'input, textarea, [contenteditable="true"]',
          )
        )
      );
    } catch {
      return false;
    }
  };
  return {
    async suggest() {
      const id = userId();
      if (!id || disposed || busy || !eligible(id)) return;
      busy = true;
      try {
        if (
          (await extensionInstalled()) ||
          disposed ||
          userId() !== id ||
          !eligible(id)
        )
          return;
        // Suppress immediately so another tab or a navigation cannot repeat it.
        try {
          localStorage.setItem(key(id), String(Date.now() + week));
        } catch {
          return;
        }
        if (!dialog) {
          dialog = document.createElement("dialog");
          dialog.className = "mobile-paywall mobile-extension-suggestion";
          dialog.setAttribute("aria-labelledby", "mobile-extension-title");
          dialog.innerHTML = `<div class="mobile-paywall-heading"><img src="/favicon-96x96.png" width="40" height="40" alt="" /><div><span class="mobile-paywall-brand">AutoLister AI</span><h2 id="mobile-extension-title">Prefer to work directly inside Vinted?</h2></div><button type="button" aria-label="Close extension suggestion">×</button></div><p>Generate titles and descriptions on the listing page with our Chrome extension.</p><a class="mobile-primary-button" href="https://chromewebstore.google.com/detail/autolister-ai-vinted-desc/${extensionId}?utm_source=mobile_web&utm_medium=app&utm_campaign=extension_suggestion" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fbbc05"/><path d="M12 2a10 10 0 0 1 8.66 5H12a5 5 0 0 0-4.33 2.5L3.34 7A10 10 0 0 1 12 2Z" fill="#ea4335"/><path d="M3.34 7 7.67 14.5a5 5 0 0 0 8.66 0L12 22A10 10 0 0 1 3.34 7Z" fill="#34a853"/><circle cx="12" cy="12" r="4.5" fill="#4285f4" stroke="white" stroke-width="1"/></svg>Install Chrome extension</a><button type="button" class="mobile-extension-later">Not now</button>`;
          root.append(dialog);
          dialog
            .querySelectorAll("button")
            .forEach((button) => button.addEventListener("click", close));
          dialog.querySelector("a")!.addEventListener("click", () => {
            void trackMobileEvent("chrome_store_click", {
              target: "extension_suggestion",
            });
            close();
          });
          dialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            close();
          });
          dialog.addEventListener("click", (event) => {
            const box = dialog!.getBoundingClientRect();
            if (
              event.target === dialog &&
              (event.clientX < box.left ||
                event.clientX > box.right ||
                event.clientY < box.top ||
                event.clientY > box.bottom)
            )
              close();
          });
        }
        previous =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        shownFor = id;
        overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialog.showModal();
      } finally {
        busy = false;
      }
    },
    close,
    dispose() {
      disposed = true;
      close();
      dialog?.remove();
    },
  };
}
