import { DRAFT_LIMITS, type DraftSettings } from "./draftContracts";
import { LocalDraftStore } from "./localDraftStore";
import {
  photoFirstIntentInTab,
  photoFirstPendingHint,
  setPhotoFirstPendingHint,
} from "./photoFirstFlags";
import { uiText } from "./ui";

const PENDING_DB = "autolister:photo-first:v1";
const GOOGLE_TICKET = "autolister:photo-first:google:v1";
const LIFETIME = 24 * 60 * 60 * 1000;
export type PendingPhoto = { id: string; blob: Blob };
type PendingItem = {
  id: string;
  expiresAt: number;
  photos: PendingPhoto[];
  armed?: boolean;
  owner?: string;
  auth?: { kind: "google"; ticket: string } | { kind: "email"; email: string };
};

async function updatePending(
  change: (current: PendingItem | null) => PendingItem | null = (current) =>
    current,
): Promise<PendingItem | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PENDING_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pending");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("pending", "readwrite");
      const store = transaction.objectStore("pending");
      const read = store.get("item");
      let next: PendingItem | null = null;
      let error: unknown;
      read.onsuccess = () => {
        const saved = read.result as PendingItem | undefined;
        try {
          const current = saved && saved.expiresAt > Date.now() ? saved : null;
          next = change(current);
          if (next && next !== saved) store.put(next, "item");
          else if (!next && saved) store.delete("item");
        } catch (cause) {
          error = cause;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(error ?? transaction.error);
    });
  } finally {
    db.close();
  }
}

export const pendingPhotoFirst = () => updatePending();

export async function addPendingPhotos(photos: PendingPhoto[]) {
  return (await updatePending((current) => {
    const item = current?.owner ? null : current;
    const combined = [...(item?.photos || []), ...photos];
    if (combined.length > DRAFT_LIMITS.photos)
      throw new Error(uiText("Choose up to 10 photos for one item."));
    return {
      id: item?.id || crypto.randomUUID(),
      expiresAt: Date.now() + LIFETIME,
      photos: combined,
    };
  }))!;
}

export async function removePendingPhoto(itemId: string, photoId: string) {
  return updatePending((item) =>
    item?.id === itemId && !item.owner
      ? {
          id: item.id,
          expiresAt: item.expiresAt,
          photos: item.photos.filter((photo) => photo.id !== photoId),
        }
      : item,
  );
}

export async function beginPhotoFirstSignIn(id: string) {
  const saved = await updatePending((item) =>
    item?.id === id && item.photos.length && !item.owner
      ? { ...item, armed: true, auth: undefined }
      : item,
  );
  if (!saved?.armed || saved.id !== id || saved.owner)
    throw new Error(uiText("Add a photo before generating."));
  setPhotoFirstPendingHint(id);
}

export async function setPhotoFirstAuth(kind: "google" | "email", email = "") {
  const id = photoFirstPendingHint();
  if (!id || !photoFirstIntentInTab()) return;
  const ticket = kind === "google" ? crypto.randomUUID() : undefined;
  const auth = ticket
    ? { kind: "google" as const, ticket }
    : { kind: "email" as const, email: email.trim().toLowerCase() };
  const saved = await updatePending((item) =>
    item?.id === id && item.armed && !item.owner ? { ...item, auth } : item,
  );
  if (ticket && saved?.auth === auth)
    sessionStorage.setItem(GOOGLE_TICKET, ticket);
  else if (kind === "email") sessionStorage.removeItem(GOOGLE_TICKET);
}

export async function claimPhotoFirstSignIn(
  user: { id: string; email?: string },
  flow: "callback" | "email",
) {
  const id = photoFirstPendingHint();
  if (!id) return false;
  const ticket =
    flow === "callback" ? sessionStorage.getItem(GOOGLE_TICKET) : null;
  let claimed = false;
  await updatePending((item) => {
    if (!item || item.id !== id || !item.armed || item.owner || !item.auth)
      return item;
    const matches =
      item.auth.kind === "google"
        ? ticket === item.auth.ticket
        : item.auth.email === user.email?.trim().toLowerCase();
    if (!matches) return item;
    claimed = true;
    return { ...item, owner: user.id, auth: undefined };
  });
  if (ticket) sessionStorage.removeItem(GOOGLE_TICKET);
  return claimed;
}

export async function importPhotoFirstDraft(
  owner: string,
  settings: DraftSettings,
) {
  const id = photoFirstPendingHint();
  if (!id) return null;
  const item = await pendingPhotoFirst();
  if (item?.id !== id || item.owner !== owner || !item.photos.length)
    return null;

  const store = new LocalDraftStore(owner);
  try {
    await store.action("create", { id, settings });
    for (const photo of item.photos)
      await store.upload(photo.blob, {
        photoId: photo.id,
        importId: id,
        draftId: id,
      });
  } finally {
    store.dispose();
  }

  let autoGenerate = false;
  await updatePending((current) => {
    if (current?.id !== id || current.owner !== owner || !current.photos.length)
      return current;
    autoGenerate = true;
    return { ...current, photos: [] };
  });
  try {
    if (photoFirstPendingHint() === id) setPhotoFirstPendingHint(null);
  } catch {}
  return { draftId: id, autoGenerate };
}
