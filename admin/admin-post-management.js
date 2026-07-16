import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { restartAdminData, subscribeAdminData } from "./admin-data-store.js";
import { confirmAction, debounce, openActionSheet, openDetailDialog, setButtonBusy, showToast } from "./admin-ui.js";

const elements = {
    body: document.getElementById("posts-tbody"), search: document.getElementById("post-search"),
    status: document.getElementById("post-status-filter"), media: document.getElementById("post-media-filter"),
    sort: document.getElementById("post-sort"), reset: document.getElementById("reset-post-filters"),
    refresh: document.getElementById("refresh-posts"), count: document.getElementById("posts-result-count"),
    pagination: document.getElementById("posts-pagination"), appeals: document.getElementById("admin-appeals-list"),
    appealCount: document.getElementById("pending-appeals-count")
};
const state = { all: [], filtered: [], loading: true, error: null, query: "", page: 1, pageSize: 10 };

const moderationState = post => post.moderationStatus || (post.deletedByAdmin === true ? "hidden" : "active");
const hasPendingAppeal = post => moderationState(post) === "hidden" && post.appeal?.status === "pending";

async function notifyAuthor(post, message, type = "admin_moderation") {
    const admin = firebaseAuthentication.currentUser;
    if (!post.authorId || !admin) return;
    try {
        await addDoc(collection(firebaseDatabase, "notifications"), {
            recipientId: post.authorId, actorId: admin.uid, actorName: "ADMIN", type,
            postId: post.id, message, isRead: false, createdAt: serverTimestamp()
        });
    } catch (error) { console.warn("Đã kiểm duyệt bài viết nhưng chưa thể gửi thông báo", error); }
}

function timestampMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}
function formatDate(value) {
    const time = timestampMs(value);
    return time ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(time) : "Chưa xác định";
}
function mediaList(post) {
    if (Array.isArray(post.attachedImages) && post.attachedImages.length) return post.attachedImages.filter(item => item?.url);
    const url = post.mediaUrl || post.attachedImage || post.imageURL || post.videoURL;
    return url ? [{ url, type: post.mediaType || (post.videoURL ? "video" : "image") }] : [];
}

function applyFilters({ resetPage = false } = {}) {
    if (resetPage) state.page = 1;
    const keyword = state.query.toLocaleLowerCase("vi");
    let posts = state.all.filter(post => {
        const status = moderationState(post);
        const statusMatch = elements.status.value === "all"
            || (elements.status.value === "appealed" ? hasPendingAppeal(post)
                : elements.status.value === "visible" ? status === "active" : status === elements.status.value);
        const hasMedia = mediaList(post).length > 0;
        const mediaMatch = elements.media.value === "all" || (elements.media.value === "media" ? hasMedia : !hasMedia);
        const haystack = `${post.authorDisplayName || ""} ${post.authorEmail || ""} ${post.content || ""} ${post.id}`.toLocaleLowerCase("vi");
        return statusMatch && mediaMatch && (!keyword || haystack.includes(keyword));
    });
    const sort = elements.sort.value;
    posts.sort((a, b) => sort === "oldest"
        ? timestampMs(a.createdAt) - timestampMs(b.createdAt)
        : sort === "author"
            ? (a.authorDisplayName || "").localeCompare(b.authorDisplayName || "", "vi")
            : timestampMs(b.createdAt) - timestampMs(a.createdAt));
    state.filtered = posts;
    state.page = Math.min(state.page, Math.max(1, Math.ceil(posts.length / state.pageSize)));
    render();
}

function render() {
    if (!elements.body) return;
    renderAppeals();
    if (state.loading) { renderLoading(); return; }
    if (state.error) { renderError(); return; }
    elements.count.textContent = `${state.filtered.length} kết quả`;
    if (!state.filtered.length) {
        elements.body.innerHTML = '<tr><td colspan="6" class="admin-empty-state"><div class="admin-empty-state-inner"><i class="fa-regular fa-newspaper"></i><strong>Không tìm thấy bài viết</strong><small>Thử thay đổi từ khóa hoặc đặt lại bộ lọc.</small></div></td></tr>';
        renderPagination(); return;
    }
    const start = (state.page - 1) * state.pageSize;
    elements.body.replaceChildren(...state.filtered.slice(start, start + state.pageSize).map(createPostRow));
    renderPagination();
}

