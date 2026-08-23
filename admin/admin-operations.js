import { subscribeAdminData } from "./admin-data-store.js";
import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { confirmAction, setButtonBusy, showToast } from "./admin-ui.js";
import { recordAdminAudit } from "./admin-audit-service.js";

const datasets = { users: [], posts: [], conversations: [], notifications: [], messageNotifications: [], adminAuditLogs: [] };
const loading = new Set(Object.keys(datasets));
const errors = {};
const $ = id => document.getElementById(id);

function timeMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    return new Date(value).getTime() || 0;
}

function relativeTime(value) {
    const ms = timeMs(value);
    if (!ms) return "Chưa xác định";
    const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
    if (minutes < 1) return "Vừa xong";
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);
}

function setText(id, value) { const node = $(id); if (node) node.textContent = value; }

function activityLabel(item) {
    const type = item.type || "activity";
    const map = {
        friend_request: "Lời mời kết bạn", friend_accepted: "Kết nối mới", friend_post: "Bài viết mới",
        comment: "Bình luận mới", comment_reply: "Phản hồi bình luận", reaction: "Tương tác bài viết",
        admin_moderation: "Thông báo kiểm duyệt"
    };
    return map[type] || "Hoạt động cộng đồng";
}

function renderActivity() {
    const list = $("ops-activity-list");
    if (!list) return;
    if (errors.notifications) {
        list.innerHTML = '<div class="admin-inline-error"><i class="fa-solid fa-triangle-exclamation"></i><span>Không thể đọc luồng thông báo.</span></div>';
        return;
    }
    const items = [...datasets.notifications].sort((a, b) => timeMs(b.createdAt) - timeMs(a.createdAt)).slice(0, 12);
    list.replaceChildren();
    if (!items.length) {
        list.innerHTML = '<div class="admin-empty-compact"><i class="fa-regular fa-bell-slash"></i><strong>Chưa có hoạt động</strong><small>Thông báo mới sẽ xuất hiện tại đây.</small></div>';
        return;
    }
    items.forEach(item => {
        const row = document.createElement("article");
        row.className = "admin-activity-item";
        const icon = document.createElement("span"); icon.innerHTML = '<i class="fa-regular fa-bell"></i>';
        const copy = document.createElement("div");
        const title = document.createElement("strong"); title.textContent = activityLabel(item);
        const message = document.createElement("p"); message.textContent = item.message || "Hệ thống đã ghi nhận một hoạt động mới.";
        const meta = document.createElement("small"); meta.textContent = `${item.actorName || "Thành viên"} · ${relativeTime(item.createdAt)}`;
        copy.append(title, message, meta); row.append(icon, copy); list.append(row);
    });
}

function renderHealth() {
    const list = $("ops-health-list");
    if (!list) return;
    const checks = [
        [!errors.conversations, "Dữ liệu hội thoại", errors.conversations ? "Không có quyền đọc hoặc mất kết nối" : "Đang cập nhật trực tiếp"],
        [!errors.notifications, "Luồng thông báo", errors.notifications ? "Không thể đồng bộ" : "Đồng bộ bình thường"],
        [!errors.messageNotifications, "Tín hiệu tin nhắn", errors.messageNotifications ? "Không thể đồng bộ" : "Đồng bộ bình thường"],
        [!loading.size, "Trạng thái tải", loading.size ? `Đang tải ${loading.size} nguồn dữ liệu` : "Tất cả nguồn đã phản hồi"]
    ];
    list.replaceChildren(...checks.map(([ok, title, detail]) => {
        const row = document.createElement("div"); row.className = `admin-health-row ${ok ? "is-ok" : "is-warning"}`;
        row.innerHTML = `<i class="fa-solid ${ok ? "fa-circle-check" : "fa-triangle-exclamation"}"></i><span><strong></strong><small></small></span>`;
        row.querySelector("strong").textContent = title; row.querySelector("small").textContent = detail;
        return row;
    }));
}

