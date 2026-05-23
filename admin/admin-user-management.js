import {
    firebaseDatabase
} from "../shared/firebase-connection.js";

import {
    collection,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Elements
const usersTbody = document.getElementById("users-tbody");
const totalUsersCount = document.getElementById("total-users-count");
const userSearchInput = document.getElementById("user-search");
const refreshUsersBtn = document.getElementById("refresh-users");

// Realtime Listener
let allUsers = [];

const usersCollection = collection(firebaseDatabase, "users");

onSnapshot(usersCollection, (snapshot) => {
    allUsers = [];
    usersTbody.innerHTML = "";

    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const userId = docSnap.id;
        allUsers.push({ id: userId, ...user });

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${user.email || 'Không có email'}</td>
            <td>${user.displayName || 'Chưa đặt tên'}</td>
            <td>
                <span class="role-badge ${user.role === 'admin' ? 'admin-badge' : 'user-badge'}">
                    ${user.role || 'user'}
                </span>
            </td>
            <td class="action-cell">
                <button class="admin-action-btn admin-make-admin" data-id="${userId}">
                    ${user.role === 'admin' ? '✓ Admin' : 'Make Admin'}
                </button>
                <button class="admin-action-btn admin-delete" data-id="${userId}">
                    Xóa
                </button>
            </td>
        `;
        usersTbody.appendChild(row);
    });

    // Cập nhật tổng số người dùng
    if (totalUsersCount) totalUsersCount.textContent = snapshot.size;
});

// Event Delegation cho buttons
usersTbody.addEventListener("click", async (e) => {
    const userId = e.target.dataset.id;
    if (!userId) return;

    if (e.target.classList.contains("admin-make-admin")) {
        await promoteUserToAdmin(userId);
    }

    if (e.target.classList.contains("admin-delete")) {
        await deleteSystemUser(userId);
    }
});

// Promote to Admin
async function promoteUserToAdmin(userId) {
    if (!confirm("Thăng cấp người dùng này thành Admin?")) return;

    try {
        await updateDoc(doc(firebaseDatabase, "users", userId), {
            role: "admin"
        });
        alert("✅ Đã thăng cấp thành Admin thành công!");
    } catch (error) {
        console.error(error);
        alert("Có lỗi xảy ra!");
    }
}

// Delete User
async function deleteSystemUser(userId) {
    if (!confirm("Bạn chắc chắn muốn xóa người dùng này?")) return;

    try {
        await deleteDoc(doc(firebaseDatabase, "users", userId));
        alert("✅ Đã xóa người dùng thành công!");
    } catch (error) {
        console.error(error);
        alert("Không thể xóa người dùng!");
    }
}

// Refresh button
if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener("click", () => {
        // onSnapshot đã realtime nên chỉ cần thông báo
        alert("Đang tải dữ liệu mới nhất...");
    });
}

// Search functionality (tùy chọn)
if (userSearchInput) {
    userSearchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const rows = usersTbody.querySelectorAll("tr");

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? "" : "none";
        });
    });
}