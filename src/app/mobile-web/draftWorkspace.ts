import {
  draftAction,
  executeDraftAttempt,
  type DraftAttempt,
  listDrafts,
  uploadDraftPhoto,
} from "./draftClient";
import {
  DEFAULT_DRAFT_SETTINGS,
  DRAFT_LIMITS,
  type Draft,
  type DraftLibrary,
  type DraftPhoto,
  type DraftSettings,
  validDraftId,
} from "./draftContracts";
import {
  DraftAutosave,
  DraftQueue,
  draftGenerationAllowance,
} from "./draftWorkflow";
import { prepareMobileImage } from "./imagePreparation";
import { copyListingField } from "./billing";
import type { MobileUsage } from "./generationClient";
import { trackMobileEvent } from "./analytics";
import { SUPPORTED_OUTPUT_LANGUAGES } from "../../utils/mobileOutputLanguages";

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
    defaultSettings?: DraftSettings;
  },
) {
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
  let disposed = false;
  let loading = false;
  let libraryLoad = 0;
  let selectionIntent = 0;
  let importing = false;
  let processing = false;
  let bulk = false;
  let conflict = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let scrollY = 0;
  let generationCount = 0;
  let allowance: number | null = null;
  let defaultSettings = {
    ...(options.defaultSettings || DEFAULT_DRAFT_SETTINGS),
  };
  let preparationDraftId: string | undefined;
  let preparationHadOutput = false;
  let selectionMode = false;
  let writingDraftId: string | undefined;
  const chosen = new Set<string>();
  const chosenPhotos = new Set<string>();
  const uploads: Upload[] = [];
  const attempts = new Map<string, DraftAttempt>();
  const listeners: Array<() => void> = [];
  const key = (id: string) => `autolister:draft:${options.userId}:${id}`;
  const queueKey = `autolister:draft-queue:${options.userId}`;
  const tell = (message: string, error = false) => {
    if (disposed) return;
    const el = find("[data-draft-message]");
    el.textContent = message;
    el.hidden = !message;
    el.classList.toggle("is-error", error);
  };
  async function confirmDelete(message: string) {
    const dialog = find<HTMLDialogElement>("[data-draft-delete-dialog]");
    if (dialog.open) return false;
    find("#draft-delete-copy").textContent = message;
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
  const remember = () => {
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
      else sessionStorage.removeItem(key(d.id));
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
  const photoCount = (draft: Draft) =>
    new Set([
      ...draft.photos.map((p) => p.id),
      ...uploads.filter((p) => p.draftId === draft.id).map((p) => p.id),
    ]).size;
  const busy = (draft?: Draft) =>
    Boolean(
      draft &&
      (generating(draft) ||
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
    action("save").hidden = status !== "error";
    find("[data-draft-save-status]").dataset.status = status;
    if (status === "saved" && selected) {
      remember();
      upsert(selected.value);
      renderLibrary();
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
    await selected?.flush();
    remember();
  }
  function renderLibrary() {
    if (disposed) return;
    const items = find("[data-draft-items]");
    items.replaceChildren();
    items.setAttribute("aria-busy", String(loading));
    if (!library.drafts.length) {
      const p = document.createElement("p");
      p.className = "draft-help";
      p.textContent =
        tab === "done"
          ? "Items you mark as done will appear here."
          : "No drafts yet. Add photos to prepare your first item.";
      items.append(p);
    }
    for (const [index, draft] of library.drafts.entries()) {
      const row = document.createElement("div");
      row.className = `draft-item${selected?.value.id === draft.id ? " is-selected" : ""}`;
      const ready =
        draft.photos.length > 0 &&
        draft.photos.every((p) => p.status === "ready") &&
        !busy(draft);
      const check = document.createElement("input");
      check.type = "checkbox";
      check.hidden = !selectionMode;
      check.checked = chosen.has(draft.id);
      check.disabled = !ready || queue.running;
      check.setAttribute(
        "aria-label",
        `Select ${draft.title || `item ${index + 1}`} for generation`,
      );
      check.addEventListener("change", () => {
        check.checked ? chosen.add(draft.id) : chosen.delete(draft.id);
        renderSelection();
      });
      const open = button("", () => run(() => openDraft(draft.id)));
      open.className = "draft-item-open";
      open.setAttribute(
        "aria-current",
        selected?.value.id === draft.id ? "true" : "false",
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
        placeholder.append(
          find("[data-draft-upload-intro] svg").cloneNode(true),
        );
        open.append(placeholder);
      }
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent =
        draft.title ||
        (draft.photos.length ? "Untitled item" : "Untitled draft");
      const detail = document.createElement("span");
      detail.className = "draft-item-detail";
      detail.dataset.state = queue.failed.has(draft.id)
        ? "error"
        : busy(draft)
          ? "working"
          : draft.description
            ? "ready"
            : "draft";
      detail.textContent =
        queue.active === draft.id
          ? "Generating…"
          : queue.remaining.includes(draft.id)
            ? queue.paused || !queue.running
              ? "Paused"
              : "Waiting…"
            : queue.failed.has(draft.id)
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
  }
  function renderSelection() {
    root.classList.toggle("is-selecting", selectionMode);
    action("selection").textContent = selectionMode ? "Cancel" : "Select";
    action("selection").setAttribute("aria-pressed", String(selectionMode));
    action("selection").hidden = tab === "done" || !library.drafts.length;
    hide("[data-draft-batch-actions]", !selectionMode);
    action("generate-selected").hidden = !chosen.size;
    find("[data-draft-selected-count]").textContent = chosen.size
      ? `${chosen.size} selected`
      : "";
    action("generate-selected").textContent = chosen.size
      ? `Generate ${chosen.size} item${chosen.size === 1 ? "" : "s"} · ${chosen.size} generation${chosen.size === 1 ? "" : "s"}`
      : "Generate selected items";
    action("generate-selected").disabled =
      !chosen.size ||
      chosen.size > DRAFT_LIMITS.batch ||
      queue.running ||
      processing;
    action("select-ready").disabled = queue.running;
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
  function renderPool() {
    if (disposed) return;
    root.classList.toggle("has-import", bulk);
    hide("[data-draft-import]", !bulk);
    hide(
      "[data-draft-import-summary]",
      bulk || (!library.imports.length && !uploads.some((p) => !p.draftId)),
    );
    find("[data-draft-import-summary-copy]").textContent =
      `${library.imports.filter((p) => p.status === "ready").length} ungrouped photos saved. These are not included when you generate drafts.`;
    const focused = (document.activeElement as HTMLInputElement | null)?.dataset
      .draftPhotoId;
    const pool = find("[data-draft-pool]");
    pool.replaceChildren();
    for (const photo of library.imports) {
      if (uploads.some((p) => p.id === photo.id)) continue;
      const wrap = thumbnail(photo, true);
      const menu = document.createElement("details");
      menu.className = "draft-photo-options";
      const summary = document.createElement("summary");
      summary.textContent = "Photo options";
      menu.append(
        summary,
        button(
          "Delete",
          () =>
            run(async () => {
              if (
                !(await confirmDelete(
                  "Permanently delete this saved photo? This cannot be undone.",
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
  }
  function renderPoolSelection() {
    action("group").textContent =
      `Create item · ${chosenPhotos.size} photo${chosenPhotos.size === 1 ? "" : "s"}`;
    action("group").disabled =
      !chosenPhotos.size ||
      chosenPhotos.size > DRAFT_LIMITS.photos ||
      importing;
    action("individual").disabled = !chosenPhotos.size || importing;
    find("[data-draft-import-status]").textContent =
      chosenPhotos.size > DRAFT_LIMITS.photos
        ? "Choose up to 10 photos for one item, or make each selected photo a separate item."
        : processing
          ? "Uploading photos… You can group the photos that are ready."
          : `${library.imports.filter((p) => p.status === "ready").length} ungrouped photos saved`;
  }
  function uploadThumbnail(upload: Upload) {
    const wrap = document.createElement("div");
    wrap.className = "draft-photo draft-upload";
    if (upload.preview) {
      const img = document.createElement("img");
      img.src = upload.preview;
      img.alt = "Photo being uploaded";
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
    const draft = selected?.value;
    hide("[data-draft-editor]", !draft);
    hide("[data-draft-editor-empty]", Boolean(draft));
    root.classList.toggle("has-editor", Boolean(draft));
    if (!draft) return;
    const preparation = find<HTMLDetailsElement>("[data-draft-preparation]");
    if (preparationDraftId !== draft.id)
      find<HTMLDetailsElement>(".draft-item-menu").open = false;
    if (
      preparationDraftId !== draft.id ||
      (!preparationHadOutput && Boolean(draft.description))
    )
      preparation.open = !draft.description;
    preparationDraftId = draft.id;
    preparationHadOutput = Boolean(draft.description);
    const hasText = Boolean(draft.title || draft.description);
    const hasPhotos = Boolean(photoCount(draft));
    hide("[data-draft-upload-intro]", hasPhotos);
    hide("[data-draft-generation-actions]", !hasPhotos);
    hide("[data-draft-originals]", !hasPhotos);
    hide("[data-draft-editor] .draft-settings", !hasPhotos);
    hide("[data-draft-copy-fields]", !hasText && writingDraftId !== draft.id);
    action("write").hidden = hasText || writingDraftId === draft.id;
    find("[data-draft-editor]").classList.toggle(
      "is-empty",
      !hasPhotos && !hasText,
    );
    find("[data-draft-preparation-label]").textContent = draft.photos.length
      ? `Photos · ${draft.photos.length}`
      : "Photos";
    const language = SUPPORTED_OUTPUT_LANGUAGES.find(
      (language) => language.code === draft.settings.descriptionLanguageCode,
    )?.label;
    find("[data-draft-settings-summary]").textContent =
      `${language || draft.settings.descriptionLanguageCode} · ${draft.settings.descriptionLength === "short" ? "Short" : "Detailed"}`;
    const locked = busy(draft);
    const index = library.drafts.findIndex((d) => d.id === draft.id);
    find("#draft-editor-title").textContent = draft.title || "New draft";
    const cover = find<HTMLImageElement>("[data-draft-editor-cover]");
    const coverUrl = draft.photos.find((p) => p.url)?.url;
    cover.hidden = !coverUrl;
    if (coverUrl) cover.src = coverUrl;
    else cover.removeAttribute("src");
    find("[data-draft-position]").textContent =
      index >= 0 ? `${index + 1} / ${library.drafts.length}` : "";
    action("previous").disabled = index <= 0;
    action("next").disabled = index < 0 || index >= library.drafts.length - 1;
    for (const name of ["title", "description"] as const) {
      const el = find<HTMLInputElement | HTMLTextAreaElement>(
        `[data-draft-field="${name}"]`,
      );
      if (el.value !== draft[name]) el.value = draft[name];
      el.disabled = locked;
      action(`copy-${name}`).disabled = !draft[name];
    }
    for (const name of [
      "titleLanguageCode",
      "descriptionLanguageCode",
      "descriptionLength",
    ] as const) {
      const el = find<HTMLSelectElement>(`[data-draft-field="${name}"]`);
      el.value = draft.settings[name];
      el.disabled = locked;
    }
    const bullet = find<HTMLInputElement>(
      '[data-draft-field="useBulletPoints"]',
    );
    bullet.checked = draft.settings.useBulletPoints;
    bullet.disabled = locked;
    root
      .querySelectorAll<HTMLInputElement>(
        '[data-draft-input="item"], [data-draft-input="camera"]',
      )
      .forEach((el) => {
        el.disabled =
          generating(draft) || photoCount(draft) >= DRAFT_LIMITS.photos;
      });
    action("generate").textContent =
      draft.title || draft.description
        ? "Regenerate listing"
        : "Generate listing";
    action("generate").disabled =
      locked ||
      !draft.photos.length ||
      draft.photos.some((p) => p.status !== "ready");
    action("done").disabled = locked;
    action("done").textContent =
      draft.state === "done" ? "Move back to drafts" : "Mark as done";
    action("check").hidden = !(
      draft.operation_state === "running" || draft.operation_state === "pending"
    );
    find("[data-draft-operation-status]").textContent =
      queue.failed.get(draft.id) ||
      (draft.operation_state === "running" ||
      draft.operation_state === "pending"
        ? "Your generation is still being saved. Check its result before trying again."
        : "");
    find("[data-draft-generate-help]").textContent = locked
      ? "You can review another draft while this item is being prepared."
      : "";
    hide("[data-draft-generate-help]", !locked);
    hide("[data-draft-conflict]", !conflict);
    const rail = find("[data-draft-item-photos]");
    rail.replaceChildren();
    for (const photo of draft.photos) {
      if (uploads.some((p) => p.id === photo.id)) continue;
      const wrap = thumbnail(photo, false);
      const controls = document.createElement("div");
      controls.className = "draft-photo-controls";
      if (!locked) {
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
                  `Permanently delete photo ${photo.position + 1} from “${draft.title || "Untitled item"}”? Your other photos and text will stay saved.`,
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
        const targets = library.drafts.filter(
          (d) => d.id !== draft.id && !busy(d) && d.photos.length < 10,
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
        summary.textContent =
          photo.position === 0 ? "Cover · Options" : "Photo options";
        menu.append(summary, controls);
        wrap.append(menu);
      }
      rail.append(wrap);
    }
    for (const upload of uploads.filter((p) => p.draftId === draft.id))
      rail.append(uploadThumbnail(upload));
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
      tell("");
    } catch (error) {
      action("reload").hidden = false;
      throw error;
    } finally {
      loading = false;
      renderLibrary();
      renderPool();
    }
  }
  async function openDraft(id: string, focus = true) {
    const intent = ++selectionIntent;
    await flush();
    let draft = await draftAction("detail", { draftId: id });
    if (disposed || intent !== selectionIntent) return;
    if (selected?.dirty) await flush();
    if (disposed || intent !== selectionIntent) return;
    if (selected?.value.id === id && selected.value.version > draft.version)
      draft = selected.value;
    if (!selected) scrollY = window.scrollY;
    selected = makeAutosave(draft);
    conflict = false;
    upsert(draft);
    renderEditor();
    renderLibrary();
    hide("[data-draft-recovery]", !recovery(draft));
    if (focus) {
      find("#draft-editor-title").tabIndex = -1;
      find("#draft-editor-title").focus({ preventScroll: true });
      if (matchMedia("(max-width: 767px)").matches)
        root.scrollIntoView({ block: "start" });
    }
  }
  async function newDraft(photoIds: string[] = []) {
    await flush();
    bulk = false;
    renderPool();
    if (tab !== "draft") {
      tab = "draft";
      await reload();
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
      await openDraft(unstarted.id);
      return unstarted;
    }
    const draft = await draftAction("create", {
      id: crypto.randomUUID(),
      settings: defaultSettings,
      photoIds,
    });
    upsert(draft);
    chosenPhotos.clear();
    await openDraft(draft.id);
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
    if (!bulkInput && !selected) await newDraft();
    const draftId = bulkInput ? undefined : selected!.value.id;
    if (
      draftId &&
      (generating(selected!.value) ||
        photoCount(selected!.value) + files.length > 10)
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
            upload.preview = prepared.previewUrl;
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
        await executeDraftAttempt(current, attempt, generationCount > 1);
        void trackMobileEvent("generation_success", {
          target: "draft_workspace",
          imageCount: current.photos.length,
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
        await options.onUsageChange();
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
  function renderQueue() {
    if (disposed) return;
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
    hide(
      "[data-draft-queue]",
      !queue.running && !queue.remaining.length && !queue.failed.size,
    );
    const attempted = queue.completed.length + queue.failed.size;
    find("[data-draft-queue-title]").textContent = queue.running
      ? `${queue.paused ? "Pausing after this item" : "Preparing your drafts"} · ${attempted} / ${generationCount}`
      : queue.remaining.length
        ? `Paused · ${attempted} / ${generationCount}`
        : `${queue.completed.length} ready${queue.failed.size ? ` · ${queue.failed.size} need attention` : ""}`;
    find("[data-draft-queue-copy]").textContent = queue.running
      ? "Keep this tab open. Each result saves automatically."
      : queue.remaining.length
        ? `${queue.remaining.length} items left. Completed drafts are saved.`
        : queue.failed.size
          ? "Open an item marked ‘Needs attention’ to check or retry it."
          : "";
    action("pause").hidden = !queue.running || queue.paused;
    action("resume").hidden = queue.running || !queue.remaining.length;
    renderLibrary();
    renderEditor();
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
    await flush();
    if (
      queue.remaining.length &&
      !window.confirm(
        "Replace the paused batch with this selection? Its remaining items will stay saved as drafts.",
      )
    )
      return;
    if (!ids.length || ids.length > 20)
      throw new Error("Select between 1 and 20 items to generate.");
    const usage = await options.onUsageChange();
    const available = draftGenerationAllowance(usage);
    if (ids.length > available) {
      if (
        !window.confirm(
          `You selected ${ids.length} items and have ${available} generations available. Generate the first ${available} and leave the others saved for later?`,
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
  const handlers: Record<string, () => Promise<unknown> | void> = {
    new: () => newDraft(),
    write: () => {
      if (!selected) return;
      writingDraftId = selected.value.id;
      renderEditor();
      find<HTMLInputElement>("#draft-title").focus();
    },
    selection: () => {
      selectionMode = !selectionMode;
      if (!selectionMode) chosen.clear();
      renderLibrary();
    },
    bulk: async () => {
      await flush();
      selected = null;
      renderEditor();
      if (tab !== "draft") {
        tab = "draft";
        await reload();
      }
      bulk = true;
      renderPool();
      find("[data-draft-import]").scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    },
    "close-import": () => {
      bulk = false;
      renderPool();
    },
    reload: () => reload(),
    more: () => reload(true),
    group: async () => {
      await flush();
      importing = true;
      renderPool();
      try {
        await draftAction("create", {
          id: crypto.randomUUID(),
          settings: defaultSettings,
          photoIds: [...chosenPhotos],
        });
        chosenPhotos.clear();
        await reload();
        if (!library.imports.length && !uploads.some((p) => !p.draftId))
          bulk = false;
      } finally {
        importing = false;
        renderPool();
      }
    },
    individual: async () => {
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
          await draftAction("create", {
            id: crypto.randomUUID(),
            settings: defaultSettings,
            photoIds: [id],
          });
          chosenPhotos.delete(id);
        }
      } finally {
        importing = false;
        await reload();
        if (!library.imports.length && !uploads.some((p) => !p.draftId))
          bulk = false;
        renderPool();
      }
    },
    back: async () => {
      selectionIntent++;
      await flush();
      selected = null;
      renderEditor();
      renderLibrary();
      window.scrollTo({ top: scrollY });
    },
    previous: () => navigate(-1),
    next: () => navigate(1),
    save: () => flush(),
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
      for (const d of library.drafts
        .filter(
          (d) =>
            d.photos.length &&
            d.photos.every((p) => p.status === "ready") &&
            !busy(d),
        )
        .slice(0, 20))
        chosen.add(d.id);
      renderLibrary();
    },
    "generate-selected": () => startGeneration([...chosen]),
    generate: () =>
      selected ? startGeneration([selected.value.id]) : undefined,
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
      await options.onUsageChange();
    },
    done: async () => {
      if (!selected) return;
      selected.edit({
        state: selected.value.state === "done" ? "draft" : "done",
      });
      remember();
      await flush();
      selected = null;
      await reload();
      renderEditor();
    },
    delete: async () => {
      if (!selected) return;
      if (
        !(await confirmDelete(
          `Permanently delete “${selected.value.title || "Untitled item"}” and its ${selected.value.photos.length} photos? This cannot be undone.`,
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
      await reload();
      renderEditor();
    },
    "copy-title": () => copy("title"),
    "copy-description": () => copy("description"),
  };
  async function navigate(delta: number) {
    if (!selected) return;
    const index = library.drafts.findIndex((d) => d.id === selected!.value.id);
    const next = library.drafts[index + delta];
    if (next) await openDraft(next.id);
  }
  async function copy(field: "title" | "description") {
    const el = find<HTMLInputElement | HTMLTextAreaElement>(
      `[data-draft-field="${field}"]`,
    );
    if (await copyListingField(field, el.value)) {
      void trackMobileEvent("copy", { field, target: "draft_workspace" });
      action(`copy-${field}`).textContent = "Copied";
      find("[data-draft-copy-status]").textContent =
        `${field === "title" ? "Title" : "Description"} copied.`;
      setTimeout(() => {
        if (!disposed) action(`copy-${field}`).textContent = `Copy ${field}`;
      }, 1800);
    } else {
      el.focus();
      el.select();
      tell(
        `Copy was blocked by your browser. The ${field} is selected — use Copy from your browser or keyboard.`,
        true,
      );
    }
  }
  bind(root, "click", (event) => {
    const el = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-draft-action]",
    );
    if (!el || el.disabled) return;
    const handler = handlers[el.dataset.draftAction!];
    if (handler)
      run(async () => {
        el.disabled = true;
        try {
          await handler();
        } finally {
          if (!disposed) {
            el.disabled = false;
            renderSelection();
          }
        }
      });
  });
  bind(root, "change", (event) => {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    if (el.matches("[data-draft-tab]")) return;
    if (el instanceof HTMLInputElement && el.dataset.draftInput) {
      const files = Array.from(el.files || []);
      el.value = "";
      run(() => addFiles(files, el.dataset.draftInput === "bulk"));
    }
    if (
      el.dataset.draftField &&
      !["title", "description"].includes(el.dataset.draftField) &&
      selected
    ) {
      const name = el.dataset.draftField;
      selected.edit({
        settings: {
          ...selected.value.settings,
          [name]:
            name === "useBulletPoints"
              ? (el as HTMLInputElement).checked
              : el.value,
        },
      });
      renderEditor();
      scheduleSave();
    }
    if (el.dataset.draftDefault) {
      const name = el.dataset.draftDefault;
      defaultSettings = {
        ...defaultSettings,
        [name]:
          name === "useBulletPoints"
            ? (el as HTMLInputElement).checked
            : el.value,
      };
    }
  });
  bind(root, "input", (event) => {
    const el = event.target as HTMLInputElement;
    if (
      selected &&
      ["title", "description"].includes(el.dataset.draftField || "")
    ) {
      selected.edit({ [el.dataset.draftField!]: el.value });
      if (el.dataset.draftField === "title")
        find("#draft-editor-title").textContent = el.value || "New draft";
      scheduleSave();
      action(`copy-${el.dataset.draftField}`).disabled = !el.value;
    }
  });
  function scheduleSave() {
    remember();
    find("[data-draft-save-status]").textContent = "Unsaved edits";
    find("[data-draft-save-status]").dataset.status = "pending";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => run(() => flush()), 650);
  }
  bind(root, "focusout", (event) => {
    if (
      (event.target as HTMLElement).matches("[data-draft-field]") &&
      selected?.dirty
    )
      run(() => flush());
  });
  root.querySelectorAll<HTMLButtonElement>("[data-draft-tab]").forEach((el) =>
    bind(el, "click", () =>
      run(async () => {
        await flush();
        tab = el.dataset.draftTab as "draft" | "done";
        selectionIntent++;
        chosen.clear();
        selectionMode = false;
        selected = null;
        await reload();
        renderEditor();
      }),
    ),
  );
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
    run(() => addFiles(files, bulk || !selected));
  });
  const hasUnsaved = () =>
    Boolean(
      selected?.dirty || processing || queue.running || queue.remaining.length,
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
  renderEditor();
  renderLibrary();
  renderPool();
  for (const name of [
    "titleLanguageCode",
    "descriptionLanguageCode",
    "descriptionLength",
  ] as const)
    find<HTMLSelectElement>(`[data-draft-default="${name}"]`).value =
      defaultSettings[name];
  find<HTMLInputElement>('[data-draft-default="useBulletPoints"]').checked =
    defaultSettings.useBulletPoints;
  root.hidden = false;
  run(async () => {
    await reload();
    if (
      !disposed &&
      !library.drafts.length &&
      tab === "draft" &&
      !library.imports.length
    )
      await newDraft();
  });
  return {
    updateUsage(usage: MobileUsage) {
      const value = usage.remaining?.generations;
      allowance =
        typeof value === "number" && Number.isFinite(value) ? value : null;
      find("[data-draft-allowance]").textContent =
        allowance === null
          ? ""
          : `${allowance} generation${allowance === 1 ? "" : "s"} left`;
    },
    hasUnsaved,
    flush,
    dispose(clearRecovery = false) {
      remember();
      const dialog = find<HTMLDialogElement>("[data-draft-delete-dialog]");
      if (dialog.open) dialog.close("cancel");
      disposed = true;
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
      ])
        find(selector).replaceChildren();
      if (clearRecovery)
        try {
          sessionStorage.removeItem(queueKey);
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const name = sessionStorage.key(i);
            if (name?.startsWith(`autolister:draft:${options.userId}:`))
              sessionStorage.removeItem(name);
          }
        } catch {}
    },
  };
}
