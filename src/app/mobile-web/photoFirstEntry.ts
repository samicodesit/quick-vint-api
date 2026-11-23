import "../../styles/photo-first-entry.css";
import { prepareMobileImage } from "./imagePreparation";
import { uiText } from "./ui";
import {
  addPendingPhotos,
  beginPhotoFirstSignIn,
  pendingPhotoFirst,
  removePendingPhoto,
  type PendingPhoto,
} from "./photoFirstStorage";

export async function mountPhotoFirstEntry(
  before: HTMLElement,
  signInButton: HTMLButtonElement,
  signIn: () => void,
) {
  const saved = await pendingPhotoFirst();
  const section = document.createElement("section");
  section.className = "photo-first-entry";
  section.dataset.photoFirstEntry = "";
  section.setAttribute("aria-labelledby", "photo-first-title");
  section.innerHTML = `
    <h1 id="photo-first-title"></h1>
    <ul class="photo-first-photos" aria-label="${uiText("Item photos")}"></ul>
    <div class="photo-first-picker">
      <label class="photo-first-library">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18M4 8H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1"/>
          <rect x="6" y="2" width="16" height="16" rx="2"/>
          <circle cx="11" cy="7" r="1"/>
        </svg>
        <span data-photo-first-picker-label></span>
        <input type="file" accept="image/*" multiple>
      </label>
      <label class="photo-first-camera">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
        <span data-photo-first-camera-label></span>
        <input type="file" accept="image/*" capture="environment">
      </label>
    </div>
    <p role="status" class="mobile-form-status" data-photo-first-status></p>
    <button type="button" class="mobile-primary-button" data-photo-first-generate hidden></button>
  `;
  before.before(section);
  const find = <T extends HTMLElement = HTMLElement>(selector: string) =>
    section.querySelector<T>(selector)!;
  const generate = find<HTMLButtonElement>("[data-photo-first-generate]");
  const photos = find<HTMLUListElement>(".photo-first-photos");
  const status = find("[data-photo-first-status]");
  const inputs = section.querySelectorAll<HTMLInputElement>("input");
  find("#photo-first-title").textContent = uiText("Add photos");
  find("[data-photo-first-picker-label]").textContent = uiText("Choose photos");
  find("[data-photo-first-camera-label]").textContent = uiText("Take photo");
  generate.textContent = uiText("Generate draft");
  let item = saved?.owner ? null : saved;
  let busy = false;
  let disposed = false;
  const previews = new Set<string>();

  const clearPreviews = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    previews.clear();
  };

  function render() {
    if (disposed) return;
    clearPreviews();
    photos.replaceChildren();
    for (const photo of item?.photos || []) {
      const row = document.createElement("li");
      const image = document.createElement("img");
      image.alt = uiText("Item photo");
      image.src = URL.createObjectURL(photo.blob);
      previews.add(image.src);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", uiText("Remove photo"));
      remove.textContent = "×";
      remove.disabled = busy;
      remove.addEventListener("click", () => {
        void run(async () => {
          if (item) item = await removePendingPhoto(item.id, photo.id);
        });
      });
      row.append(image, remove);
      photos.append(row);
    }
    photos.hidden = !photos.childElementCount;
    generate.hidden = photos.hidden;
    generate.disabled = busy || photos.hidden;
    signInButton.disabled = busy;
    inputs.forEach((input) => {
      input.disabled = busy;
    });
  }

  async function run(task: () => Promise<void>) {
    if (busy || disposed) return;
    busy = true;
    status.textContent = "";
    render();
    try {
      await task();
    } catch (error) {
      status.textContent =
        error instanceof Error
          ? error.message
          : uiText("Could not prepare your photos. Try again.");
    } finally {
      busy = false;
      render();
    }
  }
  for (const input of inputs) {
    input.addEventListener("change", () => {
      const chosen = Array.from(input.files || []);
      input.value = "";
      if (!chosen.length) return;
      void run(async () => {
        if (chosen.length + (item?.photos.length || 0) > 10)
          throw new Error(uiText("Choose up to 10 photos for one item."));
        const prepared: PendingPhoto[] = [];
        for (const original of chosen) {
          const result = await prepareMobileImage(original);
          URL.revokeObjectURL(result.previewUrl);
          prepared.push({ id: crypto.randomUUID(), blob: result.file });
        }
        item = await addPendingPhotos(prepared);
      });
    });
  }
  signInButton.addEventListener("click", signIn);
  generate.addEventListener("click", () => {
    void run(async () => {
      if (!item) return;
      await beginPhotoFirstSignIn(item.id);
      if (!disposed) signIn();
    });
  });
  render();
  signInButton.hidden = false;
  return () => {
    disposed = true;
    signInButton.hidden = true;
    signInButton.disabled = false;
    signInButton.removeEventListener("click", signIn);
    clearPreviews();
    section.remove();
  };
}