function renderAppeals() {
    if (!elements.appeals) return;
    const pending = state.all.filter(post => post.appeal?.status === "pending").sort((a, b) => timestampMs(a.appeal?.submittedAt) - timestampMs(b.appeal?.submittedAt));
    if (elements.appealCount) elements.appealCount.textContent = `${pending.length} đang chờ`;
    if (!pending.length) {
        elements.appeals.innerHTML = '<div class="admin-appeal-empty"><i class="fa-solid fa-shield-circle-check"></i><strong>Không có khiếu nại đang chờ</strong><small>Các yêu cầu mới sẽ xuất hiện tại đây theo thời gian thực.</small></div>';
        return;
    }
    elements.appeals.replaceChildren(...pending.map(post => {
        const card = document.createElement("article"); card.className = "admin-appeal-card"; card.dataset.postId = post.id;
        const name = post.authorDisplayName || "Không rõ tác giả";
        card.innerHTML = `<div class="admin-appeal-card-head"><span class="admin-appeal-avatar"></span><div><strong></strong><small><i class="fa-regular fa-clock"></i> Gửi ${formatDate(post.appeal?.submittedAt)}</small></div><span class="admin-appeal-pending">Chờ duyệt</span></div><blockquote></blockquote><div class="admin-appeal-post-context"><i class="fa-regular fa-newspaper"></i><span></span></div><div class="admin-appeal-actions"><button type="button" data-appeal-action="inspect"><i class="fa-regular fa-eye"></i> Xem bài</button><button type="button" data-appeal-action="reject" class="appeal-reject"><i class="fa-solid fa-ban"></i> Giữ quyết định</button><button type="button" data-appeal-action="approve" class="appeal-approve"><i class="fa-solid fa-rotate-left"></i> Chấp thuận</button></div>`;
        const avatar = card.querySelector(".admin-appeal-avatar");
        if (post.authorAvatar) { const image = document.createElement("img"); image.src = post.authorAvatar; image.alt = ""; avatar.appendChild(image); } else avatar.textContent = name.charAt(0).toUpperCase();
        card.querySelector("strong").textContent = name; card.querySelector("blockquote").textContent = post.appeal?.message || "Không có nội dung giải trình.";
        card.querySelector(".admin-appeal-post-context span").textContent = (post.content || "Bài viết có ảnh/video").slice(0, 150);
        return card;
    }));
}

elements.appeals?.addEventListener("click", event => {
    const button = event.target.closest("[data-appeal-action]"); if (!button) return;
    const post = state.all.find(item => item.id === button.closest("[data-post-id]")?.dataset.postId); if (!post) return;
    if (button.dataset.appealAction === "inspect") openPostDetail(post); else openAppealReview(post, button.dataset.appealAction);
});

