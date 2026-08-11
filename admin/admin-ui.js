import { playUiSound } from "../shared/audio/sound-manager.js";

const toastRegion = document.getElementById("admin-toast-region");
const dialogRoot = document.getElementById("admin-dialog-root");

const iconByType = {
    success: "fa-circle-check",
    warning: "fa-triangle-exclamation",
    error: "fa-circle-xmark",
    info: "fa-circle-info"
};

function escapeText(value = "") {
    const node = document.createElement("span");
    node.textContent = String(value);
    return node.innerHTML;
}

export function showToast(message, options = {}) {
    if (!toastRegion) return;
    const type = options.type || "success";
    playUiSound(type === "info" ? "notification" : type);
    const toast = document.createElement("article");
    toast.className = `admin-toast ${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.innerHTML = `
        <i class="fa-solid ${iconByType[type] || iconByType.info}" aria-hidden="true"></i>
        <div class="admin-toast-copy">
            <strong>${escapeText(options.title || (type === "error" ? "Không thể hoàn tất" : "Đã cập nhật"))}</strong>
            <span>${escapeText(message)}</span>
        </div>
        <button class="admin-toast-close" type="button" aria-label="Đóng thông báo"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
    const dismiss = () => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(12px)";
        setTimeout(() => toast.remove(), 180);
    };
    toast.querySelector("button").addEventListener("click", dismiss);
    toastRegion.prepend(toast);
    while (toastRegion.children.length > 3) toastRegion.lastElementChild.remove();
    setTimeout(dismiss, options.duration || 4200);
}

function getFocusable(container) {
    return [...container.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.getClientRects().length);
}

function mountLayer(layer, { close, initialFocus } = {}) {
    const previousFocus = document.activeElement;
    dialogRoot.replaceChildren(layer);
    document.body.classList.add("admin-modal-open");
    const keyHandler = event => {
        if (event.key === "Escape") {
            event.preventDefault();
            close?.();
            return;
        }
        if (event.key !== "Tab") return;
        const focusable = getFocusable(layer);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    layer.addEventListener("keydown", keyHandler);
    requestAnimationFrame(() => (initialFocus || getFocusable(layer)[0])?.focus());
    return () => {
        layer.removeEventListener("keydown", keyHandler);
        layer.remove();
        document.body.classList.remove("admin-modal-open");
        if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
}

export function confirmAction(options = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "admin-modal-overlay";
        overlay.innerHTML = `
            <section class="admin-modal ${options.tone === "danger" ? "danger" : ""}" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description">
                <div class="admin-modal-header">
                    <span class="admin-modal-symbol"><i class="fa-solid ${options.icon || (options.tone === "danger" ? "fa-triangle-exclamation" : "fa-shield-halved")}" aria-hidden="true"></i></span>
                    <div class="admin-modal-heading"><h2 id="admin-confirm-title">${escapeText(options.title || "Xác nhận thao tác")}</h2><p id="admin-confirm-description">${escapeText(options.description || "Bạn có chắc muốn tiếp tục?")}</p></div>
                </div>
                ${options.context ? `<div class="admin-modal-context">${escapeText(options.context)}</div>` : ""}
                <footer class="admin-modal-footer">
                    <button class="admin-modal-button" type="button" data-cancel>${escapeText(options.cancelLabel || "Hủy")}</button>
                    <button class="admin-modal-button ${options.tone === "danger" ? "danger" : "primary"}" type="button" data-confirm>${escapeText(options.confirmLabel || "Xác nhận")}</button>
                </footer>
            </section>`;
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(value);
        };
        const cleanup = mountLayer(overlay, { close: () => finish(false), initialFocus: overlay.querySelector("[data-cancel]") });
        overlay.querySelector("[data-cancel]").addEventListener("click", () => finish(false));
        overlay.querySelector("[data-confirm]").addEventListener("click", () => finish(true));
        overlay.addEventListener("click", event => { if (event.target === overlay) finish(false); });
    });
}

export function openActionSheet({ title = "Hành động", description = "Chọn thao tác muốn thực hiện", actions = [] } = {}) {
    const overlay = document.createElement("div");
    overlay.className = "admin-sheet-overlay";
    const section = document.createElement("section");
    section.className = "admin-action-sheet";
    section.setAttribute("role", "dialog");
    section.setAttribute("aria-modal", "true");
    section.innerHTML = `<header><h2>${escapeText(title)}</h2><p>${escapeText(description)}</p></header><div class="admin-action-list"></div><button class="admin-sheet-cancel" type="button">Đóng</button>`;
    const actionList = section.querySelector(".admin-action-list");
    let cleanup;
    const close = () => cleanup?.();
    actions.filter(action => !action.hidden).forEach(action => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `admin-sheet-action ${action.tone === "danger" ? "danger" : ""}`;
        button.innerHTML = `<i class="fa-solid ${action.icon || "fa-arrow-right"}" aria-hidden="true"></i><span><strong>${escapeText(action.label)}</strong><small>${escapeText(action.description || "")}</small></span>`;
        button.addEventListener("click", () => { close(); action.onSelect?.(); });
        actionList.appendChild(button);
    });
    overlay.appendChild(section);
    cleanup = mountLayer(overlay, { close });
    section.querySelector(".admin-sheet-cancel").addEventListener("click", close);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
}

export function openDetailDialog({ title = "Chi tiết", subtitle = "", content, footer } = {}) {
    const overlay = document.createElement("div");
    overlay.className = "admin-modal-overlay";
    const modal = document.createElement("section");
    modal.className = "admin-modal admin-detail-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "admin-detail-title");
    modal.innerHTML = `<div class="admin-detail-header"><div><p>${escapeText(subtitle)}</p><h2 id="admin-detail-title">${escapeText(title)}</h2></div><button type="button" data-detail-close aria-label="Đóng chi tiết"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div><div class="admin-detail-content"></div>`;
    if (content instanceof Node) modal.querySelector(".admin-detail-content").appendChild(content);
    if (footer instanceof Node) modal.appendChild(footer);
    overlay.appendChild(modal);
    let cleanup;
    const close = () => cleanup?.();
    cleanup = mountLayer(overlay, { close, initialFocus: modal.querySelector("[data-detail-close]") });
    modal.querySelector("[data-detail-close]").addEventListener("click", close);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    return close;
}

export function setButtonBusy(button, busy, label = "Đang xử lý") {
    if (!button) return;
    if (busy) {
        button.dataset.originalHtml = button.innerHTML;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span class="sr-only">${escapeText(label)}</span>`;
    } else {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
    }
}

export function debounce(callback, delay = 320) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => callback(...args), delay);
    };
}

window.AdminUI = { showToast, confirmAction, openActionSheet, openDetailDialog, setButtonBusy, debounce };
