import { SUPPORTED_OUTPUT_LANGUAGES } from "../../utils/mobileOutputLanguages";
import { validateDescriptionFooterText } from "../../../utils/descriptionFooter";

export const DRAFT_LIMITS = {
  photos: 10,
  importPhotos: 100,
  batch: 20,
  drafts: 500,
  storageBytes: 512 * 1024 * 1024,
  uploadBytes: 4 * 1024 * 1024,
} as const;
export interface DraftSettings {
  titleLanguageCode: string;
  descriptionLanguageCode: string;
  descriptionLength: "long" | "short";
  useBulletPoints: boolean;
  tone?: "standard" | "friendly" | "professional" | "enthusiastic";
  useHashtags?: boolean;
  useEmojis?: boolean;
  includeSellerNote?: boolean;
  descriptionFooterText?: string;
}
export type ResolvedDraftSettings = Required<DraftSettings>;
export interface DraftPhoto {
  id: string;
  import_id: string;
  draft_id: string | null;
  position: number;
  bytes: number;
  status: "pending" | "ready";
  url?: string;
  created_at: string;
}
export interface Draft {
  id: string;
  title: string;
  description: string;
  settings: DraftSettings;
  state: "draft" | "done";
  version: number;
  input_version: number;
  operation_id: string | null;
  operation_state: "idle" | "running" | "pending" | "succeeded" | "failed";
  updated_at: string;
  photos: DraftPhoto[];
}
export interface DraftLibrary {
  drafts: Draft[];
  imports: DraftPhoto[];
  nextCursor: string | null;
}
export const DEFAULT_DRAFT_SETTINGS: ResolvedDraftSettings = {
  titleLanguageCode: "en",
  descriptionLanguageCode: "en",
  descriptionLength: "long",
  useBulletPoints: true,
  tone: "standard",
  useHashtags: false,
  useEmojis: false,
  includeSellerNote: false,
  descriptionFooterText: "",
};
export function normalizeDraftSettings(value: unknown): ResolvedDraftSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Choose valid listing settings.");
  const settings = { ...DEFAULT_DRAFT_SETTINGS, ...value };
  validateDraftSettings(settings);
  return settings;
}
export function validDraftId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function validateDraftSettings(
  value: unknown,
): asserts value is DraftSettings {
  const v = value as DraftSettings;
  if (
    !v ||
    typeof v !== "object" ||
    !SUPPORTED_OUTPUT_LANGUAGES.some((l) => l.code === v.titleLanguageCode) ||
    !SUPPORTED_OUTPUT_LANGUAGES.some(
      (l) => l.code === v.descriptionLanguageCode,
    ) ||
    !["long", "short"].includes(v.descriptionLength) ||
    typeof v.useBulletPoints !== "boolean" ||
    (v.tone !== undefined &&
      !["standard", "friendly", "professional", "enthusiastic"].includes(
        v.tone,
      )) ||
    ["useHashtags", "useEmojis", "includeSellerNote"].some(
      (key) =>
        v[key as keyof DraftSettings] !== undefined &&
        typeof v[key as keyof DraftSettings] !== "boolean",
    ) ||
    Object.keys(v).some((k) => !Object.keys(DEFAULT_DRAFT_SETTINGS).includes(k))
  )
    throw new Error("Choose valid languages and description style.");
  const note = validateDescriptionFooterText(v.descriptionFooterText);
  if (!note.ok) throw new Error(note.error);
}
export function validateDraftAction(
  action: string,
  value: unknown,
): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid draft request.");
  const input = value as Record<string, any>;
  const keys: Record<string, string[]> = {
    list: ["cursor", "state"],
    detail: ["draftId"],
    create: ["id", "settings", "photoIds"],
    save: [
      "draftId",
      "expectedVersion",
      "title",
      "description",
      "settings",
      "state",
    ],
    grant: ["photoId", "importId", "draftId", "bytes"],
    completeUpload: ["photoId"],
    group: ["draftId", "expectedVersion", "photoIds", "sourceVersions"],
    delete: ["draftId", "expectedVersion"],
    removePhoto: ["photoId"],
    recover: ["draftId"],
  };
  if (
    !keys[action] ||
    Object.keys(input).some((k) => !keys[action].includes(k))
  )
    throw new Error("Invalid draft action.");
  for (const key of ["draftId", "photoId", "importId", "id"])
    if (input[key] !== undefined && !validDraftId(input[key]))
      throw new Error("Invalid item identifier.");
  if (
    ["detail", "save", "group", "delete", "recover"].includes(action) &&
    !validDraftId(input.draftId)
  )
    throw new Error("Choose an item.");
  if (
    ["grant", "completeUpload", "removePhoto"].includes(action) &&
    !validDraftId(input.photoId)
  )
    throw new Error("Choose a photo.");
  if (
    action === "grant" &&
    (!validDraftId(input.importId) ||
      !Number.isInteger(input.bytes) ||
      input.bytes < 1 ||
      input.bytes > DRAFT_LIMITS.uploadBytes)
  )
    throw new Error("Each prepared photo must be no larger than 4 MB.");
  if (
    ["save", "group", "delete"].includes(action) &&
    (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
  )
    throw new Error("Reload this draft before saving.");
  if (input.settings !== undefined) validateDraftSettings(input.settings);
  if (input.state !== undefined && !["draft", "done"].includes(input.state))
    throw new Error("Invalid draft state.");
  if (
    input.title !== undefined &&
    (typeof input.title !== "string" || input.title.length > 200)
  )
    throw new Error("Keep the title under 200 characters.");
  if (
    input.description !== undefined &&
    (typeof input.description !== "string" || input.description.length > 10000)
  )
    throw new Error("Keep the description under 10,000 characters.");
  if (
    input.photoIds !== undefined &&
    (!Array.isArray(input.photoIds) ||
      input.photoIds.length > DRAFT_LIMITS.photos ||
      !input.photoIds.every(validDraftId) ||
      new Set(input.photoIds).size !== input.photoIds.length)
  )
    throw new Error("Choose up to 10 different photos for one item.");
  if (action === "group" && !Array.isArray(input.photoIds))
    throw new Error("Choose this item's photos.");
  if (
    input.sourceVersions !== undefined &&
    (typeof input.sourceVersions !== "object" ||
      Array.isArray(input.sourceVersions) ||
      !input.sourceVersions ||
      Object.entries(input.sourceVersions).some(
        ([id, v]) =>
          !validDraftId(id) || !Number.isSafeInteger(v) || Number(v) < 1,
      ))
  )
    throw new Error("Reload the photo groups before moving photos.");
  if (
    input.cursor !== undefined &&
    (typeof input.cursor !== "string" || input.cursor.length > 160)
  )
    throw new Error("Invalid page.");
  return input;
}
