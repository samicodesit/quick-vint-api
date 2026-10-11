import { fetchMobileJson } from "./api";

type Mode = "single" | "batch";
interface PhoneFiles {
  status: string;
  complete: boolean;
  files: Array<{ name: string; url: string; order: number }>;
  count: number;
}
interface QrCode {
  addData(value: string): void;
  make(): void;
  createDataURL(cellSize: number, margin: number): string;
}
let qrLibrary: Promise<void> | undefined;
function loadQrLibrary() {
  if (!qrLibrary)
    qrLibrary = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/app/vendor/qrcode.min.js";
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        qrLibrary = undefined;
        reject(new Error("Could not load the QR code. Try again."));
      };
      document.head.append(script);
    });
  return qrLibrary;
}

/** Reuses the extension's QR capability session. Never puts account credentials in the link. */
export function mountPhoneEntry(
  root: HTMLElement,
  receive: (files: File[], batch: boolean) => Promise<void>,
) {
  const desktop = window.matchMedia("(min-width: 768px)");
  let desired: Mode | null = null;
  let activeMode: Mode | null = null;
  let sessionId: string | undefined;
  let link = "";
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let receiving = false;
  let disposed = false;
  const pane = (mode: Mode) =>
    root.querySelector<HTMLElement>(`[data-phone-upload="${mode}"]`)!;
  const status = (mode: Mode, text: string, retry = false) => {
    pane(mode).querySelector<HTMLElement>("[data-phone-status]")!.textContent =
      text;
    pane(mode).querySelector<HTMLElement>("[data-phone-retry]")!.hidden =
      !retry;
  };
  const cleanup = (id: string, cancelled = true) =>
    fetchMobileJson(
      `/api/phone-upload?action=cleanup&v=2&sessionId=${id}${cancelled ? "&reason=cancelled" : ""}`,
      { method: "POST" },
    ).catch(() => {});
  const stop = () => {
    revision++;
    clearTimeout(timer);
    request?.abort();
    if (sessionId) void cleanup(sessionId);
    sessionId = undefined;
    activeMode = null;
    link = "";
  };
  const poll = async (mode: Mode, id: string, intent: number) => {
    if (disposed || intent !== revision) return;
    request = new AbortController();
    try {
      const result = await fetchMobileJson<PhoneFiles>(
        `/api/phone-upload?v=2&includeUrls=1&sessionId=${id}`,
        { signal: request.signal },
      );
      if (intent !== revision || disposed) return;
      if (["expired", "cancelled"].includes(result.status)) {
        sessionId = undefined;
        throw new Error("This QR code has expired. Create a new one.");
      }
      if (result.complete) {
        if (
          !result.files.length ||
          result.files.length > (mode === "batch" ? 100 : 10)
        )
          throw new Error("Choose fewer photos on your phone and try again.");
        status(mode, "Receiving your photos…");
        const files = await Promise.all(
          [...result.files]
            .sort((a, b) => a.order - b.order)
            .map(async (file) => {
              const response = await fetch(file.url, {
                signal: request!.signal,
              });
              if (!response.ok)
                throw new Error("Could not receive your photos. Try again.");
              const blob = await response.blob();
              return new File([blob], file.name, {
                type: blob.type || "image/jpeg",
              });
            }),
        );
        if (intent !== revision || disposed) return;
        receiving = true;
        await receive(files, mode === "batch");
        sessionId = undefined;
        await cleanup(id, false);
        activeMode = null;
        receiving = false;
        reconcile();
        return;
      }
      status(
        mode,
        result.status === "uploading"
          ? "Photos are uploading…"
          : "Scan to take or choose photos.",
      );
      timer = setTimeout(() => void poll(mode, id, intent), 2500);
    } catch (error) {
      receiving = false;
      if (intent !== revision || disposed) return;
      status(
        mode,
        error instanceof Error
          ? error.message
          : "Could not connect. Try again.",
        true,
      );
    }
  };
  const start = async (mode: Mode) => {
    activeMode = mode;
    const intent = ++revision;
    const id = crypto.randomUUID();
    sessionId = id;
    request = new AbortController();
    const qr = pane(mode).querySelector<HTMLElement>("[data-phone-qr]")!;
    qr.setAttribute("aria-busy", "true");
    qr.replaceChildren(
      Object.assign(document.createElement("span"), {
        className: "draft-qr-placeholder",
      }),
    );
    pane(mode).querySelector<HTMLElement>("[data-phone-copy]")!.hidden = true;
    status(mode, "Preparing QR code…");
    try {
      await fetchMobileJson(
        `/api/phone-upload?action=open&v=2&mode=${mode}&sessionId=${id}`,
        {
          method: "POST",
          signal: request.signal,
        },
      );
      await loadQrLibrary();
      if (intent !== revision || disposed) {
        void cleanup(id);
        return;
      }
      const url = new URL("/phone-upload/", window.location.origin);
      url.searchParams.set("s", id);
      url.searchParams.set("v", "2");
      if (mode === "batch") url.searchParams.set("mode", "batch");
      link = url.href;
      const code = (
        window as unknown as {
          qrcode: (version: number, level: string) => QrCode;
        }
      ).qrcode(0, "M");
      code.addData(link);
      code.make();
      const image = document.createElement("img");
      image.src = code.createDataURL(4, 16);
      image.alt = "Scan to add photos from your phone";
      qr.replaceChildren(image);
      pane(mode).querySelector<HTMLElement>("[data-phone-copy]")!.hidden =
        false;
      void poll(mode, id, intent);
    } catch (error) {
      if (intent !== revision || disposed) return;
      void cleanup(id);
      sessionId = undefined;
      status(
        mode,
        error instanceof Error
          ? error.message
          : "Could not create QR code. Try again.",
        true,
      );
    } finally {
      if (intent === revision) qr.setAttribute("aria-busy", "false");
    }
  };
  function reconcile() {
    if (disposed || receiving) return;
    const next = desktop.matches ? desired : null;
    if (next === activeMode) return;
    stop();
    if (next) void start(next);
  }
  const click = async (event: Event) => {
    const target = event.target as HTMLElement;
    const current = target.closest<HTMLElement>("[data-phone-upload]");
    const mode = current?.dataset.phoneUpload as Mode | undefined;
    if (!mode || mode !== activeMode) return;
    if (target.closest("[data-phone-retry]")) {
      status(mode, "Reconnecting…");
      if (sessionId) void poll(mode, sessionId, revision);
      else {
        stop();
        void start(mode);
      }
    }
    if (target.closest("[data-phone-copy]")) {
      try {
        await navigator.clipboard.writeText(link);
        status(mode, "Link copied");
      } catch {
        const field = document.createElement("input");
        field.readOnly = true;
        field.value = link;
        field.setAttribute("aria-label", "Phone upload link");
        current!.querySelector("[data-phone-status]")!.replaceChildren(field);
        field.focus();
        field.select();
      }
    }
  };
  root.addEventListener("click", click);
  desktop.addEventListener("change", reconcile);
  return {
    update(mode: Mode | null) {
      desired = mode;
      reconcile();
    },
    dispose() {
      disposed = true;
      stop();
      root.removeEventListener("click", click);
      desktop.removeEventListener("change", reconcile);
    },
  };
}
