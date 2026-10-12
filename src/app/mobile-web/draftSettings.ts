import {
  DEFAULT_DRAFT_SETTINGS,
  type Draft,
  type DraftSettings,
  permittedDraftSettings,
} from "./draftContracts";
import { SUPPORTED_OUTPUT_LANGUAGES } from "../../utils/mobileOutputLanguages";
import { validateDescriptionFooterText } from "../../../utils/descriptionFooter";
import { syncDraftSelects } from "./draftSelect";

export const TONE_LABELS = {
  standard: "Standard",
  friendly: "Friendly",
  professional: "Pro",
  enthusiastic: "Enthusiastic",
} as const;
export function settingsSummary(value: DraftSettings): string {
  const s = { ...DEFAULT_DRAFT_SETTINGS, ...value };
  return `${s.descriptionLength === "short" ? "Short" : "Long"} · ${s.useBulletPoints ? "Bullet points" : "Paragraphs"} · ${TONE_LABELS[s.tone]}`;
}
export function settingsExtras(value: DraftSettings): string {
  return `Hashtags ${value.useHashtags ? "on" : "off"} · Emojis ${value.useEmojis ? "on" : "off"} · ${value.includeSellerNote && value.descriptionFooterText?.trim() ? "Note included" : "Note excluded"}`;
}
export function settingsLanguages(value: DraftSettings): string {
  const label = (code: string) =>
    SUPPORTED_OUTPUT_LANGUAGES.find((l) => l.code === code)?.label || code;
  return `Title: ${label(value.titleLanguageCode)} · Description: ${label(value.descriptionLanguageCode)}`;
}
export function sameSettings(a: DraftSettings, b: DraftSettings): boolean {
  return Object.keys(DEFAULT_DRAFT_SETTINGS).every(
    (key) =>
      ({ ...DEFAULT_DRAFT_SETTINGS, ...a })[key as keyof DraftSettings] ===
      { ...DEFAULT_DRAFT_SETTINGS, ...b }[key as keyof DraftSettings],
  );
}
export function batchInheritingItems(
  drafts: Draft[],
  ids: string[],
  previous: DraftSettings,
): Draft[] {
  return drafts.filter(
    (d) =>
      ids.includes(d.id) &&
      !["running", "pending"].includes(d.operation_state) &&
      !d.description &&
      sameSettings(d.settings, previous),
  );
}
export function settingInputValue(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): string | boolean {
  if (el instanceof HTMLInputElement && el.type === "checkbox")
    return el.checked;
  if (
    (el.dataset.draftField ||
      el.dataset.draftDefault ||
      el.getAttribute("data-draft-global")) === "useBulletPoints"
  )
    return el.value === "true";
  return el.value;
}
export function syncSettingsControls(
  root: HTMLElement,
  attribute: "field" | "default" | "global",
  value: DraftSettings,
  locked = false,
  access = { tone: true, extras: true },
) {
  const settings = permittedDraftSettings(value, access);
  root
    .querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`[data-draft-${attribute}]`)
    .forEach((el) => {
      const key = el.getAttribute(
        `data-draft-${attribute}`,
      ) as keyof DraftSettings;
      if (!(key in settings)) return;
      const current = settings[key];
      if (el instanceof HTMLInputElement && el.type === "radio")
        el.checked = el.value === String(current);
      else if (el instanceof HTMLInputElement && el.type === "checkbox")
        el.checked = Boolean(current);
      else if (el.value !== String(current)) el.value = String(current);
      el.disabled = locked;
      if (key === "tone" && el instanceof HTMLSelectElement)
        Array.from(el.options).forEach(
          (o) => (o.disabled = !access.tone && o.value !== "standard"),
        );
      if (["useEmojis", "includeSellerNote"].includes(key)) {
        el.disabled = locked || !access.extras;
        const link = el
          .closest("label")
          ?.querySelector<HTMLAnchorElement>("[data-draft-plan-lock]");
        if (link) {
          link.hidden = access.extras;
          link.tabIndex = locked ? -1 : 0;
          link.style.pointerEvents = locked ? "none" : "";
        }
      }
    });
  syncDraftSelects(root, attribute);
  const note = root.querySelector<HTMLTextAreaElement>(
    `[data-draft-${attribute}="descriptionFooterText"]`,
  );
  const panel = note?.closest<HTMLElement>(".draft-settings-grid");
  if (!panel || !note) return;
  panel.querySelector("[data-draft-note-count]")!.textContent =
    `${note.value.length}/240`;
  const validation = validateDescriptionFooterText(note.value);
  note.setCustomValidity(validation.ok ? "" : validation.error);
  const error = panel.querySelector<HTMLElement>(
    "[data-draft-settings-error]",
  )!;
  const newlyInvalid = error.hidden && !validation.ok;
  error.hidden = validation.ok;
  error.textContent = validation.ok ? "" : validation.error;
  note.setAttribute("aria-invalid", String(!validation.ok));
  panel
    .closest(".draft-popover-panel")
    ?.querySelectorAll<HTMLButtonElement>(
      '.draft-settings-done, [data-draft-action="save-defaults"]',
    )
    .forEach((button) => {
      button.disabled = locked || !validation.ok;
    });
  if (newlyInvalid) error.scrollIntoView({ block: "nearest" });
}
