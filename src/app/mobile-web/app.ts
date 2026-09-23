import {
  getBrowserSession,
  requestMagicLink,
  signInWithGoogle,
  signOutBrowser,
  verifyEmailOtp,
} from "./auth.js";
import { MobileApiError } from "./api.js";
import {
  createMobileGenerationRequestId,
  generateListing,
  loadUsage,
  type MobileGenerationInput,
  type MobileGenerationResult,
  type MobileUsage,
} from "./generationClient.js";
import {
  readFormattingPreferences,
  persistFormattingPreferences,
  type FormattingPreferences,
} from "./formatting.js";
import {
  resolveMobileLanguagePreferences,
  type MobileLanguagePreferences,
} from "./language.js";
import {
  cleanupUploadSession,
  createMobileUploadSession,
  uploadSelectedPhotos,
  type MobileUploadSession,
  type MobileUploadProgress,
  type UploadedMobilePhoto,
} from "./uploadClient.js";
import { revokeMobilePreview } from "./imagePreparation.js";

export type MobileGenerationState =
  | { status: "idle" }
  | { status: "uploading"; completed: number; total: number }
  | { status: "generating" }
  | { status: "success"; result: MobileGenerationResult }
  | { status: "quota"; message: string }
  | { status: "error"; message: string; retryable: boolean };

interface SelectedPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

interface MobileAppRoot extends HTMLElement {
  __mobileWebCleanup?: () => void;
}

const GENERATION_RETRY_STATUSES = new Set([500, 502, 503, 504]);

function uuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid) return randomUuid.call(globalThis.crypto);
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function asElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T | null {
  return root.querySelector<T>(selector);
}

function text(root: ParentNode, selector: string, value: string): void {
  const element = asElement<HTMLElement>(root, selector);
  if (element) element.textContent = value;
}

function setHidden(root: ParentNode, selector: string, hidden: boolean): void {
  const element = asElement<HTMLElement>(root, selector);
  if (element) element.hidden = hidden;
}

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function safeLanguagePreferences(): MobileLanguagePreferences {
  const storage = getStorage();
  const adapter = {
    getItem: (key: string) => storage?.getItem(key) ?? null,
    setItem: (key: string, value: string) => storage?.setItem(key, value),
  };
  return resolveMobileLanguagePreferences({
    storage: adapter,
    hostname: typeof window === "undefined" ? "" : window.location.hostname,
    navigatorLanguages:
      typeof navigator === "undefined" ? [] : navigator.languages,
    navigatorLanguage:
      typeof navigator === "undefined" ? undefined : navigator.language,
  });
}

function safeFormattingPreferences(): FormattingPreferences {
  const storage = getStorage();
  return readFormattingPreferences({
    getItem: (key: string) => storage?.getItem(key) ?? null,
    setItem: () => undefined,
  });
}

export function getMobileUsageDisplay(usage: MobileUsage): string {
  if (usage.canGenerate === false) return "Limit reached";
  const remaining = usage.remaining ?? {};
  const tier = usage.plan?.tier;
  const packCredits =
    typeof remaining.packCredits === "number" ? remaining.packCredits : 0;
  const planRemaining =
    tier === "free"
      ? typeof remaining.freeLifetime === "number"
        ? remaining.freeLifetime
        : null
      : [remaining.daily, remaining.monthly].filter(
            (value): value is number => typeof value === "number",
          ).length > 0
        ? Math.min(
            ...[remaining.daily, remaining.monthly].filter(
              (value): value is number => typeof value === "number",
            ),
          )
        : null;
  let available =
    planRemaining === null ? packCredits : planRemaining + packCredits;
  if (typeof remaining.minute === "number")
    available = Math.min(available, remaining.minute);
  if (available <= 0) return "Limit reached";
  return `${available} generation${available === 1 ? "" : "s"} left`;
}

export function canReuseMobileGenerationUpload(
  selectedPhotoIds: string[],
  uploadedPhotoIds: string[],
  uploadedPhotoCount: number,
): boolean {
  return (
    uploadedPhotoCount > 0 &&
    selectedPhotoIds.length === uploadedPhotoIds.length &&
    selectedPhotoIds.every((id, index) => uploadedPhotoIds[index] === id)
  );
}

export function revokeMobileUploadedPreviews(
  photos: UploadedMobilePhoto[],
): void {
  photos.forEach((photo) => revokeMobilePreview(photo.previewUrl));
}

