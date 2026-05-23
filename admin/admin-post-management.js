import {
    firebaseDatabase
} from "../shared/firebase-connection.js";

import {
    collection,
    onSnapshot,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Elements
const postsTbody = document.getElementById("posts-tbody");
const totalPostsCount = document.getElementById("total-posts-count");
const postSearchInput = document.getElementById("post-search");
const refreshPostsBtn = document.getElementById("refresh-posts");

// Realtime Listener
const postsCollection = collection(firebaseDatabase, "posts");

onSnapshot(postsCollection, (snapshot) => {
    postsTbody.innerHTML = "";

    if (totalPostsCount) {
        totalPostsCount.textContent = snapshot.size;
    }

    snapshot.forEach((docSnap) => {
        const post = docSnap.data();
        const postId = docSnap.id;

        const status = post.deletedByAdmin 
            ? `<span class="status-badge deleted">Đã xóa</span>` 
            : `<span class="status-badge active">Đang hiển thị</span>`;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${post.authorDisplayName || 'Không rõ'}</td>
            <td class="post-content-cell">${post.content || ''}</td>
            <td>${status}</td>
            <td class="action-cell">
                ${!post.deletedByAdmin ? `
                    <button class="admin-action-btn admin-delete" data-id="${postId}">
                        Xóa bài
                    </button>
                ` : `
                    <button class="admin-action-btn admin-restore" data-id="${postId}">
                        Khôi phục
                    </button>
                `}
            </td>
        `;
        postsTbody.appendChild(row);
    });
});

// Event Delegation cho nút hành động
postsTbody.addEventListener("click", async (e) => {
    const postId = e.target.dataset.id;
    if (!postId) return;

    if (e.target.classList.contains("admin-delete")) {
        await adminDeleteCommunityPost(postId);
    }

    if (e.target.classList.contains("admin-restore")) {
        await restoreCommunityPost(postId);
    }
});

// Admin Delete Post
async function adminDeleteCommunityPost(postId) {
    if (!confirm("Bạn chắc chắn muốn xóa bài viết này?")) return;

    try {
        await updateDoc(doc(firebaseDatabase, "posts", postId), {
            deletedByAdmin: true,
            deletedReason: "Vi phạm quy định cộng đồng"
        });
        alert("✅ Đã xóa bài viết thành công!");
    } catch (error) {
        console.error(error);
        alert("Có lỗi khi xóa bài viết!");
    }
}

// Restore Post
async function restoreCommunityPost(postId) {
    if (!confirm("Khôi phục bài viết này?")) return;

    try {
        await updateDoc(doc(firebaseDatabase, "posts", postId), {
            deletedByAdmin: false,
            deletedReason: ""
        });
        alert("✅ Đã khôi phục bài viết thành công!");
    } catch (error) {
        console.error(error);
        alert("Có lỗi khi khôi phục bài viết!");
    }
}

// Refresh Button
if (refreshPostsBtn) {
    refreshPostsBtn.addEventListener("click", () => {
        alert("Đang tải dữ liệu mới nhất...");
    });
}

// Search functionality
if (postSearchInput) {
    postSearchInput.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase().trim();
        const rows = postsTbody.querySelectorAll("tr");

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? "" : "none";
        });
    });
}