import {
  buildExample,
  draftSettingsFromStyle,
  resolveInitialStyle,
  type ListingStyle,
} from "./styleExample";
import { detectLanguage, getTranslation } from "./styleTranslations";
import { mountDraftSelects, syncDraftSelects } from "./draftSelect";
import { validateDescriptionFooterText } from "../../../utils/descriptionFooter";
import type { DraftSettings } from "./draftContracts";
import { trackMobileEvent } from "./analytics";

/** Prepared example copy only. This screen never uploads or generates. */
export function mountStyleOnboarding(
  root: HTMLElement,
  initial: DraftSettings,
  finish: (settings: DraftSettings) => void,
) {
  const uiLanguage = detectLanguage([
    ...navigator.languages,
    navigator.language,
  ]);
  const copy = getTranslation(uiLanguage).ui;
  const languageTag = (code: string) => (code === "cz" ? "cs" : code);
  let style: ListingStyle = {
    ...resolveInitialStyle([uiLanguage]),
    titleLanguage: initial.titleLanguageCode,
    descriptionLanguage: initial.descriptionLanguageCode,
    length: initial.descriptionLength,
    bullets: initial.useBulletPoints,
    hashtags: initial.useHashtags ?? true,
    emojis: initial.useEmojis ?? true,
    note: initial.descriptionFooterText || "",
    includeNote: Boolean(
      initial.includeSellerNote && initial.descriptionFooterText?.trim(),
    ),
  };
  const original = { ...style };
  const find = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const listeners: (() => void)[] = [];
  const bind = (target: EventTarget, event: string, fn: EventListener) => {
    target.addEventListener(event, fn);
    listeners.push(() => target.removeEventListener(event, fn));
  };
  root.lang = languageTag(uiLanguage);
  root.querySelectorAll<HTMLElement>("[data-style-copy]").forEach((el) => {
    el.textContent = copy[el.dataset.styleCopy as keyof typeof copy];
  });
  for (const kind of ["title", "description"] as const) {
    const select = find<HTMLSelectElement>(
      `[data-style-field="${kind}LanguageCode"]`,
    );
    const widget = select.closest<HTMLElement>("[data-draft-select]")!;
    widget.querySelector<HTMLElement>(".draft-control-label")!.textContent =
      copy[kind];
    select.setAttribute("aria-label", copy[kind]);
    select.value =
      kind === "title" ? style.titleLanguage : style.descriptionLanguage;
    bind(select, "change", () => {
      style = {
        ...style,
        [kind === "title" ? "titleLanguage" : "descriptionLanguage"]:
          select.value,
      };
      render();
    });
  }
  find("[data-style-group=length]").setAttribute("aria-label", copy.length);
  find("[data-style-group=format]").setAttribute("aria-label", copy.format);
  const unmountSelects = mountDraftSelects(root);
  const preview = find("[data-style-preview]");
  preview.setAttribute("aria-label", copy.example);
  function render(bottom = false) {
    const example = buildExample(style);
    find("[data-style-title]").textContent = example.title;
    find("[data-style-title]").lang = languageTag(style.titleLanguage);
    preview.lang = languageTag(style.descriptionLanguage);
    find("[data-style-intro]").textContent = example.intro;
    find("[data-style-details]").replaceChildren(
      ...example.details.map((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        return item;
      }),
    );
    find("[data-style-details]").hidden = !style.bullets;
    find("[data-style-text]").hidden = style.bullets;
    find("[data-style-text]").textContent = example.details.join(". ") + ".";
    find("[data-style-note-preview]").textContent = example.note;
    find("[data-style-note-preview]").hidden = !example.note;
    find("[data-style-hashtags]").textContent = example.hashtags;
    find("[data-style-hashtags]").hidden = !example.hashtags;
    root
      .querySelectorAll<HTMLElement>("[data-style-length]")
      .forEach((el) =>
        el.setAttribute(
          "aria-pressed",
          String(el.dataset.styleLength === style.length),
        ),
      );
    root
      .querySelectorAll<HTMLElement>("[data-style-format]")
      .forEach((el) =>
        el.setAttribute(
          "aria-pressed",
          String((el.dataset.styleFormat === "bullets") === style.bullets),
        ),
      );
    root.querySelectorAll<HTMLElement>("[data-style-toggle]").forEach((el) => {
      const key = el.dataset.styleToggle as
        | "hashtags"
        | "emojis"
        | "includeNote";
      el.setAttribute("aria-checked", String(style[key]));
      el.setAttribute(
        "aria-label",
        key === "includeNote" ? copy.note : copy[key],
      );
    });
    const hasNote = Boolean(style.note.trim());
    find("[data-style-edit-note]").hidden = hasNote;
    find("[data-style-toggle=includeNote]").hidden = !hasNote;
    find("[data-style-edit-existing]").hidden = !hasNote;
    find("[data-style-note-label]").textContent = copy.addNote;
    syncDraftSelects(root);
    preview.scrollTop = bottom ? preview.scrollHeight : 0;
  }
  root.querySelectorAll<HTMLElement>("[data-style-length]").forEach((el) =>
    bind(el, "click", () => {
      style.length = el.dataset.styleLength as ListingStyle["length"];
      render();
    }),
  );
  root.querySelectorAll<HTMLElement>("[data-style-format]").forEach((el) =>
    bind(el, "click", () => {
      style.bullets = el.dataset.styleFormat === "bullets";
      render();
    }),
  );
  root.querySelectorAll<HTMLElement>("[data-style-toggle]").forEach((el) =>
    bind(el, "click", () => {
      const key = el.dataset.styleToggle as
        | "hashtags"
        | "emojis"
        | "includeNote";
      style[key] = !style[key];
      render(key !== "emojis");
    }),
  );
  const dialog = find<HTMLDialogElement>("[data-style-note-dialog]");
  const noteInput = find<HTMLTextAreaElement>("[data-style-note-input]");
  noteInput.setAttribute("aria-label", copy.note);
  find("[data-style-edit-existing]").setAttribute("aria-label", copy.note);
  let opener: HTMLElement | null = null;
  let closing = false;
  const reducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function openNote(event: Event) {
    if (dialog.open || closing) return;
    opener = event.currentTarget as HTMLElement;
    noteInput.value = style.note;
    find("[data-style-note-error]").hidden = true;
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    if (!reducedMotion())
      dialog.animate(
        [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
        { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
  }
  function closeNote() {
    if (!dialog.open || closing) return;
    closing = true;
    const rect = dialog.getBoundingClientRect();
    dialog.style.top = `${rect.top}px`;
    dialog.style.bottom = "auto";
    dialog.style.height = `${rect.height}px`;
    noteInput.blur();
    const done = () => {
      dialog.close();
      dialog.removeAttribute("style");
      closing = false;
      const focusTarget = opener?.getClientRects().length
        ? opener
        : find("[data-style-edit-existing]");
      focusTarget.focus({ preventScroll: true });
    };
    dialog.getAnimations().forEach((animation) => animation.cancel());
    if (reducedMotion()) {
      done();
      return;
    }
    const animation = dialog.animate(
      [
        { transform: "translateY(0)" },
        {
          transform: `translateY(${Math.max(rect.height, window.innerHeight - rect.top + 24)}px)`,
        },
      ],
      { duration: 160, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
    );
    void animation.finished
      .catch(() => undefined)
      .then(() => {
        animation.cancel();
        done();
      });
  }
  bind(find("[data-style-edit-note]"), "click", openNote);
  bind(find("[data-style-edit-existing]"), "click", openNote);
  bind(find("[data-style-dismiss-note]"), "click", closeNote);
  bind(dialog, "cancel", (event) => {
    event.preventDefault();
    closeNote();
  });
  bind(dialog, "click", (event) => {
    const e = event as MouseEvent;
    const r = dialog.getBoundingClientRect();
    if (
      e.target === dialog &&
      (e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom)
    )
      closeNote();
  });
  bind(find("[data-style-save-note]"), "click", () => {
    const note = noteInput.value.trim();
    const valid = validateDescriptionFooterText(note);
    const error = find("[data-style-note-error]");
    error.hidden = valid.ok;
    error.textContent = valid.ok ? "" : valid.error;
    if (!valid.ok) {
      noteInput.focus({ preventScroll: true });
      return;
    }
    style.note = note;
    style.includeNote = Boolean(note);
    render(true);
    closeNote();
  });
  function complete(skip: boolean) {
    const next = draftSettingsFromStyle(skip ? original : style);
    try {
      finish(next);
      void trackMobileEvent("web_style_setup", {
        phase: "complete",
        method: skip ? "skip" : "apply",
        titleLanguageCode: next.titleLanguageCode,
        descriptionLanguageCode: next.descriptionLanguageCode,
        descriptionLength: next.descriptionLength,
        useBulletPoints: next.useBulletPoints,
        useHashtags: next.useHashtags,
        useEmojis: next.useEmojis,
        includeSellerNote: next.includeSellerNote,
      });
    } catch {
      const error = find("[data-style-save-error]");
      error.hidden = false;
      error.textContent = "Your settings could not be saved. Please try again.";
    }
  }
  bind(find("[data-style-finish]"), "click", () => complete(false));
  bind(find("[data-style-skip]"), "click", () => complete(true));
  render();
  root.hidden = false;
  void trackMobileEvent("web_style_setup", { phase: "shown" });
  find("#style-heading").focus({ preventScroll: true });
  return () => {
    listeners.forEach((remove) => remove());
    unmountSelects();
    if (dialog.open) dialog.close();
    root.hidden = true;
  };
}
