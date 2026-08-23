import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { resolveDisplayName } from "../shared/user-identity.js";
import { restartAdminData, subscribeAdminData } from "./admin-data-store.js";
import { confirmAction, debounce, openAnchoredMenu, setButtonBusy, showToast } from "./admin-ui.js";
import { recordAdminAudit } from "./admin-audit-service.js";

const DEFAULT_AVATAR = "../shared/assets/default-avatar.png?v=3";
const elements = {
    body: document.getElementById("users-tbody"),
    search: document.getElementById("user-search"),
    role: document.getElementById("user-role-filter"),
    status: document.getElementById("user-status-filter"),
    sort: document.getElementById("user-sort"),
    reset: document.getElementById("reset-user-filters"),
    refresh: document.getElementById("refresh-users"),
    count: document.getElementById("users-result-count"),
    pagination: document.getElementById("users-pagination")
};

const state = { all: [], filtered: [], loading: true, error: null, query: "", page: 1, pageSize: 10 };

function timestampMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
    const time = timestampMs(value);
    return time ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(time) : "Chưa xác định";
}

function applyFilters({ resetPage = false } = {}) {
    if (resetPage) state.page = 1;
    const keyword = state.query.toLocaleLowerCase("vi");
    let users = state.all.filter(user => {
        const roleMatch = elements.role.value === "all" || (user.role || "user") === elements.role.value;
        const status = user.accountStatus === "suspended" ? "suspended" : "active";
        const statusMatch = elements.status.value === "all" || status === elements.status.value;
        const haystack = `${resolveDisplayName(user)} ${user.username || ""} ${user.email || ""} ${user.id}`.toLocaleLowerCase("vi");
        return roleMatch && statusMatch && (!keyword || haystack.includes(keyword));
    });
    const sort = elements.sort.value;
    users.sort((a, b) => {
        if (sort === "oldest") return timestampMs(a.createdAt || a.joinedAt) - timestampMs(b.createdAt || b.joinedAt);
        if (sort === "name-asc") return resolveDisplayName(a).localeCompare(resolveDisplayName(b), "vi");
        if (sort === "name-desc") return resolveDisplayName(b).localeCompare(resolveDisplayName(a), "vi");
        return timestampMs(b.createdAt || b.joinedAt) - timestampMs(a.createdAt || a.joinedAt);
    });
    state.filtered = users;
    const pages = Math.max(1, Math.ceil(users.length / state.pageSize));
    state.page = Math.min(state.page, pages);
    render();
}

function render() {
    if (!elements.body) return;
    if (state.loading) { renderLoading(); return; }
    if (state.error) { renderError(); return; }
    elements.count.textContent = `${state.filtered.length} kết quả`;
    if (!state.filtered.length) {
        elements.body.innerHTML = '<tr><td colspan="7" class="admin-empty-state"><div class="admin-empty-state-inner"><i class="fa-solid fa-users-slash"></i><strong>Không tìm thấy người dùng</strong><small>Thử thay đổi từ khóa hoặc đặt lại bộ lọc.</small></div></td></tr>';
        renderPagination();
        return;
    }
    const start = (state.page - 1) * state.pageSize;
    const pageItems = state.filtered.slice(start, start + state.pageSize);
    elements.body.replaceChildren(...pageItems.map(createUserRow));
    renderPagination();
}

