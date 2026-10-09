(() => {
  try {
    const url = new URL(window.location.href);
    const defaults = {
      utm_source: "x",
      utm_medium: "organic_social",
      utm_campaign: "posts",
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (!url.searchParams.get(key)) url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // Tagging is best effort and must never prevent the landing page loading.
  }
})();
