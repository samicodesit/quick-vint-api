import { animateSurface, bindSurfaceBackdrop } from "./surfaceMotion";
/** Modal behavior for the existing mobile sheets, without moving their controls. */
export function activateMobileSheet(
  panel: HTMLElement,
  close: () => void,
  allSizes = false,
  animated = true,
) {
  if (
    typeof window === "undefined" ||
    !window ||
    typeof window.matchMedia !== "function"
  )
    return () => {};

  if (allSizes) return activateModal(panel, close, animated);

  const breakpoint = window.matchMedia("(max-width: 767px)");
  let release = () => {};
  const update = () => {
    release();
    release = breakpoint.matches
      ? activateModal(panel, close, animated)
      : () => {};
  };
  breakpoint.addEventListener("change", update);
  update();
  return () => {
    breakpoint.removeEventListener("change", update);
    release();
  };
}

function activateModal(
  panel: HTMLElement,
  close: () => void,
  animated: boolean,
) {
  const previousRole = panel.getAttribute("role");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.classList.add("is-mobile-sheet");
  const background: Array<[HTMLElement, boolean]> = [];
  let branch: HTMLElement = panel;
  while (branch.parentElement) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      if (sibling !== branch && sibling instanceof HTMLElement) {
        background.push([sibling, sibling.inert]);
        sibling.inert = true;
      }
    }
    branch = branch.parentElement;
    if (branch === document.body) break;
  }
  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "mobile-sheet-backdrop";
  backdrop.setAttribute("aria-label", "Close dialog");
  backdrop.tabIndex = -1;
  backdrop.addEventListener("click", close);
  // A sticky header is its own stacking context. Keep its backdrop below the
  // account panel but above the header content, without hiding that content.
  (panel.closest(".mobile-workspace-header") || document.body).append(backdrop);
  const unbindBackdrop = bindSurfaceBackdrop(panel, backdrop);
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const controls = () =>
    Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ),
    ).filter(
      (el) =>
        el.getClientRects().length &&
        !el.closest("[hidden]") &&
        !el.matches('[tabindex="-1"], [aria-hidden="true"]'),
    );
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const elements = controls();
    const first = elements[0];
    const last = elements.at(-1);
    if (!first) return;
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  };
  panel.addEventListener("keydown", keydown);
  controls()[0]?.focus({ preventScroll: true });
  if (animated) animateSurface(panel, "enter");
  return () => {
    panel.removeEventListener("keydown", keydown);
    unbindBackdrop();
    backdrop.remove();
    background.forEach(([el, inert]) => {
      el.inert = inert;
    });
    document.body.style.overflow = overflow;
    panel.removeAttribute("aria-modal");
    panel.classList.remove("is-mobile-sheet");
    if (previousRole) panel.setAttribute("role", previousRole);
    else panel.removeAttribute("role");
  };
}
