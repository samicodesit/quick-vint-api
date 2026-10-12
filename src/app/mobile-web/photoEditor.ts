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
  dialog.dataset.tool = "crop";
  dialog.setAttribute("aria-labelledby", "photo-editor-title");
  dialog.innerHTML = `
    <header class="photo-editor-heading"><h2 id="photo-editor-title">Edit photo</h2><button type="button" data-photo-edit="close" aria-label="Close photo editor"></button></header>
    <div class="photo-editor-stage"><cropper-canvas theme-color="#3458df"><cropper-image initial-fit="none" alt="Photo to edit"></cropper-image><cropper-shade></cropper-shade><cropper-selection movable resizable zoomable keyboard precise tabindex="0" role="group" aria-label="Crop area. Arrow keys move; plus and minus resize."><cropper-grid covered aria-hidden="true"></cropper-grid><cropper-handle action="move" plain></cropper-handle><cropper-handle action="nw-resize"></cropper-handle><cropper-handle action="ne-resize"></cropper-handle><cropper-handle action="sw-resize"></cropper-handle><cropper-handle action="se-resize"></cropper-handle></cropper-selection></cropper-canvas></div>
    <div class="photo-editor-tools" role="group" aria-label="Photo tool"><button type="button" data-photo-tool="crop" aria-pressed="true">Crop</button><button type="button" data-photo-tool="rotate" aria-pressed="false">Rotate</button><button type="button" data-photo-tool="hide" aria-pressed="false">Hide area</button></div>
    <div class="photo-editor-options"><div data-photo-panel="crop"><select aria-label="Crop shape"><option value="free">Free crop</option><option value="square">Square crop</option><option value="portrait">Portrait crop</option></select></div><div data-photo-panel="rotate" hidden><button type="button" data-photo-edit="rotate">Rotate 90°</button><label class="photo-editor-straighten">Straighten<output data-photo-angle aria-hidden="true">0°</output><input aria-label="Straighten" aria-valuetext="0 degrees" type="range" min="-15" max="15" step="1" value="0" /></label></div><label class="photo-editor-brush" data-photo-panel="hide" hidden>Brush size<input aria-label="Brush size" type="range" min="2" max="20" step="1" value="8" /></label><button type="button" data-photo-edit="undo" aria-label="Undo hide" disabled>Undo</button></div>
    <p class="photo-editor-status" role="status">Loading photo…</p>
    <footer class="photo-editor-footer"><button type="button" data-photo-edit="reset">Reset</button><button type="button" class="photo-editor-save" data-photo-edit="save" disabled>Save photo</button></footer>`;
  const control = (name: string) =>
    dialog.querySelector<HTMLButtonElement>(`[data-photo-edit="${name}"]`)!;
  const canvas = dialog.querySelector<CropperCanvas>("cropper-canvas")!;
  const image = dialog.querySelector<CropperImage>("cropper-image")!;
  const selection =
    dialog.querySelector<CropperSelection>("cropper-selection")!;
  const range = dialog.querySelector<HTMLInputElement>(
    '[aria-label="Straighten"]',
  )!;
  const brushSize = dialog.querySelector<HTMLInputElement>(
    '[aria-label="Brush size"]',
  )!;
  const cropShape = dialog.querySelector<HTMLSelectElement>("select")!;
  const masks = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  masks.dataset.photoMasks = "";
  masks.setAttribute("aria-hidden", "true");
  image.slottable = true;
  image.append(masks);
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
  dialog
    .querySelector('[data-photo-tool="crop"]')!
    .prepend(options.icon("crop"));
  dialog
    .querySelector('[data-photo-tool="rotate"]')!
    .prepend(options.icon("rotate"));
  dialog
    .querySelector('[data-photo-tool="hide"]')!
    .prepend(options.icon("hide"));
  control("undo").prepend(options.icon("undo"));
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
  let tool = "crop",
    edited = false;
  type Stroke = {
    points: Array<[number, number]>;
    width: number;
    path: SVGPathElement;
    data: string;
  };
  const strokes: Stroke[] = [];
  let painting: { pointer: number; stroke: Stroke } | undefined;
  let paintFrame = 0;
  image.rotatable = true;
  image.scalable = true;
  image.src = url;
  const updateSave = () => {
    save.disabled = !ready || saving || (!edited && !strokes.length);
    control("undo").disabled = !strokes.length || saving;
  };
  const dirty = () => {
    if (ready && !saving && !closed) {
      edited = true;
      updateSave();
    }
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
  const finishPaint = () => {
    cancelAnimationFrame(paintFrame);
    paintFrame = 0;
    const current = painting;
    painting = undefined;
    if (current) {
      current.stroke.path.setAttribute("d", current.stroke.data);
      if (canvas.hasPointerCapture(current.pointer))
        canvas.releasePointerCapture(current.pointer);
    }
  };
  const setTool = (next: string) => {
    if (!ready || saving) return;
    finishPaint();
    tool = next;
    dialog.dataset.tool = next;
    dialog
      .querySelectorAll<HTMLButtonElement>("[data-photo-tool]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.photoTool === next),
        ),
      );
    dialog
      .querySelectorAll<HTMLElement>("[data-photo-panel]")
      .forEach((panel) => {
        panel.hidden = panel.dataset.photoPanel !== next;
      });
    selection.movable =
      selection.resizable =
      selection.zoomable =
      selection.keyboard =
        next === "crop";
    selection.tabIndex = next === "crop" ? 0 : -1;
  };
  dialog
    .querySelectorAll<HTMLButtonElement>("[data-photo-tool]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        setTool(button.dataset.photoTool!),
      ),
    );
  control("undo").addEventListener("click", () => {
    if (!ready || saving) return;
    finishPaint();
    strokes.pop()?.path.remove();
    updateSave();
  });
  const sourcePoint = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(
      selection.x,
      Math.min(event.clientX - rect.left, selection.x + selection.width),
    );
    const y = Math.max(
      selection.y,
      Math.min(event.clientY - rect.top, selection.y + selection.height),
    );
    const [a, b, c, d, e, f] = image.$getTransform();
    const determinant = a * d - b * c;
    const dx = x - e - naturalWidth / 2,
      dy = y - f - naturalHeight / 2;
    return [
      (d * dx - c * dy) / determinant + naturalWidth / 2,
      (a * dy - b * dx) / determinant + naturalHeight / 2,
    ];
  };
  const appendPoint = (event: PointerEvent) => {
    if (!painting) return;
    const point = sourcePoint(event);
    const previous = painting.stroke.points.at(-1)!;
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 0.5)
      return;
    painting.stroke.points.push(point);
    painting.stroke.data += ` L${point[0].toFixed(2)},${point[1].toFixed(2)}`;
    if (!paintFrame)
      paintFrame = requestAnimationFrame(() => {
        paintFrame = 0;
        if (painting)
          painting.stroke.path.setAttribute("d", painting.stroke.data);
      });
  };
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (tool !== "hide" || !ready || saving || closed) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (painting || event.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      if (
        x < selection.x ||
        y < selection.y ||
        x > selection.x + selection.width ||
        y > selection.y + selection.height
      )
        return;
      const point = sourcePoint(event);
      const width =
        (Math.min(naturalWidth, naturalHeight) * Number(brushSize.value)) / 100;
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      const data = `M${point[0].toFixed(2)},${point[1].toFixed(2)} L${point[0].toFixed(2)},${point[1].toFixed(2)}`;
      for (const [name, value] of Object.entries({
        d: data,
        fill: "none",
        stroke: "#000",
        "stroke-width": String(width),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }))
        path.setAttribute(name, value);
      const stroke = { points: [point], width, path, data };
      strokes.push(stroke);
      masks.append(path);
      painting = { pointer: event.pointerId, stroke };
      canvas.setPointerCapture(event.pointerId);
      updateSave();
    },
    true,
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (tool !== "hide") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (painting?.pointer !== event.pointerId) return;
      const coalesced = event.getCoalescedEvents?.();
      for (const point of coalesced?.length ? coalesced : [event])
        appendPoint(point);
    },
    true,
  );
  for (const type of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const)
    canvas.addEventListener(
      type,
      (event) => {
        if (tool !== "hide") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (painting?.pointer === event.pointerId) finishPaint();
      },
      true,
    );
  const close = () => {
    if (closed) return;
    closed = true;
    finishPaint();
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
  cropShape.addEventListener("change", () => {
    if (!ready || saving) return;
    ratio =
      cropShape.value === "square"
        ? 1
        : cropShape.value === "portrait"
          ? 3 / 4
          : NaN;
    selection.aspectRatio = ratio;
    fit();
    dirty();
  });
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
    finishPaint();
    strokes.length = 0;
    masks.replaceChildren();
    cropShape.value = "free";
    setTool("crop");
    range.setAttribute("aria-valuetext", "0 degrees");
    selection.aspectRatio = NaN;
    dialog.querySelector("[data-photo-angle]")!.textContent = "0°";
    fit();
    edited = false;
    updateSave();
    message("");
  });
  save.addEventListener("click", async () => {
    if (!ready || saving || closed) return;
    finishPaint();
    saving = true;
    canvas.disabled = true;
    save.disabled = true;
    save.textContent = "Saving…";
    save.setAttribute("aria-busy", "true");
    message("");
    dialog
      .querySelectorAll<HTMLButtonElement>(
        ".photo-editor-tools button, .photo-editor-options button, [data-photo-edit=reset]",
      )
      .forEach((button) => {
        button.disabled = true;
      });
    range.disabled = true;
    brushSize.disabled = cropShape.disabled = true;
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
      if (strokes.length) {
        const context = result.getContext("2d")!;
        const [a, b, c, d, e, f] = matrix;
        const outputScale = result.width / selection.width;
        context.scale(outputScale, outputScale);
        context.translate(
          e + naturalWidth / 2 - selection.x,
          f + naturalHeight / 2 - selection.y,
        );
        context.transform(a, b, c, d, 0, 0);
        context.translate(-naturalWidth / 2, -naturalHeight / 2);
        context.fillStyle = context.strokeStyle = "#000";
        context.lineCap = context.lineJoin = "round";
        // Source coordinates keep the painted area aligned with the preview
        // through crop, rotation, angle adjustments and viewport changes.
        for (const stroke of strokes) {
          context.lineWidth = stroke.width;
          context.beginPath();
          context.arc(
            stroke.points[0][0],
            stroke.points[0][1],
            stroke.width / 2,
            0,
            Math.PI * 2,
          );
          context.fill();
          if (stroke.points.length > 1) {
            context.beginPath();
            stroke.points.forEach(([x, y], index) =>
              index ? context.lineTo(x, y) : context.moveTo(x, y),
            );
            context.stroke();
          }
        }
      }
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
        brushSize.disabled = cropShape.disabled = false;
        dialog
          .querySelectorAll<HTMLButtonElement>(
            ".photo-editor-tools button, .photo-editor-options button, [data-photo-edit=reset]",
          )
          .forEach((button) => {
            button.disabled = false;
          });
        updateSave();
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
      masks.setAttribute("viewBox", `0 0 ${naturalWidth} ${naturalHeight}`);
      ready = true;
      fit();
      edited = false;
      updateSave();
      message("");
      dialog.dataset.ready = "true";
    })
    .catch(() => {
      if (!closed)
        message("This photo could not be opened. Close and try again.", true);
    });
  return { close };
}
