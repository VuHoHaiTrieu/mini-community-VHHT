import { subscribeAdminData } from "./admin-data-store.js";
import { resolveDisplayName } from "../shared/user-identity.js";

const DEFAULT_AVATAR = "../shared/assets/default-avatar.png?v=3";
const usersCount = document.getElementById("total-users-count");
const activeUsersCount = document.getElementById("active-users-count");
const postsCount = document.getElementById("total-posts-count");
const hiddenPostsCount = document.getElementById("hidden-posts-count");
const recentUsersList = document.getElementById("recent-users-list");
const recentPostsList = document.getElementById("recent-posts-list");

function timestampMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function relativeTime(value) {
    const milliseconds = timestampMs(value);
    if (!milliseconds) return "Chưa xác định";
    const delta = Date.now() - milliseconds;
    const minutes = Math.max(0, Math.floor(delta / 60000));
    if (minutes < 1) return "Vừa xong";
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return days < 30 ? `${days} ngày trước` : new Date(milliseconds).toLocaleDateString("vi-VN");
}

function markLoaded(element, value) {
    if (!element) return;
    element.textContent = String(value);
    element.classList.remove("admin-skeleton-value");
}

subscribeAdminData("users", ({ data: users, loading, error }) => {
    if (loading) return;
    if (error) {
        markLoaded(usersCount, "!");
        markLoaded(activeUsersCount, "!");
        if (recentUsersList) recentUsersList.innerHTML = '<div class="admin-empty-state-inner"><i class="fa-solid fa-triangle-exclamation"></i><strong>Không tải được người dùng</strong><small>Kiểm tra kết nối hoặc quyền Firestore.</small></div>';
        return;
    }
    markLoaded(usersCount, users.length);
    markLoaded(activeUsersCount, users.filter(user => user.accountStatus !== "suspended").length);
    renderRecentUsers(users);
});

subscribeAdminData("posts", ({ data: posts, loading, error }) => {
    if (loading) return;
    if (error) {
        markLoaded(postsCount, "!");
        markLoaded(hiddenPostsCount, "!");
        if (recentPostsList) recentPostsList.innerHTML = '<div class="admin-empty-state-inner"><i class="fa-solid fa-triangle-exclamation"></i><strong>Không tải được bài viết</strong><small>Kiểm tra kết nối hoặc quyền Firestore.</small></div>';
        return;
    }
    markLoaded(postsCount, posts.length);
    markLoaded(hiddenPostsCount, posts.filter(post => post.moderationStatus === "hidden" || (post.deletedByAdmin === true && !post.moderationStatus)).length);
    renderRecentPosts(posts);
});

function renderRecentUsers(users) {
    if (!recentUsersList) return;
    const recent = [...users].sort((a, b) => timestampMs(b.createdAt || b.joinedAt) - timestampMs(a.createdAt || a.joinedAt)).slice(0, 4);
    if (!recent.length) {
        recentUsersList.innerHTML = '<div class="admin-empty-state-inner"><i class="fa-solid fa-user-plus"></i><strong>Chưa có người dùng</strong><small>Thành viên mới sẽ xuất hiện tại đây.</small></div>';
        return;
    }
    recentUsersList.replaceChildren(...recent.map(user => {
        const item = document.createElement("div");
        item.className = "admin-compact-item";
        const avatarUrl = user.photoURL || user.profileImage;
        const visual = avatarUrl ? document.createElement("img") : document.createElement("span");
        if (avatarUrl) { visual.src = avatarUrl; visual.alt = ""; }
        else { visual.className = "admin-compact-avatar"; visual.textContent = resolveDisplayName(user).charAt(0).toUpperCase(); }
        item.innerHTML = '<span class="admin-compact-copy"><strong></strong><span></span></span><time></time>';
        item.prepend(visual);
        item.querySelector("strong").textContent = resolveDisplayName(user);
        item.querySelector(".admin-compact-copy span").textContent = user.email || "Không có email";
        item.querySelector("time").textContent = relativeTime(user.createdAt || user.joinedAt);
        visual.addEventListener?.("error", event => { event.currentTarget.src = DEFAULT_AVATAR; }, { once: true });
        return item;
    }));
}

function renderRecentPosts(posts) {
    if (!recentPostsList) return;
    const recent = [...posts].sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt)).slice(0, 4);
    if (!recent.length) {
        recentPostsList.innerHTML = '<div class="admin-empty-state-inner"><i class="fa-regular fa-newspaper"></i><strong>Chưa có bài viết</strong><small>Nội dung mới sẽ xuất hiện tại đây.</small></div>';
        return;
    }
    recentPostsList.replaceChildren(...recent.map(post => {
        const item = document.createElement("div");
        item.className = "admin-recent-post-item";
        item.innerHTML = `<i class="fa-solid ${post.deletedByAdmin ? "fa-eye-slash" : "fa-satellite-dish"}" aria-hidden="true"></i><span class="admin-compact-copy"><strong></strong><span></span></span><time></time>`;
        item.querySelector("strong").textContent = post.authorDisplayName || "Không rõ tác giả";
        item.querySelector(".admin-compact-copy span").textContent = post.content?.trim() || "Bài viết có media";
        item.querySelector("time").textContent = relativeTime(post.createdAt);
        return item;
    }));
}