function openAppealReview(post, decision) {
    const approved = decision === "approve", content = document.createElement("div"); content.className = "admin-appeal-review";
    content.innerHTML = `<div class="admin-review-decision ${approved ? "approve" : "reject"}"><i class="fa-solid ${approved ? "fa-circle-check" : "fa-shield-halved"}"></i><div><strong>${approved ? "Chấp thuận khiếu nại" : "Giữ nguyên quyết định kiểm duyệt"}</strong><p>${approved ? "Bài viết sẽ được khôi phục và tiếp tục áp dụng quyền riêng tư của tác giả." : "Bài viết tiếp tục bị ẩn khỏi cộng đồng. Hãy ghi rõ lý do để tác giả hiểu quyết định."}</p></div></div><label for="appeal-review-note">Ghi chú phản hồi</label><textarea id="appeal-review-note" maxlength="1000" placeholder="Giải thích kết quả xem xét cho tác giả…"></textarea>`;
    const footer = document.createElement("footer"); footer.className = "admin-detail-footer admin-appeal-review-footer";
    const submit = document.createElement("button"); submit.type = "button"; submit.className = approved ? "appeal-approve" : "appeal-reject"; submit.innerHTML = `<i class="fa-solid ${approved ? "fa-rotate-left" : "fa-ban"}"></i> ${approved ? "Khôi phục bài viết" : "Xác nhận giữ ẩn"}`; footer.appendChild(submit);
    const close = openDetailDialog({ title: post.authorDisplayName || "Khiếu nại bài viết", subtitle: "Xem xét khiếu nại", content, footer });
    submit.addEventListener("click", async () => {
        const reviewNote = content.querySelector("#appeal-review-note").value.trim();
        if (!approved && reviewNote.length < 10) { showToast("Hãy ghi lý do từ chối ít nhất 10 ký tự.", { type: "error", title: "Thiếu ghi chú" }); return; }
        setButtonBusy(submit, true);
        try {
            const appeal = { ...(post.appeal || {}), status: approved ? "approved" : "rejected", reviewedAt: serverTimestamp(), reviewNote };
            await updateDoc(doc(firebaseDatabase, "posts", post.id), approved ? { deletedByAdmin: false, moderationStatus: null, restoredAt: serverTimestamp(), appeal } : { deletedByAdmin: true, moderationStatus: "hidden", appeal });
            await notifyAuthor(post, approved ? "đã chấp thuận khiếu nại và khôi phục bài viết của bạn." : `đã xem xét và giữ nguyên quyết định ẩn bài viết của bạn${reviewNote ? `: ${reviewNote}` : "."}`, "moderation_appeal");
            close(); showToast(approved ? "Đã chấp thuận và khôi phục bài viết." : "Đã lưu quyết định giữ ẩn bài viết.", { title: "Đã xử lý khiếu nại" });
        } catch (error) { console.error("Không thể xử lý khiếu nại", error); showToast("Không thể lưu quyết định. Hãy kiểm tra quyền Firestore.", { type: "error" }); setButtonBusy(submit, false); }
    });
}