function errorDetails(error: unknown): {
  status: number;
  message: string;
  retryable: boolean;
  code: string;
} {
  if (error instanceof MobileApiError) {
    return {
      status: error.status,
      message: error.message,
      retryable: error.retryable,
      code: error.code,
    };
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      status: typeof record.status === "number" ? record.status : 0,
      message:
        typeof record.message === "string"
          ? record.message
          : "Something went wrong. Please try again.",
      retryable: record.retryable === true,
      code: typeof record.code === "string" ? record.code : "unknown_error",
    };
  }
  return {
    status: 0,
    message: "Something went wrong. Please try again.",
    retryable: true,
    code: "unknown_error",
  };
}

function progressCopy(state: MobileGenerationState): [string, string] {
  if (state.status === "uploading")
    return [
      "Preparing your photos",
      `Securely uploading ${state.completed} of ${state.total} photos`,
    ];
  if (state.status === "generating")
    return [
      "Writing your listing",
      "Our AI is finding the useful details in your photos",
    ];
  return ["Preparing your listing", "Your photos are being securely prepared."];
}

function setGenerationState(
  root: ParentNode,
  state: MobileGenerationState,
  options: { canGenerate?: boolean; hasPhotos?: boolean } = {},
): void {
  const shell = asElement<HTMLElement>(root, '[data-mobile-web="workspace"]');
  if (shell) shell.dataset.state = state.status;
  const progress = asElement<HTMLElement>(
    root,
    '[data-mobile-web="generation-progress"]',
  );
  if (progress)
    progress.hidden =
      state.status !== "uploading" && state.status !== "generating";
  const generateButton = asElement<HTMLButtonElement>(
    root,
    '[data-mobile-web="generate"]',
  );
  if (generateButton)
    generateButton.disabled =
      state.status === "uploading" ||
      state.status === "generating" ||
      state.status === "quota" ||
      options.canGenerate === false ||
      options.hasPhotos === false;
  const editingDisabled =
    state.status === "uploading" || state.status === "generating";
  root
    .querySelectorAll<HTMLInputElement>(
      '[data-mobile-web="camera-input"], [data-mobile-web="gallery-input"]',
    )
    .forEach((input) => {
      input.disabled = editingDisabled;
    });
  root
    .querySelectorAll<HTMLButtonElement>(
      '[data-mobile-web="add-photo"], [data-photo-remove]',
    )
    .forEach((button) => {
      button.disabled = editingDisabled;
    });
  const [title, copy] = progressCopy(state);
  text(root, '[data-mobile-web="generation-progress-title"]', title);
  text(root, '[data-mobile-web="generation-progress-copy"]', copy);
  if (state.status === "uploading" || state.status === "generating") {
    text(root, '[data-mobile-web="generation-status"]', "");
  } else if (state.status === "error" || state.status === "quota") {
    text(root, '[data-mobile-web="generation-status"]', state.message);
  } else {
    text(root, '[data-mobile-web="generation-status"]', "");
  }
}

function renderPhotos(root: ParentNode, photos: SelectedPhoto[]): void {
  const list = asElement<HTMLElement>(root, '[data-mobile-web="photo-list"]');
  if (!list) return;
  list.querySelectorAll("[data-photo-id]").forEach((item) => item.remove());
  const addButton = list.querySelector('[data-mobile-web="add-photo"]');
  photos.forEach((photo, index) => {
    const tile = document.createElement("div");
    tile.className = "photo-tile";
    tile.dataset.photoId = photo.id;
    tile.setAttribute("role", "listitem");
    const image = document.createElement("img");
    image.src = photo.previewUrl;
    image.alt = `Selected photo ${index + 1}`;
    image.loading = "lazy";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "photo-remove";
    remove.dataset.photoRemove = photo.id;
    remove.setAttribute("aria-label", `Remove photo ${index + 1}`);
    remove.textContent = "×";
    tile.append(image, remove);
    if (addButton) list.insertBefore(tile, addButton);
    else list.append(tile);
  });
  text(
    root,
    '[data-mobile-web="photo-count"]',
    photos.length
      ? `${photos.length} photo${photos.length === 1 ? "" : "s"} selected`
      : "No photos yet",
  );
  const generateButton = asElement<HTMLButtonElement>(
    root,
    '[data-mobile-web="generate"]',
  );
  if (generateButton && photos.length === 0) generateButton.disabled = true;
}

