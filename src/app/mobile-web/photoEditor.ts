import {
  CropperCanvas,
  CropperImage,
  CropperSelection,
  CropperHandle,
  CropperShade,
  CropperGrid,
} from "cropperjs";
import "../../styles/photo-editor.css";

/** Imported only from the photo menu. No editor, image or listener at app startup. */
export function openPhotoEditor(options: {
  photo: Blob;
  icon: (name: string) => Node;
  onSave: (photo: Blob) => Promise<void>;
  onClose: () => void;
}) {
  for (const element of [
    CropperCanvas,
    CropperImage,
    CropperSelection,
    CropperHandle,
    CropperShade,
    CropperGrid,
  ])
    if (!customElements.get(element.$name)) element.$define();
  const dialog = document.createElement("dialog");
  dialog.className = "photo-editor";
  dialog.setAttribute("aria-labelledby", "photo-editor-title");
  dialog.innerHTML = `
    <header class="photo-editor-heading"><h2 id="photo-editor-title">Edit photo</h2><button type="button" data-photo-edit="close" aria-label="Close photo editor"></button></header>
    <div class="photo-editor-stage"><cropper-canvas theme-color="#3458df"><cropper-image initial-fit="none" alt="Photo to edit"></cropper-image><cropper-shade></cropper-shade><cropper-selection movable resizable zoomable keyboard precise tabindex="0" role="group" aria-label="Crop area. Arrow keys move; plus and minus resize."><cropper-grid covered aria-hidden="true"></cropper-grid><cropper-handle action="move" plain></cropper-handle><cropper-handle action="nw-resize"></cropper-handle><cropper-handle action="ne-resize"></cropper-handle><cropper-handle action="sw-resize"></cropper-handle><cropper-handle action="se-resize"></cropper-handle></cropper-selection></cropper-canvas></div>
    <div class="photo-editor-tools"><div class="photo-editor-ratios" role="group" aria-label="Crop shape"><button type="button" data-photo-ratio="free" aria-pressed="true">Free</button><button type="button" data-photo-ratio="square" aria-pressed="false">Square</button><button type="button" data-photo-ratio="portrait" aria-pressed="false">Portrait</button></div><button type="button" data-photo-edit="rotate">Rotate</button></div>
    <label class="photo-editor-straighten">Straighten<output data-photo-angle aria-hidden="true">0°</output><input aria-label="Straighten" aria-valuetext="0 degrees" type="range" min="-15" max="15" step="1" value="0" /></label>
    <p class="photo-editor-status" role="status">Loading photo…</p>
    <footer class="photo-editor-footer"><button type="button" data-photo-edit="reset">Reset</button><button type="button" class="photo-editor-save" data-photo-edit="save" disabled>Save photo</button></footer>`;
  const control = (name: string) =>
    dialog.querySelector<HTMLButtonElement>(`[data-photo-edit="${name}"]`)!;
  const canvas = dialog.querySelector<CropperCanvas>("cropper-canvas")!;
  const image = dialog.querySelector<CropperImage>("cropper-image")!;
  const selection =
    dialog.querySelector<CropperSelection>("cropper-selection")!;
  const range = dialog.querySelector<HTMLInputElement>('input[type="range"]')!;
  const status = dialog.querySelector<HTMLElement>(".photo-editor-status")!;
  const save = control("save");
  dialog
    .querySelectorAll<CropperHandle>('cropper-handle[action$="-resize"]')
    .forEach((handle) => {
      handle.slottable = true;
      const dot = document.createElement("span");
      dot.setAttribute("aria-hidden", "true");
      handle.append(dot);
    });
  control("close").append(options.icon("remove"));
  control("rotate").prepend(options.icon("rotate"));
  const previousFocus = document.activeElement as HTMLElement | null;
  const overflow = document.body.style.overflow;
  const url = URL.createObjectURL(options.photo);
  let closed = false,
    ready = false,
    saving = false,
    programmatic = false;
  let naturalWidth = 0,
    naturalHeight = 0,
    quarterTurns = 0;
  let bounds = { x: 0, y: 0, width: 0, height: 0 };
  let ratio = NaN;
  image.rotatable = true;
  image.scalable = true;
  image.src = url;
  const dirty = () => {
    if (ready && !saving && !closed) save.disabled = false;
  };
  const message = (text: string, error = false) => {
    status.textContent = text;
    status.hidden = !text;
    status.dataset.tone = error ? "error" : "neutral";
  };
  const transform = () => {
    const w = quarterTurns % 2 ? naturalHeight : naturalWidth;
    const h = quarterTurns % 2 ? naturalWidth : naturalHeight;
    const fit = Math.min(
      (canvas.clientWidth - 48) / w,
      (canvas.clientHeight - 48) / h,
    );
    const angle = (Number(range.value) * Math.PI) / 180;
    // Straightening fills the original rectangle, avoiding blank corner wedges.
    const cover = Math.max(
      (w * Math.abs(Math.cos(angle)) + h * Math.abs(Math.sin(angle))) / w,
      (w * Math.abs(Math.sin(angle)) + h * Math.abs(Math.cos(angle))) / h,
    );
    const rotation = (quarterTurns * Math.PI) / 2 + angle;
    const scale = fit * cover;
    image.$setTransform(
      Math.cos(rotation) * scale,
      Math.sin(rotation) * scale,
      -Math.sin(rotation) * scale,
      Math.cos(rotation) * scale,
      (canvas.clientWidth - naturalWidth) / 2,
      (canvas.clientHeight - naturalHeight) / 2,
    );
    return {
      x: (canvas.clientWidth - w * fit) / 2,
      y: (canvas.clientHeight - h * fit) / 2,
      width: w * fit,
      height: h * fit,
    };
  };
  const fit = (preserve = false) => {
    if (!ready || closed || saving) return;
    const old = bounds;
    const fractions =
      preserve && old.width
        ? {
            x: (selection.x - old.x) / old.width,
            y: (selection.y - old.y) / old.height,
            width: selection.width / old.width,
            height: selection.height / old.height,
          }
        : null;
    programmatic = true;
    bounds = transform();
    selection.minInset = `${bounds.y}px ${canvas.clientWidth - bounds.x - bounds.width}px ${canvas.clientHeight - bounds.y - bounds.height}px ${bounds.x}px`;
    let width = fractions ? fractions.width * bounds.width : bounds.width;
    let height = fractions ? fractions.height * bounds.height : bounds.height;
    if (Number.isFinite(ratio)) {
      width = Math.min(width, height * ratio);
      height = width / ratio;
    }
    const x = fractions
      ? bounds.x + fractions.x * bounds.width
      : bounds.x + (bounds.width - width) / 2;
    const y = fractions
      ? bounds.y + fractions.y * bounds.height
      : bounds.y + (bounds.height - height) / 2;
    selection.$change(x, y, width, height, ratio);
    programmatic = false;
  };
  const observer = new ResizeObserver(() => fit(true));
  const close = () => {
    if (closed) return;
    closed = true;
    observer.disconnect();
    dialog.close();
    dialog.remove(); // Custom elements synchronously release their pointer/keyboard listeners.
    document.body.style.overflow = overflow;
    URL.revokeObjectURL(url);
    if (previousFocus?.isConnected)
      previousFocus.focus({ preventScroll: true });
    options.onClose();
  };
  control("close").addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      close();
  });
  selection.addEventListener("change", () => {
    if (!programmatic) dirty();
  });
  dialog
    .querySelectorAll<HTMLButtonElement>("[data-photo-ratio]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        if (!ready || saving) return;
        ratio =
          button.dataset.photoRatio === "square"
            ? 1
            : button.dataset.photoRatio === "portrait"
              ? 3 / 4
              : NaN;
        selection.aspectRatio = ratio;
        dialog
          .querySelectorAll<HTMLButtonElement>("[data-photo-ratio]")
          .forEach((item) =>
            item.setAttribute("aria-pressed", String(item === button)),
          );
        fit();
        dirty();
      }),
    );
  control("rotate").addEventListener("click", () => {
    if (!ready || saving) return;
    quarterTurns = (quarterTurns + 1) % 4;
    range.value = "0";
    range.setAttribute("aria-valuetext", "0 degrees");
    dialog.querySelector("[data-photo-angle]")!.textContent = "0°";
    fit();
    dirty();
  });
  range.addEventListener("input", () => {
    if (!ready || saving) return;
    dialog.querySelector("[data-photo-angle]")!.textContent = `${range.value}°`;
    range.setAttribute("aria-valuetext", `${range.value} degrees`);
    transform();
    dirty();
  });
  control("reset").addEventListener("click", () => {
    if (!ready || saving) return;
    quarterTurns = 0;
    range.value = "0";
    ratio = NaN;
    range.setAttribute("aria-valuetext", "0 degrees");
    selection.aspectRatio = NaN;
    dialog.querySelector("[data-photo-angle]")!.textContent = "0°";
    dialog
      .querySelectorAll<HTMLButtonElement>("[data-photo-ratio]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.photoRatio === "free"),
        ),
      );
    fit();
    save.disabled = true;
    message("");
  });
  save.addEventListener("click", async () => {
    if (!ready || saving || closed) return;
    saving = true;
    canvas.disabled = true;
    save.disabled = true;
    save.textContent = "Saving…";
    save.setAttribute("aria-busy", "true");
    message("");
    dialog
      .querySelectorAll<HTMLButtonElement>(
        ".photo-editor-tools button, [data-photo-edit=reset]",
      )
      .forEach((button) => {
        button.disabled = true;
      });
    range.disabled = true;
    try {
      const matrix = image.$getTransform();
      const scale = Math.hypot(matrix[0], matrix[1]);
      const width = Math.round(selection.width / scale);
      if (
        !Number.isFinite(width) ||
        width < 32 ||
        selection.height / scale < 32
      )
        throw new Error("Make the crop a little larger.");
      const result = await selection.$toCanvas({
        width,
        beforeDraw(context, output) {
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.fillStyle = "white";
          context.fillRect(0, 0, output.width, output.height);
        },
      });
      const blob = await new Promise<Blob>((resolve, reject) =>
        result.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("This photo could not be saved. Try again.")),
          "image/jpeg",
          0.92,
        ),
      );
      if (closed) return;
      await options.onSave(blob);
      close();
    } catch (error) {
      if (closed) return;
      message(
        error instanceof Error
          ? error.message
          : "This photo could not be saved. Try again.",
        true,
      );
    } finally {
      if (!closed) {
        saving = false;
        canvas.disabled = false;
        save.disabled = false;
        save.textContent = "Save photo";
        save.removeAttribute("aria-busy");
        range.disabled = false;
        dialog
          .querySelectorAll<HTMLButtonElement>(
            ".photo-editor-tools button, [data-photo-edit=reset]",
          )
          .forEach((button) => {
            button.disabled = false;
          });
      }
    }
  });
  document.body.append(dialog);
  dialog.showModal();
  document.body.style.overflow = "hidden";
  observer.observe(canvas);
  void image
    .$ready()
    .then((source) => {
      if (closed) return;
      naturalWidth = source.naturalWidth;
      naturalHeight = source.naturalHeight;
      ready = true;
      fit();
      save.disabled = true;
      message("");
      dialog.dataset.ready = "true";
    })
    .catch(() => {
      if (!closed)
        message("This photo could not be opened. Close and try again.", true);
    });
  return { close };
}
