import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { callOps } from "../../gateway";
import { captureQueue, type PendingPhoto } from "./queue";
import { digestFile, transferPhoto, type CaptureTransport } from "./transfer";

type Session = { sessionId: string; itemId: string };
type PhotoRow = {
  id: string;
  state: string;
  original_name: string;
  thumbnailUrl?: string;
};

function usePwa() {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/ops-sw.js", { scope: "/app/" })
        .catch(() => undefined);
  }, []);
}

async function pairCall<T>(input: unknown): Promise<T> {
  const response = await fetch("/api/ops-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as {
    ok: boolean;
    data: T;
    error?: { message: string };
  };
  if (!body.ok) throw new Error(body.error?.message ?? "Phone upload failed");
  return body.data;
}

function PhotoCollector({
  session,
  workspaceId,
  transport,
  loadSaved,
  onReorder,
  onRetire,
}: {
  session: Session;
  workspaceId: string;
  transport: CaptureTransport;
  loadSaved?: () => Promise<PhotoRow[]>;
  onReorder?: (ids: string[]) => Promise<unknown>;
  onRetire?: (id: string) => Promise<unknown>;
}) {
  const [queue, setQueue] = useState<PendingPhoto[]>([]);
  const [saved, setSaved] = useState<PhotoRow[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  usePwa();
  const refresh = useCallback(async () => {
    setQueue(await captureQueue.forSession(session.sessionId));
    if (loadSaved) setSaved(await loadSaved());
  }, [session.sessionId, loadSaved]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const resume = () => {
      void captureQueue
        .forSession(session.sessionId)
        .then((pending) =>
          Promise.all(
            pending.map((photo) => transferPhoto(photo, transport, setMessage)),
          ),
        )
        .then(refresh);
    };
    window.addEventListener("online", resume);
    return () => window.removeEventListener("online", resume);
  }, [session.sessionId, transport, refresh]);

  async function addFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      const existing = await captureQueue.forSession(session.sessionId);
      if (existing.length + saved.length + files.length > 20)
        throw new Error("Each item can have up to 20 photos.");
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error(`${file.name} exceeds 20 MiB.`);
        const photo: PendingPhoto = {
          id: crypto.randomUUID(),
          workspaceId,
          sessionId: session.sessionId,
          itemId: session.itemId,
          file,
          sha256: await digestFile(file),
          manifestKey: crypto.randomUUID(),
          state: "local",
        };
        await captureQueue.put(photo);
        await refresh();
        await transferPhoto(photo, transport, setMessage);
        await refresh();
      }
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not queue photos",
      );
    } finally {
      setBusy(false);
    }
  }
  async function retry(photo: PendingPhoto) {
    setBusy(true);
    await transferPhoto(photo, transport, setMessage);
    await refresh();
    setBusy(false);
  }
  async function moveSaved(index: number, direction: -1 | 1) {
    if (!onReorder) return;
    const available = saved.filter((photo) => photo.state === "available");
    const target = index + direction;
    if (target < 0 || target >= available.length) return;
    const ids = available.map((photo) => photo.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await onReorder(ids);
      await refresh();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not reorder photos",
      );
    }
  }
  async function retake(id: string) {
    if (!onRetire) return;
    try {
      await onRetire(id);
      await refresh();
      setMessage("Old photo retired. Add its replacement now.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not retire photo",
      );
    }
  }
  return (
    <section aria-label="Capture photos">
      <h2>Photos for this item</h2>
      <p>
        Item {session.itemId}. Photos stay with this item if you move to another
        piece.
      </p>
      <label>
        Add photos{" "}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          capture="environment"
          multiple
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            event.target.value = "";
            void addFiles(selected);
          }}
        />
      </label>
      <p role="status">{message}</p>
      {queue.length > 0 && (
        <>
          <h3>On this device, not yet server-saved</h3>
          <ul>
            {queue.map((photo) => (
              <li key={photo.id}>
                {photo.file.name}:{" "}
                {photo.error ??
                  (navigator.onLine
                    ? "Pending verification"
                    : "Waiting for connection")}{" "}
                <button disabled={busy} onClick={() => void retry(photo)}>
                  Retry
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {saved.length > 0 && (
        <>
          <h3>Server photos</h3>
          <ul className="ops-media-grid">
            {saved.map((photo) => (
              <li key={photo.id}>
                {photo.thumbnailUrl && (
                  <img src={photo.thumbnailUrl} alt={photo.original_name} />
                )}
                <span>
                  {photo.original_name}: {photo.state}
                </span>
                {photo.state === "available" && onReorder && (
                  <div>
                    <button
                      onClick={() =>
                        void moveSaved(
                          saved
                            .filter((entry) => entry.state === "available")
                            .findIndex((entry) => entry.id === photo.id),
                          -1,
                        )
                      }
                    >
                      Earlier
                    </button>
                    <button
                      onClick={() =>
                        void moveSaved(
                          saved
                            .filter((entry) => entry.state === "available")
                            .findIndex((entry) => entry.id === photo.id),
                          1,
                        )
                      }
                    >
                      Later
                    </button>
                  </div>
                )}
                {photo.state === "available" && onRetire && (
                  <button onClick={() => void retake(photo.id)}>Retake</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function CaptureDesk({
  client,
  workspaceId,
}: {
  client: SupabaseClient;
  workspaceId: string;
}) {
  const itemId =
    new URLSearchParams(window.location.search).get("itemId") ?? "";
  const storageKey = `ops-capture:${workspaceId}:${itemId}`;
  const [session, setSession] = useState<Session | null>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(storageKey) ?? "null",
      ) as Session | null;
    } catch {
      return null;
    }
  });
  const [message, setMessage] = useState("");
  const [qr, setQr] = useState("");
  const [finished, setFinished] = useState(false);
  const token = useCallback(
    async () =>
      (await client.auth.getSession()).data.session?.access_token ?? "",
    [client],
  );
  const request = useCallback(
    async <T,>(
      kind: "query" | "command",
      name: string,
      payload: unknown,
      key: string = crypto.randomUUID(),
    ) =>
      callOps<T>(fetch, await token(), {
        kind,
        name,
        payload,
        workspaceId,
        ...(kind === "command"
          ? { meta: { idempotencyKey: key, expectedVersion: null } }
          : {}),
      }),
    [token, workspaceId],
  );
  const transport = useMemo<CaptureTransport>(
    () => ({
      async manifest(photo) {
        const result = await request<{ uploads: { uploadId: string }[] }>(
          "command",
          "capture.manifest",
          {
            sessionId: photo.sessionId,
            files: [
              {
                clientFileId: photo.id,
                name: photo.file.name,
                mime: photo.file.type || "image/heic",
                bytes: photo.file.size,
                sha256: photo.sha256,
              },
            ],
          },
          photo.manifestKey,
        );
        return result.uploads[0];
      },
      sign: (uploadId) => request("query", "media.sign", { uploadId }),
      complete: (uploadId, checksum) =>
        request("command", "media.complete", { uploadId, checksum }, uploadId),
    }),
    [request],
  );
  const loadSaved = useCallback(
    () => request<PhotoRow[]>("query", "media.list", { itemId }),
    [request, itemId],
  );
  usePwa();

  async function start() {
    try {
      const key =
        localStorage.getItem(`${storageKey}:create-key`) ?? crypto.randomUUID();
      localStorage.setItem(`${storageKey}:create-key`, key);
      const created = await request<Session>(
        "command",
        "capture.create",
        { itemId },
        key,
      );
      localStorage.setItem(storageKey, JSON.stringify(created));
      setSession(created);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not start capture",
      );
    }
  }
  async function pair() {
    if (!session) return;
    try {
      const paired = await request<{ secret: string }>(
        "command",
        "capture.pair",
        { sessionId: session.sessionId },
      );
      const url = `${location.origin}/app/phone?token=${encodeURIComponent(paired.secret)}`;
      setQr(await QRCode.toDataURL(url));
      setMessage(
        "This QR code opens a short-lived upload-only phone session. It expires in five minutes and can be used once.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not pair phone",
      );
    }
  }
  async function finish() {
    if (!session) return;
    const pending = await captureQueue.forSession(session.sessionId);
    if (pending.some((photo) => !photo.uploadId)) {
      setMessage("Queue offline photos before finishing this session.");
      return;
    }
    try {
      const key =
        localStorage.getItem(`${storageKey}:finish-key`) ?? crypto.randomUUID();
      localStorage.setItem(`${storageKey}:finish-key`, key);
      await request(
        "command",
        "capture.finish",
        { sessionId: session.sessionId },
        key,
      );
      setFinished(true);
      setMessage(
        pending.length
          ? "Capture finished. Earlier uploads will keep their original item."
          : "Capture finished.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not finish capture",
      );
    }
  }
  if (!itemId) return <p>Choose an inventory item before taking photos.</p>;
  return (
    <div className="ops-capture">
      <p>
        <a href={`/app/inventory/item?itemId=${encodeURIComponent(itemId)}`}>
          Back to item
        </a>
      </p>
      <p role="status">{message}</p>
      {!session ? (
        <button onClick={() => void start()}>
          Start capture for this item
        </button>
      ) : (
        <>
          <PhotoCollector
            session={session}
            workspaceId={workspaceId}
            transport={transport}
            loadSaved={loadSaved}
            onReorder={(orderedIds) =>
              request("command", "media.reorder", { itemId, orderedIds })
            }
            onRetire={(uploadId) =>
              request("command", "media.retire", { uploadId })
            }
          />
          {!finished && (
            <>
              <button onClick={() => void pair()}>Pair phone</button>{" "}
              <button onClick={() => void finish()}>Finish capture</button>
            </>
          )}
          {qr && (
            <div>
              <img
                src={qr}
                alt="Phone pairing QR code"
                width="220"
                height="220"
              />
              <p>Scan on your phone. The code expires after five minutes.</p>
            </div>
          )}
          <p>
            <a href="/app/inventory/new">Next item</a>
          </p>
        </>
      )}
    </div>
  );
}

export function PhoneCapture() {
  const [paired, setPaired] = useState<{
    grant: string;
    workspaceId: string;
    sessionId: string;
    itemId: string;
  } | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("ops-phone-grant") ?? "null");
    } catch {
      return null;
    }
  });
  const [message, setMessage] = useState("");
  const token = new URLSearchParams(window.location.search).get("token");
  usePwa();
  useEffect(() => {
    if (!token || paired) return;
    void pairCall<typeof paired>({ action: "redeem", token })
      .then((result) => {
        if (!result) return;
        sessionStorage.setItem("ops-phone-grant", JSON.stringify(result));
        history.replaceState(null, "", "/app/phone");
        setPaired(result);
      })
      .catch((cause) =>
        setMessage(cause instanceof Error ? cause.message : "Pairing failed"),
      );
  }, [token, paired]);
  const transport = useMemo<CaptureTransport | null>(
    () =>
      paired && {
        async manifest(photo) {
          const result = await pairCall<{ uploads: { uploadId: string }[] }>({
            action: "manifest",
            grant: paired.grant,
            input: {
              sessionId: paired.sessionId,
              files: [
                {
                  clientFileId: photo.id,
                  name: photo.file.name,
                  mime: photo.file.type || "image/heic",
                  bytes: photo.file.size,
                  sha256: photo.sha256,
                },
              ],
            },
            idempotencyKey: photo.manifestKey,
          });
          return result.uploads[0];
        },
        sign: (uploadId) =>
          pairCall({ action: "sign", grant: paired.grant, uploadId }),
        complete: (uploadId, checksum) =>
          pairCall({
            action: "complete",
            grant: paired.grant,
            input: { uploadId, checksum },
          }),
      },
    [paired],
  );
  return (
    <main className="ops-phone">
      <h1>AutoLister phone capture</h1>
      <p role="status">{message}</p>
      {paired && transport ? (
        <PhotoCollector
          session={paired}
          workspaceId={paired.workspaceId}
          transport={transport}
        />
      ) : (
        <p>Scan a fresh pairing code from the item capture screen.</p>
      )}
    </main>
  );
}
