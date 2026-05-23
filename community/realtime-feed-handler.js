import {
    firebaseAuthentication,
    firebaseDatabase
} from "../shared/firebase-connection.js";

import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    deleteDoc,
    updateDoc,
    serverTimestamp,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* =========================================
   ELEMENTS
========================================= */
const communityPostFeedContainer = document.getElementById("community-post-feed-container");
const myOwnPostsContainer = document.getElementById("my-own-posts-container");
const currentUserDisplayName = document.getElementById("community-current-user-display-name");
const myPostsFixedPanel = document.getElementById("my-posts-fixed-panel");
const toggleMyPostsPanelButton = document.getElementById("toggle-my-posts-panel-button");

/* =========================================
   STATES
========================================= */
let authenticatedUser = null;
let authenticatedUserRole = "user";
let selectedPostCard = null;
let postCardsMap = new Map();

/* =========================================
   AUTH
========================================= */
onAuthStateChanged(firebaseAuthentication, async (user) => {
    authenticatedUser = user;
    if (!user) return;

    const userDoc = await getDoc(doc(firebaseDatabase, "users", user.uid));
    const userData = userDoc.data();

    authenticatedUserRole = userData.role || "user";
    currentUserDisplayName.innerText = userData.displayName || "Người dùng";
});

/* =========================================
   TOGGLE MY POSTS
========================================= */
toggleMyPostsPanelButton.addEventListener("click", () => {
    const isCollapsed = myPostsFixedPanel.classList.toggle("collapsed");
    toggleMyPostsPanelButton.innerHTML = isCollapsed 
        ? `<i class="fa-solid fa-chevron-right"></i>` 
        : `<i class="fa-solid fa-chevron-left"></i>`;
});

if (myPostsFixedPanel.classList.contains("collapsed")) {
    toggleMyPostsPanelButton.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
}

/* =========================================
   REALTIME POSTS
========================================= */
const communityPostsQuery = query(
    collection(firebaseDatabase, "posts"),
    orderBy("createdAt", "desc")
);

onSnapshot(communityPostsQuery, (snapshot) => {
    const currentPostIds = new Set();

    snapshot.forEach((docSnapshot) => {
        const postData = docSnapshot.data();
        const postId = docSnapshot.id;
        currentPostIds.add(postId);

        if (authenticatedUser && authenticatedUser.uid === postData.authorId) {
            createOrUpdateMyPost(postData, postId);
        } else {
            createOrUpdateFloatingPost(postData, postId);
        }
    });

    postCardsMap.forEach((card, id) => {
        if (!currentPostIds.has(id)) {
            card.remove();
            postCardsMap.delete(id);
        }
    });
});

/* MY POSTS */
function createOrUpdateMyPost(postData, postId) {
    let myPostCard = document.getElementById(`my-post-${postId}`);
    if (!myPostCard) {
        myPostCard = document.createElement("div");
        myPostCard.id = `my-post-${postId}`;
        myPostCard.className = "my-own-post-card";
        myOwnPostsContainer.appendChild(myPostCard);
    }

    myPostCard.innerHTML = `
        <div class="community-post-author">✨ ${postData.authorDisplayName}</div>
        <div class="community-post-content">${postData.content}</div>
        <div class="community-post-actions">
            <button class="edit-btn">✏️</button>
            <button class="delete-btn">🗑</button>
        </div>
    `;

    myPostCard.querySelector(".edit-btn").addEventListener("click", () => editCommunityPost(postId));
    myPostCard.querySelector(".delete-btn").addEventListener("click", () => deleteCommunityPost(postId));
}

/* FLOATING POSTS */
function createOrUpdateFloatingPost(postData, postId) {
    let postCard = postCardsMap.get(postId);

    if (!postCard) {
        postCard = document.createElement("div");
        postCard.className = "community-post-card";
        postCard.dataset.postId = postId;
        communityPostFeedContainer.appendChild(postCard);
        postCardsMap.set(postId, postCard);

        addClickToExpand(postCard);
        startFloatingMovement(postCard);
    }

    const contentHTML = postData.deletedByAdmin 
        ? `<div class="community-post-content">⚠️ Đã bị admin xóa</div>`
        : `<div class="community-post-content">${postData.content}</div>`;

    const adminHTML = (authenticatedUserRole === "admin" && !postData.deletedByAdmin)
        ? `<button class="admin-delete-btn">🚫</button>` : "";

    postCard.innerHTML = `
        <div class="community-post-author">✨ ${postData.authorDisplayName}</div>
        ${contentHTML}
        <div class="community-post-actions">${adminHTML}</div>
    `;

    if (authenticatedUserRole === "admin") {
        const btn = postCard.querySelector(".admin-delete-btn");
        if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); adminDeletePost(postId); });
    }
}

