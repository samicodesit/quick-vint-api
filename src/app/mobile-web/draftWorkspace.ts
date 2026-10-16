import { createDraftClient, type DraftAttempt } from "./draftClient";
import {
  DEFAULT_DRAFT_SETTINGS,
  DRAFT_LIMITS,
  type Draft,
  type DraftLibrary,
  type DraftPhoto,
  type DraftSettings,
  validDraftId,
  normalizeDraftSettings,
  permittedDraftSettings,
  validateDraftSettings,
} from "./draftContracts";
import {
  batchInheritingItems,
  sameSettings,
  settingsExtras,
  settingsLanguages,
  settingInputValue,
  syncSettingsControls,
} from "./draftSettings";
import {
  DraftAutosave,
  DraftQueue,
  draftGenerationAllowance,
} from "./draftWorkflow";
import { prepareMobileImage } from "./imagePreparation";
import { copyListingField } from "./billing";
import type { MobileUsage } from "./generationClient";
import { trackMobileEvent } from "./analytics";
import { activateMobileSheet } from "./sheet";
import { mountDraftSelects } from "./draftSelect";
import { animateSurface } from "./surfaceMotion";
import { mountPhoneEntry } from "./phoneEntry";

interface Upload {
  id: string;
  importId: string;
  draftId?: string;
  file: File;
  prepared?: File;
  preview?: string;
  state: "waiting" | "uploading" | "error";
  error?: string;
}
export function mountDraftWorkspace(
  root: HTMLElement,
  options: {
    userId: string;
    onUsageChange: () => Promise<MobileUsage | null>;
    onGenerationBlocked?: (usage: MobileUsage | null, code?: string) => boolean;
    onViewPlans?: () => void;
    defaultSettings?: DraftSettings;
    startWithNewItem?: boolean;
  },
) {
  const client = createDraftClient(options.userId);
  const { draftAction, executeDraftAttempt, listDrafts, uploadDraftPhoto } =
    client;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const action = (name: string) =>
    find<HTMLButtonElement>(`[data-draft-action="${name}"]`);
  const hide = (selector: string, hidden: boolean) => {
    find(selector).hidden = hidden;
  };
  let library: DraftLibrary = { drafts: [], imports: [], nextCursor: null };
  let tab: "draft" | "done" = "draft";
  let selected: DraftAutosave | null = null;
  let batchSettingsItem: DraftAutosave | null = null;
  let disposed = false;
  let loading = true;
  let initializing = true;
  let initialMotionFrame = 0;
  let libraryLoad = 0;
  let selectionIntent = 0;
  let libraryPages = 1;
  let importing = false;
  let processing = false;
  let bulk = false;
  let composing = false;
  let reviewIds: string[] = [];
  let groupIds: string[] = [];
  let openedFromGrouping = false;
  let restoringHistory = false;
  let railSignature = "";
  let photoEditor: { close: () => void } | undefined;
  let openingPhotoEditor = false;
  const nativePhotoPicker =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  root.dataset.nativePhotoPicker = String(nativePhotoPicker);
  let conflict = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let scrollY = 0;
  let generationCount = 0;
  let startingGenerationId: string | null = null;
  let allowance: number | null = null;
  const defaultsKey = `autolister:listing-defaults:${options.userId}`;
  const freshDefaults = {
    ...DEFAULT_DRAFT_SETTINGS,
    useHashtags: true,
    useEmojis: true,
    ...options.defaultSettings,
  };
  let defaultSettings = normalizeDraftSettings(freshDefaults);
  try {
    const saved = localStorage.getItem(defaultsKey);
    if (saved) defaultSettings = normalizeDraftSettings(JSON.parse(saved));
  } catch {}
  const batchSettingsKey = `autolister:batch-settings:${options.userId}`;
  const loadDefaults = () => {
    try {
      return normalizeDraftSettings(
        JSON.parse(localStorage.getItem(defaultsKey) || "null"),
      );
    } catch {
      return normalizeDraftSettings(freshDefaults);
    }
  };
  let newItemSettings = loadDefaults();
  let globalSettings = loadDefaults();
  try {
    const saved = sessionStorage.getItem(batchSettingsKey);
    if (saved) defaultSettings = normalizeDraftSettings(JSON.parse(saved));
    else
      sessionStorage.setItem(batchSettingsKey, JSON.stringify(defaultSettings));
  } catch {}
  let settingsAccess = { tone: true, extras: true };
  let preparationDraftId: string | undefined;
  let selectionMode = false;
  let writingDraftId: string | undefined;
  const chosen = new Set<string>();
  const chosenPhotos = new Set<string>();
  const uploads: Upload[] = [];
  const attempts = new Map<string, DraftAttempt>();
  const listeners: Array<() => void> = [];
  let descriptionSizeKey = "";
  const resizeDescription = () => {
    const field = find<HTMLTextAreaElement>("#draft-description");
    if (!field.offsetParent) return;
    const key = `${field.clientWidth}:${field.value}`;
    if (key === descriptionSizeKey) return;
    descriptionSizeKey = key;
    field.style.height = "auto";
    field.style.height = `${Math.max(120, field.scrollHeight + 2)}px`;
  };
  let photoViewportFrame = 0;
  const workspaceHeader = root
    .closest(".mobile-workspace-shell")
    ?.querySelector<HTMLElement>(".mobile-workspace-header");
  const schedulePhotoViewport = () => {
    cancelAnimationFrame(photoViewportFrame);
    photoViewportFrame = requestAnimationFrame(() => {
      if (workspaceHeader) {
        const headerHeight = `${Math.ceil(workspaceHeader.getBoundingClientRect().height)}px`;
        if (
          root.style.getPropertyValue("--draft-header-height") !== headerHeight
        )
          root.style.setProperty("--draft-header-height", headerHeight);
      }
      resizeDescription();
      const rail = find("[data-draft-item-photos]");
      if (
        !find("[data-draft-editor]").classList.contains("is-preparing") ||
        !window.matchMedia("(max-width: 767px) and (min-height: 540px)").matches
      ) {
        rail.style.removeProperty("--draft-photo-viewport-height");
        return;
      }
      const footer = find("[data-draft-generation-actions]");
      const height = Math.max(
        96,
        (window.visualViewport?.height || window.innerHeight) -
          rail.getBoundingClientRect().top -
          footer.getBoundingClientRect().height -
          8,
      );
      const value = `${Math.floor(height)}px`;
      if (
        rail.style.getPropertyValue("--draft-photo-viewport-height") !== value
      )
        rail.style.setProperty("--draft-photo-viewport-height", value);
    });
  };
  const photoViewportObserver = new ResizeObserver(schedulePhotoViewport);
  photoViewportObserver.observe(root);
  if (workspaceHeader) photoViewportObserver.observe(workspaceHeader);
  window.addEventListener("resize", schedulePhotoViewport);
  window.visualViewport?.addEventListener("resize", schedulePhotoViewport);
  listeners.push(() => {
    root.style.removeProperty("--draft-header-height");
    cancelAnimationFrame(photoViewportFrame);
    photoViewportObserver.disconnect();
    window.removeEventListener("resize", schedulePhotoViewport);
    window.visualViewport?.removeEventListener("resize", schedulePhotoViewport);
  });
  const phoneEntry = mountPhoneEntry(root, addFiles);
  const updatePhoneEntry = () =>
    phoneEntry.update(
      bulk && !library.imports.length && !groupIds.length && !uploads.length
        ? "batch"
        : !bulk &&
            (composing ||
              (selected &&
                !photoCount(selected.value) &&
                !selected.value.title &&
                !selected.value.description &&
                writingDraftId !== selected.value.id))
          ? "single"
          : null,
    );
  listeners.push(() => phoneEntry.dispose());
  listeners.push(mountDraftSelects(root));
  const globalTrigger = root
    .closest('[data-mobile-web="workspace"]')
    ?.querySelector<HTMLButtonElement>("[data-draft-global-trigger]");
  const globalDetails = find<HTMLDetailsElement>(
    "[data-draft-global-settings]",
  );
  const restorePopoverFocus = (details: HTMLDetailsElement) => {
    if (batchSettingsItem && details.classList.contains("draft-settings")) {
      root
        .querySelector<HTMLButtonElement>(
          `[data-focus-key="group-settings-${batchSettingsItem.value.id}"]`,
        )
        ?.focus({ preventScroll: true });
      return;
    }
    (details.classList.contains("draft-settings")
      ? globalTrigger
      : details.querySelector<HTMLElement>("summary")
    )?.focus({ preventScroll: true });
  };
  if (globalTrigger) {
    globalTrigger.hidden = false;
    const discoveryKey = `autolister:settings-opened:${options.userId}`;
    try {
      if (!localStorage.getItem(discoveryKey))
        globalTrigger.dataset.settingsUnseen = "true";
    } catch {
      globalTrigger.dataset.settingsUnseen = "true";
    }
    const openGlobal = () => {
      const details =
        batchSettingsItem || selected
          ? find<HTMLDetailsElement>("[data-draft-editor-settings]")
          : bulk &&
              (library.imports.length || groupIds.length || uploads.length)
            ? find<HTMLDetailsElement>(".draft-batch-settings")
            : globalDetails;
      openPopover(details);
      delete globalTrigger.dataset.settingsUnseen;
      try {
        localStorage.setItem(discoveryKey, "true");
      } catch {}
    };
    globalTrigger.addEventListener("click", openGlobal);
    listeners.push(() => {
      globalTrigger.removeEventListener("click", openGlobal);
      globalTrigger.hidden = true;
      delete globalTrigger.dataset.settingsUnseen;
      globalTrigger.setAttribute("aria-expanded", "false");
    });
  }
  let previousView = "";
  const queuePanel = find("[data-draft-queue]");
  const queueAnchor = document.createComment("Batch progress home");
  queuePanel.before(queueAnchor);
  function positionQueuePanel() {
    updateQueueVisibility();
    const reviewing = Boolean(
      selected?.value.title || selected?.value.description,
    );
    const reviewSlot = find("[data-draft-editor-progress]");
    const target = bulk
      ? find("[data-draft-group-generation]")
      : selected && reviewing
        ? reviewSlot
        : selected || composing
          ? find("[data-draft-generation-actions]")
          : root;
    if (target === root) {
      if (queuePanel.parentElement !== root) queueAnchor.after(queuePanel);
    } else if (queuePanel.parentElement !== target) target.append(queuePanel);
    reviewSlot.hidden = target !== reviewSlot || queuePanel.hidden;
  }
  listeners.push(() => {
    queueAnchor.after(queuePanel);
    queueAnchor.remove();
  });
  const stateMotion = new MutationObserver(() => {
    const view = root.classList.contains("has-import")
      ? "grouping"
      : root.dataset.view || "library";
    const next = `${view}:${tab}:${selected?.value.id || ""}`;
    if (next === previousView) return;
    previousView = next;
    if (initializing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const selector =
      view === "library"
        ? ".draft-library-title, .draft-item-open"
        : view === "grouping"
          ? ".draft-heading, .draft-mode, [data-draft-pool] > .draft-photo > img"
          : "#draft-editor-title, .draft-preparation > img, .draft-text-panel";
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (!el.getClientRects().length) return;
      el.getAnimations().forEach((animation) => animation.cancel());
      el.animate(
        el.classList.contains("draft-text-panel")
          ? [{ opacity: 0.35 }, { opacity: 1 }]
          : [
              { opacity: 0.35, translate: "0 6px" },
              { opacity: 1, translate: "0 0" },
            ],
        { duration: 220, easing: "cubic-bezier(.2,0,0,1)" },
      );
    });
  });
  stateMotion.observe(root, {
    attributes: true,
    attributeFilter: ["class", "data-view"],
  });
  listeners.push(() => {
    stateMotion.disconnect();
    cancelAnimationFrame(initialMotionFrame);
  });
  const sheets = new Map<HTMLDetailsElement, () => void>();
  const closingPopovers = new Set<HTMLDetailsElement>();
  const closingTokens = new WeakMap<HTMLDetailsElement, object>();
  const closePopover = (
    details: HTMLDetailsElement,
    animated = true,
    restoreFocus = true,
  ) => {
    if (details.classList.contains("draft-add-menu")) animated = false;
    if (!details.open || (animated && closingPopovers.has(details))) return;
    if (!animated) {
      details
        .querySelector(".draft-popover-panel")
        ?.getAnimations()
        .forEach((animation) => animation.cancel());
      closingPopovers.delete(details);
    }
    if (
      restoreFocus &&
      batchSettingsItem?.dirty &&
      details.classList.contains("draft-settings")
    ) {
      closingPopovers.add(details);
      void flush()
        .then(() => {
          closingPopovers.delete(details);
          closePopover(details, animated, restoreFocus);
        })
        .catch((error) => {
          closingPopovers.delete(details);
          const status = find("[data-draft-item-save-status]");
          status.hidden = false;
          status.textContent =
            error instanceof Error
              ? error.message
              : "Could not save settings. Try again.";
          action("retry-item-settings").hidden = false;
        });
      return;
    }
    const token = {};
    closingTokens.set(details, token);
    const finish = () => {
      if (closingTokens.get(details) !== token) return;
      closingTokens.delete(details);
      sheets.get(details)?.();
      sheets.delete(details);
      details.open = false;
      closingPopovers.delete(details);
      if (details.classList.contains("draft-settings"))
        globalTrigger?.setAttribute("aria-expanded", "false");
      if (restoreFocus) restorePopoverFocus(details);
      if (restoreFocus && details.classList.contains("draft-settings"))
        batchSettingsItem = null;
    };
    const panel = details.querySelector<HTMLElement>(".draft-popover-panel");
    const motion = animated && panel ? animateSurface(panel, "exit") : null;
    if (motion) {
      closingPopovers.add(details);
      void motion.then(finish);
    } else finish();
  };
  const closeContainedPopovers = (container: HTMLElement) => {
    container
      .querySelectorAll<HTMLDetailsElement>("[data-draft-popover][open]")
      .forEach((details) => closePopover(details, false));
  };
  const positionPhotoPopover = (details: HTMLDetailsElement) => {
    const panel = details.querySelector<HTMLElement>(".draft-popover-panel");
    if (!details.classList.contains("draft-photo-options")) return;
    details.dataset.align = "start";
    if (panel && panel.getBoundingClientRect().right > window.innerWidth - 16)
      details.dataset.align = "end";
  };
  const handledPopoverToggles = new WeakSet<HTMLDetailsElement>();
  const togglePopover = (event: Event, animate = true) => {
    const details = event.target;
    if (
      !(details instanceof HTMLDetailsElement) ||
      !details.hasAttribute("data-draft-popover")
    )
      return;
    if (handledPopoverToggles.has(details)) {
      handledPopoverToggles.delete(details);
      return;
    }
    const wasSheet = details.querySelector(".is-mobile-sheet") !== null;
    sheets.get(details)?.();
    sheets.delete(details);
    if (!details.open) {
      if (details.classList.contains("draft-settings"))
        globalTrigger?.setAttribute(
          "aria-expanded",
          String(Boolean(root.querySelector(".draft-settings[open]"))),
        );
      if (wasSheet) restorePopoverFocus(details);
      return;
    }
    if (details.hasAttribute("data-draft-global-settings")) {
      globalTrigger?.setAttribute("aria-expanded", "true");
      globalSettings = loadDefaults();
      renderGlobalSettings();
      hide("[data-draft-global-save-status]", true);
      label("save-global-defaults", "Save defaults");
    }
    root
      .querySelectorAll<HTMLDetailsElement>("[data-draft-popover][open]")
      .forEach((other) => {
        if (other !== details) closePopover(other, false);
      });
    const panel = details.querySelector<HTMLElement>(".draft-popover-panel");
    if (!panel) return;
    if (details.classList.contains("draft-settings")) {
      globalTrigger?.setAttribute("aria-expanded", "true");
      globalTrigger?.setAttribute("aria-controls", panel.id);
      panel
        .querySelectorAll<HTMLElement>('[data-draft-action="settings-item"]')
        .forEach((button) => (button.hidden = !selected && !batchSettingsItem));
      panel
        .querySelectorAll<HTMLElement>('[data-draft-action="settings-batch"]')
        .forEach((button) => (button.hidden = !bulk));
      panel
        .querySelector(".draft-settings-scope")
        ?.classList.toggle(
          "is-single-scope",
          !selected && !batchSettingsItem && !bulk,
        );
    }
    if (details.classList.contains("draft-add-menu")) return;
    const summary = details.querySelector("summary");
    const name =
      panel.querySelector("h3")?.textContent?.trim() ||
      summary?.getAttribute("aria-label") ||
      summary?.textContent?.trim() ||
      "Photo options";
    panel.setAttribute("aria-label", name);
    if (!panel.querySelector("h3")) {
      const heading = document.createElement("h3");
      heading.textContent = name;
      panel.prepend(heading);
    }
    positionPhotoPopover(details);
    sheets.set(
      details,
      activateMobileSheet(
        panel,
        () => closePopover(details),
        details.classList.contains("draft-settings"),
        animate,
      ),
    );
  };
  function openPopover(details: HTMLDetailsElement, animate = true) {
    if (details.open) return;
    details.open = true;
    // Native toggle is queued. Set up motion and containment before the first paint.
    togglePopover({ target: details } as unknown as Event, animate);
    handledPopoverToggles.add(details);
  }
  root.addEventListener("toggle", togglePopover, true);
  const positionOpenPopovers = () =>
    root
      .querySelectorAll<HTMLDetailsElement>("[data-draft-popover][open]")
      .forEach(positionPhotoPopover);
  window.addEventListener("resize", positionOpenPopovers);
  listeners.push(() => {
    root.removeEventListener("toggle", togglePopover, true);
    window.removeEventListener("resize", positionOpenPopovers);
    sheets.forEach((cleanup, details) => {
      closingTokens.delete(details);
      closingPopovers.delete(details);
      cleanup();
    });
    sheets.clear();
  });
  const activeActions = new Set<string>();
  const beginNavigation = () => {
    restoringHistory = false;
    return ++selectionIntent;
  };
  const key = (id: string) => `autolister:draft:${options.userId}:${id}`;
  const queueKey = `autolister:draft-queue:${options.userId}`;
  const groupsKey = `autolister:draft-groups:${options.userId}`;
  try {
    const ids = JSON.parse(sessionStorage.getItem(groupsKey) || "[]");
    if (Array.isArray(ids)) groupIds = ids.filter(validDraftId).slice(0, 100);
  } catch {}
  const icon = (name: string) =>
    find<HTMLTemplateElement>(
      `[data-draft-icon="${name}"]`,
    ).content.firstElementChild!.cloneNode(true);
  const label = (name: string, value: string) => {
    const el = action(name);
    const span = el.querySelector("[data-draft-label]");
    if (span) span.textContent = value;
    else el.textContent = value;
  };
  const preserveFocus = (container: HTMLElement) => {
    const focused = document.activeElement as HTMLElement | null;
    const focusKey = container.contains(focused)
      ? focused?.dataset.focusKey
      : undefined;
    const openPhotos = Array.from(
      container.querySelectorAll<HTMLDetailsElement>("details[open]"),
    ).map((el) => el.dataset.photoOptions);
    return () => {
      for (const id of openPhotos)
        if (id) {
          const menu = container.querySelector<HTMLDetailsElement>(
            `[data-photo-options="${id}"]`,
          );
          if (menu) openPopover(menu);
        }
      if (focusKey)
        container
          .querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)
          ?.focus({ preventScroll: true });
    };
  };
  function rememberView(push = false) {
    if (disposed || restoringHistory) return;
    history[push ? "pushState" : "replaceState"](
      {
        ...history.state,
        draftWorkspace: {
          owner: options.userId,
          draftId: selected?.value.id,
          composing,
          bulk,
          tab,
          scrollY,
          reviewIds,
          openedFromGrouping,
          libraryPages,
        },
      },
      "",
      location.href,
    );
  }
  function rememberGroups() {
    try {
      sessionStorage.setItem(groupsKey, JSON.stringify(groupIds));
    } catch {}
  }
  const tell = (message: string, error = false) => {
    if (disposed) return;
    if (conflict && error) message = "";
    const el = find("[data-draft-message]");
    el.textContent = message;
    el.hidden = !message;
    el.classList.toggle("is-error", error);
  };
  async function confirmDelete(message: string, photo?: DraftPhoto) {
    const dialog = find<HTMLDialogElement>("[data-draft-delete-dialog]");
    if (dialog.open) return false;
    root
      .querySelectorAll<HTMLDetailsElement>("[data-draft-popover][open]")
      .forEach((details) => closePopover(details, false));
    find("#draft-delete-copy").textContent = message;
    const cover = find<HTMLImageElement>("[data-draft-delete-cover]");
    const url = photo
      ? photo.url
      : selected?.value.photos.find((p) => p.url)?.url;
    cover.alt = photo ? "Photo to delete" : "Item to delete";
    cover.hidden = !url;
    if (url) cover.src = url;
    else cover.removeAttribute("src");
    dialog.returnValue = "cancel";
    const closed = new Promise<boolean>((resolve) =>
      dialog.addEventListener(
        "close",
        () => resolve(!disposed && dialog.returnValue === "confirm"),
        { once: true },
      ),
    );
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[value="cancel"]')!.focus();
    return closed;
  }
  const recovery = (draft: Draft) => {
    try {
      return JSON.parse(sessionStorage.getItem(key(draft.id)) || "null");
    } catch {
      return null;
    }
  };
  const remember = (saved = false) => {
    if (!selected) return;
    try {
      const d = selected.value;
      if (selected.dirty)
        sessionStorage.setItem(
          key(d.id),
          JSON.stringify({
            baseVersion: selected.savedVersion,
            title: d.title,
            description: d.description,
            settings: d.settings,
            state: d.state,
          }),
        );
      else if (saved) sessionStorage.removeItem(key(d.id));
    } catch {
      /* beforeunload still protects edits if storage is unavailable. */
    }
  };
  const bind = (target: EventTarget, type: string, fn: EventListener) => {
    target.addEventListener(type, fn);
    listeners.push(() => target.removeEventListener(type, fn));
  };
  const button = (label: string, click: () => void, className = "") => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.className = className;
    el.addEventListener("click", click);
    return el;
  };
  const run = (fn: () => Promise<unknown>) => {
    void fn().catch((error) => {
      tell(
        error instanceof Error
          ? error.message
          : "Your work could not be saved. Try again.",
        true,
      );
      if ((error as { status?: number }).status === 401) queue.pause();
    });
  };
  const generating = (draft: Draft) =>
    draft.operation_state === "running" ||
    draft.operation_state === "pending" ||
    queue.active === draft.id;
  const outputFailed = (draft: Draft) =>
    !generating(draft) &&
    !queue.remaining.includes(draft.id) &&
    (queue.failed.has(draft.id) || draft.operation_state === "failed");
  bind(root, "mobile-paywall-request", () => options.onViewPlans?.());
  bind(root, "click", (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "a[data-draft-plan-lock]",
    );
    if (
      !link ||
      (event as MouseEvent).ctrlKey ||
      (event as MouseEvent).metaKey ||
      (event as MouseEvent).shiftKey ||
      (event as MouseEvent).altKey
    )
      return;
    event.preventDefault();
    options.onViewPlans?.();
  });
  const photoCount = (draft: Draft) =>
    new Set([
      ...draft.photos.map((p) => p.id),
      ...uploads.filter((p) => p.draftId === draft.id).map((p) => p.id),
    ]).size;
  const busy = (draft?: Draft) =>
    Boolean(
      draft &&
      (generating(draft) ||
        queue.remaining.includes(draft.id) ||
        uploads.some((p) => p.draftId === draft.id && p.state !== "error")),
    );
  const upsert = (draft: Draft) => {
    const index = library.drafts.findIndex((d) => d.id === draft.id);
    if (draft.state === tab) {
      if (index < 0) library.drafts.unshift(draft);
      else library.drafts[index] = draft;
    } else if (index >= 0) library.drafts.splice(index, 1);
  };
  const saveStatus = (status: "saving" | "saved" | "error") => {
    if (disposed) return;
    find("[data-draft-save-status]").textContent =
      status === "saving"
        ? "Saving…"
        : status === "saved"
          ? "Saved"
          : "Not saved";
    action("save").hidden = status !== "error" || conflict;
    find("[data-draft-save-status]").dataset.status = status;
    if (status === "saved" && selected) {
      remember();
      upsert(selected.value);
      renderLibrary();
      renderEditor();
      tell("");
    }
  };
  const makeAutosave = (draft: Draft) => {
    find("[data-draft-save-status]").textContent = "Saved";
    find("[data-draft-save-status]").dataset.status = "saved";
    action("save").hidden = true;
    return new DraftAutosave(
      draft,
      async (input) => {
        try {
          return await draftAction("save", input);
        } catch (error) {
          if ((error as { code?: string }).code === "draft_conflict") {
            conflict = true;
            hide("[data-draft-conflict]", false);
          }
          remember();
          throw error;
        }
      },
      saveStatus,
    );
  };
  async function flush() {
    clearTimeout(saveTimer);
    if (conflict)
      throw new Error(
        "Choose which version of this draft to keep before continuing.",
      );
    const snapshot = batchSettingsItem || selected;
    if (snapshot?.dirty) validateDraftSettings(snapshot.value.settings);
    const hadEdits = snapshot?.dirty;
    await snapshot?.flush();
    if (selected === snapshot) remember(Boolean(hadEdits));
  }
  function renderLibrary() {
    if (disposed) return;
    find(".draft-library-title").textContent =
      tab === "done" ? "Listed items" : "Your drafts";
    const items = find("[data-draft-items]");
    items.setAttribute("aria-busy", String(loading));
    const selectedId = selected?.value.id;
    // The library is hidden in these views. Back navigation renders the latest data.
    if (selected || composing || bulk) {
      renderSelection();
      return;
    }
    if (loading && items.children.length) {
      root
        .querySelectorAll<HTMLButtonElement>("[data-draft-tab]")
        .forEach((el) =>
          el.setAttribute("aria-pressed", String(el.dataset.draftTab === tab)),
        );
      return;
    }
    const restoreFocus = preserveFocus(items);
    items.replaceChildren();
    items.setAttribute("aria-busy", String(loading));
    if (!library.drafts.length) {
      const p = document.createElement("div");
      p.className = "draft-empty";
      p.append(icon("images"));
      const heading = document.createElement("h2");
      heading.textContent = loading
        ? "Loading your drafts…"
        : !action("reload").hidden
          ? "Drafts unavailable"
          : tab === "done"
            ? "Items you mark as listed will appear here."
            : "Prepare your first item";
      p.append(heading);
      if (tab === "draft" && !loading && action("reload").hidden)
        p.append(
          button(
            "Add item",
            () => run(async () => handlers.new()),
            "draft-primary",
          ),
        );
      items.append(p);
    }
    for (const [index, draft] of library.drafts.entries()) {
      const row = document.createElement("div");
      row.className = `draft-item${selectedId === draft.id ? " is-selected" : ""}`;
      const ready =
        draft.photos.length > 0 &&
        draft.photos.every((p) => p.status === "ready") &&
        !busy(draft);
      const check = document.createElement("input");
      check.type = "checkbox";
      check.hidden = !selectionMode;
      check.checked = chosen.has(draft.id);
      check.dataset.focusKey = `select-${draft.id}`;
      check.disabled = busy(draft) || queue.running;
      check.setAttribute(
        "aria-label",
        `Select ${draft.title || `item ${index + 1}`}`,
      );
      check.addEventListener("change", () => {
        check.checked ? chosen.add(draft.id) : chosen.delete(draft.id);
        renderSelection();
      });
      const open = button("", () => {
        if (selectionMode) check.click();
        else run(() => openDraft(draft.id));
      });
      open.className = "draft-item-open";
      open.dataset.focusKey = `open-${draft.id}`;
      open.setAttribute(
        "aria-current",
        selectedId === draft.id ? "true" : "false",
      );
      const cover = draft.photos.find((p) => p.url);
      if (cover?.url) {
        const img = document.createElement("img");
        img.src = cover.url;
        img.alt = "";
        img.loading = "lazy";
        open.append(img);
      } else {
        const placeholder = document.createElement("span");
        placeholder.className = "draft-item-placeholder";
        placeholder.append(icon("images"));
        open.append(placeholder);
      }
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent =
        draft.title ||
        (draft.photos.length ? "Untitled item" : "Untitled draft");
      const detail = document.createElement("span");
      detail.className = "draft-item-detail";
      detail.dataset.state =
        draft.state === "done"
          ? "ready"
          : outputFailed(draft)
            ? "error"
            : busy(draft)
              ? "working"
              : draft.description
                ? "ready"
                : "draft";
      detail.textContent =
        draft.state === "done"
          ? "Listed"
          : queue.active === draft.id
            ? "Generating…"
            : queue.remaining.includes(draft.id)
              ? queue.paused || !queue.running
                ? "Paused"
                : "Waiting…"
              : outputFailed(draft)
                ? "Needs attention"
                : draft.operation_state === "running" ||
                    draft.operation_state === "pending"
                  ? "Check result"
                  : draft.description
                    ? "Ready to copy"
                    : draft.photos.length
                      ? `${draft.photos.length} photo${draft.photos.length === 1 ? "" : "s"} · ${ready ? "Ready to generate" : "Uploading"}`
                      : "No photos yet";
      text.append(title, detail);
      open.append(text);
      row.append(check, open);
      items.append(row);
    }
    action("more").hidden = !library.nextCursor;
    root
      .querySelectorAll<HTMLButtonElement>("[data-draft-tab]")
      .forEach((el) =>
        el.setAttribute("aria-pressed", String(el.dataset.draftTab === tab)),
      );
    renderSelection();
    restoreFocus();
  }
  function renderSelection() {
    root.classList.toggle("is-selecting", selectionMode);
    label("selection", selectionMode ? "Cancel" : "Select");
    action("selection").setAttribute("aria-pressed", String(selectionMode));
    action("selection").hidden = tab === "done" || !library.drafts.length;
    hide("[data-draft-batch-actions]", !selectionMode);
    const eligible = [...chosen].filter((id) => {
      const d = library.drafts.find((d) => d.id === id);
      return (
        d &&
        d.photos.length &&
        d.photos.every((p) => p.status === "ready") &&
        !busy(d)
      );
    });
    action("delete-selected").hidden = !chosen.size;
    action("delete-selected").disabled = queue.running || processing;
    root
      .querySelectorAll<HTMLInputElement>(".draft-item > input")
      .forEach((check) => {
        const open =
          check.parentElement?.querySelector<HTMLButtonElement>(
            ".draft-item-open",
          );
        if (open) {
          open.disabled = selectionMode && check.disabled;
          if (selectionMode)
            open.setAttribute("aria-pressed", String(check.checked));
          else open.removeAttribute("aria-pressed");
        }
      });
    find("[data-draft-selected-count]").textContent = chosen.size
      ? `${chosen.size} selected`
      : "";
    const runSize = Math.min(
      eligible.length,
      DRAFT_LIMITS.batch,
      allowance !== null && allowance > 0 ? allowance : DRAFT_LIMITS.batch,
    );
    action("generate-selected").hidden = !eligible.length;
    label(
      "generate-selected",
      chosen.size
        ? `Generate ${runSize} draft${runSize === 1 ? "" : "s"}`
        : "Generate drafts",
    );
    action("generate-selected").disabled =
      !eligible.length || queue.running || processing;
    action("select-ready").disabled = queue.running;
    action("select-ready").hidden = chosen.size > 0;
  }
  function thumbnail(photo: DraftPhoto, selectable: boolean) {
    const wrap = document.createElement("div");
    wrap.className = "draft-photo";
    if (photo.url) {
      const img = document.createElement("img");
      img.src = photo.url;
      img.alt = "Item photo";
      wrap.append(img);
    } else {
      const p = document.createElement("span");
      p.textContent = "Upload incomplete";
      wrap.append(p);
    }
    if (selectable) {
      const label = document.createElement("label");
      label.className = "draft-photo-select";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = chosenPhotos.has(photo.id);
      check.dataset.draftPhotoId = photo.id;
      check.dataset.focusKey = `photo-${photo.id}`;
      check.disabled = photo.status !== "ready";
      check.setAttribute(
        "aria-label",
        `Select photo ${library.imports.indexOf(photo) + 1}`,
      );
      check.addEventListener("change", () => {
        check.checked
          ? chosenPhotos.add(photo.id)
          : chosenPhotos.delete(photo.id);
        renderPoolSelection();
      });
      label.append(check);
      wrap.append(label);
    }
    return wrap;
  }
  function renderDefaults() {
    syncSettingsControls(
      root,
      "default",
      defaultSettings,
      processing,
      settingsAccess,
    );
    find("[data-draft-default-summary]").textContent =
      `${defaultSettings.descriptionLength === "short" ? "Short" : "Long"} · ${defaultSettings.useBulletPoints ? "Bullets" : "Paragraphs"}`;
  }
  function renderGlobalSettings() {
    syncSettingsControls(root, "global", globalSettings, false, settingsAccess);
  }
  function persistDefaults(settings: DraftSettings) {
    validateDraftSettings(settings);
    localStorage.setItem(defaultsKey, JSON.stringify(settings));
    globalSettings = normalizeDraftSettings(settings);
    if (composing) newItemSettings = globalSettings;
    if (
      !groupIds.length &&
      !library.imports.length &&
      !uploads.some((p) => !p.draftId)
    ) {
      defaultSettings = globalSettings;
      try {
        sessionStorage.setItem(
          batchSettingsKey,
          JSON.stringify(defaultSettings),
        );
      } catch {
        // Persistent defaults are already saved, even if session storage is unavailable.
      }
      renderDefaults();
    }
    renderGlobalSettings();
    renderEditor();
  }
  async function changeBatchSettings(next: DraftSettings) {
    validateDraftSettings(next);
    const previous = defaultSettings;
    const inherited = batchInheritingItems(
      library.drafts,
      groupIds,
      defaultSettings,
    );
    defaultSettings = normalizeDraftSettings(next);
    processing = true;
    const saveStatus = find("[data-draft-batch-save-status]");
    saveStatus.hidden = false;
    saveStatus.classList.remove("draft-settings-error");
    saveStatus.textContent = "Saving…";
    renderPool();
    try {
      for (const draft of inherited) {
        const saved = await draftAction("save", {
          draftId: draft.id,
          expectedVersion: draft.version,
          settings: defaultSettings,
        });
        upsert(saved);
      }
      try {
        sessionStorage.setItem(
          batchSettingsKey,
          JSON.stringify(defaultSettings),
        );
      } catch {}
      saveStatus.textContent = "Saved";
      tell("");
    } catch {
      defaultSettings = previous;
      saveStatus.classList.add("draft-settings-error");
      saveStatus.textContent = "Not saved. Change this setting again to retry.";
      saveStatus.scrollIntoView({ block: "nearest" });
      throw new Error(
        "Batch settings could not be saved for every item. Change this setting again to retry. Each item's last saved choices are safe.",
      );
    } finally {
      processing = false;
      renderPool();
    }
  }
  function batchHasStarted() {
    return groupIds.some(
      (id) =>
        queue.active === id ||
        queue.remaining.includes(id) ||
        queue.completed.includes(id) ||
        queue.failed.has(id) ||
        library.drafts.some(
          (draft) => draft.id === id && Boolean(draft.description),
        ),
    );
  }
  function renderGroups() {
    const started = batchHasStarted();
    const importer = find("[data-draft-import]");
    importer.classList.toggle("has-started", started);
    hide(
      "[data-draft-grouping-complete]",
      !importer.classList.contains("is-complete") || started,
    );
    hide(
      "[data-draft-grouping-instruction]",
      importer.classList.contains("is-complete"),
    );
    if (started) hide("[data-draft-import-controls]", false);
    const groups = groupIds
      .map((id) => library.drafts.find((d) => d.id === id))
      .filter((d): d is Draft => Boolean(d));
    hide(
      "[data-draft-groups]",
      !groups.length &&
        !library.imports.length &&
        !uploads.some((photo) => !photo.draftId),
    );
    find("[data-draft-groups] h2").textContent = groups.length
      ? `Items (${groups.length})`
      : "Your items";
    find("[data-draft-import]").classList.toggle(
      "has-groups",
      Boolean(groups.length),
    );
    const container = find("[data-draft-created-groups]");
    const restoreFocus = preserveFocus(container);
    container.replaceChildren();
    for (const draft of groups) {
      const row = document.createElement("article");
      row.className = "draft-group-row";
      const card = button("", () => run(() => openDraft(draft.id)));
      card.className = "draft-group-card";
      card.dataset.focusKey = `group-${draft.id}`;
      if (draft.photos[0]?.url) {
        const img = document.createElement("img");
        img.src = draft.photos[0].url;
        img.alt = "";
        card.append(img);
      }
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = draft.title || `Item ${groups.indexOf(draft) + 1}`;
      const status = document.createElement("small");
      status.textContent = outputFailed(draft)
        ? "Needs attention"
        : queue.remaining.includes(draft.id)
          ? queue.paused
            ? "Paused"
            : "Waiting"
          : busy(draft)
            ? "Preparing…"
            : draft.description
              ? "Ready to copy"
              : `${draft.photos.length} photo${draft.photos.length === 1 ? "" : "s"} · ${sameSettings(draft.settings, defaultSettings) ? "Uses batch settings" : "Custom settings"}`;
      text.append(title, status);
      card.append(text);
      const settings = button("", () =>
        run(async () => {
          const current = await draftAction("detail", { draftId: draft.id });
          batchSettingsItem = new DraftAutosave(
            current,
            (input) => draftAction("save", input),
            (status) => {
              if (disposed || !batchSettingsItem) return;
              const message = find("[data-draft-item-save-status]");
              message.hidden = false;
              message.textContent =
                status === "saving"
                  ? "Saving…"
                  : status === "saved"
                    ? "Saved"
                    : "Could not save settings. Try again.";
              action("retry-item-settings").hidden = status !== "error";
              if (status === "saved") {
                upsert(batchSettingsItem.value);
                renderGroups();
              }
            },
          );
          renderEditor();
          find<HTMLDetailsElement>("[data-draft-editor-settings]").hidden =
            false;
          openPopover(find<HTMLDetailsElement>("[data-draft-editor-settings]"));
        }),
      );
      settings.append(icon("settings"));
      settings.dataset.focusKey = `group-settings-${draft.id}`;
      settings.title = "Listing settings";
      settings.className = "draft-text-button draft-group-settings";
      settings.setAttribute("aria-label", `Settings for ${title.textContent}`);
      settings.disabled = busy(draft);
      const remove = button(
        "",
        () =>
          run(async () => {
            remove.disabled = true;
            try {
              const empty = await draftAction("group", {
                draftId: draft.id,
                expectedVersion: draft.version,
                photoIds: [],
                sourceVersions: {},
              });
              groupIds = groupIds.filter((id) => id !== draft.id);
              rememberGroups();
              if (!empty.title && !empty.description)
                await draftAction("delete", {
                  draftId: empty.id,
                  expectedVersion: empty.version,
                });
              await reload();
              renderPool();
            } catch (error) {
              await reload();
              renderPool();
              throw error;
            }
          }),
        "draft-text-button draft-group-remove",
      );
      remove.append(icon("remove"));
      remove.setAttribute(
        "aria-label",
        `Remove ${title.textContent} from batch`,
      );
      remove.title = "Remove item. Return photos to the pool.";
      remove.disabled = busy(draft);
      remove.style.visibility = draft.description ? "hidden" : "visible";
      remove.disabled ||= Boolean(draft.description);
      if (outputFailed(draft) || (draft.description && !busy(draft))) {
        const review = button(
          outputFailed(draft) ? "Open" : "Review",
          () => run(() => openDraft(draft.id)),
          "draft-text-button draft-group-review",
        );
        review.dataset.focusKey = `group-review-${draft.id}`;
        review.setAttribute(
          "aria-label",
          `${review.textContent} ${title.textContent}`,
        );
        row.append(remove, card, review);
      } else row.append(remove, card, settings);
      container.append(row);
    }
    const eligibleCount = groups.filter(
      (d) =>
        d.photos.length &&
        !busy(d) &&
        !d.description &&
        d.photos.every((p) => p.status === "ready"),
    ).length;
    const eligible = eligibleCount > 0;
    find("[data-draft-grouping-complete] p").textContent = queue.running
      ? "Drafts are being prepared."
      : queue.remaining.length
        ? "Resume to finish preparing your drafts."
        : eligible
          ? "Ready to generate."
          : "Your drafts are saved and ready to review.";
    action("generate-groups").disabled =
      queue.running || processing || !eligible;
    label(
      "generate-groups",
      `Generate ${eligibleCount} draft${eligibleCount === 1 ? "" : "s"}`,
    );
    find("[data-draft-batch-cost]").textContent = eligibleCount
      ? `Uses ${eligibleCount} generation${eligibleCount === 1 ? "" : "s"}${library.imports.length ? `. ${library.imports.length} unassigned photos stay saved.` : ""}`
      : "";
    action("generate-groups").hidden = !eligible && !queue.running;
    const status = !groups.length
      ? "Group photos to create an item."
      : groups.every((d) => Boolean(d.description))
        ? "All drafts are ready to review and copy."
        : "Open an item to review its photos and finish preparing it.";
    find("[data-draft-groups-status]").textContent = status;
    hide("[data-draft-groups-status]", eligible || !queuePanel.hidden);
    restoreFocus();
  }
  function renderPool() {
    if (disposed) return;
    updatePhoneEntry();
    renderDefaults();
    positionQueuePanel();
    root.classList.toggle("has-import", bulk);
    hide("[data-draft-import]", !bulk);
    find("[data-draft-heading]").textContent = bulk
      ? library.imports.length || groupIds.length
        ? "Prepare several items"
        : "Add several items"
      : tab === "done"
        ? "Listed"
        : "Drafts";
    find("[data-draft-heading]").classList.toggle("draft-sr-only", !bulk);
    find(".draft-heading").hidden = !bulk;
    hide("[data-draft-library-actions]", bulk);
    action("close-import").hidden = !bulk;
    const hasPhotos = Boolean(
      library.imports.length || uploads.some((p) => !p.draftId),
    );
    hide("[data-draft-import] > .draft-mode", hasPhotos || groupIds.length > 0);
    const complete = !hasPhotos && groupIds.length > 0;
    if (bulk && complete)
      find("[data-draft-heading]").textContent = "Your batch";
    find("[data-draft-import]").classList.toggle("is-complete", complete);
    find("[data-draft-import]").classList.toggle(
      "is-empty",
      !hasPhotos && !complete,
    );
    const startedBatch = batchHasStarted();
    hide("[data-draft-grouping-complete]", !complete || startedBatch);
    find("[data-draft-grouping-instruction]").textContent = complete
      ? "All photos grouped. Generate each item automatically."
      : "Select photos of the same item.";
    hide("[data-draft-bulk-entry]", hasPhotos || groupIds.length > 0);
    hide("[data-draft-import-controls]", !hasPhotos && !startedBatch);
    hide(
      "[data-draft-import-summary]",
      bulk ||
        Boolean(selected) ||
        composing ||
        tab === "done" ||
        (!library.imports.length && !uploads.some((p) => !p.draftId)),
    );
    find("[data-draft-import-summary-copy]").textContent =
      `${library.imports.filter((p) => p.status === "ready").length} photos waiting to be grouped`;
    const focused = (document.activeElement as HTMLInputElement | null)?.dataset
      .draftPhotoId;
    const pool = find("[data-draft-pool]");
    const restoreFocus = preserveFocus(pool);
    closeContainedPopovers(pool);
    pool.replaceChildren();
    for (const photo of library.imports) {
      if (uploads.some((p) => p.id === photo.id)) continue;
      const wrap = thumbnail(photo, true);
      const menu = document.createElement("details");
      menu.className = "draft-photo-options";
      const summary = document.createElement("summary");
      summary.append(icon("more"));
      summary.dataset.focusKey = `options-${photo.id}`;
      summary.setAttribute("aria-label", "Photo options");
      menu.dataset.draftPopover = "";
      menu.dataset.photoOptions = photo.id;
      const panel = document.createElement("div");
      panel.className = "draft-popover-panel";
      menu.append(summary, panel);
      panel.append(
        button("Close", () => closePopover(menu), "draft-close"),
        button(
          "Delete",
          () =>
            run(async () => {
              if (
                !(await confirmDelete(
                  "Delete this saved photo? This cannot be undone.",
                  photo,
                ))
              )
                return;
              await draftAction("removePhoto", { photoId: photo.id });
              chosenPhotos.delete(photo.id);
              await reload();
            }),
          "draft-photo-delete",
        ),
      );
      wrap.append(menu);
      pool.append(wrap);
    }
    for (const upload of uploads.filter((p) => !p.draftId))
      pool.append(uploadThumbnail(upload));
    if (focused)
      pool
        .querySelector<HTMLInputElement>(`[data-draft-photo-id="${focused}"]`)
        ?.focus({ preventScroll: true });
    renderPoolSelection();
    restoreFocus();
    renderGroups();
  }
  function renderPoolSelection() {
    hide("[data-draft-import-footer]", !chosenPhotos.size);
    find("[data-draft-photo-count]").textContent =
      `${chosenPhotos.size} photo${chosenPhotos.size === 1 ? "" : "s"} selected`;
    action("individual").hidden = chosenPhotos.size < 2;
    action("group").disabled =
      !chosenPhotos.size ||
      chosenPhotos.size > DRAFT_LIMITS.photos ||
      importing ||
      processing;
    action("individual").disabled =
      !chosenPhotos.size || importing || processing;
    const status =
      chosenPhotos.size > DRAFT_LIMITS.photos
        ? "Choose up to 10 photos for one item, or make each selected photo a separate item."
        : processing
          ? "Uploading photos… You can group the photos that are ready."
          : "";
    find("[data-draft-import-status]").textContent = status;
    hide("[data-draft-import-status]", !status);
  }
  function uploadThumbnail(upload: Upload) {
    const wrap = document.createElement("div");
    wrap.className = "draft-photo draft-upload";
    wrap.dataset.state = upload.state;
    if (upload.preview) {
      const img = document.createElement("img");
      img.src = upload.preview;
      img.alt = "Photo being uploaded";
      img.addEventListener("error", () => img.remove(), { once: true });
      wrap.append(img);
    }
    const text = document.createElement("span");
    text.textContent =
      upload.state === "error"
        ? upload.error || "Upload failed"
        : upload.state === "waiting"
          ? "Waiting…"
          : "Uploading…";
    wrap.append(text);
    if (upload.state === "error") {
      wrap.append(
        button("Retry photo", () =>
          run(async () => {
            await flush();
            upload.state = "waiting";
            void processUploads();
          }),
        ),
      );
      wrap.append(
        button("Remove", () =>
          run(async () => {
            await draftAction("removePhoto", { photoId: upload.id }).catch(
              (e) => {
                if ((e as { status?: number }).status !== 404) throw e;
              },
            );
            removeUpload(upload);
            await reloadSelected();
            await reload();
          }),
        ),
      );
    }
    return wrap;
  }
  function removeUpload(upload: Upload) {
    if (upload.preview) URL.revokeObjectURL(upload.preview);
    const i = uploads.indexOf(upload);
    if (i >= 0) uploads.splice(i, 1);
  }
  function renderEditor() {
    if (disposed) return;
    schedulePhotoViewport();
    if (batchSettingsItem) {
      const draft = batchSettingsItem.value;
      syncSettingsControls(
        root,
        "field",
        draft.settings,
        busy(draft),
        settingsAccess,
      );
      find("[data-draft-settings-context]").textContent =
        `This item · ${draft.title || `Item ${groupIds.indexOf(draft.id) + 1}`}`;
      find("[data-draft-settings-summary]").textContent = "";
      hide("[data-draft-regenerate-notice]", true);
      action("regenerate").hidden = true;
      return;
    }
    updatePhoneEntry();
    const draft = selected?.value;
    positionQueuePanel();
    label("back", openedFromGrouping ? "Back to batch" : "Back to drafts");
    hide("[data-draft-editor]", !draft && !composing);
    hide("[data-draft-editor-empty]", true);
    root.classList.toggle("has-editor", Boolean(draft) || composing);
    root.dataset.view = bulk
      ? "grouping"
      : draft?.title || draft?.description
        ? "review"
        : composing || draft
          ? "preparation"
          : "library";
    if (!draft) {
      find("[data-draft-editor]").classList.remove("is-preparing");
      if (composing) {
        find("#draft-editor-title").textContent = "Add item";
        find("#draft-editor-title").classList.remove("draft-sr-only");
        find("[data-draft-editor]").classList.add("is-empty");
        find("[data-draft-editor]").classList.remove("has-text");
        find("[data-draft-editor]").classList.remove("is-manual");
        find("[data-draft-save-status]").textContent = "";
        closeContainedPopovers(find("[data-draft-item-photos]"));
        find("[data-draft-item-photos]").replaceChildren();
        railSignature = "";
        hide("[data-draft-upload-intro]", false);
        hide("[data-draft-editor-cover]", true);
        hide("[data-draft-upload-actions]", true);
        hide("[data-draft-entry-help]", true);
        action("write").hidden = false;
        for (const selector of [
          "[data-draft-copy-fields]",
          "[data-draft-generation-actions]",
          "[data-draft-editor-footer]",
          "[data-draft-conflict]",
          "[data-draft-recovery]",
          "[data-draft-operation-status]",
          ".draft-item-menu",
          "[data-draft-position]",
        ])
          hide(selector, true);
        hide("[data-draft-editor-settings]", true);
        syncSettingsControls(
          root,
          "field",
          newItemSettings,
          false,
          settingsAccess,
        );
        find("[data-draft-editor-summary]").textContent =
          `${newItemSettings.descriptionLength === "short" ? "Short" : "Long"} · ${newItemSettings.useBulletPoints ? "Bullet points" : "Paragraphs"}`;
        find("[data-draft-settings-summary]").textContent =
          `${settingsLanguages(newItemSettings)}\n${settingsExtras(permittedDraftSettings(newItemSettings, settingsAccess))}`;
        find("[data-draft-settings-context]").textContent = "For this new item";
        hide("[data-draft-regenerate-notice]", true);
        action("regenerate").hidden = true;
        hide(".draft-entry-mode", false);
        for (const name of ["previous", "next", "check", "save"])
          action(name).hidden = true;
        root
          .querySelectorAll<HTMLInputElement>(
            '[data-draft-input="item"],[data-draft-input="camera"]',
          )
          .forEach((el) => {
            el.disabled = false;
          });
      }
      return;
    }
    if (preparationDraftId !== draft.id) {
      root
        .querySelectorAll<HTMLDetailsElement>("[data-draft-popover][open]")
        .forEach((details) => closePopover(details, false));
      railSignature = "";
    }
    preparationDraftId = draft.id;
    const hasText = Boolean(draft.title || draft.description);
    const failedOutput = outputFailed(draft);
    const hasPhotos = Boolean(photoCount(draft));
    find("[data-draft-editor]").classList.toggle(
      "is-preparing",
      hasPhotos &&
        !hasText &&
        writingDraftId !== draft.id &&
        draft.state !== "done",
    );
    hide("[data-draft-entry-help]", true);
    const editing = hasText || writingDraftId === draft.id;
    find("[data-draft-editor]").classList.toggle(
      "is-manual",
      !hasPhotos && (hasText || writingDraftId === draft.id),
    );
    find("[data-draft-editor]").classList.toggle("is-editing", editing);
    find("[data-draft-editor]").classList.toggle("has-text", hasText);
    hide(
      "[data-draft-upload-intro]",
      hasPhotos || hasText || writingDraftId === draft.id,
    );
    hide(
      "[data-draft-generation-actions]",
      (!hasPhotos || hasText || draft.state === "done") &&
        (queuePanel.hidden ||
          queuePanel.parentElement !== find("[data-draft-generation-actions]")),
    );
    hide(
      "[data-draft-upload-actions]",
      !hasPhotos || hasText || draft.state === "done",
    );
    hide("[data-draft-editor-settings]", false);
    hide(
      ".draft-entry-mode",
      hasPhotos ||
        hasText ||
        writingDraftId === draft.id ||
        draft.state === "done",
    );
    hide("[data-draft-regenerate-notice]", !hasText);
    hide("[data-draft-copy-fields]", !hasText && writingDraftId !== draft.id);
    hide("[data-draft-editor-footer]", !hasText && draft.state !== "done");
    action("write").hidden =
      hasText || hasPhotos || writingDraftId === draft.id;
    hide(".draft-item-menu", false);
    find("[data-draft-editor]").classList.toggle(
      "is-empty",
      !hasPhotos && !hasText && writingDraftId !== draft.id,
    );
    find("[data-draft-preparation-label]").textContent = draft.photos.length
      ? `Photos · ${draft.photos.length}`
      : "Photos";
    find("[data-draft-settings-summary]").textContent =
      `${settingsLanguages(draft.settings)}\n${settingsExtras(permittedDraftSettings(draft.settings, settingsAccess))}`;
    find("[data-draft-editor-summary]").textContent =
      `${draft.settings.descriptionLength === "short" ? "Short" : "Long"} · ${draft.settings.useBulletPoints ? "Bullet points" : "Paragraphs"}`;
    find("[data-draft-settings-context]").textContent =
      `This item${draft.title ? ` · ${draft.title}` : ""}`;
    const locked = busy(draft);
    const outputPreparing =
      generating(draft) || queue.remaining.includes(draft.id);
    const order = reviewOrder();
    const index = order.indexOf(draft.id);
    find("#draft-editor-title").textContent = outputPreparing
      ? "Preparing item"
      : failedOutput
        ? "Needs attention"
        : writingDraftId === draft.id
          ? "Write item"
          : hasText
            ? "Review and copy"
            : draft.state === "done"
              ? "Listed item"
              : "Prepare item";
    find("#draft-editor-title").classList.remove("draft-sr-only");
    const cover = find<HTMLImageElement>("[data-draft-editor-cover]");
    const coverUrl =
      draft.photos.find((p) => p.url)?.url ||
      uploads.find((p) => p.draftId === draft.id && p.preview)?.preview;
    cover.hidden = !coverUrl;
    if (coverUrl) cover.src = coverUrl;
    else cover.removeAttribute("src");
    find("[data-draft-position]").textContent =
      index >= 0 ? `${index + 1} / ${order.length}` : "";
    hide("[data-draft-position]", order.length < 2);
    action("previous").hidden = order.length < 2;
    action("next").hidden = order.length < 2;
    const batchReview = generationCount > 1 && reviewIds.includes(draft.id);
    action("next").setAttribute(
      "aria-label",
      batchReview ? "Next ready item" : "Next",
    );
    action("next").querySelector("span")!.textContent = batchReview
      ? "Next ready"
      : "Next";
    action("previous").disabled = !reviewTarget(-1);
    action("next").disabled = !reviewTarget(1);
    action("next").title =
      batchReview && !reviewTarget(1) && queue.running
        ? "The next item is still preparing."
        : "";
    for (const name of ["title", "description"] as const) {
      const el = find<HTMLInputElement | HTMLTextAreaElement>(
        `[data-draft-field="${name}"]`,
      );
      if (el.value !== draft[name]) el.value = draft[name];
      el.hidden = !editing;
      if (name === "description" && !el.hidden) {
        resizeDescription();
      }
      const readable = find(`[data-draft-read="${name}"]`);
      readable.textContent = draft[name];
      readable.hidden = editing;
      el.disabled = locked;
      action(`copy-${name}`).disabled = outputPreparing || !draft[name];
      action(`copy-${name}`).setAttribute(
        "aria-label",
        `Copy ${failedOutput ? "previous " : ""}${name}`,
      );
      label(`copy-${name}`, failedOutput ? "Copy previous" : "Copy");
    }
    syncSettingsControls(root, "field", draft.settings, locked, settingsAccess);
    root
      .querySelectorAll<HTMLInputElement>(
        '[data-draft-input="item"], [data-draft-input="camera"]',
      )
      .forEach((el) => {
        el.disabled =
          outputPreparing || photoCount(draft) >= DRAFT_LIMITS.photos;
      });
    const photoSource = find<HTMLElement>(".draft-photo-source > summary");
    const cannotAddPhotos =
      outputPreparing || photoCount(draft) >= DRAFT_LIMITS.photos;
    photoSource.setAttribute("aria-disabled", String(cannotAddPhotos));
    photoSource.title = cannotAddPhotos
      ? "Remove a photo to add another"
      : "Add photos";
    const singleGenerating =
      startingGenerationId === draft.id || generating(draft);
    label(
      "generate",
      singleGenerating
        ? "Generating…"
        : failedOutput
          ? "Retry generation"
          : "Generate draft",
    );
    action("generate").setAttribute("aria-busy", String(singleGenerating));
    find("[data-draft-generate-play]").toggleAttribute(
      "hidden",
      singleGenerating,
    );
    find("[data-draft-generate-loader]").toggleAttribute(
      "hidden",
      !singleGenerating,
    );
    action("generate").disabled =
      singleGenerating ||
      processing ||
      locked ||
      !draft.photos.length ||
      draft.photos.some((p) => p.status !== "ready") ||
      !find<HTMLTextAreaElement>('[data-draft-field="descriptionFooterText"]')
        .validity.valid;
    action("regenerate").disabled = action("generate").disabled;
    action("regenerate").hidden = !hasText || draft.state === "done";
    action("done").disabled = failedOutput
      ? action("generate").disabled
      : locked;
    action("done")
      .querySelector("svg")
      ?.replaceWith(icon(failedOutput ? "rotate" : "check"));
    label(
      "done",
      failedOutput
        ? "Retry · 1 generation"
        : selected?.savedState === "done"
          ? "Move to drafts"
          : "Mark as listed",
    );
    action("check").hidden = !(
      draft.operation_state === "running" || draft.operation_state === "pending"
    );
    find("[data-draft-operation-status]").textContent =
      (failedOutput
        ? `${queue.failed.get(draft.id) || "Generation failed."}${hasText ? " Previous text kept." : ""}`
        : "") ||
      (queue.remaining.includes(draft.id)
        ? "Waiting for its turn. The previous text will be replaced."
        : "") ||
      (draft.operation_state === "running" ||
      draft.operation_state === "pending"
        ? "Your generation is still being saved. Check its result before trying again."
        : "");
    hide(
      "[data-draft-operation-status]",
      !find("[data-draft-operation-status]").textContent,
    );
    find("[data-draft-generate-help]").textContent = locked
      ? "You can review another draft while this item is being prepared."
      : "";
    hide("[data-draft-generate-help]", true);
    hide("[data-draft-conflict]", !conflict);
    const rail = find("[data-draft-item-photos]");
    const targets = library.drafts.filter(
      (d) => d.id !== draft.id && !busy(d) && d.photos.length < 10,
    );
    const signature = JSON.stringify([
      draft.id,
      draft.photos,
      locked,
      uploads
        .filter((p) => p.draftId === draft.id)
        .map((p) => [p.id, p.state, p.preview, p.error]),
      targets.map((d) => [d.id, d.title]),
    ]);
    if (railSignature === signature) return;
    const photoScroll = railSignature
      ? { top: rail.scrollTop, left: rail.scrollLeft }
      : { top: 0, left: 0 };
    railSignature = signature;
    const restoreFocus = preserveFocus(rail);
    closeContainedPopovers(rail);
    rail.replaceChildren();
    for (const photo of draft.photos) {
      if (uploads.some((p) => p.id === photo.id)) continue;
      const wrap = thumbnail(photo, false);
      const controls = document.createElement("div");
      controls.className = "draft-photo-controls";
      if (photo.url) {
        controls.append(
          button("Save photo (JPEG)", () =>
            run(async () => {
              const url = URL.createObjectURL(
                await client.readDraftPhoto(photo.id),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `autolister-${photo.position + 1}.jpg`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }),
          ),
        );
        const help = document.createElement("p");
        help.className = "draft-photo-download-help";
        help.textContent =
          "Prepared JPEG. Keep your originals for full quality.";
        controls.append(help);
      }
      if (!locked) {
        if (photo.status === "ready") {
          controls.prepend(
            button("Edit photo", () =>
              run(async () => {
                if (photoEditor || openingPhotoEditor) return;
                openingPhotoEditor = true;
                const menu = controls.closest<HTMLDetailsElement>("details");
                const trigger =
                  controls.querySelector<HTMLButtonElement>("button")!;
                trigger.disabled = true;
                trigger.textContent = "Opening…";
                try {
                  await flush();
                  const [editor, blob] = await Promise.all([
                    import("./photoEditor.js"),
                    client.readDraftPhoto(photo.id),
                  ]);
                  if (
                    disposed ||
                    selected?.value.id !== draft.id ||
                    !menu?.open
                  )
                    return;
                  closeContainedPopovers(rail);
                  photoEditor = editor.openPhotoEditor({
                    photo: blob,
                    icon,
                    onSave: async (replacement) => {
                      if (disposed || selected?.value.id !== draft.id)
                        throw new Error("Reopen this item to edit its photo.");
                      await flush();
                      await client.editDraftPhoto(
                        {
                          draftId: draft.id,
                          photoId: photo.id,
                          revision: photo.revision || 0,
                        },
                        replacement,
                      );
                      await reloadSelected();
                      await reload();
                    },
                    onClose: () => {
                      photoEditor = undefined;
                      root
                        .querySelector<HTMLElement>(
                          `[data-focus-key="options-${photo.id}"]`,
                        )
                        ?.focus({ preventScroll: true });
                    },
                  });
                } finally {
                  openingPhotoEditor = false;
                  trigger.disabled = false;
                  trigger.textContent = "Edit photo";
                }
              }),
            ),
          );
          if (photo.original_bytes)
            controls.append(
              button("Restore original", () =>
                run(async () => {
                  await flush();
                  await client.editDraftPhoto(
                    {
                      draftId: draft.id,
                      photoId: photo.id,
                      revision: photo.revision || 0,
                    },
                    null,
                  );
                  closeContainedPopovers(rail);
                  await reloadSelected();
                  await reload();
                  root
                    .querySelector<HTMLElement>(
                      `[data-focus-key="options-${photo.id}"]`,
                    )
                    ?.focus({ preventScroll: true });
                }),
              ),
            );
        }
        if (photo.position > 0 && photo.status === "ready")
          controls.append(
            button("Use as cover", () =>
              run(() =>
                regroup([
                  photo.id,
                  ...draft.photos
                    .filter((p) => p.id !== photo.id)
                    .map((p) => p.id),
                ]),
              ),
            ),
          );
        controls.append(
          button("Ungroup", () =>
            run(() =>
              regroup(
                draft.photos.filter((p) => p.id !== photo.id).map((p) => p.id),
              ),
            ),
          ),
        );
        controls.append(
          button("Delete photo", () =>
            run(async () => {
              if (
                !(await confirmDelete(
                  `Delete photo ${photo.position + 1}? Your other photos and text will stay saved.`,
                  photo,
                ))
              )
                return;
              await flush();
              await draftAction("removePhoto", { photoId: photo.id });
              await reloadSelected();
              await reload();
            }),
          ),
        );
        if (targets.length) {
          const move = document.createElement("select");
          move.setAttribute("aria-label", "Move photo to another item");
          move.append(new Option("Move to item…", ""));
          for (const [i, d] of targets.entries())
            move.append(new Option(d.title || `Item ${i + 1}`, d.id));
          move.addEventListener("change", () =>
            run(async () => {
              if (!move.value) return;
              await flush();
              const target = await draftAction("detail", {
                draftId: move.value,
              });
              await draftAction("group", {
                draftId: target.id,
                expectedVersion: target.version,
                photoIds: [...target.photos.map((p) => p.id), photo.id],
                sourceVersions: { [draft.id]: selected!.value.version },
              });
              await reloadSelected();
              await reload();
            }),
          );
          controls.append(move);
        }
      }
      if (!locked) {
        const menu = document.createElement("details");
        menu.className = "draft-photo-options";
        const summary = document.createElement("summary");
        summary.append(icon("more"));
        summary.setAttribute(
          "aria-label",
          `Photo ${photo.position + 1} options`,
        );
        summary.dataset.focusKey = `options-${photo.id}`;
        menu.dataset.photoOptions = photo.id;
        menu.dataset.draftPopover = "";
        const panel = document.createElement("div");
        panel.className = "draft-popover-panel";
        panel.append(
          button("Close", () => closePopover(menu), "draft-close"),
          controls,
        );
        controls
          .querySelectorAll<HTMLElement>("button,select")
          .forEach((el, i) => {
            el.dataset.focusKey = `control-${photo.id}-${i}`;
          });
        menu.append(summary, panel);
        wrap.append(menu);
      }
      rail.append(wrap);
    }
    for (const upload of uploads.filter((p) => p.draftId === draft.id))
      rail.append(uploadThumbnail(upload));
    restoreFocus();
    rail.scrollTop = photoScroll.top;
    rail.scrollLeft = photoScroll.left;
  }
  async function reloadSelected() {
    if (!selected || disposed) return;
    if (selected.dirty) return;
    const snapshot = selected;
    const id = selected.value.id;
    const draft = await draftAction("detail", { draftId: id });
    if (
      disposed ||
      selected !== snapshot ||
      selected.dirty ||
      draft.version < selected.value.version
    )
      return;
    selected = makeAutosave(draft);
    upsert(draft);
    renderEditor();
    renderLibrary();
  }
  async function reload(more = false) {
    if (disposed) return;
    const request = ++libraryLoad;
    const requestedTab = tab;
    loading = true;
    action("reload").hidden = true;
    renderLibrary();
    try {
      const data = await listDrafts(
        tab,
        more ? library.nextCursor || undefined : undefined,
      );
      if (!more) {
        for (let page = 1; page < libraryPages && data.nextCursor; page++) {
          const next = await listDrafts(requestedTab, data.nextCursor);
          if (disposed || request !== libraryLoad || requestedTab !== tab)
            return;
          data.drafts.push(...next.drafts);
          data.nextCursor = next.nextCursor;
        }
      } else libraryPages++;
      if (disposed || request !== libraryLoad || requestedTab !== tab) return;
      library = {
        ...data,
        drafts: more
          ? [
              ...library.drafts,
              ...data.drafts.filter(
                (d) => !library.drafts.some((old) => old.id === d.id),
              ),
            ]
          : data.drafts,
      };
      for (const id of chosen)
        if (!library.drafts.some((d) => d.id === id)) chosen.delete(id);
      for (const id of chosenPhotos)
        if (!library.imports.some((p) => p.id === id && p.status === "ready"))
          chosenPhotos.delete(id);
      if (groupIds.length && tab === "draft") {
        for (const id of groupIds.filter(
          (id) => !library.drafts.some((d) => d.id === id),
        )) {
          try {
            const group = await draftAction("detail", { draftId: id });
            if (disposed || request !== libraryLoad || requestedTab !== tab)
              return;
            if (group.state === "draft") upsert(group);
            else {
              groupIds = groupIds.filter((groupId) => groupId !== id);
              rememberGroups();
            }
          } catch (error) {
            if ((error as { status?: number }).status !== 404) throw error;
            groupIds = groupIds.filter((groupId) => groupId !== id);
            rememberGroups();
          }
        }
      }
    } catch (error) {
      action("reload").hidden = false;
      throw error;
    } finally {
      loading = false;
      renderLibrary();
      renderPool();
    }
  }
  async function openDraft(
    id: string,
    focus = true,
    push = true,
    intent = beginNavigation(),
  ) {
    if (!selected && !restoringHistory) {
      scrollY = window.scrollY;
      rememberView();
    }
    await flush();
    if (disposed || intent !== selectionIntent) return;
    let draft = await draftAction("detail", { draftId: id });
    if (disposed || intent !== selectionIntent) return;
    if (selected?.dirty) await flush();
    if (disposed || intent !== selectionIntent) return;
    if (selected?.value.id === id && selected.value.version > draft.version)
      draft = selected.value;
    if (bulk) openedFromGrouping = true;
    bulk = false;
    composing = false;
    selected = makeAutosave(draft);
    conflict = false;
    upsert(draft);
    renderEditor();
    renderLibrary();
    renderPool();
    rememberView(push);
    hide("[data-draft-recovery]", !recovery(draft));
    if (focus) {
      find("#draft-editor-title").tabIndex = -1;
      find("#draft-editor-title").focus({ preventScroll: true });
      if (matchMedia("(max-width: 767px)").matches)
        root.scrollIntoView({ block: "start" });
    }
  }
  async function newDraft(photoIds: string[] = []) {
    validateDraftSettings(newItemSettings);
    const intent = beginNavigation();
    await flush();
    if (disposed || intent !== selectionIntent) return;
    bulk = false;
    composing = false;
    renderPool();
    if (tab !== "draft") {
      tab = "draft";
      await reload();
      if (disposed || intent !== selectionIntent) return;
    }
    const unstarted =
      !photoIds.length &&
      library.drafts.find(
        (draft) =>
          !draft.title &&
          !draft.description &&
          !draft.photos.length &&
          !busy(draft) &&
          !uploads.some((upload) => upload.draftId === draft.id) &&
          !recovery(draft),
      );
    if (unstarted) {
      await openDraft(unstarted.id, true, false, intent);
      return unstarted;
    }
    const draft = await draftAction("create", {
      id: crypto.randomUUID(),
      settings: newItemSettings,
      photoIds,
    });
    upsert(draft);
    if (disposed || intent !== selectionIntent) return draft;
    chosenPhotos.clear();
    await openDraft(draft.id, true, false, intent);
    await reload();
    return draft;
  }
  async function regroup(photoIds: string[]) {
    await flush();
    const d = selected!.value;
    await draftAction("group", {
      draftId: d.id,
      expectedVersion: d.version,
      photoIds,
      sourceVersions: {},
    });
    await reloadSelected();
    await reload();
  }
  async function addFiles(files: File[], bulkInput: boolean) {
    if (!files.length) return;
    if (files.length > (bulkInput ? 100 : 10))
      throw new Error(
        bulkInput
          ? "Choose up to 100 photos per import."
          : "Choose up to 10 photos for one item.",
      );
    await flush();
    const draft = bulkInput ? undefined : selected?.value || (await newDraft());
    if (!bulkInput && !draft) return;
    const draftId = draft?.id;
    if (
      draftId &&
      (generating(draft!) || photoCount(draft!) + files.length > 10)
    )
      throw new Error(
        "One item can have up to 10 photos. Wait for uploads or choose fewer photos.",
      );
    const importId = crypto.randomUUID();
    for (const file of files)
      uploads.push({
        id: crypto.randomUUID(),
        importId,
        draftId,
        file,
        preview: URL.createObjectURL(file),
        state: "waiting",
      });
    if (bulkInput) bulk = true;
    renderPool();
    renderEditor();
    void processUploads();
  }
  async function processUploads() {
    if (processing || disposed) return;
    processing = true;
    renderSelection();
    const worker = async () => {
      while (!disposed) {
        const upload = uploads.find((p) => p.state === "waiting");
        if (!upload) break;
        upload.state = "uploading";
        renderPool();
        renderEditor();
        try {
          if (!upload.prepared) {
            const prepared = await prepareMobileImage(upload.file);
            upload.prepared = prepared.file;
            if (upload.preview) URL.revokeObjectURL(upload.preview);
            upload.preview = prepared.previewUrl;
            renderPool();
            renderEditor();
          }
          if (disposed) break;
          await uploadDraftPhoto(upload.prepared, {
            photoId: upload.id,
            importId: upload.importId,
            ...(upload.draftId ? { draftId: upload.draftId } : {}),
          });
          void trackMobileEvent("upload_complete", {
            imageCount: 1,
            target: "draft_workspace",
          });
          removeUpload(upload);
          await reload();
          await reloadSelected();
        } catch (error) {
          upload.state = "error";
          upload.error =
            error instanceof Error ? error.message : "Upload failed";
          renderPool();
          renderEditor();
        }
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
    } finally {
      await reloadSelected().catch(() => undefined);
      processing = false;
      renderPool();
      renderEditor();
      renderSelection();
      if (uploads.some((p) => p.state === "waiting")) void processUploads();
    }
  }
  const queue = new DraftQueue(async (id) => {
    if (disposed) return;
    const current = await draftAction("detail", { draftId: id });
    if (
      !attempts.has(id) &&
      (current.operation_state === "running" ||
        current.operation_state === "pending")
    ) {
      const recovered = await draftAction("recover", { draftId: id });
      upsert(recovered);
      if (recovered.operation_state !== "succeeded")
        throw Object.assign(
          new Error(
            "This item is still being saved. Check its result before retrying.",
          ),
          { code: "generation_commit_pending" },
        );
    } else {
      let attempt = attempts.get(id);
      if (!attempt) {
        attempt = {
          operationId: crypto.randomUUID(),
          inputVersion: current.input_version,
        };
        attempts.set(id, attempt);
        renderQueue();
      }
      try {
        await executeDraftAttempt(
          current,
          attempt,
          generationCount > 1,
          settingsAccess,
        );
        void trackMobileEvent("generation_success", {
          target: "draft_workspace",
          imageCount: current.photos.length,
          method: generationCount > 1 ? "batch" : "single",
          count: generationCount,
        });
      } catch (error) {
        const recovered = await draftAction("recover", { draftId: id }).catch(
          () => null,
        );
        if (disposed) return;
        if (recovered) {
          upsert(recovered);
          if (selected?.value.id === id && !selected.dirty) {
            selected = makeAutosave(recovered);
            renderEditor();
          }
        }
        const blockedUsage = await options.onUsageChange();
        const blockCode = (error as { code?: string }).code;
        void trackMobileEvent("generation_error", {
          target: "draft_workspace",
          errorCode: blockCode || "generation_failed",
          method: generationCount > 1 ? "batch" : "single",
          count: generationCount,
        });
        if (
          blockCode &&
          [
            "free_lifetime_limit",
            "daily_limit",
            "monthly_limit",
            "account_paused",
            "payment_required",
          ].includes(blockCode)
        )
          options.onGenerationBlocked?.(blockedUsage, blockCode);
        if (
          recovered?.operation_state !== "succeeded" ||
          recovered.operation_id !== attempt.operationId
        ) {
          if (
            !recovered ||
            recovered.operation_state === "running" ||
            recovered.operation_state === "pending"
          )
            throw Object.assign(
              new Error(
                "This item's outcome is still being checked. Use Check saved result before trying again.",
              ),
              {
                code: "generation_commit_pending",
                status: (error as { status?: number }).status || 503,
              },
            );
          throw error;
        }
      }
    }
    const generated = await draftAction("detail", { draftId: id });
    if (disposed) return;
    upsert(generated);
    if (selected?.value.id === id && !selected.dirty) {
      selected = makeAutosave(generated);
      renderEditor();
    }
    await options.onUsageChange();
  }, renderQueue);
  function updateQueueVisibility() {
    const keepCompletedProgress =
      generationCount > 1 &&
      queue.completed.length > 0 &&
      ((Boolean(selected) && reviewIds.includes(selected!.value.id)) ||
        (bulk && groupIds.some((id) => queue.completed.includes(id))));
    hide(
      "[data-draft-queue]",
      (generationCount === 1 &&
        !selected?.value.title &&
        !selected?.value.description &&
        queue.running &&
        Boolean(selected) &&
        (selected?.value.id === queue.active ||
          startingGenerationId === selected?.value.id)) ||
        (!queue.running &&
          !queue.remaining.length &&
          !queue.failed.size &&
          !keepCompletedProgress),
    );
  }
  function renderQueue() {
    if (disposed) return;
    if (bulk) find("[data-draft-heading]").textContent = "Your batch";
    try {
      if (queue.running || queue.remaining.length || queue.failed.size)
        sessionStorage.setItem(
          queueKey,
          JSON.stringify({
            remaining: queue.active
              ? [queue.active, ...queue.remaining]
              : queue.remaining,
            completed: queue.completed,
            failed: [...queue.failed],
            attempts: [...attempts],
            total: generationCount,
          }),
        );
      else sessionStorage.removeItem(queueKey);
    } catch {}
    updateQueueVisibility();
    find("[data-draft-queue-title]").textContent = queue.running
      ? `${queue.completed.length} of ${generationCount} ready${queue.paused ? " · Pausing" : ""}`
      : queue.remaining.length
        ? `Paused · ${queue.completed.length} of ${generationCount} ready`
        : `${queue.completed.length} of ${generationCount} ready${queue.failed.size ? ` · ${queue.failed.size} need attention` : ""}`;
    find("[data-draft-queue-copy]").textContent = queue.running
      ? "Keep AutoLister open while preparing."
      : queue.remaining.length
        ? `${queue.remaining.length} items left.`
        : "";
    hide(
      "[data-draft-queue-copy]",
      !find("[data-draft-queue-copy]").textContent,
    );
    action("pause").hidden = !queue.running || queue.paused;
    action("resume").hidden = queue.running || !queue.remaining.length;
    const rows = find("[data-draft-queue-items]");
    rows.replaceChildren();
    const ids = [
      ...new Set([
        ...queue.completed,
        ...(queue.active ? [queue.active] : []),
        ...queue.remaining,
        ...queue.failed.keys(),
      ]),
    ];
    for (const id of ids) {
      const draft = library.drafts.find((d) => d.id === id);
      const row = document.createElement("div");
      row.className = "draft-queue-row";
      const cover = document.createElement("img");
      cover.alt = "";
      cover.className = "draft-queue-cover";
      const url = draft?.photos.find((p) => p.url)?.url;
      if (url) cover.src = url;
      else cover.hidden = true;
      const name = document.createElement("span");
      name.textContent = draft?.title || `Item ${ids.indexOf(id) + 1}`;
      const status = document.createElement("span");
      status.className = "draft-queue-item-status";
      status.textContent = queue.failed.has(id)
        ? "Needs attention"
        : queue.completed.includes(id)
          ? "Ready"
          : queue.active === id
            ? "Generating"
            : "Waiting";
      status.prepend(
        icon(
          queue.failed.has(id)
            ? "warning"
            : queue.completed.includes(id)
              ? "check"
              : queue.active === id
                ? "loading"
                : "waiting",
        ),
      );
      row.dataset.status = status.textContent.toLowerCase().replace(/ /g, "-");
      row.append(cover, name, status);
      if (queue.completed.includes(id) || queue.failed.has(id)) {
        const review = button(
          queue.failed.has(id) ? "Open" : "Review",
          () => openDraft(id),
          "draft-text-button",
        );
        review.setAttribute(
          "aria-label",
          `${review.textContent} ${name.textContent}`,
        );
        row.append(review);
      }
      rows.append(row);
    }
    renderLibrary();
    renderEditor();
    if (bulk) renderGroups();
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(queueKey) || "null");
    if (
      saved &&
      Array.isArray(saved.remaining) &&
      saved.remaining.length <= 20 &&
      saved.remaining.every(validDraftId) &&
      Array.isArray(saved.completed) &&
      saved.completed.length <= 20 &&
      saved.completed.every(validDraftId) &&
      Number.isSafeInteger(saved.total) &&
      saved.total <= 20 &&
      saved.total > 0
    ) {
      queue.remaining = [...new Set<string>(saved.remaining)];
      queue.completed = [...new Set<string>(saved.completed)];
      queue.paused = true;
      generationCount = saved.total;
      if (Array.isArray(saved.attempts))
        for (const [id, attempt] of saved.attempts.slice(0, 20))
          if (
            validDraftId(id) &&
            attempt &&
            validDraftId(attempt.operationId) &&
            Number.isSafeInteger(attempt.inputVersion) &&
            attempt.inputVersion > 0
          )
            attempts.set(id, attempt);
      if (Array.isArray(saved.failed))
        for (const entry of saved.failed.slice(0, 20))
          if (
            Array.isArray(entry) &&
            validDraftId(entry[0]) &&
            typeof entry[1] === "string"
          )
            queue.failed.set(entry[0], entry[1].slice(0, 300));
      renderQueue();
    }
  } catch {}
  async function startGeneration(ids: string[]) {
    if (processing)
      throw new Error("Wait for your settings and photos to finish saving.");
    if (bulk)
      validateDraftSettings({
        ...defaultSettings,
        descriptionFooterText: find<HTMLTextAreaElement>(
          '[data-draft-default="descriptionFooterText"]',
        ).value,
      });
    root
      .querySelectorAll<HTMLDetailsElement>("[data-draft-popover][open]")
      .forEach((details) => closePopover(details, false));
    await flush();
    if (
      queue.remaining.length &&
      !window.confirm(
        "Replace the paused batch with this selection? Its remaining items will stay saved as drafts.",
      )
    )
      return;
    if (!ids.length) throw new Error("Select at least one item to generate.");
    const usage = await options.onUsageChange();
    if (usage?.canGenerate === false && options.onGenerationBlocked?.(usage))
      return;
    const available = Math.min(
      DRAFT_LIMITS.batch,
      draftGenerationAllowance(usage),
    );
    if (ids.length > available) {
      if (
        !window.confirm(
          `Generate the first ${available} of ${ids.length} selected items? This run uses ${available} generations (up to 20 per run). The remaining items stay saved.`,
        )
      )
        return;
      ids = ids.slice(0, available);
    }
    if (
      ids.some((id) => {
        const d = library.drafts.find((item) => item.id === id);
        return Boolean(d?.title || d?.description);
      }) &&
      !window.confirm(
        `Replace the current title and description for ${ids.length === 1 ? "this item" : `${ids.length} items`}? This uses ${ids.length} generation${ids.length === 1 ? "" : "s"}.`,
      )
    )
      return;
    generationCount = ids.length;
    void trackMobileEvent("web_generation_run", {
      method: ids.length > 1 ? "batch" : "single",
      count: ids.length,
      target: "draft_workspace",
    });
    reviewIds = [...ids];
    rememberView();
    attempts.clear();
    chosen.clear();
    tell("");
    const pending = queue.start(ids);
    renderEditor();
    await pending;
    renderEditor();
  }
  async function resolveConflict(keep: boolean) {
    if (!selected) return;
    const snapshot = selected;
    const saved = await draftAction("detail", { draftId: snapshot.value.id });
    if (disposed || selected !== snapshot) return;
    const edits = selected.value;
    if (
      keep &&
      (saved.operation_state === "running" ||
        saved.operation_state === "pending")
    )
      throw new Error(
        "Wait for this item's generation to finish before saving your edits.",
      );
    selected = makeAutosave(saved);
    conflict = false;
    if (keep) {
      selected.edit({
        title: edits.title,
        description: edits.description,
        settings: edits.settings,
        state: edits.state,
      });
      await flush();
    } else {
      try {
        sessionStorage.removeItem(key(saved.id));
      } catch {}
    }
    renderEditor();
    renderLibrary();
    tell("");
  }
  function openSettingsScope(selector: string) {
    root
      .querySelectorAll<HTMLDetailsElement>(".draft-settings[open]")
      .forEach((details) => closePopover(details, false, false));
    const details = find<HTMLDetailsElement>(selector);
    details.hidden = false;
    openPopover(details, false);
    details
      .querySelector<HTMLButtonElement>(
        '.draft-settings-scope [aria-pressed="true"]',
      )
      ?.focus({ preventScroll: true });
  }
  const handlers: Record<string, () => Promise<unknown> | void> = {
    "settings-item": () => {
      if (selected || batchSettingsItem)
        openSettingsScope("[data-draft-editor-settings]");
    },
    "settings-batch": () => {
      if (bulk) openSettingsScope(".draft-batch-settings");
    },
    "settings-defaults": () =>
      openSettingsScope("[data-draft-global-settings]"),
    "choose-item": () =>
      find<HTMLInputElement>('[data-draft-input="item"]').click(),
    "choose-camera": () =>
      find<HTMLInputElement>('[data-draft-input="camera"]').click(),
    "choose-bulk": () =>
      find<HTMLInputElement>('[data-draft-input="bulk"]').click(),
    "add-bulk-photos": () => handlers["choose-bulk"](),
    new: async () => {
      const intent = beginNavigation();
      await flush();
      if (disposed || intent !== selectionIntent) return;
      if (!selected) scrollY = window.scrollY;
      rememberView();
      selected = null;
      writingDraftId = undefined;
      newItemSettings = loadDefaults();
      bulk = false;
      composing = true;
      openedFromGrouping = false;
      conflict = false;
      tell("");
      renderEditor();
      renderPool();
      rememberView(true);
      find("#draft-editor-title").tabIndex = -1;
      find("#draft-editor-title").focus();
    },
    write: async () => {
      if (!selected) await newDraft();
      if (!selected) return;
      writingDraftId = selected!.value.id;
      renderEditor();
      find<HTMLInputElement>("#draft-title").focus();
    },
    selection: () => {
      selectionMode = !selectionMode;
      if (!selectionMode) chosen.clear();
      renderLibrary();
    },
    bulk: async () => {
      const intent = beginNavigation();
      await flush();
      if (disposed || intent !== selectionIntent) return;
      if (!selected) scrollY = window.scrollY;
      rememberView();
      selected = null;
      composing = false;
      openedFromGrouping = false;
      renderEditor();
      if (tab !== "draft") {
        tab = "draft";
        await reload();
        if (disposed || intent !== selectionIntent) return;
      }
      bulk = true;
      renderPool();
      rememberView(true);
      root.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    },
    "close-import": () => {
      beginNavigation();
      bulk = false;
      renderLibrary();
      renderPool();
      rememberView();
      action("bulk").focus();
    },
    reload: async () => {
      await reload();
      tell("");
    },
    more: () => reload(true),
    group: async () => {
      validateDraftSettings({
        ...defaultSettings,
        descriptionFooterText: find<HTMLTextAreaElement>(
          '[data-draft-default="descriptionFooterText"]',
        ).value,
      });
      await flush();
      importing = true;
      renderPool();
      try {
        const created = await draftAction("create", {
          id: crypto.randomUUID(),
          settings: defaultSettings,
          photoIds: [...chosenPhotos],
        });
        groupIds.push(created.id);
        rememberGroups();
        chosenPhotos.clear();
        await reload();
      } finally {
        importing = false;
        renderPool();
      }
    },
    individual: async () => {
      validateDraftSettings({
        ...defaultSettings,
        descriptionFooterText: find<HTMLTextAreaElement>(
          '[data-draft-default="descriptionFooterText"]',
        ).value,
      });
      if (
        !window.confirm(
          `Create ${chosenPhotos.size} separate items, one photo per item?`,
        )
      )
        return;
      await flush();
      importing = true;
      renderPool();
      try {
        for (const id of [...chosenPhotos]) {
          const created = await draftAction("create", {
            id: crypto.randomUUID(),
            settings: defaultSettings,
            photoIds: [id],
          });
          groupIds.push(created.id);
          rememberGroups();
          chosenPhotos.delete(id);
        }
      } finally {
        importing = false;
        await reload();
        renderPool();
      }
    },
    back: async () => {
      const intent = beginNavigation();
      await flush();
      if (disposed || intent !== selectionIntent) return;
      selected = null;
      composing = false;
      bulk = openedFromGrouping;
      openedFromGrouping = false;
      tell("");
      renderEditor();
      renderLibrary();
      renderPool();
      rememberView();
      window.scrollTo({ top: scrollY });
    },
    previous: () => navigate(-1),
    next: () => navigate(1),
    save: () =>
      selected && selected.value.state !== selected.savedState
        ? handlers.done()
        : flush(),
    "load-saved": () => resolveConflict(false),
    "keep-edits": () => resolveConflict(true),
    restore: async () => {
      if (!selected) return;
      const saved = recovery(selected.value);
      if (!saved) return;
      const baseVersion =
        Number.isSafeInteger(saved.baseVersion) && saved.baseVersion > 0
          ? saved.baseVersion
          : 0;
      selected.restore(
        {
          title: saved.title,
          description: saved.description,
          settings: saved.settings,
          state: saved.state,
        },
        baseVersion,
      );
      find("[data-draft-save-status]").textContent = "Unsaved edits";
      find("[data-draft-save-status]").dataset.status = "pending";
      remember();
      renderEditor();
      hide("[data-draft-recovery]", true);
      if (baseVersion !== selected.value.version) {
        conflict = true;
        hide("[data-draft-conflict]", false);
        return;
      }
      await flush();
    },
    "discard-recovery": () => {
      if (selected)
        try {
          sessionStorage.removeItem(key(selected.value.id));
        } catch {}
      hide("[data-draft-recovery]", true);
    },
    "select-ready": () => {
      selectionMode = true;
      chosen.clear();
      for (const d of library.drafts.filter(
        (d) =>
          d.photos.length &&
          d.photos.every((p) => p.status === "ready") &&
          !busy(d),
      ))
        chosen.add(d.id);
      renderLibrary();
    },
    "generate-selected": () =>
      startGeneration(
        [...chosen].filter((id) => {
          const d = library.drafts.find((d) => d.id === id);
          return (
            d &&
            d.photos.length &&
            d.photos.every((p) => p.status === "ready") &&
            !busy(d)
          );
        }),
      ),
    "delete-selected": async () => {
      const items = library.drafts.filter((d) => chosen.has(d.id));
      if (
        !items.length ||
        !(await confirmDelete(
          `Delete ${items.length} item${items.length === 1 ? "" : "s"} and their ${items.reduce((count, d) => count + d.photos.length, 0)} photos? This cannot be undone.`,
        ))
      )
        return;
      try {
        for (const draft of items) {
          await draftAction("delete", {
            draftId: draft.id,
            expectedVersion: draft.version,
          });
          chosen.delete(draft.id);
          groupIds = groupIds.filter((id) => id !== draft.id);
          reviewIds = reviewIds.filter((id) => id !== draft.id);
          try {
            sessionStorage.removeItem(key(draft.id));
          } catch {}
        }
      } finally {
        rememberGroups();
        await reload();
        renderPool();
      }
    },
    generate: async () => {
      if (!selected || startingGenerationId) return;
      startingGenerationId = selected.value.id;
      renderEditor();
      try {
        await startGeneration([startingGenerationId]);
      } finally {
        startingGenerationId = null;
        renderEditor();
      }
    },
    regenerate: () =>
      selected ? startGeneration([selected.value.id]) : undefined,
    "save-defaults": async () => {
      const settings = normalizeDraftSettings(
        batchSettingsItem?.value.settings ||
          selected?.value.settings ||
          newItemSettings,
      );
      validateDraftSettings(settings);
      persistDefaults(settings);
      const status = find("[data-draft-default-save-status]");
      status.hidden = false;
      status.textContent =
        "Saved for new items on this device. Existing items keep their settings.";
    },
    "retry-item-settings": () => flush(),
    "save-global-defaults": async () => {
      const status = find("[data-draft-global-save-status]");
      status.hidden = false;
      try {
        persistDefaults(normalizeDraftSettings(globalSettings));
        status.classList.remove("draft-settings-error");
        status.textContent = "Defaults saved";
        label("save-global-defaults", "Defaults saved");
      } catch {
        status.classList.add("draft-settings-error");
        status.textContent = "Could not save defaults. Try again.";
      }
    },
    "generate-groups": () =>
      startGeneration(
        groupIds.filter((id) => {
          const d = library.drafts.find((d) => d.id === id);
          return (
            d &&
            !d.description &&
            d.photos.length &&
            d.photos.every((p) => p.status === "ready") &&
            !busy(d)
          );
        }),
      ),
    pause: () => queue.pause(),
    resume: async () => {
      await flush();
      const available = draftGenerationAllowance(await options.onUsageChange());
      if (
        queue.remaining.length > available &&
        !window.confirm(
          `You have ${available} generations available. Continue with the first ${available} and keep the rest paused?`,
        )
      )
        return;
      tell("");
      await queue.resume(available);
    },
    check: async () => {
      await flush();
      if (!selected) return;
      const d = await draftAction("recover", { draftId: selected.value.id });
      selected = makeAutosave(d);
      upsert(d);
      queue.failed.delete(d.id);
      renderEditor();
      renderLibrary();
      if (d.operation_state === "failed")
        tell(
          "No saved result is available for that attempt. Check your usage before generating again.",
        );
      await options.onUsageChange();
    },
    done: async () => {
      if (!selected || busy(selected.value)) return;
      if (outputFailed(selected.value)) {
        if (!action("generate").disabled)
          await startGeneration([selected.value.id]);
        return;
      }
      const intent = beginNavigation();
      const snapshot = selected;
      const target = selected.savedState === "done" ? "draft" : "done";
      const order = reviewOrder();
      const candidates =
        target === "done"
          ? order.slice(order.indexOf(selected.value.id) + 1)
          : [];
      selected.edit({ state: target });
      remember();
      await flush();
      if (disposed || intent !== selectionIntent || selected !== snapshot)
        return;
      if (target === "done")
        reviewIds = reviewIds.filter((id) => id !== snapshot.value.id);
      selected = null;
      await reload();
      if (disposed || intent !== selectionIntent) return;
      renderEditor();
      for (const id of candidates) {
        let draft = library.drafts.find((d) => d.id === id);
        if (!draft) {
          try {
            draft = await draftAction("detail", { draftId: id });
          } catch (error) {
            if ((error as { status?: number }).status !== 404) throw error;
          }
        }
        if (disposed || intent !== selectionIntent) return;
        if (
          draft?.state === "draft" &&
          (draft.title || draft.description) &&
          !busy(draft) &&
          !outputFailed(draft)
        ) {
          await openDraft(id, true, false, intent);
          return;
        }
      }
      openedFromGrouping = false;
      renderPool();
      rememberView();
      window.scrollTo({ top: scrollY });
    },
    delete: async () => {
      if (!selected) return;
      if (
        !(await confirmDelete(
          `Delete “${selected.value.title || "Untitled item"}” and its ${selected.value.photos.length} photos? This cannot be undone.`,
        ))
      )
        return;
      await flush();
      const d = selected!.value;
      await draftAction("delete", {
        draftId: d.id,
        expectedVersion: d.version,
      });
      try {
        sessionStorage.removeItem(key(d.id));
      } catch {}
      selected = null;
      groupIds = groupIds.filter((id) => id !== d.id);
      rememberGroups();
      await reload();
      renderEditor();
      rememberView();
    },
    "copy-title": () => copy("title"),
    "copy-description": () => copy("description"),
  };
  function reviewOrder() {
    const ids = library.drafts.map((d) => d.id);
    return selected && reviewIds.includes(selected.value.id) ? reviewIds : ids;
  }
  function reviewTarget(delta: number): string | undefined {
    if (!selected) return;
    const order = reviewOrder();
    const index = order.indexOf(selected.value.id);
    if (index < 0) return;
    if (generationCount <= 1 || !reviewIds.includes(selected.value.id))
      return order[index + delta];
    const candidates =
      delta > 0 ? order.slice(index + 1) : order.slice(0, index).reverse();
    return candidates.find((id) => {
      const draft = library.drafts.find((item) => item.id === id);
      return (
        draft &&
        Boolean(draft.title || draft.description) &&
        !busy(draft) &&
        !outputFailed(draft)
      );
    });
  }
  async function navigate(delta: number) {
    if (!selected) return;
    const next = reviewTarget(delta);
    if (next) await openDraft(next, true, false);
  }
  async function copy(field: "title" | "description") {
    if (
      !selected ||
      generating(selected.value) ||
      queue.remaining.includes(selected.value.id)
    )
      return;
    const el = find<HTMLInputElement | HTMLTextAreaElement>(
      `[data-draft-field="${field}"]`,
    );
    if (await copyListingField(field, el.value)) {
      void trackMobileEvent("copy", { field, target: "draft_workspace" });
      label(`copy-${field}`, "Copied");
      action(`copy-${field}`).querySelector("svg")!.replaceWith(icon("check"));
      find("[data-draft-copy-status]").textContent =
        `${field === "title" ? "Title" : "Description"} copied.`;
      if (!disposed)
        root.dispatchEvent(
          new CustomEvent("mobile-copy-complete", { bubbles: true }),
        );
      setTimeout(() => {
        if (!disposed) {
          label(
            `copy-${field}`,
            selected && outputFailed(selected.value) ? "Copy previous" : "Copy",
          );
          action(`copy-${field}`)
            .querySelector("svg")!
            .replaceWith(icon("copy"));
        }
      }, 1800);
    } else {
      if (selected) {
        renderEditor();
      }
      el.focus();
      el.select();
      tell(
        `Copy was blocked. The ${field} is selected. Use your browser or keyboard to copy it.`,
        true,
      );
    }
  }
  bind(root, "click", (event) => {
    const target = event.target as HTMLElement;
    const summary = target.closest("summary");
    const owner = summary?.parentElement;
    if (owner?.classList.contains("draft-photo-source")) {
      if (summary?.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        return;
      }
      if (
        nativePhotoPicker ||
        window.matchMedia("(min-width: 768px)").matches
      ) {
        event.preventDefault();
        handlers["choose-item"]();
        return;
      }
    }
    if (
      owner instanceof HTMLDetailsElement &&
      owner.hasAttribute("data-draft-popover")
    ) {
      event.preventDefault();
      if (owner.open) closePopover(owner);
      else openPopover(owner);
      return;
    }
    if (target.closest("[data-draft-close]")) {
      const details = target.closest<HTMLDetailsElement>("details");
      if (details) closePopover(details);
      return;
    }
    const el = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-draft-action]",
    );
    const name = el?.dataset.draftAction;
    if (!el || el.disabled || !name || activeActions.has(name)) return;
    if (name.startsWith("settings-")) event.stopPropagation();
    if (
      name.startsWith("settings-") &&
      el.getAttribute("aria-pressed") === "true"
    )
      return;
    if (
      el.closest(".draft-mode") &&
      ((name === "new" && !bulk) || (name === "bulk" && bulk))
    )
      return;
    const handler = handlers[name];
    const addMenu = el.closest<HTMLDetailsElement>(".draft-add-menu");
    if (addMenu) closePopover(addMenu, false);
    if (handler)
      run(async () => {
        activeActions.add(name);
        el.disabled = true;
        try {
          await handler();
        } finally {
          activeActions.delete(name);
          if (!disposed) {
            el.disabled = false;
            renderSelection();
          }
        }
      });
  });
  bind(root, "change", (event) => {
    const el = event.target as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;
    if (el.matches("[data-draft-tab]")) return;
    if (el.hasAttribute("data-draft-global")) {
      globalSettings = {
        ...globalSettings,
        [el.getAttribute("data-draft-global")!]: settingInputValue(el),
      };
      hide("[data-draft-global-save-status]", true);
      label("save-global-defaults", "Save defaults");
      renderGlobalSettings();
      return;
    }
    if (el instanceof HTMLInputElement && el.dataset.draftInput) {
      const files = Array.from(el.files || []);
      el.value = "";
      run(() => addFiles(files, el.dataset.draftInput === "bulk"));
    }
    if (
      el.dataset.draftField &&
      !["title", "description"].includes(el.dataset.draftField)
    ) {
      const name = el.dataset.draftField;
      if (el instanceof HTMLInputElement && el.type === "radio" && !el.checked)
        return;
      const settings = {
        ...DEFAULT_DRAFT_SETTINGS,
        ...(batchSettingsItem?.value.settings ||
          selected?.value.settings ||
          newItemSettings),
        [name]: settingInputValue(el),
      };
      if (batchSettingsItem) batchSettingsItem.edit({ settings });
      else if (selected) selected.edit({ settings });
      else newItemSettings = settings;
      hide("[data-draft-default-save-status]", true);
      renderEditor();
      if (selected || batchSettingsItem) scheduleSave();
    }
    if (el.dataset.draftDefault) {
      const name = el.dataset.draftDefault;
      if (el instanceof HTMLInputElement && el.type === "radio" && !el.checked)
        return;
      const settings = { ...defaultSettings, [name]: settingInputValue(el) };
      run(() => changeBatchSettings(settings));
    }
  });
  bind(root, "input", (event) => {
    const el = event.target as HTMLInputElement;
    if (el.getAttribute("data-draft-global") === "descriptionFooterText") {
      globalSettings = { ...globalSettings, descriptionFooterText: el.value };
      hide("[data-draft-global-save-status]", true);
      label("save-global-defaults", "Save defaults");
      renderGlobalSettings();
      return;
    }
    if (el.dataset.draftField === "descriptionFooterText") {
      const settings = {
        ...DEFAULT_DRAFT_SETTINGS,
        ...(batchSettingsItem?.value.settings ||
          selected?.value.settings ||
          newItemSettings),
        descriptionFooterText: el.value,
      };
      if (batchSettingsItem) batchSettingsItem.edit({ settings });
      else if (selected) selected.edit({ settings });
      else newItemSettings = settings;
      renderEditor();
      if (selected || batchSettingsItem) scheduleSave();
      return;
    }
    if (el.dataset.draftDefault === "descriptionFooterText") {
      syncSettingsControls(
        root,
        "default",
        { ...defaultSettings, descriptionFooterText: el.value },
        false,
        settingsAccess,
      );
      return;
    }
    if (
      selected &&
      ["title", "description"].includes(el.dataset.draftField || "")
    ) {
      selected.edit({ [el.dataset.draftField!]: el.value });
      const hasText = Boolean(
        selected.value.title || selected.value.description,
      );
      hide(
        "[data-draft-editor-footer]",
        !hasText && selected.value.state !== "done",
      );
      if (el instanceof HTMLTextAreaElement) {
        resizeDescription();
      }
      scheduleSave();
      action(`copy-${el.dataset.draftField}`).disabled = !el.value;
    }
  });
  function scheduleSave() {
    if (!batchSettingsItem) remember();
    find("[data-draft-save-status]").textContent = "Unsaved edits";
    find("[data-draft-save-status]").dataset.status = "pending";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => run(() => flush()), 650);
  }
  bind(root, "focusout", (event) => {
    if (
      (event.target as HTMLElement).matches("[data-draft-field]") &&
      (selected?.dirty || batchSettingsItem?.dirty)
    )
      run(() => flush());
  });
  const showLibrary = async (nextTab: "draft" | "done") => {
    const intent = beginNavigation();
    await flush();
    if (disposed || intent !== selectionIntent) return;
    tab = nextTab;
    libraryPages = 1;
    chosen.clear();
    selectionMode = false;
    selected = null;
    composing = false;
    bulk = false;
    openedFromGrouping = false;
    await reload();
    if (disposed || intent !== selectionIntent) return;
    renderEditor();
    rememberView();
  };
  root
    .querySelectorAll<HTMLButtonElement>("[data-draft-tab]")
    .forEach((el) =>
      bind(el, "click", () =>
        run(() => showLibrary(el.dataset.draftTab as "draft" | "done")),
      ),
    );
  const brandLink = root
    .closest('[data-mobile-web="workspace"]')
    ?.querySelector<HTMLAnchorElement>(".mobile-workspace-brand");
  if (brandLink)
    bind(brandLink, "click", (event) => {
      const click = event as MouseEvent;
      if (
        click.button !== 0 ||
        click.ctrlKey ||
        click.metaKey ||
        click.shiftKey ||
        click.altKey
      )
        return;
      click.preventDefault();
      run(async () => {
        await showLibrary("draft");
        if (!disposed) window.scrollTo({ top: 0 });
      });
    });
  bind(root, "dragover", (event) => {
    if ((event as DragEvent).dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      root.classList.add("is-dragging");
    }
  });
  bind(root, "dragleave", (event) => {
    if (!root.contains((event as DragEvent).relatedTarget as Node))
      root.classList.remove("is-dragging");
  });
  bind(root, "drop", (event) => {
    event.preventDefault();
    root.classList.remove("is-dragging");
    const files = Array.from((event as DragEvent).dataTransfer?.files || []);
    run(() => addFiles(files, bulk || (!selected && !composing)));
  });
  const hasUnsaved = () =>
    Boolean(
      selected?.dirty ||
      batchSettingsItem?.dirty ||
      processing ||
      queue.running ||
      queue.remaining.length,
    );
  bind(window, "beforeunload", (event) => {
    if (hasUnsaved()) {
      remember();
      event.preventDefault();
      (event as BeforeUnloadEvent).returnValue = "";
    }
  });
  bind(document, "visibilitychange", () => {
    if (document.hidden && selected?.dirty) run(() => flush());
  });
  bind(document, "keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    root
      .querySelectorAll<HTMLDetailsElement>("[data-draft-popover][open]")
      .forEach((el) => {
        closePopover(el);
      });
  });
  bind(document, "click", (event) => {
    if ((event.target as HTMLElement).closest("[data-draft-global-trigger]"))
      return;
    root
      .querySelectorAll<HTMLDetailsElement>("[data-draft-popover][open]")
      .forEach((el) => {
        if (!el.contains(event.target as Node)) closePopover(el);
      });
  });
  async function restoreView(state: unknown) {
    const intent = beginNavigation();
    const value = state as {
      owner?: string;
      draftId?: string;
      composing?: boolean;
      bulk?: boolean;
      tab?: string;
      scrollY?: number;
      reviewIds?: string[];
      openedFromGrouping?: boolean;
      libraryPages?: number;
    } | null;
    if (value?.owner !== options.userId) {
      rememberView();
      return;
    }
    restoringHistory = true;
    try {
      await flush();
      if (disposed || intent !== selectionIntent) return;
      selected = null;
      composing = value.composing === true;
      bulk = value.bulk === true;
      tab = value.tab === "done" ? "done" : "draft";
      libraryPages =
        Number.isSafeInteger(value.libraryPages) && value.libraryPages! > 0
          ? value.libraryPages!
          : 1;
      scrollY = typeof value.scrollY === "number" ? value.scrollY : 0;
      reviewIds = Array.isArray(value.reviewIds)
        ? value.reviewIds.filter(validDraftId).slice(0, 20)
        : [];
      openedFromGrouping = value.openedFromGrouping === true;
      await reload();
      if (disposed || intent !== selectionIntent) return;
      if (value.draftId && validDraftId(value.draftId)) {
        try {
          await openDraft(value.draftId, false, false, intent);
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
          selected = null;
          composing = false;
          openedFromGrouping = false;
        }
      }
      if (disposed || intent !== selectionIntent) return;
      renderEditor();
      renderPool();
      if (!selected && !composing && !bulk) window.scrollTo({ top: scrollY });
    } finally {
      if (intent === selectionIntent) {
        restoringHistory = false;
        rememberView();
      }
    }
  }
  bind(window, "popstate", () =>
    run(() => restoreView(history.state?.draftWorkspace)),
  );
  renderEditor();
  renderLibrary();
  renderPool();
  renderDefaults();
  renderGlobalSettings();
  const initialView = history.state?.draftWorkspace;
  // Restore the requested screen before exposing it, rather than flashing the library.
  root.hidden = initialView?.owner === options.userId;
  run(async () => {
    try {
      if (initialView?.owner === options.userId) await restoreView(initialView);
      else {
        await reload();
        if (
          options.startWithNewItem &&
          !library.drafts.length &&
          !library.imports.length &&
          !disposed
        )
          await handlers.new();
        rememberView();
      }
    } finally {
      if (!disposed) {
        root.hidden = false;
        schedulePhotoViewport();
        initialMotionFrame = requestAnimationFrame(() => {
          initializing = false;
        });
      }
    }
  });
  return {
    closeOverlays() {
      root
        .querySelectorAll<HTMLDetailsElement>("[data-draft-popover][open]")
        .forEach((details) => closePopover(details, false));
    },
    updateUsage(usage: MobileUsage) {
      const tier = usage.plan?.tier || "free";
      const active =
        !usage.plan?.status ||
        ["active", "trialing"].includes(usage.plan.status);
      settingsAccess = {
        tone: active && ["pro", "business"].includes(tier),
        extras: !active || tier !== "basic",
      };
      const value = usage.remaining?.generations;
      allowance =
        typeof value === "number" && Number.isFinite(value) ? value : null;
      find("[data-draft-allowance]").textContent =
        allowance === null
          ? ""
          : `${allowance} generation${allowance === 1 ? "" : "s"} left`;
      renderSelection();
      renderEditor();
      renderDefaults();
      renderGlobalSettings();
    },
    hasUnsaved,
    flush,
    dispose(clearRecovery = false) {
      remember();
      photoEditor?.close();
      const dialog = find<HTMLDialogElement>("[data-draft-delete-dialog]");
      if (dialog.open) dialog.close("cancel");
      disposed = true;
      client.dispose();
      queue.pause();
      clearTimeout(saveTimer);
      listeners.forEach((remove) => remove());
      uploads.forEach((p) => {
        if (p.preview) URL.revokeObjectURL(p.preview);
      });
      root.hidden = true;
      find("#draft-editor-title").textContent = "New draft";
      find<HTMLImageElement>("[data-draft-editor-cover]").removeAttribute(
        "src",
      );
      find("[data-draft-operation-status]").textContent = "";
      for (const name of ["title", "description"])
        find<HTMLInputElement>(`[data-draft-field="${name}"]`).value = "";
      for (const selector of [
        "[data-draft-items]",
        "[data-draft-pool]",
        "[data-draft-item-photos]",
        "[data-draft-created-groups]",
      ])
        find(selector).replaceChildren();
      if (clearRecovery)
        try {
          sessionStorage.removeItem(queueKey);
          sessionStorage.removeItem(groupsKey);
          sessionStorage.removeItem(batchSettingsKey);
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const name = sessionStorage.key(i);
            if (name?.startsWith(`autolister:draft:${options.userId}:`))
              sessionStorage.removeItem(name);
          }
        } catch {}
    },
  };
}