function createUserRow(user) {
    const row = document.createElement("tr");
    row.dataset.userId = user.id;
    const name = resolveDisplayName(user);
    const role = user.role === "admin" ? "admin" : "user";
    const suspended = user.accountStatus === "suspended";
    row.innerHTML = `
        <td data-label="Người dùng"><div class="table-user-info"><span class="table-user-avatar"></span><span class="table-user-copy"><strong class="table-user-name"></strong><small class="table-user-id"></small></span></div></td>
        <td data-label="Tên đăng nhập"><span class="table-user-username"></span></td>
        <td data-label="Email"><span class="table-user-email"></span></td>
        <td data-label="Vai trò"><span class="role-badge ${role === "admin" ? "admin-badge" : "user-badge"}">${role === "admin" ? "ADMIN" : "THÀNH VIÊN"}</span></td>
        <td data-label="Trạng thái"><span class="status-badge ${suspended ? "deleted-status" : "active-status"}"><i class="fa-solid fa-circle"></i>${suspended ? "Đã đình chỉ" : "Hoạt động"}</span></td>
        <td data-label="Ngày tham gia"><time>${formatDate(user.createdAt || user.joinedAt)}</time></td>
        <td data-label="Hành động"><button class="row-action-trigger" type="button" data-action="menu" aria-haspopup="menu" aria-expanded="false" aria-label="Mở thao tác cho ${name}"><i class="fa-solid fa-ellipsis"></i></button></td>`;
    const avatar = row.querySelector(".table-user-avatar");
    if (user.photoURL || user.profileImage) {
        const image = document.createElement("img");
        image.src = user.photoURL || user.profileImage;
        image.alt = "";
        image.addEventListener("error", () => { image.src = DEFAULT_AVATAR; }, { once: true });
        avatar.appendChild(image);
    } else avatar.textContent = name.charAt(0).toUpperCase();
    row.querySelector(".table-user-name").textContent = name;
    row.querySelector(".table-user-id").textContent = user.id;
    row.querySelector(".table-user-username").textContent = user.username ? `@${user.username}` : "Chưa thiết lập";
    row.querySelector(".table-user-username").classList.toggle("is-missing", !user.username);
    row.querySelector(".table-user-email").textContent = user.email || "Không có email";
    return row;
}

function renderLoading() {
    elements.body.innerHTML = '<tr class="admin-loading-row"><td colspan="7"><div class="admin-table-skeleton"></div><div class="admin-table-skeleton"></div><div class="admin-table-skeleton"></div></td></tr>';
}

function renderError() {
    elements.body.innerHTML = '<tr><td colspan="7" class="admin-error-state"><div class="admin-empty-state-inner"><i class="fa-solid fa-triangle-exclamation"></i><strong>Không tải được danh sách người dùng</strong><small>Vui lòng kiểm tra kết nối hoặc quyền truy cập.</small><button class="admin-retry-button" type="button">Thử hiển thị lại</button></div></td></tr>';
    elements.body.querySelector(".admin-retry-button")?.addEventListener("click", () => restartAdminData("users"));
}

function renderPagination() {
    const total = state.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    const first = total ? (state.page - 1) * state.pageSize + 1 : 0;
    const last = Math.min(state.page * state.pageSize, total);
    elements.pagination.innerHTML = `<span class="admin-pagination-summary">Hiển thị ${first}–${last} trong ${total}</span><div class="admin-pagination-controls"><select aria-label="Số người dùng mỗi trang"><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option></select><button type="button" data-page="prev" aria-label="Trang trước"><i class="fa-solid fa-chevron-left"></i></button><span class="admin-pagination-page">Trang ${state.page}/${totalPages}</span><button type="button" data-page="next" aria-label="Trang sau"><i class="fa-solid fa-chevron-right"></i></button></div>`;
    const select = elements.pagination.querySelector("select");
    select.value = String(state.pageSize);
    elements.pagination.querySelector('[data-page="prev"]').disabled = state.page <= 1;
    elements.pagination.querySelector('[data-page="next"]').disabled = state.page >= totalPages;
}

elements.pagination?.addEventListener("click", event => {
    const direction = event.target.closest("button")?.dataset.page;
    if (!direction) return;
    state.page += direction === "next" ? 1 : -1;
    render();
});
elements.pagination?.addEventListener("change", event => {
    if (event.target.tagName !== "SELECT") return;
    state.pageSize = Number(event.target.value) || 10;
    state.page = 1;
    render();
});

elements.search?.addEventListener("input", debounce(event => { state.query = event.target.value.trim(); applyFilters({ resetPage: true }); }, 320));
[elements.role, elements.status, elements.sort].forEach(control => control?.addEventListener("change", () => applyFilters({ resetPage: true })));
elements.reset?.addEventListener("click", () => {
    elements.search.value = ""; state.query = "";
    elements.role.value = "all"; elements.status.value = "all"; elements.sort.value = "newest";
    applyFilters({ resetPage: true });
});
elements.refresh?.addEventListener("click", () => {
    elements.refresh.classList.add("syncing");
    applyFilters();
    setTimeout(() => elements.refresh.classList.remove("syncing"), 650);
    showToast("Danh sách đã được cập nhật đến thời điểm hiện tại.", { type: "info", title: "Dữ liệu thời gian thực" });
});

