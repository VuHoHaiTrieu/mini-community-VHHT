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
      html.page-not-visible *, html.page-not-visible *::before, html.page-not-visible *::after { animation-play-state: paused !important; }
      @media (max-width: 900px) and (pointer: coarse) {
        html[data-performance-tier="balanced"] .vhht-brand-mark,
        html[data-performance-tier="balanced"] .vhht-brand-lockup,
        html[data-performance-tier="balanced"] .nova-mascot-button::before,
        html[data-performance-tier="balanced"] .nova-mascot-button::after,
        html[data-performance-tier="economy"] .vhht-brand-mark,
        html[data-performance-tier="economy"] .vhht-brand-lockup,
        html[data-performance-tier="economy"] .nova-mascot-button::before,
        html[data-performance-tier="economy"] .nova-mascot-button::after { animation: none !important; }
        .community-topbar, .community-post-card, .community-create-post-container,
        .messenger-shell, .conversation-sidebar, .chat-main-column, #chat-header,
        #message-form, .message, .composer-more-menu, .message-emoji-picker,
        .message-effect-picker {
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }
        .feed-list-post {
          content-visibility: auto;
          contain-intrinsic-size: auto 520px;
        }
        html[data-performance-tier="balanced"] .message,
        html[data-performance-tier="balanced"] .feed-list-post,
        html[data-performance-tier="balanced"] .community-post-card,
        html[data-performance-tier="balanced"] .nova-ai-assistant { filter: none !important; box-shadow: 0 8px 24px rgba(0,10,28,.28) !important; }
        html[data-performance-tier="economy"] .message,
        html[data-performance-tier="economy"] .feed-list-post,
        html[data-performance-tier="economy"] .community-post-card,
        html[data-performance-tier="economy"] .nova-ai-assistant { filter: none !important; box-shadow: 0 4px 14px rgba(0,10,28,.2) !important; }
        html[data-performance-tier="economy"] .nebula,
        html[data-performance-tier="economy"] .shooting-star,
        html[data-performance-tier="economy"] .message-send-effect::before,
        html[data-performance-tier="economy"] .message-send-effect::after { animation: none !important; }
      }
    `;
    document.head.appendChild(rules);
}

function syncVisibility() {
    document.documentElement.classList.toggle("page-not-visible", document.hidden);
    if (document.hidden) document.querySelectorAll("video, audio").forEach(media => media.pause());
}

document.addEventListener("visibilitychange", syncVisibility, { passive: true });
window.addEventListener("pagehide", () => {
    document.documentElement.classList.add("page-not-visible");
    document.querySelectorAll("video, audio").forEach(media => media.pause());
}, { passive: true });
window.addEventListener("pageshow", syncVisibility, { passive: true });
syncVisibility();

// A shared signal lets render loops suspend without every page creating its own
// visibility observer. It does not alter visuals while the page is active.
window.VHHTPerformance = Object.freeze({
    tier,
    get visible() { return !document.hidden; }
});

export const performanceTier = tier;

if (new URLSearchParams(location.search).get("perf") === "1") {
    import("./performance-debug.js").then(module => module.startPerformanceDebug()).catch(console.warn);
}