/* CLICK TO EXPAND */
function addClickToExpand(postCard) {
    postCard.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") return;
        e.stopPropagation();
        selectedPostCard === postCard ? removeSelectedPost() : selectPostCard(postCard);
    });
}

/* SELECT POST */
function selectPostCard(postCard) {
    removeSelectedPost();
    selectedPostCard = postCard;
    postCard.classList.add("selected-post");

    const centerX = (window.innerWidth / 2) - 170;
    const centerY = (window.innerHeight / 2) - 130;

    postCard.style.transition = "all 0.45s ease";
    postCard.style.left = `${centerX}px`;
    postCard.style.top = `${centerY}px`;
    postCard.style.zIndex = "9999";

    document.querySelectorAll(".community-post-card").forEach(c => {
        if (c !== postCard) c.classList.add("blurred-post");
    });
}

function removeSelectedPost() {
    if (!selectedPostCard) return;
    document.querySelectorAll(".community-post-card").forEach(c => {
        c.classList.remove("blurred-post", "selected-post");
    });
    selectedPostCard = null;
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".community-post-card")) removeSelectedPost();
});

/* =========================================
   FLOATING MOVEMENT - ĐÃ SỬA THEO Ý BẠN
========================================= */
function startFloatingMovement(postCard) {
    let posX = Math.random() * (window.innerWidth - 200) + 50;
    let posY = Math.random() * (window.innerHeight - 300) + 100;

    let velocityX = (Math.random() - 0.5) * 2.2;
    let velocityY = (Math.random() - 0.5) * 2.2;

    function animate() {
        if (selectedPostCard === postCard) {
            requestAnimationFrame(animate);
            return;
        }

        posX += velocityX;
        posY += velocityY;

        // Tăng tốc nhẹ tự nhiên
        velocityX += (Math.random() - 0.5) * 0.012;
        velocityY += (Math.random() - 0.5) * 0.012;

        velocityX = Math.max(-2.5, Math.min(2.5, velocityX));
        velocityY = Math.max(-2.5, Math.min(2.5, velocityY));

        postCard.style.left = `${posX}px`;
        postCard.style.top = `${posY}px`;

        // Nếu trôi ra khỏi màn hình thì spawn lại ngẫu nhiên
        const isOutside = 
            posX > window.innerWidth + 180 ||
            posX < -180 ||
            posY > window.innerHeight + 180 ||
            posY < -180;

        if (isOutside) {
            // Spawn ngẫu nhiên từ một phía
            const side = Math.floor(Math.random() * 4);
            
            if (side === 0) { // Trái
                posX = -160;
                posY = Math.random() * window.innerHeight;
            } else if (side === 1) { // Phải
                posX = window.innerWidth + 160;
                posY = Math.random() * window.innerHeight;
            } else if (side === 2) { // Trên
                posX = Math.random() * window.innerWidth;
                posY = -160;
            } else { // Dưới
                posX = Math.random() * window.innerWidth;
                posY = window.innerHeight + 160;
            }

            // Reset vận tốc mới
            velocityX = (Math.random() - 0.5) * 2.2;
            velocityY = (Math.random() - 0.5) * 2.2;
        }

        requestAnimationFrame(animate);
    }

    animate();
}

/* DELETE & EDIT */
window.deleteCommunityPost = async (postId) => {
    if (confirm("Xóa bài viết?")) await deleteDoc(doc(firebaseDatabase, "posts", postId));
};

window.editCommunityPost = async (postId) => {
    const newContent = prompt("Chỉnh sửa bài viết:", "");
    if (newContent?.trim()) {
        await updateDoc(doc(firebaseDatabase, "posts", postId), {
            content: newContent,
            updatedAt: serverTimestamp()
        });
    }
};

window.adminDeletePost = async (postId) => {
    if (confirm("Admin xóa bài này?")) {
        await updateDoc(doc(firebaseDatabase, "posts", postId), {
            deletedByAdmin: true,
            deletedReason: "Vi phạm quy định"
        });
    }
};