function updateLanguageControls(
  root: ParentNode,
  languages: MobileLanguagePreferences,
): void {
  const labels = {
    title: languages.titleLanguageCode,
    description: languages.descriptionLanguageCode,
  } as const;
  for (const [kind, code] of Object.entries(labels)) {
    const trigger = asElement<HTMLButtonElement>(
      root,
      `[data-mobile-language-trigger="${kind}"]`,
    );
    const label = asElement<HTMLElement>(
      root,
      `[data-mobile-language-label="${kind}"]`,
    );
    const options = root.querySelectorAll<HTMLElement>(
      `[data-mobile-language-option="${kind}"]`,
    );
    const selected = Array.from(options).find(
      (option) => option.dataset.value === code,
    );
    if (trigger) trigger.dataset.value = code;
    if (label && selected)
      label.textContent = selected.textContent?.trim() ?? code;
    options.forEach((option) => {
      const isSelected = option.dataset.value === code;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-selected", String(isSelected));
    });
  }
}

function persistLanguage(
  kind: "title" | "description",
  code: string,
): MobileLanguagePreferences {
  const storage = getStorage();
  const current = safeLanguagePreferences();
  if (storage)
    storage.setItem(
      kind === "title"
        ? "selectedTitleLanguage"
        : "selectedDescriptionLanguage",
      code,
    );
  return {
    ...current,
    [kind === "title" ? "titleLanguageCode" : "descriptionLanguageCode"]: code,
  };
}