function renderAudit() {
    const list = $("admin-audit-list");
    if (!list) return;
    const items = [...datasets.adminAuditLogs].sort((a, b) => timeMs(b.createdAt) - timeMs(a.createdAt));
    setText("audit-result-count", `${items.length} sự kiện`);
    if (errors.adminAuditLogs) {
        list.innerHTML = '<div class="admin-audit-permission"><i class="fa-solid fa-lock"></i><div><strong>Chưa thể đọc nhật ký</strong><p>Quyền truy cập nhật ký quản trị chưa được kích hoạt. Vui lòng hoàn tất cấu hình hệ thống.</p></div></div>';
        return;
    }
    list.replaceChildren();
    if (!items.length) {
        list.innerHTML = '<div class="admin-empty-compact"><i class="fa-solid fa-clipboard-check"></i><strong>Chưa có thay đổi mới</strong><small>Thao tác quản trị phát sinh từ phiên bản này sẽ xuất hiện tại đây.</small></div>';
        return;
    }
    items.slice(0, 100).forEach(item => {
        const row = document.createElement("article"); row.className = "admin-audit-item";
        row.innerHTML = '<span class="admin-audit-icon"><i class="fa-solid fa-shield"></i></span><div><strong></strong><p></p><small></small></div><time></time>';
        row.querySelector("strong").textContent = String(item.action || "admin.action").replaceAll(".", " · ");
        row.querySelector("p").textContent = `${item.targetType || "đối tượng"}: ${item.targetId || "không xác định"}`;
        row.querySelector("small").textContent = item.adminEmail || item.adminId || "Quản trị viên";
        row.querySelector("time").textContent = relativeTime(item.createdAt);
        list.append(row);
    });
}

function render() {
    setText("ops-conversations-count", datasets.conversations.length.toLocaleString("vi-VN"));
    setText("ops-unread-notifications", datasets.notifications.filter(item => !item.isRead).length.toLocaleString("vi-VN"));
    setText("ops-message-signals", datasets.messageNotifications.length.toLocaleString("vi-VN"));
    setText("ops-suspended-users", datasets.users.filter(item => item.accountStatus === "suspended").length.toLocaleString("vi-VN"));
    setText("admin-broadcast-audience", datasets.users.filter(item => item.accountStatus !== "suspended").length.toLocaleString("vi-VN"));
    renderActivity(); renderHealth(); renderAudit();
}

Object.keys(datasets).forEach(type => subscribeAdminData(type, payload => {
    datasets[type] = payload.data;
    if (payload.loading) loading.add(type); else loading.delete(type);
    errors[type] = payload.error;
    render();
}));

$("admin-broadcast-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const message = $("admin-broadcast-message")?.value.trim() || "";
    const recipients = datasets.users.filter(item => item.accountStatus !== "suspended" && item.id !== firebaseAuthentication.currentUser?.uid);
    if (message.length < 10) return showToast("Thông báo cần có ít nhất 10 ký tự.", { type: "warning", title: "Nội dung quá ngắn" });
    if (!recipients.length) return showToast("Không có thành viên phù hợp để nhận thông báo.", { type: "warning" });
    const accepted = await confirmAction({
        title: "Phát thông báo hệ thống?",
        description: `Thông báo này sẽ xuất hiện cho ${recipients.length} thành viên đang hoạt động.`,
        context: message,
        confirmLabel: "Gửi thông báo",
        icon: "fa-bullhorn"
    });
    if (!accepted) return;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Đang gửi");
    const admin = firebaseAuthentication.currentUser;
    try {
        const results = await Promise.allSettled(recipients.map(recipient => addDoc(collection(firebaseDatabase, "notifications"), {
            recipientId: recipient.id, actorId: admin.uid, actorName: "Quản trị viên VHHT",
            type: "admin_announcement", message, isRead: false, createdAt: serverTimestamp()
        })));
        const sent = results.filter(result => result.status === "fulfilled").length;
        const failed = results.length - sent;
        await recordAdminAudit("system.broadcast", "users", "active-members", { sent, failed, message });
        if (!failed) { $("admin-broadcast-message").value = ""; showToast(`Đã gửi thông báo tới ${sent} thành viên.`, { title: "Phát thông báo thành công" }); }
        else showToast(`Đã gửi ${sent}/${results.length} thông báo. ${failed} lượt gửi thất bại.`, { type: "warning", title: "Hoàn tất một phần" });
    } catch (error) {
        console.error("Không thể phát thông báo", error);
        showToast("Không thể phát thông báo lúc này.", { type: "error" });
    } finally { setButtonBusy(button, false); }
});
