/* Static uploader UI only. Never observes or translates user content. */
(function (root) {
  "use strict";
  const catalogs = root.AutoListerWebUiCatalogs;
  const sharedSources = new Set(root.AutoListerWebUiSharedSources || []);
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .split(/[-_]/)[0]
      .replace(/^cs$/, "cz");
  const locale =
    [...(root.navigator?.languages || []), root.navigator?.language]
      .map(normalize)
      .find((code) => catalogs[code]) || "en";
  const text = (source) =>
    locale === "en" && !sharedSources.has(source)
      ? source
      : (catalogs[locale][source] ?? source);
  const format = (source, values) =>
    text(source).replace(/\{(\d+)\}/g, (_, index) =>
      String(values[Number(index)] ?? ""),
    );
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const translatedValues = new Set(Object.values(catalogs[locale]));
  const templates = [...translatedValues]
    .filter(
      (value) =>
        /\{\d+\}/.test(value) &&
        value.replace(/\{\d+\}/g, "").replace(/[^\p{L}]/gu, "").length >= 3,
    )
    .map(
      (value) =>
        new RegExp(
          "^" +
            value
              .split(/\{\d+\}/)
              .map(escape)
              .join("[\\s\\S]*") +
            "$",
        ),
    );
  const error = (source) => {
    if (
      !source ||
      locale === "en" ||
      translatedValues.has(source) ||
      templates.some((pattern) => pattern.test(source))
    )
      return source;
    return catalogs.en[source]
      ? text(source)
      : text("Something went wrong. Please try again.");
  };
  function initialize(container = root.document) {
    root.document.documentElement.lang = locale === "cz" ? "cs" : locale;
    const walker = root.document.createTreeWalker(container, 4);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("script,style,[data-ui-content]"))
        continue;
      const value = node.textContent || "",
        key = value.trim();
      if (catalogs.en[key]) node.textContent = value.replace(key, text(key));
    }
    for (const el of container.querySelectorAll("*")) {
      for (const attr of ["aria-label", "title", "alt", "placeholder"]) {
        const value = el.getAttribute(attr);
        if (value && catalogs.en[value]) el.setAttribute(attr, text(value));
      }
    }
  }
  root.AutoListerWebUi = { text, format, error, initialize, locale };
  initialize();
})(globalThis);