function updateFormattingControls(
  root: ParentNode,
  formatting: FormattingPreferences,
): void {
  root
    .querySelectorAll<HTMLElement>('[data-mobile-format-option="length"]')
    .forEach((item) => {
      const selected = item.dataset.value === formatting.descriptionLength;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
  root
    .querySelectorAll<HTMLElement>('[data-mobile-format-option="shape"]')
    .forEach((item) => {
      const selected =
        (item.dataset.value === "bullets") === formatting.useBulletPoints;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
  text(
    root,
    "[data-mobile-format-summary]",
    `${formatting.descriptionLength === "long" ? "Long" : "Short"} · ${formatting.useBulletPoints ? "Bullet points" : "Paragraphs"}`,
  );
}

function showAuth(root: ParentNode): void {
  setHidden(root, '[data-mobile-web="auth-card"]', false);
  setHidden(root, '[data-mobile-web="app-view"]', true);
  setHidden(root, '[data-mobile-web="state-card"]', true);
  setHidden(root, '[data-mobile-web="sign-out"]', true);
  setHidden(root, '[data-mobile-web="usage"]', true);
}

function showApp(root: ParentNode): void {
  setHidden(root, '[data-mobile-web="auth-card"]', true);
  setHidden(root, '[data-mobile-web="app-view"]', false);
  setHidden(root, '[data-mobile-web="state-card"]', true);
  setHidden(root, '[data-mobile-web="sign-out"]', false);
  setHidden(root, '[data-mobile-web="usage"]', false);
}

function showState(
  root: ParentNode,
  title: string,
  copy: string,
  action?: string,
): void {
  setHidden(root, '[data-mobile-web="auth-card"]', true);
  setHidden(root, '[data-mobile-web="app-view"]', true);
  setHidden(root, '[data-mobile-web="state-card"]', false);
  text(root, '[data-mobile-web="state-title"]', title);
  text(root, '[data-mobile-web="state-copy"]', copy);
  const button = asElement<HTMLButtonElement>(
    root,
    '[data-mobile-web="state-action"]',
  );
  if (button) {
    button.hidden = !action;
    button.textContent = action ?? "";
  }
}

export function mountMobileWebApp(
  root: MobileAppRoot = document.body as MobileAppRoot,
): () => void {
  const shell = asElement<HTMLElement>(root, '[data-mobile-web="workspace"]');
  if (!shell) return () => undefined;
  let disposed = false;
  let session: Awaited<ReturnType<typeof getBrowserSession>> = null;
  let photos: SelectedPhoto[] = [];
  let uploadSession: MobileUploadSession | null = null;
  let uploadedPhotos: UploadedMobilePhoto[] = [];
  let uploadedPhotoIds: string[] = [];
  let activeController: AbortController | null = null;
  let requestId: string | undefined;
  let canGenerate: boolean | null = null;
  let cancellationRequested = false;
  let language = safeLanguagePreferences();
  let formatting = safeFormattingPreferences();
  let state: MobileGenerationState = { status: "idle" };
  const listeners: Array<() => void> = [];

  const bind = (
    element: Element | null,
    event: string,
    handler: EventListener,
  ): void => {
    if (!element) return;
    element.addEventListener(event, handler);
    listeners.push(() => element.removeEventListener(event, handler));
  };

  const applyGenerationState = (): void => {
    setGenerationState(root, state, {
      canGenerate: canGenerate !== false,
      hasPhotos: photos.length > 0,
    });
  };

  const refreshUsage = async (): Promise<MobileUsage | null> => {
    if (disposed) return null;
    try {
      const usage = await loadUsage();
      if (disposed) return null;
      canGenerate = usage.canGenerate !== false;
      text(root, '[data-mobile-web="usage"]', getMobileUsageDisplay(usage));
      if (usage.canGenerate === false) {
        state = {
          status: "quota",
          message: "You have reached your current generation limit.",
        };
      } else if (state.status === "quota") {
        state = { status: "idle" };
      }
      applyGenerationState();
      return usage;
    } catch (error) {
      if (disposed) return null;
      if (errorDetails(error).status === 401) {
        session = null;
        activeController?.abort();
        await cleanupServerSession("cancelled");
        clearPreviews();
        showAuth(root);
      } else {
        text(root, '[data-mobile-web="usage"]', "Usage unavailable");
      }
      return null;
    }
  };

  const clearPreviews = (): void => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    photos = [];
    renderPhotos(root, photos);
    applyGenerationState();
  };

  const clearUploadedPhotos = (): void => {
    revokeMobileUploadedPreviews(uploadedPhotos);
    uploadedPhotos = [];
    uploadedPhotoIds = [];
  };

  const cleanupServerSession = async (
    phase: "cancelled" | "post-generation",
  ): Promise<void> => {
    const current = uploadSession;
    uploadSession = null;
    clearUploadedPhotos();
    if (current)
      await cleanupUploadSession(current, phase).catch(() => undefined);
  };

  const renderResult = (result: MobileGenerationResult): void => {
    const resultSection = asElement<HTMLElement>(
      root,
      '[data-mobile-web="listing-result"]',
    );
    if (!resultSection) return;
    const titleInput = asElement<HTMLInputElement>(
      root,
      '[data-mobile-web="result-title"]',
    );
    const descriptionInput = asElement<HTMLTextAreaElement>(
      root,
      '[data-mobile-web="result-description"]',
    );
    if (titleInput) titleInput.value = result.title;
    if (descriptionInput) descriptionInput.value = result.description;
    resultSection.hidden = false;
  };

  const runGeneration = async (): Promise<void> => {
    if (
      disposed ||
      !session ||
      photos.length === 0 ||
      canGenerate === false ||
      state.status === "uploading" ||
      state.status === "generating"
    )
      return;
    activeController?.abort();
    activeController = new AbortController();
    cancellationRequested = false;
    const selectedPhotoIds = photos.map((photo) => photo.id);
    const reuseUpload = Boolean(
      requestId &&
      uploadSession &&
      canReuseMobileGenerationUpload(
        selectedPhotoIds,
        uploadedPhotoIds,
        uploadedPhotos.length,
      ),
    );
    state = { status: "uploading", completed: 0, total: photos.length };
    applyGenerationState();
    let generationStarted = false;
    try {
      if (!reuseUpload) {
        if (uploadSession) await cleanupServerSession("cancelled");
        requestId = createMobileGenerationRequestId();
        uploadSession = createMobileUploadSession(session.access_token);
        uploadedPhotoIds = [];
        uploadedPhotos = await uploadSelectedPhotos(
          uploadSession,
          photos.map((photo) => photo.file),
          activeController.signal,
          (progress: MobileUploadProgress) => {
            if (disposed || cancellationRequested) return;
            state = { status: "uploading", ...progress };
            applyGenerationState();
          },
        );
        uploadedPhotoIds = selectedPhotoIds;
      }
      if (disposed || cancellationRequested) return;
      state = { status: "generating" };
      applyGenerationState();
      const input: MobileGenerationInput = {
        imageUrls: uploadedPhotos.map((photo) => photo.url),
        titleLanguageCode: language.titleLanguageCode,
        descriptionLanguageCode: language.descriptionLanguageCode,
        descriptionLength: formatting.descriptionLength,
        useBulletPoints: formatting.useBulletPoints,
        requestId,
        signal: activeController.signal,
      };
      generationStarted = true;
      const result = await generateListing(input);
      if (disposed || cancellationRequested) return;
      requestId = undefined;
      state = { status: "success", result };
      applyGenerationState();
      renderResult(result);
      await cleanupServerSession("post-generation");
      clearPreviews();
      await refreshUsage();
    } catch (error) {
      const details = errorDetails(error);
      if (disposed) return;
      if (details.status === 401) {
        session = null;
        await cleanupServerSession("cancelled");
        clearPreviews();
        state = { status: "idle" };
        showAuth(root);
        return;
      }
      const cancelled = cancellationRequested || details.code === "aborted";
      if (cancelled) {
        await cleanupServerSession("cancelled");
        requestId = undefined;
        clearPreviews();
        state = {
          status: "error",
          message: "Photo generation was cancelled.",
          retryable: false,
        };
        applyGenerationState();
        return;
      }
      const retryableGenerationError =
        generationStarted &&
        (GENERATION_RETRY_STATUSES.has(details.status) ||
          (details.status === 0 && details.retryable) ||
          (details.status === 429 &&
            ["burst_limit", "service_unavailable"].includes(details.code)));
      if (!retryableGenerationError) {
        await cleanupServerSession("cancelled");
        requestId = undefined;
      }
      const usage =
        details.status === 403 || details.status === 429
          ? await refreshUsage()
          : null;
      const isQuota =
        (details.status === 403 || details.status === 429) &&
        usage?.canGenerate === false;
      state = isQuota
        ? { status: "quota", message: details.message }
        : {
            status: "error",
            message: details.message,
            retryable: retryableGenerationError,
          };
      applyGenerationState();
    } finally {
      activeController = null;
      if (!disposed) {
        applyGenerationState();
        const button = asElement<HTMLButtonElement>(
          root,
          '[data-mobile-web="generate"]',
        );
        if (button) {
          button.textContent =
            state.status === "error" && state.retryable
              ? "Try again"
              : "Generate listing";
        }
      }
    }
  };

  const acceptFiles = (event: Event): void => {
    if (state.status === "uploading" || state.status === "generating") return;
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    photos.push(
      ...files.map((file) => ({
        id: uuid(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    );
    input.value = "";
    renderPhotos(root, photos);
    applyGenerationState();
  };

  bind(
    asElement(root, '[data-mobile-web="camera-input"]'),
    "change",
    acceptFiles,
  );
  bind(
    asElement(root, '[data-mobile-web="gallery-input"]'),
    "change",
    acceptFiles,
  );
  bind(asElement(root, '[data-mobile-web="add-photo"]'), "click", () => {
    if (state.status === "uploading" || state.status === "generating") return;
    asElement<HTMLInputElement>(
      root,
      '[data-mobile-web="gallery-input"]',
    )?.click();
  });
  bind(asElement(root, '[data-mobile-web="photo-list"]'), "click", (event) => {
    if (state.status === "uploading" || state.status === "generating") return;
    const target = event.target as HTMLElement;
    const id = target.closest<HTMLElement>("[data-photo-remove]")?.dataset
      .photoRemove;
    if (!id) return;
    const photo = photos.find((item) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    photos = photos.filter((item) => item.id !== id);
    renderPhotos(root, photos);
    applyGenerationState();
  });
  bind(
    asElement(root, '[data-mobile-web="generate"]'),
    "click",
    () => void runGeneration(),
  );
  bind(
    asElement(root, '[data-mobile-web="cancel-generation"]'),
    "click",
    () => {
      cancellationRequested = true;
      activeController?.abort();
    },
  );
  bind(asElement(root, '[data-mobile-web="new-item"]'), "click", () => {
    setHidden(root, '[data-mobile-web="listing-result"]', true);
    state = { status: "idle" };
    applyGenerationState();
    requestId = undefined;
    renderPhotos(root, photos);
  });
  bind(
    asElement(root, '[data-mobile-web="google-sign-in"]'),
    "click",
    () =>
      void signInWithGoogle().catch((error) =>
        disposed
          ? undefined
          : text(
              root,
              '[data-mobile-web="auth-status"]',
              error instanceof Error ? error.message : "Google sign-in failed.",
            ),
      ),
  );
  bind(
    asElement<HTMLFormElement>(root, '[data-mobile-web="email-form"]'),
    "submit",
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const email =
        (new FormData(form).get("email") as string | null)?.trim() ?? "";
      void requestMagicLink(email)
        .then(() => {
          if (disposed) return;
          form.hidden = true;
          setHidden(root, '[data-mobile-web="otp-form"]', false);
          text(
            root,
            '[data-mobile-web="auth-status"]',
            "Check your email for a sign-in link and 6-digit code.",
          );
          asElement<HTMLInputElement>(root, "#mobile-otp")?.focus();
        })
        .catch((error) => {
          if (disposed) return;
          text(
            root,
            '[data-mobile-web="auth-status"]',
            error instanceof Error
              ? error.message
              : "We could not send the sign-in email.",
          );
        });
    },
  );
  bind(asElement(root, '[data-mobile-web="change-email"]'), "click", () => {
    setHidden(root, '[data-mobile-web="otp-form"]', true);
    setHidden(root, '[data-mobile-web="email-form"]', false);
    text(root, '[data-mobile-web="auth-status"]', "");
  });
  bind(asElement<HTMLInputElement>(root, "#mobile-otp"), "input", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    if (input.value.length !== 6) return;
    const email =
      asElement<HTMLInputElement>(root, "#mobile-email")?.value ?? "";
    void verifyEmailOtp(email, input.value)
      .then((nextSession) => {
        if (disposed) return;
        session = nextSession;
        showApp(root);
        void refreshUsage();
      })
      .catch((error) => {
        if (disposed) return;
        text(
          root,
          '[data-mobile-web="auth-status"]',
          error instanceof Error
            ? error.message
            : "That code could not be verified.",
        );
      });
  });
  bind(asElement(root, '[data-mobile-web="sign-out"]'), "click", () => {
    cancellationRequested = true;
    activeController?.abort();
    void signOutBrowser().then(() => {
      if (disposed) return;
      session = null;
      void cleanupServerSession("cancelled");
      clearPreviews();
      showAuth(root);
    });
  });
  bind(asElement(root, '[data-mobile-web="state-action"]'), "click", () =>
    showAuth(root),
  );

  bind(asElement(root, "[data-mobile-listing-controls]"), "click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-mobile-language-option], [data-mobile-format-option], [data-mobile-format-sheet-trigger], [data-mobile-format-done]",
    );
    if (!target) return;
    const languageKind = target.dataset.mobileLanguageOption as
      | "title"
      | "description"
      | undefined;
    if (languageKind && target.dataset.value) {
      language = persistLanguage(languageKind, target.dataset.value);
      updateLanguageControls(root, language);
      return;
    }
    const formatKind = target.dataset.mobileFormatOption;
    if (formatKind === "length" && target.dataset.value)
      formatting = {
        ...formatting,
        descriptionLength: target.dataset.value === "short" ? "short" : "long",
      };
    if (formatKind === "shape")
      formatting = {
        ...formatting,
        useBulletPoints: target.dataset.value === "bullets",
      };
    if (formatKind) {
      const storage = getStorage();
      if (storage)
        persistFormattingPreferences(
          {
            getItem: (key: string) => storage.getItem(key),
            setItem: (key: string, value: string) =>
              storage.setItem(key, value),
          },
          formatting,
        );
      updateFormattingControls(root, formatting);
    }
    if (target.dataset.mobileFormatSheetTrigger)
      setHidden(root, "[data-mobile-format-sheet]", false);
    if (target.dataset.mobileFormatDone)
      setHidden(root, "[data-mobile-format-sheet]", true);
  });
  bind(
    asElement(root, "[data-mobile-listing-controls]"),
    "keydown",
    (event) => {
      if ((event as KeyboardEvent).key === "Escape")
        setHidden(root, "[data-mobile-format-sheet]", true);
    },
  );

  updateLanguageControls(root, language);
  updateFormattingControls(root, formatting);
  renderPhotos(root, photos);
  applyGenerationState();

  const start = async (): Promise<void> => {
    try {
      session = await getBrowserSession();
      if (disposed) return;
      if (!session) {
        showAuth(root);
        return;
      }
      showApp(root);
      await refreshUsage();
    } catch {
      if (disposed) return;
      showState(
        root,
        "We could not restore your session",
        "Please sign in again to continue.",
        "Sign in",
      );
    }
  };
  void start();

  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    cancellationRequested = true;
    activeController?.abort();
    void cleanupServerSession("cancelled");
    clearPreviews();
    listeners.forEach((remove) => remove());
  };
  root.__mobileWebCleanup = cleanup;
  return cleanup;
}

export function getMobileWebCleanup(
  root: MobileAppRoot,
): (() => void) | undefined {
  return root.__mobileWebCleanup;
}
