(() => {
  "use strict";

  const root = document.documentElement;
  const editableSelector = "input:not([type='file']):not([type='button']):not([type='submit']), textarea, [contenteditable='true']";
  let activeField = null;
  let baselineHeight = Math.max(window.innerHeight, root.clientHeight);
  let settleTimer = 0;

  const viewport = () => window.visualViewport;

  function ensureFieldVisible(field) {
    if (!field?.isConnected) return;
    const vv = viewport();
    const top = (vv?.offsetTop || 0) + 10;
    const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12;
    const rect = field.getBoundingClientRect();
    if (rect.top >= top && rect.bottom <= bottom) return;
    field.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  }

  function syncViewport() {
    const vv = viewport();
    const height = Math.round(vv?.height || window.innerHeight);
    const offsetTop = Math.round(vv?.offsetTop || 0);
    const focused = Boolean(activeField && activeField.isConnected);

    if (!focused) baselineHeight = Math.max(window.innerHeight, root.clientHeight, height);
    const obscured = Math.max(0, baselineHeight - height - offsetTop);
    const keyboardOpen = focused && (obscured > 70 || height < baselineHeight * 0.82);

    root.style.setProperty("--mobile-vv-height", `${height}px`);
    root.style.setProperty("--mobile-vv-top", `${offsetTop}px`);
    root.style.setProperty("--mobile-keyboard-inset", `${Math.round(obscured)}px`);
    root.classList.toggle("soft-keyboard-open", keyboardOpen);

    if (keyboardOpen) ensureFieldVisible(activeField);
  }

  document.addEventListener("focusin", event => {
    const field = event.target.closest?.(editableSelector);
    if (!field || window.innerWidth > 800) return;
    activeField = field;
    root.classList.add("mobile-field-focused");
    syncViewport();
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(syncViewport, 80);
    window.setTimeout(syncViewport, 260);
    window.setTimeout(() => ensureFieldVisible(field), 360);
  });

  document.addEventListener("focusout", event => {
    if (event.target !== activeField) return;
    window.setTimeout(() => {
      if (document.activeElement?.matches?.(editableSelector)) return;
      activeField = null;
      root.classList.remove("mobile-field-focused", "soft-keyboard-open");
      syncViewport();
    }, 140);
  });

  viewport()?.addEventListener("resize", syncViewport, { passive: true });
  viewport()?.addEventListener("scroll", syncViewport, { passive: true });
  window.addEventListener("resize", syncViewport, { passive: true });
  window.addEventListener("orientationchange", () => window.setTimeout(syncViewport, 180), { passive: true });
  syncViewport();
})();
