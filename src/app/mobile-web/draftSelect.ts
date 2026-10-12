const selectedArtwork = new WeakMap<Element, Element>();

export function syncDraftSelects(root: HTMLElement, attribute?: string) {
  root
    .querySelectorAll<HTMLElement>("[data-draft-select]")
    .forEach((widget) => {
      const select = widget.querySelector<HTMLSelectElement>("select")!;
      if (attribute && !select.hasAttribute(`data-draft-${attribute}`)) return;
      const trigger = widget.querySelector<HTMLButtonElement>(
        "[data-draft-select-trigger]",
      )!;
      if (trigger.disabled !== select.disabled)
        trigger.disabled = select.disabled;
      const selected = widget.querySelector<HTMLElement>(
        `[data-draft-select-option="${select.value}"]`,
      );
      if (!selected) return;
      const label = widget.querySelector("[data-draft-select-label]")!;
      const text = select.selectedOptions[0]?.textContent || "";
      if (label.textContent !== text) label.textContent = text;
      const art = selected.querySelector("[data-draft-select-art]")!;
      const triggerArt = trigger.querySelector("[data-draft-select-art]")!;
      if (selectedArtwork.get(triggerArt) !== art) {
        triggerArt.replaceChildren(
          ...Array.from(art.childNodes, (node) => node.cloneNode(true)),
        );
        if (widget.hasAttribute("data-draft-language"))
          triggerArt
            .querySelector("img")
            ?.setAttribute("data-draft-language-flag", "");
        selectedArtwork.set(triggerArt, art);
      }
      const nativeOptions = new Map(
        Array.from(select.options, (option) => [option.value, option]),
      );
      widget
        .querySelectorAll<HTMLElement>("[data-draft-select-option]")
        .forEach((option) => {
          const nativeOption = nativeOptions.get(
            option.dataset.draftSelectOption!,
          );
          const planLocked = Boolean(nativeOption?.disabled);
          const disabled = select.disabled;
          if ((option as HTMLButtonElement).disabled !== disabled)
            (option as HTMLButtonElement).disabled = disabled;
          const lock = option.querySelector<HTMLElement>(
            "[data-draft-plan-lock]",
          );
          if (lock) lock.hidden = !planLocked;
          option.toggleAttribute("data-draft-plan-locked", planLocked);
          if (planLocked)
            option.setAttribute(
              "aria-label",
              `${nativeOption?.textContent}: locked, view plans`,
            );
          else option.removeAttribute("aria-label");
          const selected = String(
            option.dataset.draftSelectOption === select.value,
          );
          if (option.getAttribute("aria-selected") !== selected)
            option.setAttribute("aria-selected", selected);
        });
    });
}

export function mountDraftSelects(root: HTMLElement) {
  let opened: HTMLElement | null = null;
  const position = (widget: HTMLElement) => {
    const menu = widget.querySelector<HTMLElement>(
      "[data-draft-select-options]",
    )!;
    const body = widget.closest<HTMLElement>(".draft-settings-content");
    const bounds = body?.getBoundingClientRect();
    const trigger = widget
      .querySelector<HTMLElement>("[data-draft-select-trigger]")!
      .getBoundingClientRect();
    const above = trigger.top - (bounds?.top || 16) - 8;
    const below =
      (bounds?.bottom || window.innerHeight - 16) - trigger.bottom - 8;
    const upward = below < Math.min(240, menu.scrollHeight) && above > below;
    menu.style.top = upward ? "auto" : "calc(100% + 6px)";
    menu.style.bottom = upward
      ? `${widget.getBoundingClientRect().bottom - trigger.top + 6}px`
      : "auto";
    menu.style.maxHeight = `${Math.max(80, Math.min(280, upward ? above : below))}px`;
  };
  const close = (widget: HTMLElement, restore = false) => {
    const menu = widget.querySelector<HTMLElement>(
      "[data-draft-select-options]",
    )!;
    const trigger = widget.querySelector<HTMLElement>(
      "[data-draft-select-trigger]",
    )!;
    if (!menu.hidden) menu.hidden = true;
    if (trigger.getAttribute("aria-expanded") !== "false")
      trigger.setAttribute("aria-expanded", "false");
    if (opened === widget) opened = null;
    if (restore) trigger.focus({ preventScroll: true });
  };
  const closeAll = () => {
    if (opened) close(opened);
  };
  const open = (widget: HTMLElement) => {
    closeAll();
    opened = widget;
    widget.querySelector<HTMLElement>("[data-draft-select-options]")!.hidden =
      false;
    position(widget);
    widget
      .querySelector("[data-draft-select-trigger]")!
      .setAttribute("aria-expanded", "true");
    widget
      .querySelector<HTMLElement>(
        '[data-draft-select-option][aria-selected="true"]',
      )
      ?.focus({ preventScroll: true });
  };
  const choose = (widget: HTMLElement, option: HTMLElement) => {
    const select = widget.querySelector<HTMLSelectElement>("select")!;
    if ((option as HTMLButtonElement).disabled) return;
    if (option.hasAttribute("data-draft-plan-locked")) {
      window.open(
        "https://autolister.app/pricing",
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    select.value = option.dataset.draftSelectOption!;
    close(widget, true);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const click = (event: Event) => {
    const target = event.target as HTMLElement;
    const widget = target.closest<HTMLElement>("[data-draft-select]");
    if (!widget || !root.contains(widget)) {
      closeAll();
      return;
    }
    const option = target.closest<HTMLElement>(
      "[data-draft-select-option]:not(:disabled)",
    );
    if (option) choose(widget, option);
    else if (target.closest("[data-draft-select-trigger]")) {
      const isOpen =
        widget
          .querySelector("[data-draft-select-trigger]")!
          .getAttribute("aria-expanded") === "true";
      if (isOpen) close(widget, true);
      else open(widget);
    }
  };
  const keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const widget = target.closest<HTMLElement>("[data-draft-select]");
    if (!widget || !root.contains(widget)) return;
    const menu = widget.querySelector<HTMLElement>(
      "[data-draft-select-options]",
    )!;
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close(widget, true);
      return;
    }
    if (event.key === "Tab") {
      close(widget);
      return;
    }
    if (
      !menu.hidden &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const match = Array.from(
        menu.querySelectorAll<HTMLElement>(
          "[data-draft-select-option]:not(:disabled)",
        ),
      ).find((option) =>
        option.textContent
          ?.trim()
          .toLocaleLowerCase()
          .startsWith(event.key.toLocaleLowerCase()),
      );
      if (match) {
        event.preventDefault();
        match.focus();
        match.scrollIntoView({ block: "nearest" });
      }
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (menu.hidden) {
      open(widget);
      return;
    }
    const options = Array.from(
      menu.querySelectorAll<HTMLElement>(
        "[data-draft-select-option]:not(:disabled)",
      ),
    );
    const current = options.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length;
    options[next]?.focus();
    options[next]?.scrollIntoView({ block: "nearest" });
  };
  document.addEventListener("click", click);
  root.addEventListener("keydown", keydown);
  const resize = () => {
    if (opened) position(opened);
  };
  const toggle = (event: Event) => {
    if (
      opened &&
      event.target instanceof HTMLDetailsElement &&
      !event.target.open &&
      event.target.contains(opened)
    )
      closeAll();
  };
  root.addEventListener("toggle", toggle, true);
  window.addEventListener("resize", resize);
  return () => {
    closeAll();
    document.removeEventListener("click", click);
    root.removeEventListener("keydown", keydown);
    root.removeEventListener("toggle", toggle, true);
    window.removeEventListener("resize", resize);
  };
}
