/** Select the supported desktop route before paint; retain web access on failure. */
export function bootstrapHomepageEntryRoute(
  w: Window & typeof globalThis,
): void {
  try {
    const desktop = w.matchMedia("(min-width: 1024px)");
    const ua = w.navigator.userAgent;
    const compatible =
      /Chrome\//.test(ua) && !/Android|Mobile|iPad|iPhone|Edg\/|OPR\//.test(ua);
    const update = () => {
      w.document.documentElement.dataset.homeEntryRoute =
        compatible && desktop.matches ? "extension" : "web";
    };
    update();
    desktop.addEventListener("change", update);
  } catch {
    // The server-rendered web action remains usable without browser detection.
  }
}