elements.body?.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const user = state.all.find(item => item.id === button.closest("tr")?.dataset.userId);
    if (!user) return;
    if (button.dataset.action === "menu") return openUserActions(user, button);
    runUserAction(user, button.dataset.action, button);
});

function openUserActions(user, trigger) {
    const suspended = user.accountStatus === "suspended";
    const admin = user.role === "admin";
    openAnchoredMenu(trigger, {
        label: `Thao tác với ${resolveDisplayName(user)}`,
        actions: [
            { label: admin ? "Hạ quyền thành viên" : "Cấp quyền Admin", description: admin ? "Gỡ quyền quản trị của tài khoản" : "Cho phép truy cập Trung tâm quản trị", icon: admin ? "fa-shield" : "fa-user-shield", onSelect: () => runUserAction(user, "role") },
            { label: suspended ? "Khôi phục tài khoản" : "Đình chỉ tài khoản", description: suspended ? "Cho phép tài khoản hoạt động trở lại" : "Tạm ngừng quyền sử dụng hồ sơ", icon: suspended ? "fa-unlock" : "fa-user-slash", onSelect: () => runUserAction(user, "suspend") },
            { label: "Lưu trữ hồ sơ", description: "Đình chỉ và đánh dấu hồ sơ đã lưu trữ", icon: "fa-box-archive", tone: "danger", onSelect: () => runUserAction(user, "archive") }
        ]
    });
}

async function runUserAction(user, action, button) {
    const currentId = firebaseAuthentication.currentUser?.uid;
    const name = resolveDisplayName(user);
    if ((action === "role" || action === "archive" || action === "suspend") && user.id === currentId) {
        showToast("Bạn không thể thay đổi quyền hoặc đình chỉ chính phiên quản trị đang dùng.", { type: "warning", title: "Thao tác bị chặn" });
        return;
    }
    if (action === "role" && user.role === "admin" && state.all.filter(item => item.role === "admin").length <= 1) {
        showToast("Hệ thống phải còn ít nhất một quản trị viên.", { type: "warning", title: "Không thể hạ quyền" });
        return;
    }
    const suspended = user.accountStatus === "suspended";
    const config = action === "role"
        ? { title: user.role === "admin" ? "Hạ quyền quản trị?" : "Cấp quyền Admin?", description: user.role === "admin" ? "Tài khoản sẽ không còn truy cập được khu vực quản trị." : "Tài khoản sẽ có quyền quản lý người dùng và nội dung.", confirmLabel: user.role === "admin" ? "Hạ quyền" : "Cấp Admin", tone: user.role === "admin" ? "danger" : "default", update: { role: user.role === "admin" ? "user" : "admin" } }
        : action === "suspend"
            ? { title: suspended ? "Khôi phục tài khoản?" : "Đình chỉ tài khoản?", description: suspended ? "Tài khoản sẽ hoạt động trở lại." : "Hồ sơ sẽ bị hạn chế cho đến khi quản trị viên khôi phục.", confirmLabel: suspended ? "Khôi phục" : "Đình chỉ", tone: suspended ? "default" : "danger", update: { accountStatus: suspended ? "active" : "suspended" } }
            : { title: "Lưu trữ hồ sơ?", description: "Thao tác này đình chỉ quyền sử dụng và đưa hồ sơ vào trạng thái lưu trữ. Dữ liệu tài khoản vẫn được bảo toàn.", confirmLabel: "Lưu trữ", tone: "danger", update: { accountStatus: "suspended", profileArchivedByAdmin: true } };
    const accepted = await confirmAction({ ...config, context: `${name} · ${user.email || user.id}` });
    if (!accepted) return;
    setButtonBusy(button, true);
    try {
        await updateDoc(doc(firebaseDatabase, "users", user.id), config.update);
        await recordAdminAudit(`user.${action}`, "user", user.id, { update: config.update });
        showToast(`Đã cập nhật tài khoản ${name}.`);
    } catch (error) {
        console.error("Không thể cập nhật người dùng", error);
        showToast("Không thể lưu thay đổi. Vui lòng kiểm tra quyền truy cập hoặc kết nối.", { type: "error" });
    } finally {
        setButtonBusy(button, false);
    }
}

subscribeAdminData("users", payload => {
    state.all = payload.data;
    state.loading = payload.loading;
    state.error = payload.error;
    applyFilters();
});
