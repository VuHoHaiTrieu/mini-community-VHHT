(() => {
  "use strict";

  const root = document.documentElement;
  const editableSelector = "input:not([type='file']):not([type='button']):not([type='submit']), textarea, [contenteditable='true']";
  let activeField = null;
  let focusViewportHeight = 0;
  let frame = 0;

  const visualViewport = () => window.visualViewport;
  const isMobileLayout = () => matchMedia("(max-width: 800px)").matches;

  function writeViewportState() {
    frame = 0;
    const vv = visualViewport();
    const visibleHeight = Math.round(vv?.height || window.innerHeight);
    const visibleTop = Math.round(vv?.offsetTop || 0);
    const layoutHeight = Math.round(window.innerHeight);
    const focused = Boolean(activeField?.isConnected && isMobileLayout());

    // Android usually resizes the layout viewport, so fixed controls already
    // move. iOS often shrinks only VisualViewport; compensate only that gap.
    const keyboardInset = focused ? Math.max(0, layoutHeight - visibleHeight - visibleTop) : 0;
    const referenceHeight = focusViewportHeight || layoutHeight;
    const keyboardOpen = focused && (keyboardInset > 70 || visibleHeight < referenceHeight * .82);

    root.style.setProperty("--mobile-vv-height", `${visibleHeight}px`);
    root.style.setProperty("--mobile-vv-top", `${visibleTop}px`);
    root.style.setProperty("--mobile-keyboard-inset", `${keyboardInset}px`);
    root.classList.toggle("mobile-field-focused", focused);
    root.classList.toggle("soft-keyboard-open", keyboardOpen);
  }

  function scheduleViewportState() {
    if (frame) return;
    frame = requestAnimationFrame(writeViewportState);
  }

  document.addEventListener("focusin", event => {
    const field = event.target.closest?.(editableSelector);
    if (!field || !isMobileLayout()) return;
    activeField = field;
    focusViewportHeight = Math.round(visualViewport()?.height || window.innerHeight);
    scheduleViewportState();
  });

  document.addEventListener("focusout", event => {
    if (event.target !== activeField) return;
    queueMicrotask(() => {
      const next = document.activeElement?.closest?.(editableSelector);
      if (next && isMobileLayout()) {
        activeField = next;
        scheduleViewportState();
        return;
      }
      activeField = null;
      focusViewportHeight = 0;
      scheduleViewportState();
    });
  });

  visualViewport()?.addEventListener("resize", scheduleViewportState, { passive: true });
  visualViewport()?.addEventListener("scroll", scheduleViewportState, { passive: true });
  window.addEventListener("resize", scheduleViewportState, { passive: true });
  window.addEventListener("orientationchange", scheduleViewportState, { passive: true });
  window.addEventListener("pageshow", scheduleViewportState, { passive: true });
  writeViewportState();
})();
