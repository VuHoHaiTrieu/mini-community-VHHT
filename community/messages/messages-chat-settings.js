import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { uploadImage } from "../../shared/cloudinary-media-service.js";

const LEGACY_THEME = { default: "default-dark", love: "sunset", cute: "sakura", friendship: "forest" };
export const CHAT_THEMES = {
    "default-dark": { label: "Mặc định tối", icon: "fa-moon", vars: ["#07101d", "#091423", "#18263a", "#2563eb", "#06b6d4", "#e5edf8"] },
    ocean: { label: "Đại dương", icon: "fa-water", vars: ["#041521", "#082638", "#123e55", "#0284c7", "#22d3ee", "#e0f2fe"] },
    sunset: { label: "Hoàng hôn", icon: "fa-sun", vars: ["#211020", "#33172b", "#43213a", "#f97316", "#ec4899", "#fff1f2"] },
    cosmic: { label: "Vũ trụ", icon: "fa-shuttle-space", vars: ["#07091d", "#11143a", "#23245c", "#6366f1", "#a855f7", "#f5f3ff"] },
    aurora: { label: "Cực quang", icon: "fa-wand-magic-sparkles", vars: ["#061819", "#0b2b2b", "#16403e", "#10b981", "#8b5cf6", "#ecfdf5"] },
    forest: { label: "Rừng xanh", icon: "fa-tree", vars: ["#071610", "#10271d", "#1d3b2b", "#16a34a", "#84cc16", "#f0fdf4"] },
    sakura: { label: "Sakura", icon: "fa-seedling", vars: ["#21131d", "#351d30", "#4b2942", "#ec4899", "#f9a8d4", "#fff1f2"] },
    neon: { label: "Neon", icon: "fa-bolt", vars: ["#050913", "#0c1825", "#15293a", "#06b6d4", "#d946ef", "#ecfeff"] },
    "light-minimal": { label: "Sáng tối giản", icon: "fa-cloud-sun", vars: ["#eef4fb", "#ffffff", "#e2e8f0", "#2563eb", "#0891b2", "#172033"] },
    amoled: { label: "AMOLED", icon: "fa-circle-half-stroke", vars: ["#000000", "#070707", "#161616", "#7c3aed", "#22d3ee", "#f8fafc"] },
    lavender: { label: "Oải hương", icon: "fa-spa", vars: ["#171126", "#241a3a", "#392d54", "#8b5cf6", "#c084fc", "#faf5ff"] },
    coral: { label: "San hô", icon: "fa-fish", vars: ["#211113", "#351d20", "#4d292d", "#fb7185", "#f59e0b", "#fff7ed"] },
    mint: { label: "Bạc hà", icon: "fa-leaf", vars: ["#071a18", "#0d2b28", "#17413c", "#14b8a6", "#6ee7b7", "#ecfdf5"] },
    candy: { label: "Kẹo ngọt", icon: "fa-candy-cane", vars: ["#211326", "#351b3e", "#4c2858", "#d946ef", "#fb7185", "#fdf4ff"] },
    coffee: { label: "Cà phê", icon: "fa-mug-hot", vars: ["#18110d", "#291d16", "#3d2b21", "#a16207", "#f59e0b", "#fef3c7"] },
    ice: { label: "Băng giá", icon: "fa-snowflake", vars: ["#07131d", "#0c2232", "#18384d", "#0ea5e9", "#a5f3fc", "#eff6ff"] },
    ruby: { label: "Hồng ngọc", icon: "fa-gem", vars: ["#1d0810", "#310d19", "#4a1526", "#e11d48", "#fb7185", "#fff1f2"] },
    midnight: { label: "Nửa đêm", icon: "fa-star-and-crescent", vars: ["#02040d", "#070b1d", "#121a38", "#4338ca", "#60a5fa", "#e0e7ff"] }
};

const THEME_EMOJIS = { "default-dark":"👍", ocean:"🌊", sunset:"🌅", cosmic:"🚀", aurora:"✨", forest:"🌿", sakura:"🌸", neon:"⚡", "light-minimal":"☀️", amoled:"🖤", lavender:"💜", coral:"🐠", mint:"🍀", candy:"🍭", coffee:"☕", ice:"❄️", ruby:"💎", midnight:"🌙" };
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡", "🔥", "🎉", "🚀", "✨", "🌸", "🌊", "🌿", "⚡", "💜", "🖤", "☕", "🍀", "🍭", "💎", "🌙", "❄️", "🥰", "🤝", "👏", "💯", "✅", "👀", "🤗", "😎"];
const ACCENTS = [
    { color: "#38bdf8", label: "Xanh thiên thanh" }, { color: "#2563eb", label: "Xanh dương" },
    { color: "#4f46e5", label: "Chàm" }, { color: "#8b5cf6", label: "Tím" },
    { color: "#c026d3", label: "Tím hồng" }, { color: "#ec4899", label: "Hồng" },
    { color: "#f43f5e", label: "Đỏ hồng" }, { color: "#ef4444", label: "Đỏ" },
    { color: "#f97316", label: "Cam" }, { color: "#eab308", label: "Vàng" },
    { color: "#22c55e", label: "Xanh lá" }, { color: "#14b8a6", label: "Xanh ngọc" }
];
const esc = value => { const node = document.createElement("div"); node.textContent = String(value || ""); return node.innerHTML; };
const timeValue = value => typeof value?.toMillis === "function" ? value.toMillis() : value?.seconds ? value.seconds * 1000 : 0;
const debounce = (fn, delay = 320) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; };
const hslToHex = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return `#${[f(0),f(8),f(4)].map(value => Math.round(255 * value).toString(16).padStart(2,"0")).join("")}`; };
const thumbnailUrl = (url, type = "image") => String(url || "").includes("res.cloudinary.com")
    ? String(url).replace("/upload/", type === "video" ? "/upload/so_0,c_fill,w_240,h_240,q_auto,f_jpg/" : "/upload/c_fill,w_240,h_240,q_auto,f_auto/")
    : String(url || "");

