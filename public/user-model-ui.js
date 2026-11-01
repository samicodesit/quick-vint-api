/* Shared account-model view. Keep byte-identical with extension lib/user-model-ui.js. */
(function (root) {
  "use strict";
  const t = (key) => root.AutoListerModelCopy.text(key);
  const mirrorIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V9a7 7 0 0 1 14 0v12H5Z"/><path d="M8 18c0-4 8-4 8 0M10 9a2 2 0 1 0 3 2"/><rect x="12" y="7" width="4" height="6" rx="1"/></svg>';
  function asset(name) {
    const path = "images/user-model-" + name + ".webp";
    return root.chrome?.runtime?.getURL
      ? root.chrome.runtime.getURL(path)
      : "/" + path;
  }
  function examples() {
    return (
      '<figure class="um-examples"><div class="um-example-pair"><img src="' +
      asset("female") +
      '" width="280" height="420" alt="' +
      t("Example full-length model") +
      '"/><img src="' +
      asset("male") +
      '" width="280" height="420" alt="' +
      t("Example full-length model") +
      '"/></div><figcaption>' +
      t("Example models") +
      "</figcaption></figure>"
    );
  }
  function entry(button, state, attention = false) {
    button.lang = root.AutoListerModelCopy.getLocale();
    const hasModel = !!state?.model;
    button.classList.toggle("um-discover", attention && !hasModel);
    button.setAttribute(
      "aria-label",
      t(hasModel ? "Your model" : "Create your model"),
    );
    button.innerHTML =
      '<img class="um-entry-photo" src="' +
      asset("female") +
      '" width="44" height="66" alt=""/><span class="um-entry-copy"><strong>' +
      t(hasModel ? "Your model" : "Create your model") +
      "</strong><span>" +
      t(hasModel ? "View and manage" : "Choose your look, save it once") +
      "</span></span>" +
      (attention && !hasModel
        ? '<span class="um-entry-new">' + t("New") + "</span>"
        : "") +
      '<svg class="um-entry-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
  }
  const choices = {
    gender: [
      ["male", "Male"],
      ["female", "Female"],
    ],
    hair: [
      ["black", "Black"],
      ["blonde", "Blonde"],
      ["brown", "Brown"],
      ["red", "Red"],
    ],
    build: [
      ["slim", "Slim"],
      ["average", "Average"],
      ["plus_size", "Plus size"],
    ],
    skinTone: [
      ["tone_1", "Very fair"],
      ["tone_2", "Fair"],
      ["tone_3", "Medium tan"],
      ["tone_4", "Medium brown"],
      ["tone_5", "Dark brown"],
      ["tone_6", "Deep brown"],
    ],
  };
  const skins = [
    "#f3d9ca",
    "#e6bc9d",
    "#ce986f",
    "#a86f49",
    "#77482f",
    "#482d24",
  ];
  function validPreferences(p) {
    return (
      p &&
      Object.entries(choices).every(([k, values]) =>
        values.some((v) => v[0] === p[k]),
      ) &&
      Number.isInteger(p.heightCm) &&
      p.heightCm >= 130 &&
      p.heightCm <= 210 &&
      Object.keys(p).every((k) => k === "heightCm" || k in choices)
    );
  }
  function icon(group, value) {
    if (group === "skinTone")
      return (
        '<span class="um-swatch" style="background:' +
        skins[Number(value.slice(-1)) - 1] +
        '"></span>'
      );
    if (group === "hair") {
      const color = {
        black: "#292522",
        blonde: "#dcb966",
        brown: "#70482f",
        red: "#b45d36",
      }[value];
      return portrait(true, color);
    }
    if (group === "gender") return portrait(value === "female", "#45403e");
    // The same adult silhouette and stance, with different torso/hip contours.
    const outline = {
      slim: "M27 23 22 25Q19 26 18 31L14 48Q13 51 16 52 18 53 19 49L23 35 24 44 22 53 24 78Q24 81 28 80L30 57Q32 54 34 57L36 80Q40 81 40 78L42 53 40 44 41 35 45 49Q46 53 48 52 51 51 50 48L46 31Q45 26 42 25L37 23",
      average:
        "M27 23 20 25Q17 26 16 31L11 48Q10 52 13 53 16 54 17 50L21 36 22 44Q19 49 20 55L23 78Q24 82 28 80L30 58Q32 55 34 58L36 80Q40 82 41 78L44 55Q45 49 42 44L43 36 47 50Q48 54 51 53 54 52 53 48L48 31Q47 26 44 25L37 23",
      plus_size:
        "M27 23 18 25Q14 26 12 32L7 48Q5 53 9 54 13 56 15 50L18 39Q17 45 16 50 15 55 18 61L22 78Q23 82 28 80L30 61Q32 58 34 61L36 80Q41 82 42 78L46 61Q49 55 48 50L46 39 49 50Q51 56 55 54 59 53 57 48L52 32Q50 26 46 25L37 23",
    }[value];
    return (
      '<svg viewBox="0 0 64 88" fill="none" stroke="#57504d" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M27 18v5q5 5 10 0v-5" fill="#d8c5b7"/><ellipse cx="32" cy="12" rx="7" ry="9" fill="#d8c5b7"/><path d="' +
      outline +
      '" fill="#e6e5ee"/><path d="M27 23q5 6 10 0M24 78l-3 4q0 2 8 1l1-4M40 78l3 4q0 2-8 1l-1-4"/></svg>'
    );
  }
  function portrait(longHair, color) {
    return (
      '<svg viewBox="0 0 64 64" fill="none" stroke="#57504d" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
      (longHair
        ? '<path d="M16 41V22C16 1 48 1 48 22v23L40 50H24Z" fill="' +
          color +
          '" stroke="none"/>'
        : "") +
      '<path d="M26 39v7l-12 4q-5 3-5 12h46q0-9-5-12l-12-4v-7" fill="#d8c5b7"/><path d="m24 47 8 5 8-5 10 3q5 3 5 12H9q0-9 5-12Z" fill="#e6e5ee"/><path d="M20 22q0-14 12-14t12 14v8q-1 12-12 14-11-2-12-14Z" fill="#d8c5b7"/><path d="' +
      (longHair
        ? "M19 28V21Q18 5 32 5t13 17v9l-4-10q-6-2-10-8-3 10-12 15Z"
        : "M19 25V17Q20 4 33 5q14 0 12 16l-2 6-3-11q-8 4-17 0l-2 11Z") +
      '" fill="' +
      color +
      '" stroke="none"/><path d="M26 29h1m10 0h1M29 36q3 2 6 0"/></svg>'
    );
  }
  function mount(container, options) {
    let disposed = false,
      timer,
      busy = false,
      state = null,
      requestSerial = 0;
    let preferences = { heightCm: 170, ...options.initialPreferences };
    container.classList.add("um-view");
    container.lang = root.AutoListerModelCopy.getLocale();
    function button(text, action, primary = false) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = t(text);
      el.className = primary ? "um-primary" : "um-secondary";
      el.addEventListener("click", action);
      return el;
    }
    function header(title = "Your model") {
      container.replaceChildren();
      const h = document.createElement("header");
      h.className = "um-header";
      const heading = document.createElement("h2");
      heading.textContent = t(title);
      h.append(heading);
      if (options.onClose) {
        const b = button(options.backLabel || "Back", options.onClose);
        b.classList.add("um-back");
        b.setAttribute(
          "aria-label",
          t(
            options.backLabel === "Settings"
              ? "Back to settings"
              : options.backLabel || "Back",
          ),
        );
        h.prepend(b);
      }
      container.append(h);
    }
    function message(text, role = "status") {
      const el = document.createElement("p");
      el.className = "um-message";
      el.setAttribute("role", role);
      el.textContent = t(text);
      container.append(el);
      return el;
    }
    function error(error) {
      if (disposed) return;
      container.querySelector(".um-error")?.remove();
      const p = message(root.AutoListerModelCopy.error(error), "alert");
      p.classList.add("um-error");
    }
    async function request(method = "GET", body) {
      if (disposed) throw new Error("View closed.");
      return options.request(method, body);
    }
    function schedule() {
      clearTimeout(timer);
      if (state?.model && ["queued", "running"].includes(state.model.state))
        timer = setTimeout(() => refresh(), 2000);
    }
    async function refresh() {
      if (busy || disposed) return;
      const serial = ++requestSerial;
      try {
        const next = await request();
        if (disposed || serial !== requestSerial) return;
        const old = state;
        state = next;
        // Do not reset an unfinished preference form on window focus.
        if (!next.model && old && !old.model) return;
        render();
        schedule();
      } catch (e) {
        if (!disposed) {
          error(e);
          clearTimeout(timer);
          timer = setTimeout(() => refresh(), 5000);
        }
      }
    }
    async function submit(action) {
      if (busy || disposed) return;
      busy = true;
      requestSerial++;
      clearTimeout(timer);
      container
        .querySelectorAll("button,input")
        .forEach((el) => (el.disabled = true));
      try {
        state = await request(
          "POST",
          action === "create" ? { action, preferences } : { action },
        );
        if (disposed) return;
        render();
        schedule();
      } catch (e) {
        if (!disposed) {
          render();
          error(e);
        }
      } finally {
        busy = false;
      }
    }
    function form() {
      header(
        options.mode === "preferences" ? "Create your model" : "Your model",
      );
      const form = document.createElement("form");
      form.className = "um-form";
      for (const [group, values] of Object.entries(choices)) {
        const field = document.createElement("fieldset");
        field.className = "um-options um-" + group;
        const legend = document.createElement("legend");
        legend.textContent = t(
          {
            gender: "Gender",
            hair: "Hair color",
            build: "Build",
            skinTone: "Skin tone",
          }[group],
        );
        field.append(legend);
        const grid = document.createElement("div");
        grid.className = "um-choice-grid";
        for (const [value, label] of values) {
          const item = document.createElement("label");
          item.className = "um-choice";
          item.title = t(label);
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "model-" + group;
          input.value = value;
          input.required = true;
          input.checked = preferences[group] === value;
          input.setAttribute("aria-label", t(label));
          input.addEventListener("change", () => {
            preferences[group] = value;
          });
          const art = document.createElement("span");
          art.className = "um-choice-art";
          art.innerHTML = icon(group, value);
          const text = document.createElement("span");
          text.className = "um-choice-name";
          text.textContent = t(label);
          item.append(input, art, text);
          grid.append(item);
        }
        field.append(grid);
        form.append(field);
        if (group === "hair") {
          const height = document.createElement("fieldset");
          height.className = "um-height";
          height.innerHTML =
            "<legend>" +
            t("Height") +
            '</legend><div><input type="range" min="130" max="210" step="1" aria-label="' +
            t("Height in centimeters") +
            '"/><label><input type="number" min="130" max="210" step="1" required aria-label="' +
            t("Height value in centimeters") +
            '"/> cm</label></div>';
          const inputs = height.querySelectorAll("input");
          inputs.forEach((input) => {
            input.value = String(preferences.heightCm);
            input.addEventListener("input", () => {
              preferences.heightCm = Number(input.value);
              inputs.forEach((other) => {
                if (other !== input) other.value = input.value;
              });
            });
          });
          form.append(height);
        }
      }
      const consequence = document.createElement("p");
      consequence.className = "um-consequence";
      consequence.textContent = t(
        "Your model can’t be changed after creation.",
      );
      form.append(consequence);
      const actions = document.createElement("div");
      actions.className = "um-actions";
      const create = button(
        options.mode === "preferences" ? "Continue" : "Create model",
        () => {},
        true,
      );
      create.type = "submit";
      actions.append(create);
      if (options.onContinue || options.onSkip)
        actions.append(
          button("Skip for now", () =>
            options.onContinue ? options.onContinue(null) : options.onSkip(),
          ),
        );
      form.append(actions);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!form.reportValidity() || !validPreferences(preferences)) return;
        if (options.mode === "preferences")
          options.onContinue({ ...preferences });
        else void submit("create");
      });
      container.append(form);
    }
    function render() {
      if (disposed) return;
      if (!state?.model) {
        form();
        return;
      }
      header();
      const model = state.model;
      if (model.state === "ready") {
        const image = document.createElement("img");
        image.className = "um-preview";
        image.src = model.imageUrl;
        image.alt = t("Your saved full-length model");
        image.width = 1024;
        image.height = 1536;
        image.addEventListener(
          "error",
          () => {
            image.removeAttribute("src");
            error(
              new Error(
                "Image unavailable. Reopen this view to load it again.",
              ),
            );
          },
          { once: true },
        );
        container.append(image);
        const toggle = document.createElement("label");
        toggle.className = "um-enabled";
        toggle.append(document.createTextNode(t("Enable your model")));
        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("role", "switch");
        input.checked = state.enabled;
        input.addEventListener("change", async () => {
          const desired = input.checked;
          busy = true;
          requestSerial++;
          input.disabled = true;
          try {
            const next = await request("PATCH", { enabled: desired });
            if (!disposed) {
              state = next;
              input.checked = next.enabled;
            }
          } catch (e) {
            if (!disposed) {
              input.checked = !desired;
              error(e);
            }
          } finally {
            busy = false;
            input.disabled = false;
          }
        });
        toggle.append(input);
        container.append(toggle);
      } else if (["queued", "running"].includes(model.state)) {
        const art = document.createElement("div");
        art.className = "um-pending";
        art.innerHTML = mirrorIcon;
        container.append(art);
        message("Creating your model…");
        message("You can close this. Your model will be saved here.");
      } else if (model.state === "failed") {
        message("Your model couldn’t be created.", "alert");
        if (model.canRetry)
          container.append(button("Try again", () => submit("retry"), true));
        else message("Contact support for help.");
      }
    }
    function focusRefresh() {
      if (options.mode !== "preferences" && !busy) void refresh();
    }
    if (options.mode === "preferences") form();
    else {
      header();
      message("Loading your model…");
      void refresh();
      window.addEventListener("focus", focusRefresh);
    }
    return () => {
      disposed = true;
      requestSerial++;
      clearTimeout(timer);
      window.removeEventListener("focus", focusRefresh);
      container.replaceChildren();
    };
  }
  function invitation() {
    return (
      '<header class="um-header um-invitation-header"><h2>' +
      t("Create your model") +
      '</h2><span class="um-invitation-new">' +
      t("New") +
      "</span></header>" +
      examples() +
      '<p class="um-message">' +
      t("Choose your look. Create once. Keep it in your account.") +
      '</p><div class="um-actions"><button type="button" class="um-primary">' +
      t("Create my model") +
      '</button><button type="button" class="um-secondary">' +
      t("Not now") +
      "</button></div>"
    );
  }
  root.AutoListerModelUI = {
    locale: () => root.AutoListerModelCopy.getLocale(),
    t,
    invitation,
    mount,
    validPreferences,
    mirrorIcon,
    examples,
    entry,
  };
  if (typeof module !== "undefined") module.exports = root.AutoListerModelUI;
})(typeof globalThis !== "undefined" ? globalThis : this);
