(() => {
  // Optional Google measurement is retired. Keep callers compatible without
  // queuing events, loading a vendor script, or creating consent controls.
  window.gtag = function () {};
  window.AutoListerMeasurement = Object.freeze({ purchase() {} });
  try {
    window.localStorage.removeItem("autolister.measurement-consent.v1");
  } catch {}

  // Retire first-party cookies left by the former Google tags. Preserve login,
  // drafts and internal acquisition attribution storage.
  try {
    for (const entry of document.cookie.split(";")) {
      const name = entry.trim().split("=")[0];
      if (!/^(_ga(?:_.+)?|_gid|_gat(?:_.+)?|_gcl_.+)$/.test(name)) continue;
      const expired = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      document.cookie = expired;
      document.cookie = `${expired}; domain=${window.location.hostname}`;
      if (window.location.hostname.endsWith(".autolister.app"))
        document.cookie = `${expired}; domain=autolister.app`;
    }
  } catch {}
})();
