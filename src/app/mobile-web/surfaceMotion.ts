const backdrops = new WeakMap<HTMLElement, HTMLElement>();

export function bindSurfaceBackdrop(panel: HTMLElement, backdrop: HTMLElement) {
  backdrops.set(panel, backdrop);
  return () => {
    panel.getAnimations().forEach((animation) => animation.cancel());
    backdrop.getAnimations().forEach((animation) => animation.cancel());
    backdrops.delete(panel);
  };
}

/** Panel and backdrop finish together. Interrupted motion continues from its current frame. */
export function animateSurface(
  panel: HTMLElement,
  direction: "enter" | "exit",
) {
  const backdrop = backdrops.get(panel);
  const interrupted = Boolean(panel.getAnimations?.().length);
  const current = interrupted ? getComputedStyle(panel) : null;
  const from = current
    ? {
        opacity: current.opacity,
        scale: current.scale,
        translate: current.translate,
      }
    : null;
  const backdropOpacity =
    backdrop && interrupted ? getComputedStyle(backdrop).opacity : null;
  panel.getAnimations?.().forEach((animation) => animation.cancel());
  backdrop?.getAnimations().forEach((animation) => animation.cancel());
  if (
    typeof panel.animate !== "function" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  )
    return null;
  const entering = direction === "enter";
  const options: KeyframeAnimationOptions = {
    duration: entering ? 160 : 100,
    easing: "cubic-bezier(.2,0,0,1)",
    fill: "both",
  };
  const animation = panel.animate(
    entering
      ? [
          from || { opacity: 0, scale: "0.985", translate: "0 4px" },
          { opacity: 1, scale: "1", translate: "0 0" },
        ]
      : [
          from || { opacity: 1, scale: "1", translate: "0 0" },
          { opacity: 0, scale: "0.99", translate: "0 2px" },
        ],
    options,
  );
  const backdropAnimation = backdrop?.animate(
    [
      { opacity: backdropOpacity ?? (entering ? 0 : 1) },
      { opacity: entering ? 1 : 0 },
    ],
    options,
  );
  // Both animations use the same clock, including after a rapid reversal.
  const startTime = document.timeline.currentTime;
  if (backdropAnimation && typeof startTime === "number") {
    animation.startTime = startTime;
    backdropAnimation.startTime = startTime;
  }
  return Promise.all([
    animation.finished.catch(() => undefined),
    backdropAnimation?.finished.catch(() => undefined),
  ]).then(() => {
    animation.cancel();
    backdropAnimation?.cancel();
  });
}
