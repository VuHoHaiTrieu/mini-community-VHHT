import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { resolveDisplayName } from "../shared/user-identity.js";
import { resolveAvatarUrl } from "../shared/default-avatar.js";

const input = document.getElementById("community-user-search");
const results = document.getElementById("community-search-results");
const panel = document.getElementById("community-search-panel");
let usersCache = null;
let cacheTime = 0;
let debounceTimer = 0;
let requestNumber = 0;
let visibleMatches = [];
let activeIndex = -1;
let authReady = false;
let resolveAuthReady;
const authReadyPromise = new Promise(resolve => { resolveAuthReady = resolve; });

const normalize = value => String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .toLocaleLowerCase("vi-VN").replace(/^@/, "")
    .replace(/[^a-z0-9\s_-]/g, " ").replace(/\s+/g, " ").trim();
const escapeHTML = value => String(value || "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function levenshtein(left, right) {
    if (left === right) return 0;
    const row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
        let previous = row[0];
        row[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
            const saved = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
            previous = saved;
        }
    }
    return row[right.length];
}

function fieldScore(query, field) {
    if (!field) return 0;
    if (field === query) return 1000;
    if (field.startsWith(query)) return 850 - Math.min(100, field.length - query.length);
    const words = field.split(/[\s_-]+/).filter(Boolean);
    if (words.some(word => word.startsWith(query))) return 680;
    // Một ký tự chỉ có ý nghĩa như tiền tố. Nếu cho phép contains/fuzzy ở đây,
    // gần như toàn bộ cộng đồng sẽ xuất hiện với các chữ phổ biến như "u".
    if (query.length === 1) return 0;
    if (field.includes(query)) return 720 - Math.min(120, field.indexOf(query) * 4);
    // Hai ký tự vẫn cần khớp trực tiếp; tìm gần đúng chỉ đáng tin từ 3 ký tự.
    if (query.length === 2) return 0;
    const compactQuery = query.replace(/\s+/g, "");
    let best = 0;
    for (const candidate of [field.replace(/\s+/g, ""), ...words]) {
        const distance = levenshtein(compactQuery, candidate);
        const maximum = Math.max(compactQuery.length, candidate.length);
        const similarity = maximum ? 1 - distance / maximum : 0;
        const allowed = compactQuery.length <= 4 ? 1 : Math.max(2, Math.floor(compactQuery.length * 0.28));
        if (distance <= allowed || similarity >= 0.68) best = Math.max(best, 400 + Math.round(similarity * 220));
    }
    return best;
}

function scoreUser(user, query) {
    const fields = [user.displayName, user.fullName, user.name, user.username,
        user.usernameNormalized, user.userName, user.memberId, user.id]
        .map(normalize).filter(Boolean);
    return Math.max(0, ...fields.map(field => fieldScore(query, field)));
}

function setMessage(icon, title, detail, className = "") {
    results.innerHTML = `<div class="empty-search-result ${className}"><i class="fa-solid ${icon}"></i><span><strong>${title}</strong><small>${detail}</small></span></div>`;
    results.classList.add("visible");
    input?.setAttribute("aria-expanded", "true");
    input?.removeAttribute("aria-activedescendant");
    visibleMatches = [];
    activeIndex = -1;
    positionResults();
}

function positionResults() {
    if (!panel || !results.classList.contains("community-search-results--portal")) return;
    const bounds = panel.getBoundingClientRect();
    const viewportPadding = 10;
    const width = Math.min(Math.max(bounds.width, 300), window.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(viewportPadding, bounds.left), window.innerWidth - width - viewportPadding);
    results.style.setProperty("--member-search-left", `${Math.round(left)}px`);
    results.style.setProperty("--member-search-top", `${Math.round(bounds.bottom + 8)}px`);
    results.style.setProperty("--member-search-width", `${Math.round(width)}px`);
}

async function loadAllUsers() {
    if (usersCache && Date.now() - cacheTime < 60000) return usersCache;
    if (!authReady) await authReadyPromise;
    if (!firebaseAuthentication.currentUser) throw new Error("AUTH_REQUIRED");
    const snapshot = await getDocs(collection(firebaseDatabase, "users"));
    usersCache = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    cacheTime = Date.now();
    return usersCache;
}