function createPostRow(post) {
    const row = document.createElement("tr");
    row.dataset.postId = post.id;
    const status = moderationState(post);
    const hidden = status === "hidden";
    const deleted = status === "deleted";
    const appealed = hasPendingAppeal(post);
    const author = post.authorDisplayName || "Không rõ tác giả";
    const media = mediaList(post);
    row.innerHTML = `
        <td data-label="Tác giả"><div class="table-user-info"><span class="table-user-avatar"></span><span class="table-user-copy"><strong class="table-user-name"></strong><small class="table-user-id"></small></span></div></td>
        <td data-label="Nội dung"><span class="post-content-cell"></span></td>
        <td data-label="Media"><div class="admin-media-preview"></div></td>
        <td data-label="Trạng thái"><span class="status-badge ${deleted ? "deleted-status" : hidden ? "hidden-status" : "active-status"}"><i class="fa-solid ${appealed ? "fa-scale-balanced" : deleted ? "fa-trash-can" : hidden ? "fa-eye-slash" : "fa-circle"}"></i>${appealed ? "Có khiếu nại" : deleted ? "Đã xóa" : hidden ? "Đã ẩn" : "Hiển thị"}</span></td>
        <td data-label="Ngày đăng"><time>${formatDate(post.createdAt)}</time></td>
        <td data-label="Hành động"><div class="table-actions desktop-actions">
            <button class="table-action-btn" type="button" data-action="inspect" title="Xem chi tiết" aria-label="Xem chi tiết bài viết"><i class="fa-solid fa-up-right-from-square"></i></button>
            <button class="table-action-btn" type="button" data-action="visibility" title="${status === "active" ? "Ẩn bài viết" : "Khôi phục bài viết"}" aria-label="${status === "active" ? "Ẩn bài viết" : "Khôi phục bài viết"}"><i class="fa-solid ${status === "active" ? "fa-eye-slash" : "fa-rotate-left"}"></i></button>
            <button class="table-action-btn danger" type="button" data-action="delete" title="Xóa khỏi cộng đồng" aria-label="Xóa bài viết khỏi cộng đồng"><i class="fa-regular fa-trash-can"></i></button>
        </div><button class="mobile-action-trigger" type="button" data-action="menu"><i class="fa-solid fa-ellipsis"></i> Hành động</button></td>`;
    const avatar = row.querySelector(".table-user-avatar");
    if (post.authorAvatar) {
        const image = document.createElement("img"); image.src = post.authorAvatar; image.alt = ""; avatar.appendChild(image);
    } else avatar.textContent = author.charAt(0).toUpperCase();
    row.querySelector(".table-user-name").textContent = author;
    row.querySelector(".table-user-id").textContent = post.authorEmail || post.authorId || "Không có ID";
    row.querySelector(".post-content-cell").textContent = post.content?.trim() || (media.length ? "Bài viết có ảnh/video" : "Không có nội dung");
    const mediaNode = row.querySelector(".admin-media-preview");
    if (!media.length) mediaNode.innerHTML = '<span class="admin-media-placeholder"><i class="fa-solid fa-minus"></i></span><span>Không có</span>';
    else {
        const first = media[0];
        if (first.type === "video") mediaNode.innerHTML = `<span class="admin-media-placeholder"><i class="fa-solid fa-play"></i></span><span>${media.length} video</span>`;
        else {
            const image = document.createElement("img"); image.src = first.url; image.alt = "Ảnh xem trước";
            const count = document.createElement("span"); count.textContent = `${media.length} ảnh`;
            mediaNode.append(image, count);
        }
    }
    return row;
}

function renderLoading() { elements.body.innerHTML = '<tr class="admin-loading-row"><td colspan="6"><div class="admin-table-skeleton"></div><div class="admin-table-skeleton"></div><div class="admin-table-skeleton"></div></td></tr>'; }
function renderError() {
    elements.body.innerHTML = '<tr><td colspan="6" class="admin-error-state"><div class="admin-empty-state-inner"><i class="fa-solid fa-triangle-exclamation"></i><strong>Không tải được bài viết</strong><small>Kiểm tra kết nối hoặc quyền truy cập Firestore.</small><button class="admin-retry-button" type="button">Thử hiển thị lại</button></div></td></tr>';
    elements.body.querySelector(".admin-retry-button")?.addEventListener("click", () => restartAdminData("posts"));
}
function renderPagination() {
    const total = state.filtered.length, pages = Math.max(1, Math.ceil(total / state.pageSize));
    const first = total ? (state.page - 1) * state.pageSize + 1 : 0, last = Math.min(state.page * state.pageSize, total);
    elements.pagination.innerHTML = `<span class="admin-pagination-summary">Hiển thị ${first}–${last} trong ${total}</span><div class="admin-pagination-controls"><select aria-label="Số bài viết mỗi trang"><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option></select><button type="button" data-page="prev" aria-label="Trang trước"><i class="fa-solid fa-chevron-left"></i></button><span class="admin-pagination-page">Trang ${state.page}/${pages}</span><button type="button" data-page="next" aria-label="Trang sau"><i class="fa-solid fa-chevron-right"></i></button></div>`;
    elements.pagination.querySelector("select").value = String(state.pageSize);
    elements.pagination.querySelector('[data-page="prev"]').disabled = state.page <= 1;
    elements.pagination.querySelector('[data-page="next"]').disabled = state.page >= pages;
}

