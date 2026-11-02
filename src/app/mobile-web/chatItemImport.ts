import { uiText } from "./ui";
import { LocalDraftStore } from "./localDraftStore";
import { validDraftId, type DraftSettings } from "./draftContracts";
import { prepareMobileImage } from "./imagePreparation";
import { appendDescriptionFooter } from "../../../utils/descriptionFooter";
import { getBrowserSession } from "./auth";

export const PRIVATE_PLUGIN_ORIGIN =
  "https://autolister-one-item-prototype.samicodesit.chatgpt.site";
export interface ChatItem {
  id: string;
  title: string;
  description: string;
  photos: Blob[];
}

async function assertImportAccount(owner: string, active: () => boolean) {
  if (!active()) throw new Error(uiText("Draft import cancelled."));
  const session = await getBrowserSession();
  if (!active()) throw new Error(uiText("Draft import cancelled."));
  if (!owner || session?.user.id !== owner)
    throw new Error(
      uiText(
        "Your account changed. Reload AutoLister and open the draft again.",
      ),
    );
}

export async function saveChatItem(
  owner: string,
  value: ChatItem,
  settings: DraftSettings,
  active: () => boolean = () => true,
) {
  if (
    !validDraftId(value?.id) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 150 ||
    typeof value.description !== "string" ||
    !value.description.trim() ||
    value.description.length > 4000 ||
    !Array.isArray(value.photos) ||
    value.photos.length < 1 ||
    value.photos.length > 4 ||
    value.photos.some(
      (p) =>
        !(p instanceof Blob) ||
        !p.size ||
        p.size > 8 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(p.type),
    )
  )
    throw new Error(uiText("Choose up to four photos of one item."));
  const id = value.id,
    store = new LocalDraftStore(owner);
  try {
    const persist = async () => {
      await assertImportAccount(owner, active);
      const existing = await store
        .action("detail", { draftId: id })
        .catch((e) => {
          if (e.status !== 404) throw e;
          return null;
        });
      if (
        existing &&
        (existing.title ||
          existing.description ||
          localStorage.getItem("autolister:imported:" + owner + ":" + id))
      )
        return;
      const prepared: File[] = [];
      for (const blob of value.photos) {
        await assertImportAccount(owner, active);
        const image = await prepareMobileImage(
          new File([blob], "item-photo", { type: blob.type }),
        );
        URL.revokeObjectURL(image.previewUrl);
        prepared.push(image.file);
      }
      await assertImportAccount(owner, active);
      const draft = await store.action("create", { id, settings });
      if (draft.title || draft.description) return;
      for (const [i, file] of prepared.entries()) {
        await assertImportAccount(owner, active);
        const photoId =
          id.slice(0, -2) +
          (parseInt(id.slice(-2), 16) ^ i).toString(16).padStart(2, "0");
        if (!draft.photos.some((p) => p.id === photoId))
          await store.upload(file, { photoId, importId: id, draftId: id });
      }
      const current = await store.action("detail", { draftId: id });
      await assertImportAccount(owner, active);
      if (!current.title && !current.description)
        await store.action("save", {
          draftId: id,
          expectedVersion: current.version,
          title: value.title,
          description: appendDescriptionFooter(
            value.description,
            settings.includeSellerNote
              ? settings.descriptionFooterText || ""
              : "",
          ),
        });
      await assertImportAccount(owner, active);
      localStorage.setItem("autolister:imported:" + owner + ":" + id, "1");
    };
    if (navigator.locks)
      await navigator.locks.request("autolister-import:" + id, persist);
    else await persist();
  } finally {
    store.dispose();
  }
}

// Only the owner-private plugin window that opened this tab can send an item.
export function listenForChatItem(
  owner: string,
  defaults: () => Promise<DraftSettings>,
  onOpen: (id: string) => Promise<void>,
  onError: (message: string) => void,
) {
  if (location.hash !== "#import-chatgpt-item" || !window.opener)
    return () => {};
  const sender: Window = window.opener,
    nonce = crypto.randomUUID();
  const senderOrigin = (() => {
    try {
      return sender.location.origin === location.origin
        ? location.origin
        : PRIVATE_PLUGIN_ORIGIN;
    } catch {
      return PRIVATE_PLUGIN_ORIGIN;
    }
  })();
  let importing = false,
    disposed = false;
  const receive = async (e: MessageEvent) => {
    if (
      disposed ||
      importing ||
      e.source !== sender ||
      e.origin !== senderOrigin ||
      e.data?.type !== "autolister.item" ||
      e.data.nonce !== nonce
    )
      return;
    importing = true;
    try {
      await assertImportAccount(owner, () => !disposed);
      if (e.origin === location.origin && e.data.item?.owner !== owner)
        throw new Error(uiText("This draft belongs to another account."));
      const settings = await defaults();
      if (disposed) return;
      await saveChatItem(owner, e.data.item, settings, () => !disposed);
      if (disposed) return;
      await assertImportAccount(owner, () => !disposed);
      history.replaceState(
        history.state,
        "",
        location.pathname + location.search,
      );
      await onOpen(e.data.item.id);
      await assertImportAccount(owner, () => !disposed);
      sessionStorage.removeItem("autolister:chat-import-start");
      sender.postMessage({ type: "autolister.opened", nonce }, e.origin);
      window.removeEventListener("message", receive);
    } catch (error) {
      if (disposed) return;
      sender.postMessage({ type: "autolister.import-error", nonce }, e.origin);
      onError(
        error instanceof Error
          ? error.message
          : uiText("Could not open this item."),
      );
      importing = false;
    }
  };
  window.addEventListener("message", receive);
  sender.postMessage({ type: "autolister.ready", nonce }, senderOrigin);
  return () => {
    disposed = true;
    window.removeEventListener("message", receive);
  };
}