function renderMatches(matches, committed = false) {
    if (!matches.length) {
        setMessage("fa-user-slash", "Không tìm thấy người dùng", "Hãy thử tên, @username hoặc ID khác.");
        return;
    }
    visibleMatches = matches.slice(0, committed ? 12 : 8);
    activeIndex = -1;
    const heading = committed
        ? '<div class="member-search-heading"><strong>Kết quả phù hợp nhất</strong><small>Enter để mở kết quả đầu tiên</small></div>'
        : "";
    results.innerHTML = heading + visibleMatches.map(({ user }, index) => {
        const displayName = resolveDisplayName(user);
        const username = String(user.username || user.userName || "").replace(/^@/, "");
        const memberId = String(user.memberId || "").trim();
        const detail = username ? `@${escapeHTML(username)}` : (memberId ? `ID: ${escapeHTML(memberId)}` : "Thành viên VHHT");
        const avatar = resolveAvatarUrl(user.photoURL || user.profileImage || user.avatarUrl, { uid: user.id, displayName });
        return `<button type="button" class="member-search-result" id="member-search-option-${index}" role="option" aria-selected="false" data-index="${index}" data-uid="${escapeHTML(user.id)}"><img src="${escapeHTML(avatar)}" alt=""><span><strong>${escapeHTML(displayName)}</strong><small>${detail}</small></span><i class="fa-solid fa-arrow-right"></i></button>`;
    }).join("");
    results.classList.add("visible");
    input.setAttribute("aria-expanded", "true");
    positionResults();
}

async function performSearch({ committed = false } = {}) {
    const query = normalize(input.value);
    const currentRequest = ++requestNumber;
    if (!query) {
        closeResults();
        return [];
    }
    setMessage("fa-circle-notch fa-spin", "Đang tìm người dùng", "Tìm trong toàn bộ cộng đồng…", "search-loading");
    try {
        const users = await loadAllUsers();
        if (currentRequest !== requestNumber) return [];
        const matches = users.map(user => ({ user, score: scoreUser(user, query) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || resolveDisplayName(a.user).localeCompare(resolveDisplayName(b.user), "vi"));
        renderMatches(matches, committed);
        return matches;
    } catch (error) {
        console.error("Community member search failed:", error);
        if (currentRequest === requestNumber) {
            const detail = firebaseAuthentication.currentUser
                ? "Không thể tải danh sách thành viên lúc này."
                : "Hãy đăng nhập để tìm toàn bộ thành viên.";
            setMessage("fa-triangle-exclamation", "Không thể tìm kiếm", detail, "search-error");
        }
        return [];
    }
}

function closeResults() {
    results.replaceChildren();
    results.classList.remove("visible");
    input?.setAttribute("aria-expanded", "false");
    input?.removeAttribute("aria-activedescendant");
    visibleMatches = [];
    activeIndex = -1;
}

function setActiveResult(index) {
    const options = [...results.querySelectorAll(".member-search-result")];
    if (!options.length) return;
    activeIndex = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
        const active = optionIndex === activeIndex;
        option.classList.toggle("is-active", active);
        option.setAttribute("aria-selected", String(active));
    });
    input.setAttribute("aria-activedescendant", options[activeIndex].id);
    options[activeIndex].scrollIntoView({ block: "nearest" });
}

function openProfile(uid) {
    if (!uid) return;
    sessionStorage.setItem("vhht_profile_return_source", "community");
    location.href = `./profile-user/user-profile.html?uid=${encodeURIComponent(uid)}`;
}

function initialize() {
    if (!input || !results) return;
    input.dataset.memberSearchReady = "true";
    document.body.append(results);
    results.classList.add("community-search-results--portal");
    positionResults();
    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => performSearch(), 130);
    });
    input.addEventListener("focus", () => { if (input.value.trim()) performSearch(); });
    input.addEventListener("keydown", async event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActiveResult(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
            return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        const active = results.querySelector(".member-search-result.is-active");
        if (active) {
            openProfile(active.dataset.uid);
            return;
        }
        const matches = await performSearch({ committed: true });
        if (matches.length) setActiveResult(0);
    });
    results.addEventListener("click", event => {
        const target = event.target.closest("[data-uid]");
        if (target) openProfile(target.dataset.uid);
    });
    document.addEventListener("pointerdown", event => {
        if (!panel?.contains(event.target) && !results.contains(event.target)) closeResults();
    });
    // The account popover owns this area on small screens. Keeping search
    // suggestions open underneath it creates an overlapping, untappable UI.
    document.getElementById("community-account-trigger")?.addEventListener("click", () => {
        closeResults();
        input.blur();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeResults();
            input.blur();
        }
    });
    document.getElementById("mobile-community-search-toggle")?.addEventListener("click", () => {
        if (input.value.trim()) performSearch({ committed: true });
        else input.focus({ preventScroll: true });
    });
    window.addEventListener("resize", positionResults, { passive: true });
    window.addEventListener("scroll", positionResults, { passive: true, capture: true });
}

initialize();
onAuthStateChanged(firebaseAuthentication, () => {
    usersCache = null;
    cacheTime = 0;
    if (!authReady) {
        authReady = true;
        resolveAuthReady();
    }
    if (input?.value.trim()) performSearch();
});
