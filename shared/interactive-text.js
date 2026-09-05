const escapeInteractiveHtml = value => {
    const node = document.createElement("div");
    node.textContent = String(value ?? "");
    return node.innerHTML;
};

import { firebaseDatabase } from "./firebase-connection.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const appRoot = new URL("../", import.meta.url);
const TOKEN_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+|@[A-Za-z0-9._]{4,24}\b|#[\p{L}\p{N}_]{2,50}\b|(?<!\d)0(?:[\s.-]?\d){8,10}(?!\d))/gu;

export function renderInteractiveText(value) {
    const source = String(value ?? "");
    let output = "", cursor = 0, match;
    TOKEN_PATTERN.lastIndex = 0;
    while ((match = TOKEN_PATTERN.exec(source))) {
        output += escapeInteractiveHtml(source.slice(cursor, match.index));
        const token = match[0];
        if (/^(?:https?:\/\/|www\.)/i.test(token)) {
            const trailing = token.match(/[),.!?;:]+$/)?.[0] || "";
            const visibleUrl = trailing ? token.slice(0, -trailing.length) : token;
            const href = visibleUrl.startsWith("www.") ? `https://${visibleUrl}` : visibleUrl;
            output += `<a class="interactive-text-link" href="${escapeInteractiveHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${escapeInteractiveHtml(visibleUrl)}</a>${escapeInteractiveHtml(trailing)}`;
        } else if (token.startsWith("@")) {
            const username = token.slice(1).toLowerCase();
            output += `<button type="button" class="interactive-reference-token" data-interactive-mention="${escapeInteractiveHtml(username)}" aria-label="Mở hồ sơ ${escapeInteractiveHtml(token)}">${escapeInteractiveHtml(token)}</button>`;
        } else if (token.startsWith("#")) {
            const topic = token.slice(1).toLocaleLowerCase("vi");
            const topicUrl = new URL("community/community-feed-page.html", appRoot);
            topicUrl.searchParams.set("hashtag", topic);
            output += `<a class="interactive-reference-token" data-interactive-topic="${escapeInteractiveHtml(topic)}" href="${escapeInteractiveHtml(topicUrl.href)}" aria-label="Xem chủ đề ${escapeInteractiveHtml(token)}">${escapeInteractiveHtml(token)}</a>`;
        } else {
            const copyValue = token.replace(/[\s.-]/g, "");
            output += `<button type="button" class="interactive-copy-token" data-interactive-copy="${escapeInteractiveHtml(copyValue)}" aria-label="Sao chép số điện thoại" title="Sao chép số điện thoại">${escapeInteractiveHtml(token)} <i class="fa-regular fa-copy" aria-hidden="true"></i></button>`;
        }
        cursor = match.index + token.length;
    }
    return output + escapeInteractiveHtml(source.slice(cursor));
}

async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value);
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.cssText = "position:fixed;inset:-9999px auto auto -9999px;opacity:0";
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();
    if (!copied) throw new Error("COPY_FAILED");
}

export function installInteractiveTextInteractions() {
    if (document.documentElement.dataset.interactiveTextInstalled) return;
    document.documentElement.dataset.interactiveTextInstalled = "true";
    const style = document.createElement("style");
    style.id = "interactive-text-styles";
    style.textContent = `
      .interactive-text-link{color:#62d9ff!important;text-decoration:underline!important;text-decoration-color:rgba(98,217,255,.45)!important;text-underline-offset:3px;overflow-wrap:anywhere;cursor:pointer}
      .interactive-text-link:hover{color:#d2f7ff!important;text-decoration-color:currentColor!important}
      .interactive-copy-token{display:inline-flex;align-items:center;gap:5px;margin:1px 2px;padding:2px 7px;border:1px solid #31516f;border-radius:8px;background:#10243a;color:#a5e5ff;font:inherit;line-height:1.35;vertical-align:baseline;cursor:pointer}
      .interactive-copy-token:hover{border-color:#4ba3d0;background:#17334f;color:#fff}
      .interactive-copy-token:focus-visible{outline:3px solid rgba(56,189,248,.25);outline-offset:2px}
      .interactive-copy-token.is-copied{border-color:#22c55e;background:#0c3b2a;color:#bbf7d0}
      .interactive-copy-token i{font-size:.72em}
      .interactive-reference-token{display:inline;padding:0;border:0;background:transparent;color:#62d9ff!important;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.interactive-reference-token:hover{text-decoration:underline;text-underline-offset:3px}.interactive-reference-token.is-missing{color:#94a3b8!important}
    `;
    document.head.appendChild(style);
    document.addEventListener("click", async event => {
        const link = event.target.closest(".interactive-text-link");
        if (link) { event.stopPropagation(); return; }
        const mention = event.target.closest("[data-interactive-mention]");
        if (mention) {
            event.preventDefault(); event.stopPropagation();
            mention.disabled = true;
            try {
                const snapshot = await getDoc(doc(firebaseDatabase, "usernames", mention.dataset.interactiveMention));
                const uid = snapshot.data()?.uid;
                if (!uid) throw new Error("PROFILE_NOT_FOUND");
                const target = new URL("community/profile-user/user-profile.html", appRoot);
                target.searchParams.set("uid", uid);
                location.href = target.href;
            } catch (error) {
                mention.classList.add("is-missing");
                mention.title = "Không tìm thấy tài khoản này";
                console.warn("Không thể mở hồ sơ được nhắc tới", error);
            } finally { mention.disabled = false; }
            return;
        }
        const button = event.target.closest("[data-interactive-copy]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        try {
            await copyText(button.dataset.interactiveCopy || "");
            const original = button.innerHTML;
            button.classList.add("is-copied");
            button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Đã sao chép';
            window.setTimeout(() => { button.innerHTML = original; button.classList.remove("is-copied"); }, 1400);
        } catch (error) {
            console.error("Không thể sao chép nội dung", error);
        }
    }, true);
}
