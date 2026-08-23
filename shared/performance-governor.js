const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const compact = matchMedia("(max-width: 800px), (pointer: coarse)").matches;
const constrainedHardware = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
    || (navigator.deviceMemory && navigator.deviceMemory <= 4)
    || connection?.saveData;
const tier = reducedMotion || constrainedHardware ? "economy" : compact ? "balanced" : "full";

document.documentElement.dataset.performanceTier = tier;
document.documentElement.classList.toggle("reduce-system-motion", reducedMotion);

if (!document.getElementById("vhht-performance-rules")) {
    const rules = document.createElement("style");
    rules.id = "vhht-performance-rules";
    rules.textContent = `
      html[data-performance-tier="economy"] *, html[data-performance-tier="economy"] *::before, html[data-performance-tier="economy"] *::after {
        animation-duration: .001ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important;
      }
      html[data-performance-tier="economy"] .space-nebula { filter: none !important; }
      html.page-not-visible *, html.page-not-visible *::before, html.page-not-visible *::after { animation-play-state: paused !important; }
    `;
    document.head.appendChild(rules);
}

function syncVisibility() {
    document.documentElement.classList.toggle("page-not-visible", document.hidden);
    document.querySelectorAll("video, audio").forEach(media => {
        if (document.hidden && !media.paused) {
            media.dataset.resumeWhenVisible = "true";
            media.pause();
        } else if (!document.hidden && media.dataset.resumeWhenVisible === "true") {
            delete media.dataset.resumeWhenVisible;
            media.play().catch(() => {});
        }
    });
}

document.addEventListener("visibilitychange", syncVisibility, { passive: true });
syncVisibility();

export const performanceTier = tier;
