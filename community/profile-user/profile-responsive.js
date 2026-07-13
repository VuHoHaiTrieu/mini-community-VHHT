const mobileProfile = window.matchMedia("(max-width: 767px)");

function installMobileAccordion(card, id, label) {
    if (!card || card.dataset.mobileAccordion === "ready") return;
    const heading = card.querySelector(":scope > h2");
    if (!heading) return;

    card.id ||= id;
    card.dataset.mobileAccordion = "ready";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "profile-mobile-toggle";
    toggle.setAttribute("aria-controls", card.id);
    toggle.setAttribute("aria-label", label);
    toggle.innerHTML = '<span></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';

    const setCollapsed = collapsed => {
        const ownIntroduction = card.id === "profile-introduction-card"
            && document.body.classList.contains("own-profile");
        card.dataset.mobileCollapsed = String(collapsed);
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.setAttribute("aria-label", `${collapsed ? "Mở" : "Thu gọn"} ${label.toLowerCase()}`);
        toggle.querySelector("span").textContent = collapsed
            ? (ownIntroduction ? "Chỉnh sửa" : "Xem")
            : "Thu gọn";
    };

    toggle.addEventListener("click", () => {
        card.dataset.mobileTouched = "true";
        setCollapsed(card.dataset.mobileCollapsed !== "true");
    });
    heading.appendChild(toggle);

    const isIntroduction = card === document.querySelector(".profile-grid > .profile-card:first-child");
    const ownProfile = document.body.classList.contains("own-profile");
    setCollapsed(mobileProfile.matches && (ownProfile || !isIntroduction));
}

function initialiseResponsiveProfile() {
    const introduction = document.querySelector(".profile-grid > .profile-card:first-child");
    const account = document.querySelector(".account-info");
    installMobileAccordion(introduction, "profile-introduction-card", "Giới thiệu");
    installMobileAccordion(account, "profile-account-card", "Thông tin tài khoản");
}

function closeTopProfileLayer(event) {
    if (event.key !== "Escape") return;
    const crop = document.querySelector("#photo-position-editor.show");
    const actionDialog = document.querySelector("#profile-action-dialog.show");
    const postViewer = document.querySelector("#profile-post-lightbox.show");
    const mediaViewer = document.querySelector("#profile-media-lightbox.show");
    const layer = crop || actionDialog || postViewer || mediaViewer;
    if (!layer) return;
    const closeButton = layer.querySelector("[data-editor-close], .lightbox-close, [data-dialog-cancel], :scope > button");
    closeButton?.click();
}

document.addEventListener("DOMContentLoaded", initialiseResponsiveProfile);
document.addEventListener("keydown", closeTopProfileLayer);

const bodyClassObserver = new MutationObserver(() => {
    const introduction = document.querySelector("#profile-introduction-card");
    if (!introduction || !mobileProfile.matches || introduction.dataset.mobileTouched === "true") return;
    const ownProfile = document.body.classList.contains("own-profile");
    introduction.dataset.mobileCollapsed = String(ownProfile);
    const toggle = introduction.querySelector(".profile-mobile-toggle");
    toggle?.setAttribute("aria-expanded", String(!ownProfile));
    const label = toggle?.querySelector("span");
    if (label) label.textContent = ownProfile ? "Chỉnh sửa" : "Thu gọn";
});
bodyClassObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