elements.pagination?.addEventListener("click", event => { const direction = event.target.closest("button")?.dataset.page; if (!direction) return; state.page += direction === "next" ? 1 : -1; render(); });
elements.pagination?.addEventListener("change", event => { if (event.target.tagName !== "SELECT") return; state.pageSize = Number(event.target.value) || 10; state.page = 1; render(); });
elements.search?.addEventListener("input", debounce(event => { state.query = event.target.value.trim(); applyFilters({ resetPage: true }); }, 320));
[elements.status, elements.media, elements.sort].forEach(control => control?.addEventListener("change", () => applyFilters({ resetPage: true })));
elements.reset?.addEventListener("click", () => { elements.search.value = ""; state.query = ""; elements.status.value = "all"; elements.media.value = "all"; elements.sort.value = "newest"; applyFilters({ resetPage: true }); });
elements.refresh?.addEventListener("click", () => { elements.refresh.classList.add("syncing"); applyFilters(); setTimeout(() => elements.refresh.classList.remove("syncing"), 650); showToast("Danh sách đang dùng snapshot Firestore mới nhất.", { type: "info", title: "Dữ liệu thời gian thực" }); });

elements.body?.addEventListener("click", event => {
    const button = event.target.closest("[data-action]"); if (!button) return;
    const post = state.all.find(item => item.id === button.closest("tr")?.dataset.postId); if (!post) return;
    if (button.dataset.action === "menu") return openPostActions(post);
    runPostAction(post, button.dataset.action, button);
});

function openPostActions(post) {
    const status = moderationState(post), hidden = status === "hidden", deleted = status === "deleted";
    openActionSheet({ title: post.authorDisplayName || "Bài viết", description: post.content?.slice(0, 90) || "Bài viết có media", actions: [
        { label: "Xem chi tiết", description: "Mở bài viết trong cộng đồng", icon: "fa-up-right-from-square", onSelect: () => runPostAction(post, "inspect") },
        { label: status === "active" ? "Ẩn bài viết" : "Khôi phục bài viết", description: status === "active" ? "Ẩn nội dung và cho phép tác giả khiếu nại" : "Cho phép nội dung hiển thị trở lại theo quyền riêng tư", icon: status === "active" ? "fa-eye-slash" : "fa-rotate-left", onSelect: () => runPostAction(post, "visibility") },
        { label: "Xóa khỏi cộng đồng", description: "Ngừng phân phối nhưng giữ bản ghi để tác giả xem lại", icon: "fa-trash-can", tone: "danger", onSelect: () => runPostAction(post, "delete") }
    ] });
}

