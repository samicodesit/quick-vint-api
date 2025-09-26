// header.js — loads shared header partial and wires up mobile menu behavior
(function () {
  async function loadHeader() {
    try {
      const resp = await fetch("/partials/header.html");
      if (!resp.ok)
        return console.warn("Header partial not found:", resp.status);
      const html = await resp.text();
      const placeholder = document.getElementById("shared-header-placeholder");
      if (placeholder) {
        placeholder.innerHTML = html;
        initHeader();
      }
    } catch (err) {
      console.error("Failed to load header partial", err);
    }
  }

  function initHeader() {
    const hamburgerButton = document.getElementById("hamburger-button");
    const mobileMenu = document.getElementById("mobile-menu");
    const sheetClose = document.getElementById("sheet-close");
    const backdrop = document.getElementById("menu-backdrop");
    // Focus-trap state
    let lastFocused = null;
    let focusableElements = [];
    let firstFocusable = null;
    let lastFocusable = null;
    let onKeyDownForTrap = null;

    function setMenuOpen(open) {
      if (!hamburgerButton || !mobileMenu || !backdrop) return;
      if (open) {
        hamburgerButton.classList.add("open");
        mobileMenu.classList.add("open");
        backdrop.classList.add("open");
        hamburgerButton.setAttribute("aria-expanded", "true");
        hamburgerButton.setAttribute("aria-label", "Close navigation menu");
        // save last focused element so we can restore focus on close
        lastFocused = document.activeElement;
        // compute focusable elements inside the menu
        focusableElements = Array.from(
          mobileMenu.querySelectorAll(
            'a, button, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(
          (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
        );
        firstFocusable = focusableElements[0] || sheetClose || mobileMenu;
        lastFocusable =
          focusableElements[focusableElements.length - 1] || firstFocusable;
        if (firstFocusable) firstFocusable.focus();
        // trap focus inside the sheet
        onKeyDownForTrap = function (e) {
          if (e.key === "Tab") {
            if (focusableElements.length === 0) {
              e.preventDefault();
              return;
            }
            if (e.shiftKey) {
              if (document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable.focus();
              }
            } else {
              if (document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable.focus();
              }
            }
          }
          if (e.key === "Escape") {
            setMenuOpen(false);
          }
        };
        document.addEventListener("keydown", onKeyDownForTrap);
        document.body.classList.add("menu-dim");
      } else {
        hamburgerButton.classList.remove("open");
        mobileMenu.classList.remove("open");
        backdrop.classList.remove("open");
        hamburgerButton.setAttribute("aria-expanded", "false");
        hamburgerButton.setAttribute("aria-label", "Open navigation menu");
        // cleanup focus trap and restore focus
        if (onKeyDownForTrap)
          document.removeEventListener("keydown", onKeyDownForTrap);
        onKeyDownForTrap = null;
        focusableElements = [];
        firstFocusable = lastFocusable = null;
        if (lastFocused && typeof lastFocused.focus === "function") {
          lastFocused.focus();
        } else {
          hamburgerButton.focus();
        }
        document.body.classList.remove("menu-dim");
      }
    }

    if (hamburgerButton) {
      hamburgerButton.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = hamburgerButton.classList.contains("open");
        setMenuOpen(!isOpen);
      });
    }

    if (backdrop) backdrop.addEventListener("click", () => setMenuOpen(false));
    if (sheetClose)
      sheetClose.addEventListener("click", () => setMenuOpen(false));

    document
      .querySelectorAll("#mobile-menu a")
      .forEach((el) => el.addEventListener("click", () => setMenuOpen(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    });

    // Prevent clicks inside the menu from closing it accidentally
    document.addEventListener("click", (e) => {
      const menu = document.getElementById("mobile-menu");
      if (!menu) return;
      if (!menu.contains(e.target) && !hamburgerButton.contains(e.target)) {
        setMenuOpen(false);
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadHeader);
  } else {
    loadHeader();
  }
})();
