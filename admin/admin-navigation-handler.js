const navigationButtons = [...document.querySelectorAll(".admin-navigation-button[data-page]")];
const pageSections = [...document.querySelectorAll(".admin-page-section")];
const shortcutButtons = [...document.querySelectorAll(".dashboard-shortcut-button[data-target]")];
const pageTitle = document.getElementById("admin-page-title");
const pageSubtitle = document.getElementById("admin-page-subtitle");

const pageMeta = Object.fromEntries(navigationButtons.map(button => [button.dataset.page, {
    title: button.dataset.title || button.textContent.trim(),
    subtitle: button.dataset.subtitle || "Trung tâm quản trị VHHT"
}]));

function showAdminPage(targetPageId, { updateHash = true } = {}) {
    const targetSection = document.getElementById(targetPageId);
    if (!targetSection) return;
    pageSections.forEach(section => section.classList.toggle("active-page-section", section === targetSection));
    navigationButtons.forEach(button => {
        const active = button.dataset.page === targetPageId;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    const meta = pageMeta[targetPageId] || { title: "Trung tâm quản trị", subtitle: "Quản lý hệ thống VHHT" };
    if (pageTitle) pageTitle.textContent = meta.title;
    if (pageSubtitle) pageSubtitle.textContent = meta.subtitle;
    document.title = `${meta.title} · VHHT Admin`;
    if (updateHash) history.replaceState(null, "", `#${targetPageId}`);
    scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

navigationButtons.forEach(button => button.addEventListener("click", () => showAdminPage(button.dataset.page)));
shortcutButtons.forEach(button => button.addEventListener("click", () => showAdminPage(button.dataset.target)));

const requestedPage = location.hash.slice(1);
showAdminPage(document.getElementById(requestedPage) ? requestedPage : "dashboard-page-section", { updateHash: false });
