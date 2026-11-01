/* Shared account-model view. Keep byte-identical with extension lib/user-model-ui.js. */
(function (root) {
  "use strict";
  const mirrorIcon =
    '<svg viewBox="0 0 32 40" fill="none" aria-hidden="true"><path d="M6 36V12a10 10 0 0 1 20 0v24Z" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="12" r="3" fill="currentColor"/><path d="M11 22c0-6 10-6 10 0m-5-5v13m-1-6-3 7m5-7 3 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const choices = {
    gender: [
      ["male", "Male"],
      ["female", "Female"],
    ],
    hair: [
      ["black", "Black"],
      ["blonde", "Blonde"],
      ["brown", "Brown"],
      ["red", "Redhead"],
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
      return (
        '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 56V29c0-28 36-28 36 0v27Z" fill="' +
        color +
        '"/><ellipse cx="32" cy="34" rx="13" ry="17" fill="#ead2c0"/><path d="M16 31c2-23 32-23 32 0-10-2-17-8-19-13-1 8-5 12-13 13Z" fill="' +
        color +
        '"/><path d="M22 58h20l-5-12H27Z" fill="#ead2c0"/></svg>'
      );
    }
    const width =
      group === "build"
        ? { slim: 8, average: 12, plus_size: 17 }[value]
        : value === "male"
          ? 13
          : 10;
    return (
      '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="10" r="7" fill="#bda995"/>' +
      (value === "female"
        ? '<path d="M23 10c0-13 18-13 18 0v9l-5-5V8h-8v6l-5 5Z" fill="#51443c"/>'
        : "") +
      '<path d="M' +
      (32 - width) +
      " 24Q32 18 " +
      (32 + width) +
      " 24L" +
      (36 + width) +
      " 43h-7l-2-10v15H" +
      (27 - width) +
      'V33l-2 10h-7Z" fill="#6f8580"/><path d="M' +
      (32 - width + 1) +
      " 46h" +
      (width * 2 - 2) +
      "l-2 16h-" +
      (width - 3) +
      "l-1-12-1 12h-" +
      (width - 3) +
      'Z" fill="#445451"/></svg>'
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
    function button(text, action, primary = false) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = text;
      el.className = primary ? "um-primary" : "um-secondary";
      el.addEventListener("click", action);
      return el;
    }
    function header(title = "Your model") {
      container.replaceChildren();
      const h = document.createElement("header");
      h.className = "um-header";
      const heading = document.createElement("h2");
      heading.textContent = title;
      h.append(heading);
      if (options.onClose) {
        const b = button(options.backLabel || "Back", options.onClose);
        b.classList.add("um-back");
        b.setAttribute(
          "aria-label",
          options.backLabel === "Settings"
            ? "Back to settings"
            : options.backLabel || "Back",
        );
        h.prepend(b);
      }
      container.append(h);
    }
    function message(text, role = "status") {
      const el = document.createElement("p");
      el.className = "um-message";
      el.setAttribute("role", role);
      el.textContent = text;
      container.append(el);
      return el;
    }
    function error(error) {
      if (disposed) return;
      container.querySelector(".um-error")?.remove();
      const p = message(
        error?.message || "Your model could not be loaded. Try again.",
        "alert",
      );
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
        legend.textContent = {
          gender: "Gender",
          hair: "Hair color",
          build: "Build",
          skinTone: "Skin tone",
        }[group];
        field.append(legend);
        const grid = document.createElement("div");
        grid.className = "um-choice-grid";
        for (const [value, label] of values) {
          const item = document.createElement("label");
          item.className = "um-choice";
          item.title = label;
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "model-" + group;
          input.value = value;
          input.required = true;
          input.checked = preferences[group] === value;
          input.setAttribute("aria-label", label);
          input.addEventListener("change", () => {
            preferences[group] = value;
          });
          const art = document.createElement("span");
          art.className = "um-choice-art";
          art.innerHTML = icon(group, value);
          const text = document.createElement("span");
          text.className = "um-choice-name";
          text.textContent = label;
          item.append(input, art, text);
          grid.append(item);
        }
        field.append(grid);
        form.append(field);
        if (group === "hair") {
          const height = document.createElement("fieldset");
          height.className = "um-height";
          height.innerHTML =
            '<legend>Height</legend><div><input type="range" min="130" max="210" step="1" aria-label="Height in centimeters"/><label><input type="number" min="130" max="210" step="1" required aria-label="Height value in centimeters"/> cm</label></div>';
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
      consequence.textContent = "Your model can’t be changed after creation.";
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
        image.alt = "Your saved full-length model";
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
        toggle.append(document.createTextNode("Enable your model"));
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
  root.AutoListerModelUI = { mount, validPreferences, mirrorIcon };
  if (typeof module !== "undefined") module.exports = root.AutoListerModelUI;
})(typeof globalThis !== "undefined" ? globalThis : this);
