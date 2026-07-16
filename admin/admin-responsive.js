const sidebar = document.getElementById("admin-sidebar");
const toggle = document.querySelector(".admin-mobile-menu-button");
const closeButton = document.querySelector(".admin-sidebar-close-button");
const overlay = document.querySelector(".admin-sidebar-overlay");
const mobileQuery = matchMedia("(max-width: 760px)");
let previousFocus = null;

function sidebarFocusable() {
    return [...sidebar.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length);
}

function setSidebarOpen(open) {
    if (!sidebar || !toggle) return;
    const shouldOpen = Boolean(open && mobileQuery.matches);
    document.body.classList.toggle("admin-menu-open", shouldOpen);
    toggle.setAttribute("aria-expanded", String(shouldOpen));
    toggle.setAttribute("aria-label", shouldOpen ? "Đóng menu quản trị" : "Mở menu quản trị");
    toggle.innerHTML = `<i class="fa-solid ${shouldOpen ? "fa-xmark" : "fa-bars"}" aria-hidden="true"></i>`;
    sidebar.setAttribute("aria-hidden", String(mobileQuery.matches && !shouldOpen));
    sidebar.inert = Boolean(mobileQuery.matches && !shouldOpen);
    if (shouldOpen) {
        previousFocus = document.activeElement;
        requestAnimationFrame(() => closeButton?.focus());
    } else if (previousFocus instanceof HTMLElement && mobileQuery.matches) {
        previousFocus.focus({ preventScroll: true });
        previousFocus = null;
    }
}

toggle?.addEventListener("click", () => setSidebarOpen(!document.body.classList.contains("admin-menu-open")));
closeButton?.addEventListener("click", () => setSidebarOpen(false));
overlay?.addEventListener("click", () => setSidebarOpen(false));
sidebar?.addEventListener("click", event => {
    if (mobileQuery.matches && event.target.closest("a, .admin-navigation-button, .admin-logout-button")) setSidebarOpen(false);
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.body.classList.contains("admin-menu-open")) setSidebarOpen(false);
    if (event.key !== "Tab" || !document.body.classList.contains("admin-menu-open")) return;
    const focusable = sidebarFocusable();
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
});

function syncViewport() {
    if (!mobileQuery.matches) {
        document.body.classList.remove("admin-menu-open");
        sidebar?.removeAttribute("aria-hidden");
        if (sidebar) sidebar.inert = false;
        toggle?.setAttribute("aria-expanded", "false");
        if (toggle) toggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    } else {
        const closed = !document.body.classList.contains("admin-menu-open");
        sidebar?.setAttribute("aria-hidden", String(closed));
        if (sidebar) sidebar.inert = closed;
    }
}
mobileQuery.addEventListener?.("change", syncViewport);
syncViewport();

document.querySelectorAll("[data-filter-toggle]").forEach(button => {
    const panel = document.querySelector(`[data-filter-panel="${button.dataset.filterToggle}"]`);
    button.addEventListener("click", () => {
        const open = !panel?.classList.contains("open");
        panel?.classList.toggle("open", open);
        button.setAttribute("aria-expanded", String(open));
    });
});

const clock = document.getElementById("admin-current-time-text");
let clockTimer = 0;
function updateClock() {
    if (clock) clock.textContent = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
function syncClock() {
    clearInterval(clockTimer);
    if (!document.hidden) {
        updateClock();
        clockTimer = setInterval(updateClock, 30000);
    }
}
document.addEventListener("visibilitychange", syncClock);
addEventListener("pagehide", () => clearInterval(clockTimer), { once: true });
syncClock();