export function createChatSettingsManager(options) {
    const { db, getContext, openMedia, openProfile, scrollToMessage, getDisplayName, getAvatar } = options;
    const panel = document.getElementById("chat-settings-panel");
    const chatPanel = document.querySelector(".chat-panel");
    const backdrop = document.querySelector(".chat-settings-backdrop");
    let privateSettings = {};
    let stopMemberSettings = null;
    let activeSettingsConversation = "";
    let draftTheme = "default-dark";
    let draftAccent = "";
    let previewObjectUrl = "";
    let activeBackgroundPreviewUrl = "";
    let backgroundUpload = null;
    let activeView = "home";
    let searchTerm = "";
    let restoreFocus = null;
    const migratedSharedBackgrounds = new Set();

    const context = () => getContext() || {};
    const conversationRef = () => {
        const state = context();
        return state.conversationId ? doc(db, "conversations", state.conversationId) : null;
    };
    const memberSettingsRef = () => {
        const state = context();
        return state.conversationId && state.me?.uid ? doc(db, "conversations", state.conversationId, "memberSettings", state.me.uid) : null;
    };
    const backgroundCacheKey = () => {
        const state = context();
        return state.conversationId && state.me?.uid ? `vhht-chat-background:${state.conversationId}:${state.me.uid}` : "";
    };
    function cacheBackgroundSettings(settings = privateSettings) {
        const key = backgroundCacheKey();
        if (!key) return;
        const value = {
            customBackgroundImageUrl: settings.customBackgroundImageUrl || null,
            customBackgroundPublicId: settings.customBackgroundPublicId || null,
            customBackgroundFormat: settings.customBackgroundFormat || null,
            customBackgroundBytes: settings.customBackgroundBytes || null,
            customBackgroundWidth: settings.customBackgroundWidth || null,
            customBackgroundHeight: settings.customBackgroundHeight || null,
            customBackgroundEmoji: settings.customBackgroundEmoji || "👍",
            backgroundOverlay: Number(settings.backgroundOverlay ?? .24),
            backgroundBlur: Number(settings.backgroundBlur || 0),
            backgroundFit: settings.backgroundFit === "contain" ? "contain" : "cover"
        };
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
    function readBackgroundSettingsCache() {
        const key = backgroundCacheKey();
        if (!key) return {};
        try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; }
    }
    async function ensureConversation() {
        const state = context(), ref = conversationRef();
        if (!ref || !state.me?.uid || !state.friend?.id) throw new Error("Chưa chọn cuộc trò chuyện.");
        await setDoc(ref, { members: [state.me.uid, state.friend.id], updatedAt: serverTimestamp() }, { merge: true });
    }

    async function announceChange(kind, text, detail = {}) {
        const state = context();
        if (!state.conversationId || !state.me?.uid || !state.friend?.id) return;
        await addDoc(collection(db, "conversations", state.conversationId, "messages"), {
            senderId: state.me.uid,
            recipientId: state.friend.id,
            content: `${getDisplayName(state.ownProfile || state.me)} ${text}`,
            systemEvent: { kind, actorId: state.me.uid, ...detail },
            createdAt: serverTimestamp(),
            readAt: null
        });
    }

    function normalizeAppearance(data = {}) {
        const legacy = LEGACY_THEME[data.theme] || data.theme;
        const shared = data.appearance || {};
        return {
            themeId: shared.themeId || legacy || "default-dark",
            accentColor: shared.accentColor || "",
            defaultEmoji: shared.defaultEmoji || THEME_EMOJIS[shared.themeId || legacy] || "👍",
            customBackgroundImageUrl: shared.customBackgroundImageUrl || null,
            customBackgroundPublicId: shared.customBackgroundPublicId || null,
            customBackgroundFormat: shared.customBackgroundFormat || null,
            customBackgroundBytes: shared.customBackgroundBytes || null,
            customBackgroundWidth: shared.customBackgroundWidth || null,
            customBackgroundHeight: shared.customBackgroundHeight || null,
            customBackgroundEmoji: shared.customBackgroundEmoji || "👍",
            backgroundOverlay: Number(shared.backgroundOverlay ?? .24),
            backgroundBlur: Number(shared.backgroundBlur || 0),
            backgroundFit: shared.backgroundFit === "contain" ? "contain" : "cover"
        };
    }

    function applyAppearance(appearance = normalizeAppearance(context().conversation || {})) {
        const backgroundUrl = activeBackgroundPreviewUrl || appearance.customBackgroundImageUrl || "";
        const hasSharedBackground = Boolean(backgroundUrl);
        chatPanel.classList.toggle("has-custom-background", hasSharedBackground);
        const theme = hasSharedBackground ? CHAT_THEMES["default-dark"] : (CHAT_THEMES[appearance.themeId] || CHAT_THEMES["default-dark"]);
        const [canvas, surface, incoming, accentA, accentB, text] = theme.vars;
        const accent = appearance.accentColor || accentA;
        chatPanel.dataset.chatTheme = appearance.themeId;
        chatPanel.style.setProperty("--chat-canvas", canvas);
        chatPanel.style.setProperty("--chat-surface", surface);
        chatPanel.style.setProperty("--chat-incoming", incoming);
        chatPanel.style.setProperty("--chat-accent-a", accent);
        chatPanel.style.setProperty("--chat-accent-b", accentB);
        chatPanel.style.setProperty("--chat-text", text);
        chatPanel.style.setProperty("--chat-shell-top", surface);
        chatPanel.style.setProperty("--chat-shell-bottom", canvas);
        chatPanel.style.setProperty("--chat-shell-border", `${accent}66`);
        chatPanel.style.setProperty("--chat-shell-glow", `${accent}28`);
        chatPanel.style.setProperty("--chat-accent-shadow", `${accent}52`);
        chatPanel.style.setProperty("--chat-control-surface", `${surface}e6`);
        chatPanel.style.setProperty("--chat-control-text", text);
        chatPanel.style.setProperty("--chat-custom-bg", backgroundUrl ? `url(\"${String(backgroundUrl).replaceAll('"', '%22')}\")` : "none");
        chatPanel.style.setProperty("--chat-bg-overlay", String(Math.max(0, Math.min(.9, Number(appearance.backgroundOverlay ?? .24)))));
        chatPanel.style.setProperty("--chat-bg-blur", `${Math.max(0, Math.min(18, Number(appearance.backgroundBlur || 0)))}px`);
        chatPanel.style.setProperty("--chat-bg-fit", appearance.backgroundFit === "contain" ? "contain" : "cover");
        document.documentElement.style.setProperty("--active-chat-emoji", `"${appearance.defaultEmoji}"`);
        const activeEmoji = hasSharedBackground ? (appearance.customBackgroundEmoji || "👍") : appearance.defaultEmoji;
        const quickEmoji = document.getElementById("quick-chat-emoji");
        if (quickEmoji) { quickEmoji.textContent = activeEmoji; quickEmoji.setAttribute("aria-label", `Gửi nhanh ${activeEmoji}`); }
    }

    function toast(message, type = "info") {
        let stack = document.querySelector(".chat-settings-toast-stack");
        if (!stack) { stack = document.createElement("div"); stack.className = "chat-settings-toast-stack"; document.body.appendChild(stack); }
        const item = document.createElement("div");
        item.className = `chat-settings-toast ${type}`;
        item.setAttribute("role", "status");
        item.innerHTML = `<i class="fa-solid ${type === "error" ? "fa-triangle-exclamation" : type === "success" ? "fa-circle-check" : "fa-circle-info"}"></i><span>${esc(message)}</span>`;
        stack.appendChild(item);
        requestAnimationFrame(() => item.classList.add("show"));
        setTimeout(() => { item.classList.remove("show"); setTimeout(() => item.remove(), 220); }, 3200);
    }

    function header(title, subtitle = "", showBack = true) {
        const leading = showBack ? `<button type="button" class="settings-back" data-settings-back aria-label="Quay lại"><i class="fa-solid fa-arrow-left"></i></button>` : "";
        return `<header class="settings-panel-header ${showBack ? "" : "settings-panel-header-home"}">${leading}<div><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ""}</div><button type="button" class="settings-close" data-chat-settings-close aria-label="Đóng cài đặt"><i class="fa-solid fa-xmark"></i></button></header>`;
    }

    function homeMarkup() {
        const state = context(), friend = state.friend || {};
        const displayName = getDisplayName(friend);
        return `${header("Cài đặt đoạn chat", "Tùy chỉnh cuộc trò chuyện này", false)}
          <div class="settings-panel-scroll">
            <section class="settings-contact-card"><img src="${esc(getAvatar(friend))}" alt=""><strong>${esc(displayName)}</strong><small>${esc(friend.activityLabel || "Cuộc trò chuyện riêng")}</small>
              <div class="settings-quick-actions">
                <button type="button" data-settings-view="search"><i class="fa-solid fa-magnifying-glass"></i><span>Tìm kiếm</span></button>
                <button type="button" data-settings-view="members"><i class="fa-solid fa-user-group"></i><span>Thành viên</span></button>
                <button type="button" data-settings-view="notifications"><i class="fa-solid fa-bell"></i><span>Thông báo</span></button>
              </div>
            </section>
            ${accordion("info", "Thông tin đoạn chat", "fa-circle-info", [
                ["members", "Thành viên", "fa-user-group"], ["search", "Tìm trong cuộc trò chuyện", "fa-magnifying-glass"], ["media", "Ảnh, video và liên kết", "fa-photo-film"]
            ])}
            ${accordion("customize", "Tùy chỉnh đoạn chat", "fa-wand-magic-sparkles", [
                ["themes", "Chủ đề và nền", "fa-palette"], ["emoji", "Emoji nhanh", "fa-face-smile"], ["nicknames", "Biệt danh", "fa-user-pen"]
            ])}
            ${accordion("alerts", "Thông báo", "fa-bell", [["notifications", "Tắt hoặc bật thông báo", "fa-bell-slash"]])}
          </div>`;
    }

    function accordion(id, title, icon, items) {
        return `<section class="settings-accordion" data-accordion="${id}"><button type="button" class="settings-accordion-trigger" aria-expanded="false"><span><i class="fa-solid ${icon}"></i>${esc(title)}</span><i class="fa-solid fa-chevron-down"></i></button><div class="settings-accordion-content" hidden>${items.map(([view, label, itemIcon]) => `<button type="button" data-settings-view="${view}"><i class="fa-solid ${itemIcon}"></i><span>${esc(label)}</span><i class="fa-solid fa-chevron-right"></i></button>`).join("")}</div></section>`;
    }

    function renderHome() { activeView = "home"; panel.innerHTML = homeMarkup(); bindCommon(); }

    function renderMembers() {
        const state = context(), people = [state.ownProfile || state.me, state.friend].filter(Boolean);
        panel.innerHTML = `${header("Thành viên", `${people.length} người trong cuộc trò chuyện`)}<div class="settings-panel-scroll"><div class="settings-members">${people.map(person => `<button type="button" class="settings-member" data-member-id="${esc(person.uid || person.id)}"><img src="${esc(getAvatar(person))}" alt=""><span><strong>${esc(getDisplayName(person))}</strong><small>${(person.uid || person.id) === state.me?.uid ? "Bạn" : "Thành viên"}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join("")}</div></div>`;
        bindCommon();
        panel.querySelectorAll("[data-member-id]").forEach(button => button.onclick = () => openProfile?.(button.dataset.memberId));
    }

    function renderSearch() {
        panel.innerHTML = `${header("Tìm trong cuộc trò chuyện", "Tìm trong các tin nhắn đã tải")}<div class="settings-panel-scroll"><label class="settings-message-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" value="${esc(searchTerm)}" placeholder="Nhập nội dung cần tìm…" autocomplete="off"><button type="button" aria-label="Xóa tìm kiếm"><i class="fa-solid fa-xmark"></i></button></label><div class="settings-search-results" aria-live="polite"></div></div>`;
        bindCommon();
        const input = panel.querySelector(".settings-message-search input"), clear = panel.querySelector(".settings-message-search button");
        const run = debounce(() => { searchTerm = input.value.trim(); renderSearchResults(); }, 300);
        input.addEventListener("input", run);
        clear.onclick = () => { input.value = ""; searchTerm = ""; renderSearchResults(); input.focus(); };
        renderSearchResults();
        setTimeout(() => input.focus(), 80);
    }

    function renderSearchResults() {
        const container = panel.querySelector(".settings-search-results"); if (!container) return;
        const term = searchTerm.toLocaleLowerCase("vi");
        if (!term) { container.innerHTML = '<p class="settings-empty"><i class="fa-regular fa-keyboard"></i>Nhập từ khóa để tìm tin nhắn.</p>'; return; }
        const results = (context().messages || []).filter(message => !message.revoked && !message.hiddenFor?.includes(context().me?.uid) && String(message.content || "").toLocaleLowerCase("vi").includes(term));
        if (!results.length) { container.innerHTML = '<p class="settings-empty"><i class="fa-solid fa-magnifying-glass"></i>Không tìm thấy tin nhắn phù hợp.</p>'; return; }
        container.innerHTML = results.map(message => { const raw = String(message.content || ""); const index = raw.toLocaleLowerCase("vi").indexOf(term); const marked = `${esc(raw.slice(0,index))}<mark>${esc(raw.slice(index,index+searchTerm.length))}</mark>${esc(raw.slice(index+searchTerm.length))}`; return `<button type="button" class="settings-search-result" data-message-id="${esc(message.id)}"><span>${marked}</span><small>${new Date(timeValue(message.createdAt) || Date.now()).toLocaleString("vi-VN")}</small></button>`; }).join("");
        container.querySelectorAll("[data-message-id]").forEach(button => button.onclick = () => { close(); scrollToMessage(button.dataset.messageId); });
    }

    function renderThemes() {
        const appearance = normalizeAppearance(context().conversation || {});
        draftTheme = appearance.themeId; draftAccent = appearance.accentColor;
        panel.innerHTML = `${header("Chủ đề và nền", "Xem trước trước khi áp dụng")}<div class="settings-panel-scroll"><div class="settings-theme-grid">${Object.entries(CHAT_THEMES).map(([id, theme]) => `<button type="button" class="settings-theme-card ${!privateSettings.customBackgroundImageUrl && draftTheme === id ? "active" : ""}" data-theme-id="${id}" style="--preview-a:${theme.vars[3]};--preview-b:${theme.vars[4]};--preview-bg:${theme.vars[0]}"><span><i class="fa-solid ${theme.icon}"></i></span><strong>${esc(theme.label)}</strong><em>${THEME_EMOJIS[id] || "👍"}</em><i class="fa-solid fa-check"></i></button>`).join("")}<button type="button" class="settings-theme-card settings-custom-theme ${privateSettings.customBackgroundImageUrl ? "active" : ""}" data-custom-background><span><i class="fa-solid fa-image"></i></span><strong>Ảnh của bạn</strong><em>📷</em><i class="fa-solid fa-check"></i></button></div><div class="settings-accent-heading"><div><h3 class="settings-subtitle">Màu nhấn</h3><small>Chọn màu có sẵn hoặc tự phối màu của bạn</small></div><button type="button" class="settings-custom-accent" data-toggle-custom-accent><i class="fa-solid fa-droplet"></i><span>Tùy chỉnh</span></button></div><div class="settings-custom-accent-editor" data-custom-accent-editor hidden><span class="custom-accent-preview" style="--custom-color:${draftAccent || "#38bdf8"}"></span><label><span>Sắc độ</span><input type="range" min="0" max="360" value="195" data-accent-hue></label><label><span>Độ đậm</span><input type="range" min="25" max="100" value="82" data-accent-saturation></label><label><span>Độ sáng</span><input type="range" min="28" max="72" value="58" data-accent-lightness></label><output data-accent-hex>${draftAccent || "#38bdf8"}</output></div><div class="settings-accent-list">${ACCENTS.map(({color,label}) => `<button type="button" data-accent="${color}" style="--accent:${color}" class="${draftAccent.toLowerCase() === color ? "active" : ""}" aria-label="${esc(label)}" title="${esc(label)}"><i class="fa-solid fa-check"></i></button>`).join("")}</div></div><footer class="settings-panel-footer"><button type="button" class="settings-secondary" data-cancel-theme>Hủy</button><button type="button" class="settings-secondary" data-reset-theme>Mặc định</button><button type="button" class="settings-primary" data-save-theme>Áp dụng</button></footer>`;
        bindCommon();
        panel.querySelectorAll("[data-theme-id]").forEach(button => button.onclick = () => { draftTheme = button.dataset.themeId; panel.querySelectorAll("[data-theme-id]").forEach(item => item.classList.toggle("active", item === button)); applyAppearance({ ...appearance, themeId: draftTheme, accentColor: draftAccent, defaultEmoji: THEME_EMOJIS[draftTheme] }, privateSettings); });
        panel.querySelector("[data-custom-background]").onclick = () => renderBackgroundEnhanced();
        panel.querySelectorAll("[data-accent]").forEach(button => button.onclick = () => { draftAccent = button.dataset.accent; panel.querySelectorAll("[data-accent]").forEach(item => item.classList.toggle("active", item === button)); applyAppearance({ ...appearance, themeId: draftTheme, accentColor: draftAccent }); });
        const customEditor=panel.querySelector("[data-custom-accent-editor]"),syncCustomAccent=()=>{const hue=Number(panel.querySelector("[data-accent-hue]").value),saturation=Number(panel.querySelector("[data-accent-saturation]").value),lightness=Number(panel.querySelector("[data-accent-lightness]").value);draftAccent=hslToHex(hue,saturation,lightness);customEditor.querySelector(".custom-accent-preview").style.setProperty("--custom-color",draftAccent);customEditor.querySelector("[data-accent-hex]").textContent=draftAccent.toUpperCase();panel.querySelectorAll("[data-accent]").forEach(item=>item.classList.remove("active"));applyAppearance({...appearance,themeId:draftTheme,accentColor:draftAccent})};
        panel.querySelector("[data-toggle-custom-accent]").onclick=()=>{customEditor.hidden=!customEditor.hidden};customEditor.querySelectorAll("input").forEach(input=>input.oninput=syncCustomAccent);
        panel.querySelector("[data-reset-theme]").onclick = () => { draftTheme = "default-dark"; draftAccent = ""; panel.querySelectorAll("[data-theme-id]").forEach(item => item.classList.toggle("active", item.dataset.themeId === draftTheme)); panel.querySelectorAll("[data-accent]").forEach(item => item.classList.remove("active")); applyAppearance({ ...appearance, themeId: draftTheme, accentColor: draftAccent }); };
        panel.querySelector("[data-cancel-theme]").onclick = () => { applyAppearance(appearance); renderHome(); };
        panel.querySelector("[data-save-theme]").onclick = async event => {
            const button = event.currentTarget;
            try {
                await ensureConversation();
                await saveSharedAppearance(button, { ...appearance, themeId: draftTheme, accentColor: draftAccent, defaultEmoji: THEME_EMOJIS[draftTheme] || appearance.defaultEmoji });
                const themeChanged = draftTheme !== appearance.themeId;
                const accentChanged = draftAccent.toLowerCase() !== String(appearance.accentColor || "").toLowerCase();
                if (themeChanged) await announceChange("theme", `đã đổi chủ đề đoạn chat thành ${CHAT_THEMES[draftTheme]?.label || "Mặc định"}`, { themeId: draftTheme });
                if (accentChanged) {
                    const preset = ACCENTS.find(item => item.color === draftAccent.toLowerCase());
                    await announceChange("accent", `đã đổi màu nhấn thành ${preset?.label || "màu tùy chọn"}`, { accentColor: draftAccent, accentName: preset?.label || "Tùy chọn" });
                }
            } catch (error) { toast(error.message || "Không thể áp dụng chủ đề.", "error"); }
        };
    }

    async function saveSharedAppearance(button, appearance) {
        const ref = conversationRef(); if (!ref) return;
        button.disabled = true;
        try { const state=context(); await setDoc(ref, { members:[state.me.uid,state.friend.id], appearance: { ...appearance, updatedAt: serverTimestamp(), updatedBy: state.me.uid }, updatedAt: serverTimestamp() }, { merge: true }); toast("Đã cập nhật cài đặt chung.", "success"); }
        catch (error) { toast(error.message || "Không thể lưu cài đặt.", "error"); applyAppearance(); }
        finally { button.disabled = false; }
    }

    function renderEmoji() {
        const appearance = normalizeAppearance(context().conversation || {});
        panel.innerHTML = `${header("Emoji mặc định", "Dùng làm phản hồi nhanh trong đoạn chat")}<div class="settings-panel-scroll"><div class="settings-emoji-grid">${EMOJIS.map(emoji => `<button type="button" data-emoji="${emoji}" class="${appearance.defaultEmoji === emoji ? "active" : ""}">${emoji}<i class="fa-solid fa-check"></i></button>`).join("")}</div></div>`;
        bindCommon(); panel.querySelectorAll("[data-emoji]").forEach(button => button.onclick = async () => { await saveSharedAppearance(button, { ...appearance, defaultEmoji: button.dataset.emoji }); });
    }

    function renderNicknames() {
        const state = context(), nicknames = state.conversation?.nicknames || {};
        const people = [state.ownProfile || state.me, state.friend].filter(Boolean);
        panel.innerHTML = `${header("Biệt danh", "Đổi riêng cho từng người trong đoạn chat")}<form class="settings-nickname-form"><div class="settings-panel-scroll"><p class="settings-helper"><i class="fa-solid fa-circle-info"></i> Có thể đổi hoặc xóa từng biệt danh độc lập.</p>${people.map(person => { const id = person.uid || person.id; return `<div class="settings-nickname-field"><img src="${esc(getAvatar(person))}" alt=""><label><small>${esc(getDisplayName(person))}</small><input data-nickname-id="${esc(id)}" maxlength="40" value="${esc(nicknames[id] || "")}" placeholder="Nhập biệt danh"></label><button type="button" data-clear-nickname="${esc(id)}" aria-label="Xóa biệt danh của ${esc(getDisplayName(person))}"><i class="fa-solid fa-rotate-left"></i></button></div>`; }).join("")}</div><footer class="settings-panel-footer"><button type="button" class="settings-secondary" data-cancel-nicknames>Hủy</button><button type="submit" class="settings-primary"><i class="fa-solid fa-check"></i> Lưu thay đổi</button></footer></form>`;
        bindCommon();
        panel.querySelectorAll("[data-clear-nickname]").forEach(button => button.onclick = () => { const input = panel.querySelector(`[data-nickname-id="${CSS.escape(button.dataset.clearNickname)}"]`); input.value = ""; input.focus(); });
        panel.querySelector("[data-cancel-nicknames]").onclick = () => renderHome();
        panel.querySelector("form").onsubmit = async event => { event.preventDefault(); const values = { ...nicknames }; panel.querySelectorAll("[data-nickname-id]").forEach(input => { const value = input.value.trim(); if (value) values[input.dataset.nicknameId] = value; else delete values[input.dataset.nicknameId]; }); const button = event.submitter || panel.querySelector(".settings-nickname-form .settings-primary"); button.disabled = true; try { const state=context(); await setDoc(conversationRef(), { members:[state.me.uid,state.friend.id], nicknames: values, updatedAt: serverTimestamp() }, { merge: true }); toast("Biệt danh đã được đồng bộ cho cả hai người.", "success"); renderHome(); } catch (error) { toast(error.message || "Không thể lưu biệt danh.", "error"); } finally { button.disabled = false; } };
    }

    function mediaItems() {
        return (context().messages || []).filter(message => !message.revoked && !message.hiddenFor?.includes(context().me?.uid)).flatMap(message => {
            const items = [];
            if (message.mediaUrl) {
                const type = message.mediaType === "video" ? "video" : message.mediaType === "file" ? "file" : "image";
                items.push({ id: message.id, url: message.mediaUrl, type, name: message.fileName || "Tệp đã gửi", senderId: message.senderId, createdAt: message.createdAt });
            }
            const urlPattern = /https?:\/\/[^\s]+/g; (String(message.content || "").match(urlPattern) || []).forEach(url => items.push({ id: message.id, url, type: "link", senderId: message.senderId, createdAt: message.createdAt }));
            return items;
        });
    }

    function renderMedia(filter = "all", sender = "all", period = "all") {
        const state = context(), cutoff = period === "7d" ? Date.now()-604800000 : period === "30d" ? Date.now()-2592000000 : 0;
        const items = mediaItems().filter(item => (filter === "all" || item.type === filter) && (sender === "all" || item.senderId === sender) && (!cutoff || timeValue(item.createdAt) >= cutoff));
        panel.innerHTML = `${header("Ảnh, video, tệp và liên kết", "Nội dung đã gửi trong đoạn chat")}<div class="settings-panel-scroll"><div class="settings-media-tabs"><button data-media-filter="all">Tất cả</button><button data-media-filter="image">Ảnh</button><button data-media-filter="video">Video</button><button data-media-filter="file">Tệp</button><button data-media-filter="link">Liên kết</button></div><div class="settings-media-filters"><select data-media-sender aria-label="Lọc theo người gửi"><option value="all">Mọi người gửi</option><option value="${esc(state.me.uid)}" ${sender===state.me.uid?"selected":""}>Bạn gửi</option><option value="${esc(state.friend.id)}" ${sender===state.friend.id?"selected":""}>${esc(getDisplayName(state.friend))} gửi</option></select><select data-media-period aria-label="Lọc theo thời gian"><option value="all">Mọi thời gian</option><option value="7d" ${period==="7d"?"selected":""}>7 ngày qua</option><option value="30d" ${period==="30d"?"selected":""}>30 ngày qua</option></select></div><div class="settings-media-grid">${items.length ? items.map((item,index) => item.type === "link" ? `<a href="${esc(item.url)}" target="_blank" rel="noopener" class="settings-link-item"><i class="fa-solid fa-link"></i><span>${esc(item.url)}</span></a>` : item.type === "file" ? `<a href="${esc(item.url)}" target="_blank" rel="noopener" class="settings-file-item"><i class="fa-solid fa-file-arrow-down"></i><span>${esc(item.name)}</span></a>` : `<button type="button" data-media-index="${index}" class="settings-media-item">${item.type === "video" ? `<img loading="lazy" src="${esc(thumbnailUrl(item.url,"video"))}" alt="Khung hình video"><i class="fa-solid fa-play"></i>` : `<img loading="lazy" src="${esc(thumbnailUrl(item.url))}" alt="Ảnh đã gửi">`}</button>`).join("") : '<p class="settings-empty"><i class="fa-regular fa-images"></i>Chưa có nội dung trong mục này.</p>'}</div></div>`;
        bindCommon();
        panel.querySelectorAll("[data-media-filter]").forEach(button => { button.classList.toggle("active", button.dataset.mediaFilter === filter); button.onclick = () => renderMedia(button.dataset.mediaFilter, sender, period); });
        panel.querySelector("[data-media-sender]").onchange = event => renderMedia(filter, event.target.value, period);
        panel.querySelector("[data-media-period]").onchange = event => renderMedia(filter, sender, event.target.value);
        panel.querySelectorAll("[data-media-index]").forEach(button => button.onclick = () => { const item = items[Number(button.dataset.mediaIndex)]; openMedia(item.url, item.type); });
    }

    function renderBackground() {
        const appearance = normalizeAppearance(context().conversation || {});
        // The editor reads the shared conversation appearance. The local alias keeps
        // the existing template concise while preventing member-only backgrounds.
        const privateSettings = appearance;
        panel.innerHTML = `${header("Ảnh nền của bạn", "Xem trực tiếp trước khi xác nhận")}<div class="settings-panel-scroll"><div class="settings-background-preview ${privateSettings.customBackgroundImageUrl ? "has-image" : ""}" style="--preview-image:${privateSettings.customBackgroundImageUrl ? `url('${esc(privateSettings.customBackgroundImageUrl)}')` : "none"}"><div class="settings-background-mock"><span>Xin chào 👋</span><span>Ảnh nền sẽ hiển thị như thế này</span></div></div><label class="settings-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp"><i class="fa-solid fa-cloud-arrow-up"></i><span>Chọn ảnh từ thiết bị<small>JPEG, PNG hoặc WebP · tối đa 5 MB</small></span></label><label class="settings-select"><span>Emoji nhanh khi dùng ảnh nền</span><select data-bg-emoji>${EMOJIS.map(emoji => `<option value="${emoji}" ${(privateSettings.customBackgroundEmoji || "👍") === emoji ? "selected" : ""}>${emoji}</option>`).join("")}</select></label><div class="settings-upload-progress" hidden><span></span><small>0%</small><button type="button" data-cancel-background-upload>Hủy</button></div><label class="settings-range"><span>Độ tối lớp phủ <b>${Math.round(Number(privateSettings.backgroundOverlay ?? .24)*100)}%</b></span><input type="range" min="0" max="80" value="${Math.round(Number(privateSettings.backgroundOverlay ?? .24)*100)}" data-bg-overlay></label><label class="settings-range"><span>Độ mờ <b>${Number(privateSettings.backgroundBlur || 0)}px</b></span><input type="range" min="0" max="18" value="${Number(privateSettings.backgroundBlur || 0)}" data-bg-blur></label><label class="settings-select"><span>Cách hiển thị</span><select data-bg-fit><option value="cover" ${privateSettings.backgroundFit !== "contain" ? "selected" : ""}>Phủ đầy</option><option value="contain" ${privateSettings.backgroundFit === "contain" ? "selected" : ""}>Hiện toàn ảnh</option></select></label></div><footer class="settings-panel-footer"><button type="button" class="settings-secondary danger" data-remove-background>Khôi phục mặc định</button><button type="button" class="settings-primary" data-save-background>Dùng ảnh nền</button></footer>`;
        bindCommon();
        panel.querySelector("[data-settings-back]").onclick = () => { if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = ""; } activeBackgroundPreviewUrl = ""; backgroundUpload = null; applyAppearance(); renderThemes(); };
        const fileInput = panel.querySelector("input[type=file]");
        fileInput.onchange = () => { const file = fileInput.files?.[0]; if (!file) return; if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = URL.createObjectURL(file); activeBackgroundPreviewUrl = previewObjectUrl; backgroundUpload = { file }; const preview = panel.querySelector(".settings-background-preview"); preview.classList.add("has-image"); preview.style.setProperty("--preview-image", `url('${previewObjectUrl}')`); updatePreview(); };
        const updatePreview = () => { const overlay = Number(panel.querySelector("[data-bg-overlay]").value)/100, blur = Number(panel.querySelector("[data-bg-blur]").value), fit = panel.querySelector("[data-bg-fit]").value, customBackgroundEmoji = panel.querySelector("[data-bg-emoji]").value, preview = panel.querySelector(".settings-background-preview"); panel.querySelector("[data-bg-overlay]").previousElementSibling.querySelector("b").textContent = `${Math.round(overlay*100)}%`; panel.querySelector("[data-bg-blur]").previousElementSibling.querySelector("b").textContent = `${blur}px`; preview.style.setProperty("--preview-fit", fit); preview.style.setProperty("--preview-overlay", String(overlay)); preview.style.setProperty("--preview-blur", `${blur}px`); applyAppearance({ ...appearance, customBackgroundImageUrl: previewObjectUrl || appearance.customBackgroundImageUrl, customBackgroundEmoji, backgroundOverlay: overlay, backgroundBlur: blur, backgroundFit: fit }); };
        panel.querySelectorAll("[data-bg-overlay],[data-bg-blur],[data-bg-fit],[data-bg-emoji]").forEach(input => input.oninput = updatePreview);
        panel.querySelector("[data-remove-background]").onclick = async event => {
            event.currentTarget.disabled = true;
            try {
                await ensureConversation();
                const reset = { customBackgroundImageUrl: null, customBackgroundPublicId: null, customBackgroundFormat: null, customBackgroundBytes: null, customBackgroundWidth: null, customBackgroundHeight: null, customBackgroundEmoji: "👍", backgroundOverlay: .24, backgroundBlur: 0, backgroundFit: "cover", updatedAt: serverTimestamp() };
                await setDoc(conversationRef(), { appearance: reset }, { merge: true });
                activeBackgroundPreviewUrl = "";
                applyAppearance();
                toast("Đã khôi phục chủ đề hệ thống.", "success");
                renderThemes();
            } catch (error) { toast(error.message || "Không thể đặt lại nền.", "error"); }
            finally { event.currentTarget.disabled = false; }
        };
        panel.querySelector("[data-save-background]").onclick = saveBackground;
        panel.querySelector("[data-cancel-background-upload]").onclick = () => backgroundUpload?.controller?.abort();
    }

    async function saveBackground(event) {
        const button = event.currentTarget, progress = panel.querySelector(".settings-upload-progress"); button.disabled = true;
        try {
            let uploaded = null;
            if (backgroundUpload?.file) { progress.hidden = false; backgroundUpload.controller = new AbortController(); uploaded = await uploadImage(backgroundUpload.file, value => { progress.querySelector("span").style.width = `${value}%`; progress.querySelector("small").textContent = `${value}%`; }, { signal: backgroundUpload.controller.signal }); }
            const appearance = normalizeAppearance(context().conversation || {});
            const payload = { customBackgroundImageUrl: uploaded?.mediaUrl || appearance.customBackgroundImageUrl || null, customBackgroundPublicId: uploaded?.mediaPublicId || appearance.customBackgroundPublicId || null, customBackgroundFormat: uploaded?.mediaFormat || appearance.customBackgroundFormat || null, customBackgroundBytes: uploaded?.mediaBytes || appearance.customBackgroundBytes || null, customBackgroundWidth: uploaded?.mediaWidth || appearance.customBackgroundWidth || null, customBackgroundHeight: uploaded?.mediaHeight || appearance.customBackgroundHeight || null, customBackgroundEmoji: panel.querySelector("[data-bg-emoji]").value, backgroundOverlay: Number(panel.querySelector("[data-bg-overlay]").value)/100, backgroundBlur: Number(panel.querySelector("[data-bg-blur]").value), backgroundFit: panel.querySelector("[data-bg-fit]").value };
            applyAppearance({ ...appearance, ...payload });
            await ensureConversation();
            await setDoc(conversationRef(), { appearance: { ...appearance, ...payload, updatedAt: serverTimestamp(), updatedBy: context().me.uid } }, { merge: true });
            backgroundUpload = null;
            if (previewObjectUrl && payload.customBackgroundImageUrl) {
                const persistedImage = new Image();
                persistedImage.src = payload.customBackgroundImageUrl;
                await new Promise(resolve => { persistedImage.onload = resolve; persistedImage.onerror = resolve; });
            }
            activeBackgroundPreviewUrl = "";
            applyAppearance();
            if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = ""; }
            announceChange("background", "đã thay đổi ảnh nền cuộc trò chuyện").catch(console.warn);
            toast("Đã lưu nền của bạn.", "success");
            renderThemes();
        } catch (error) { toast(error.message || "Không thể lưu nền.", "error"); }
        finally { button.disabled = false; }
    }

    function renderNotifications() {
        const now = Date.now(), mutedUntil = timeValue(privateSettings.mutedUntil), current = mutedUntil > now ? mutedUntil : 0;
        const choices = [[0,"Bật thông báo"],[3600000,"Tắt trong 1 giờ"],[28800000,"Tắt trong 8 giờ"],[86400000,"Tắt trong 24 giờ"],[315360000000,"Tắt đến khi bật lại"]];
        panel.innerHTML = `${header("Thông báo", current ? `Đang tắt đến ${new Date(current).toLocaleString("vi-VN")}` : "Bạn đang nhận thông báo")}<div class="settings-panel-scroll"><div class="settings-choice-list">${choices.map(([duration,label]) => `<button type="button" data-mute-duration="${duration}"><span><i class="fa-solid ${duration ? "fa-bell-slash" : "fa-bell"}"></i><strong>${label}</strong></span><i class="fa-solid fa-chevron-right"></i></button>`).join("")}</div></div>`;
        bindCommon(); panel.querySelectorAll("[data-mute-duration]").forEach(button => button.onclick = async () => { button.disabled = true; const duration = Number(button.dataset.muteDuration); try { await ensureConversation(); const mutedUntil = duration ? new Date(Date.now()+duration) : null; await setDoc(memberSettingsRef(), { mutedUntil, updatedAt: serverTimestamp() }, { merge: true }); document.dispatchEvent(new CustomEvent("chat-mute-updated", { detail: { conversationId: context().conversationId, friendId: context().friend?.id, muted: Boolean(duration), mutedUntil: mutedUntil?.getTime?.() || 0 } })); toast(duration ? "Đã tắt thông báo cuộc trò chuyện." : "Đã bật thông báo.", "success"); renderHome(); } catch (error) { toast(error.message || "Không thể cập nhật thông báo.", "error"); } finally { button.disabled = false; } });
    }

    function renderEmojiEnhanced() {
        const appearance = normalizeAppearance(context().conversation || {});
        panel.innerHTML = `${header("Cảm xúc nhanh", "Chạm một biểu tượng để dùng cho nút gửi nhanh")}
          <div class="settings-panel-scroll">
            <section class="settings-emoji-hero"><span>${appearance.defaultEmoji}</span><div><strong>Cảm xúc đang dùng</strong><small>Cả hai thành viên sẽ nhìn thấy thay đổi</small></div></section>
            <div class="settings-emoji-grid settings-emoji-grid-pro">${EMOJIS.map(emoji => `<button type="button" data-emoji="${emoji}" class="${appearance.defaultEmoji === emoji ? "active" : ""}" aria-label="Chọn ${emoji}"><span>${emoji}</span><i class="fa-solid fa-check"></i></button>`).join("")}</div>
          </div>`;
        bindCommon();
        panel.querySelectorAll("[data-emoji]").forEach(button => button.onclick = async () => {
            const emoji = button.dataset.emoji;
            await saveSharedAppearance(button, { ...appearance, defaultEmoji: emoji });
            await announceChange("quick_emoji", `đã đổi cảm xúc nhanh thành ${emoji}`, { emoji });
        });
    }

    function renderNicknamesEnhanced() {
        const state = context(), nicknames = state.conversation?.nicknames || {};
        const people = [state.ownProfile || state.me, state.friend].filter(Boolean);
        panel.innerHTML = `${header("Biệt danh", "Đặt tên riêng cho từng người trong đoạn chat")}
          <form class="settings-nickname-form"><div class="settings-panel-scroll">
            <div class="nickname-editor-list">${people.map(person => {
                const id = person.uid || person.id, original = getDisplayName(person), nickname = nicknames[id] || "";
                return `<article class="settings-nickname-field" data-person-id="${esc(id)}"><div class="nickname-avatar-wrap"><img src="${esc(getAvatar(person))}" alt=""><i class="fa-solid fa-pen"></i></div><label><span><strong>${esc(original)}</strong><small>${nickname ? `Đang hiển thị: ${esc(nickname)}` : "Đang dùng tên gốc"}</small></span><div class="nickname-input-wrap"><input data-nickname-id="${esc(id)}" data-original-value="${esc(nickname)}" maxlength="40" value="${esc(nickname)}" placeholder="Nhập biệt danh"><button type="button" data-clear-nickname="${esc(id)}" aria-label="Khôi phục tên gốc của ${esc(original)}" title="Khôi phục tên gốc"><i class="fa-solid fa-arrow-rotate-left"></i></button></div></label></article>`;
            }).join("")}</div>
          </div><footer class="settings-panel-footer"><button type="button" class="settings-secondary" data-cancel-nicknames>Hủy</button><button type="submit" class="settings-primary"><i class="fa-solid fa-check"></i> Lưu biệt danh</button></footer></form>`;
        bindCommon();
        panel.querySelectorAll("[data-clear-nickname]").forEach(button => button.onclick = () => { const input = panel.querySelector(`[data-nickname-id="${CSS.escape(button.dataset.clearNickname)}"]`); input.value = ""; input.focus(); });
        panel.querySelector("[data-cancel-nicknames]").onclick = () => renderHome();
        panel.querySelector("form").onsubmit = async event => {
            event.preventDefault(); const values = { ...nicknames }, changes = [];
            panel.querySelectorAll("[data-nickname-id]").forEach(input => { const value=input.value.trim(), old=input.dataset.originalValue||"", id=input.dataset.nicknameId; if(value) values[id]=value; else delete values[id]; if(value!==old) changes.push({id,value}); });
            if (!changes.length) { toast("Chưa có biệt danh nào thay đổi."); return; }
            const button=event.submitter||panel.querySelector(".settings-primary"); button.disabled=true;
            try { await setDoc(conversationRef(), { members:[state.me.uid,state.friend.id], nicknames:values, updatedAt:serverTimestamp() }, {merge:true});
                for (const change of changes) { const person=people.find(item=>(item.uid||item.id)===change.id), original=getDisplayName(person||{}); await announceChange("nickname", change.value ? `đã đặt biệt danh của ${original} là ${change.value}` : `đã khôi phục tên gốc của ${original}`, {targetId:change.id,nickname:change.value}); }
                toast("Biệt danh đã được đồng bộ cho cả hai người.","success"); renderHome();
            } catch(error) { toast(error.message||"Không thể lưu biệt danh.","error"); } finally { button.disabled=false; }
        };
    }

    function enhanceBackgroundEditor() {
        const select = panel.querySelector("[data-bg-emoji]");
        if (!select) return;
        const current = select.value;
        const chooser = document.createElement("section");
        chooser.className = "background-emoji-chooser";
        chooser.innerHTML = `<header><span><i class="fa-regular fa-face-smile"></i></span><div><strong>Cảm xúc nhanh</strong><small>Chọn biểu tượng phù hợp với ảnh nền</small></div><b data-bg-emoji-preview>${current}</b></header><div>${EMOJIS.map(emoji=>`<button type="button" data-bg-emoji-button="${emoji}" class="${emoji===current?"active":""}">${emoji}</button>`).join("")}</div>`;
        select.closest("label")?.replaceWith(chooser);
        chooser.appendChild(select); select.hidden = true;
        chooser.querySelectorAll("[data-bg-emoji-button]").forEach(button => button.onclick = () => { select.value=button.dataset.bgEmojiButton; chooser.querySelectorAll("button").forEach(item=>item.classList.toggle("active",item===button)); chooser.querySelector("[data-bg-emoji-preview]").textContent=select.value; select.dispatchEvent(new Event("input",{bubbles:true})); });
        const fitSelect = panel.querySelector("[data-bg-fit]");
        const fitLabel = fitSelect?.closest("label");
        let fitChooser = null;
        if (fitSelect && fitLabel) {
            fitChooser = document.createElement("section");
            fitChooser.className = "background-fit-chooser";
            fitChooser.innerHTML = `<span>Cách hiển thị</span><div><button type="button" data-fit-choice="cover"><i class="fa-solid fa-expand"></i><b>Phủ đầy</b><small>Lấp đầy khung chat</small></button><button type="button" data-fit-choice="contain"><i class="fa-regular fa-image"></i><b>Hiện toàn ảnh</b><small>Giữ nguyên khung ảnh</small></button></div>`;
            fitLabel.replaceWith(fitChooser);
            fitChooser.appendChild(fitSelect);
            fitSelect.hidden = true;
            const syncFit = () => fitChooser.querySelectorAll("[data-fit-choice]").forEach(button => button.classList.toggle("active", button.dataset.fitChoice === fitSelect.value));
            fitChooser.querySelectorAll("[data-fit-choice]").forEach(button => button.onclick = () => { fitSelect.value = button.dataset.fitChoice; syncFit(); fitSelect.dispatchEvent(new Event("input", { bubbles: true })); });
            syncFit();
        }
        const preview = panel.querySelector(".settings-background-preview"), blur = panel.querySelector("[data-bg-blur]");
        const scroll = panel.querySelector(".settings-panel-scroll");
        scroll?.classList.add("background-editor-scroll");
        const upload = panel.querySelector(".settings-upload-button"), progress = panel.querySelector(".settings-upload-progress");
        const rangeGroup = document.createElement("section");
        rangeGroup.className = "background-adjustments";
        panel.querySelectorAll(".settings-range").forEach(item => rangeGroup.appendChild(item));
        if (scroll) {
            preview && scroll.appendChild(preview);
            upload && scroll.appendChild(upload);
            progress && scroll.appendChild(progress);
            fitChooser && scroll.appendChild(fitChooser);
            rangeGroup.childElementCount && scroll.appendChild(rangeGroup);
            scroll.appendChild(chooser);
        }
        preview?.style.setProperty("--preview-fit", fitSelect?.value === "contain" ? "contain" : "cover");
        const syncPreviewBlur = () => preview?.style.setProperty("--preview-blur", `${Number(blur?.value || 0)}px`);
        blur?.addEventListener("input", syncPreviewBlur); syncPreviewBlur();
        const resetButton = panel.querySelector("[data-remove-background]"), originalReset = resetButton?.onclick;
        if (resetButton && originalReset) resetButton.onclick = async event => { await originalReset.call(resetButton, event); if (!resetButton.disabled) await announceChange("background_reset", "đã khôi phục ảnh nền mặc định", { privateForActor:true }); };
    }

    function renderBackgroundEnhanced() { renderBackground(); enhanceBackgroundEditor(); }

    function renderView(view) {
        activeView = view;
        if (view === "search") renderSearch(); else if (view === "members") renderMembers(); else if (view === "themes") renderThemes(); else if (view === "emoji") renderEmojiEnhanced(); else if (view === "nicknames") renderNicknamesEnhanced(); else if (view === "media") renderMedia(); else if (view === "background") renderBackgroundEnhanced(); else if (view === "notifications") renderNotifications(); else renderHome();
    }

    function bindCommon() {
        panel.querySelectorAll("[data-chat-settings-close]").forEach(button => button.onclick = close);
        panel.querySelectorAll("[data-settings-back]").forEach(button => button.onclick = () => renderHome());
        panel.querySelectorAll("[data-settings-view]").forEach(button => button.onclick = () => renderView(button.dataset.settingsView));
        panel.querySelectorAll(".settings-accordion-trigger").forEach(button => button.onclick = () => { const content = button.nextElementSibling, open = button.getAttribute("aria-expanded") === "true"; button.setAttribute("aria-expanded", String(!open)); content.hidden = open; });
    }

    function open(view = "home") {
        if (!context().friend) return;
        restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        renderView(view); chatPanel.classList.add("settings-open"); panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); backdrop.hidden = false; requestAnimationFrame(() => backdrop.classList.add("show"));
        panel.querySelector("button")?.focus({ preventScroll: true });
    }
    function close() {
        chatPanel.classList.remove("settings-open"); panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); backdrop.classList.remove("show"); setTimeout(() => { if (!panel.classList.contains("open")) backdrop.hidden = true; }, 220); applyAppearance();
        restoreFocus?.focus?.({ preventScroll: true }); restoreFocus = null;
    }

    function connectMemberSettings() {
        const state = context(), id = state.conversationId;
        if (!id || !state.me?.uid || id === activeSettingsConversation) { applyAppearance(); return; }
        stopMemberSettings?.(); activeSettingsConversation = id; privateSettings = readBackgroundSettingsCache(); applyAppearance();
        stopMemberSettings = onSnapshot(doc(db, "conversations", id, "memberSettings", state.me.uid), snapshot => { privateSettings = snapshot.data() || {}; cacheBackgroundSettings(privateSettings); const sharedAppearance = normalizeAppearance(context().conversation || {}); if (privateSettings.customBackgroundImageUrl && !sharedAppearance.customBackgroundImageUrl && !migratedSharedBackgrounds.has(id)) { migratedSharedBackgrounds.add(id); const migrated = { ...sharedAppearance, customBackgroundImageUrl: privateSettings.customBackgroundImageUrl, customBackgroundPublicId: privateSettings.customBackgroundPublicId || null, customBackgroundFormat: privateSettings.customBackgroundFormat || null, customBackgroundBytes: privateSettings.customBackgroundBytes || null, customBackgroundWidth: privateSettings.customBackgroundWidth || null, customBackgroundHeight: privateSettings.customBackgroundHeight || null, customBackgroundEmoji: privateSettings.customBackgroundEmoji || "👍", backgroundOverlay: Number(privateSettings.backgroundOverlay ?? .24), backgroundBlur: Number(privateSettings.backgroundBlur || 0), backgroundFit: privateSettings.backgroundFit === "contain" ? "contain" : "cover", updatedAt: serverTimestamp(), updatedBy: state.me.uid }; setDoc(conversationRef(), { appearance: migrated }, { merge: true }).catch(error => { migratedSharedBackgrounds.delete(id); console.warn("background migration", error); }); } applyAppearance(); const mutedUntil = timeValue(privateSettings.mutedUntil); document.dispatchEvent(new CustomEvent("chat-mute-updated", { detail: { conversationId: id, friendId: state.friend?.id, muted: mutedUntil > Date.now(), mutedUntil } })); if (panel.classList.contains("open") && ["background","notifications"].includes(activeView)) renderView(activeView); }, error => { console.warn("memberSettings", error); activeSettingsConversation = ""; privateSettings = readBackgroundSettingsCache(); applyAppearance(); });
    }

    backdrop?.addEventListener("click", close);
    document.addEventListener("keydown", event => {
        if (!panel.classList.contains("open")) return;
        if (event.key === "Escape") { event.preventDefault(); close(); return; }
        if (event.key !== "Tab" || innerWidth >= 1024) return;
        const focusable = [...panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]
            .filter(element => !element.hidden && element.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    return { open, close, refresh() { connectMemberSettings(); applyAppearance(); if (panel.classList.contains("open") && activeView === "media") renderMedia(); else if (panel.classList.contains("open") && activeView === "search") renderSearchResults(); }, applyAppearance, getDefaultEmoji() { const appearance = normalizeAppearance(context().conversation || {}); return appearance.customBackgroundImageUrl ? (appearance.customBackgroundEmoji || "👍") : appearance.defaultEmoji; }, destroy() { stopMemberSettings?.(); stopMemberSettings = null; } };
}