async function runPostAction(post, action, button) {
    if (action === "inspect") { openPostDetail(post); return; }
    const previousStatus = moderationState(post);
    const hidden = previousStatus === "hidden";
    const deleted = previousStatus === "deleted";
    const restoring = hidden || deleted;
    const isDelete = action === "delete";
    const config = isDelete
        ? { title: "Xóa bài viết khỏi cộng đồng?", description: "Bài viết sẽ biến mất với mọi người nhưng vẫn nằm trong hồ sơ tác giả để họ xem lại hoặc tự xóa.", confirmLabel: "Xác nhận xóa", tone: "danger" }
        : { title: restoring ? "Khôi phục bài viết?" : "Ẩn bài viết?", description: restoring ? "Bài viết sẽ xuất hiện trở lại theo quyền riêng tư của tác giả." : "Bài viết sẽ bị ẩn nhưng dữ liệu gốc vẫn được giữ.", confirmLabel: restoring ? "Khôi phục" : "Ẩn bài", tone: restoring ? "default" : "danger" };
    const accepted = await confirmAction({ ...config, context: `${post.authorDisplayName || "Không rõ tác giả"} · ${(post.content || "Bài viết có media").slice(0, 110)}` });
    if (!accepted) return;
    setButtonBusy(button, true);
    try {
        const moderatedBy = firebaseAuthentication.currentUser?.uid || null;
        if (isDelete) {
            await updateDoc(doc(firebaseDatabase, "posts", post.id), { moderationStatus: "deleted", deletedByAdmin: true, moderationReason: "Vi phạm tiêu chuẩn cộng đồng", moderatedAt: serverTimestamp(), moderatedBy, appeal: null });
            await notifyAuthor(post, "đã xóa bài viết của bạn khỏi cộng đồng. Bạn vẫn có thể xem hoặc tự xóa bài này trong hồ sơ.");
        } else if (restoring) {
            const appeal = post.appeal?.status === "pending" ? { ...post.appeal, status: "approved", reviewedAt: serverTimestamp(), reviewNote: "ADMIN khôi phục trực tiếp bài viết." } : (post.appeal || null);
            await updateDoc(doc(firebaseDatabase, "posts", post.id), { moderationStatus: null, deletedByAdmin: false, moderationReason: null, restoredAt: serverTimestamp(), moderatedBy, appeal });
            await notifyAuthor(post, deleted ? "đã khôi phục bài viết từng bị xóa của bạn. Bài viết tiếp tục áp dụng quyền riêng tư trước đó." : "đã bỏ ẩn và khôi phục khả năng hiển thị bài viết của bạn.");
        } else {
            await updateDoc(doc(firebaseDatabase, "posts", post.id), { moderationStatus: "hidden", deletedByAdmin: true, moderationReason: "Đang được kiểm duyệt", moderatedAt: serverTimestamp(), moderatedBy, appeal: null });
            await notifyAuthor(post, "đã ẩn bài viết của bạn. Bạn có thể gửi khiếu nại từ trang hồ sơ.");
        }
        showToast(isDelete ? "Đã xóa bài viết khỏi cộng đồng." : restoring ? "Đã khôi phục bài viết và thông báo tác giả." : "Đã ẩn bài viết và thông báo tác giả.");
    } catch (error) {
        console.error("Không thể cập nhật bài viết", error);
        showToast("Firestore từ chối hoặc kết nối bị gián đoạn.", { type: "error" });
    } finally { setButtonBusy(button, false); }
}

function openPostDetail(post) {
    const content = document.createElement("article");
    content.className = "admin-post-detail";
    const meta = document.createElement("div");
    meta.className = "admin-post-detail-meta";
    const status = moderationState(post);
    meta.innerHTML = `<span class="status-badge ${status === "deleted" ? "deleted-status" : status === "hidden" ? "hidden-status" : "active-status"}"><i class="fa-solid ${status === "deleted" ? "fa-trash-can" : status === "hidden" ? "fa-eye-slash" : "fa-circle"}"></i>${status === "deleted" ? "Đã xóa" : status === "hidden" ? "Đã ẩn" : "Hiển thị"}</span><time>${formatDate(post.createdAt)}</time>`;
    const text = document.createElement("p");
    text.className = "admin-post-detail-text";
    text.textContent = post.content?.trim() || "Bài viết không có nội dung văn bản.";
    const gallery = document.createElement("div");
    gallery.className = "admin-post-detail-media";
    mediaList(post).forEach(media => {
        const node = document.createElement(media.type === "video" ? "video" : "img");
        node.src = media.url;
        if (node instanceof HTMLVideoElement) { node.controls = true; node.preload = "metadata"; }
        else node.alt = "Media trong bài viết";
        gallery.appendChild(node);
    });
    content.append(meta, text);
    if (gallery.children.length) content.appendChild(gallery);
    const footer = document.createElement("footer");
    footer.className = "admin-detail-footer";
    footer.innerHTML = '<button type="button"><i class="fa-solid fa-up-right-from-square"></i> Mở trong cộng đồng</button>';
    footer.querySelector("button").addEventListener("click", () => window.open(`../community/community-feed-page.html?post=${encodeURIComponent(post.id)}`, "_blank", "noopener"));
    openDetailDialog({ title: post.authorDisplayName || "Không rõ tác giả", subtitle: "Chi tiết bài viết", content, footer });
}

subscribeAdminData("posts", payload => { state.all = payload.data; state.loading = payload.loading; state.error = payload.error; applyFilters(); });
