/** Wire a short, noninteractive disclosure to hover, focus and tap. */
export function mountContextTooltip(
  help: HTMLElement,
  trigger: HTMLButtonElement,
  tooltip: HTMLElement,
) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const dialog = help.closest("dialog");
  let hovered = false;
  let focused = false;
  let pinned = false;

  const revealInline = () => {
    if (tooltip.dataset.placement === "inline")
      tooltip.scrollIntoView({ block: "nearest", behavior: "instant" });
  };
  const position = () => {
    if (tooltip.hidden) return;
    const anchor = trigger.getBoundingClientRect();
    const box = dialog?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom =
      viewportTop + (viewport?.height ?? window.innerHeight);
    const top = Math.max(viewportTop, box?.top ?? viewportTop);
    const bottom = Math.min(viewportBottom, box?.bottom ?? viewportBottom);
    tooltip.dataset.placement = "below";
    const height = tooltip.offsetHeight + 12;
    tooltip.dataset.placement =
      bottom - anchor.bottom >= height
        ? "below"
        : anchor.top - top >= height
          ? "above"
          : "inline";
    if (focused || pinned) revealInline();
  };
  const render = () => {
    const open = !help.hidden && (hovered || focused || pinned);
    const opening = open && tooltip.hidden;
    tooltip.hidden = !open;
    if (opening) position();
    trigger.setAttribute("aria-expanded", String(open));
  };
  const close = () => {
    hovered = focused = pinned = false;
    render();
  };

  window.addEventListener("resize", position, options);
  window.visualViewport?.addEventListener("resize", position, options);
  help.addEventListener(
    "pointerenter",
    (event) => {
      if (event.pointerType === "mouse") {
        hovered = true;
        render();
      }
    },
    options,
  );
  help.addEventListener(
    "pointerleave",
    (event) => {
      if (event.pointerType === "mouse") {
        hovered = false;
        render();
      }
    },
    options,
  );
  trigger.addEventListener(
    "focus",
    () => {
      focused = trigger.matches(":focus-visible");
      render();
    },
    options,
  );
  trigger.addEventListener(
    "blur",
    () => {
      focused = pinned = false;
      render();
    },
    options,
  );
  trigger.addEventListener(
    "click",
    () => {
      if (pinned) close();
      else {
        pinned = true;
        render();
        revealInline();
      }
    },
    options,
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !tooltip.hidden &&
        event.target instanceof Node &&
        !help.contains(event.target)
      )
        close();
    },
    options,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || tooltip.hidden) return;
      event.preventDefault();
      close();
    },
    options,
  );

  return {
    close,
    dispose() {
      events.abort();
      close();
    },
  };
}
