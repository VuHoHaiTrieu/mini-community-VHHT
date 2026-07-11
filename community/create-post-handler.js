import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ĐÃ SỬA ĐÚNG ID THEO HTML CỦA BẠN
const createCommunityPostButton = document.getElementById("create-community-post-button");
const postImageInput = document.getElementById("main-post-file-input"); // Sửa id
const postImagePreviewBox = document.getElementById("main-post-preview-box"); // Sửa id
const postPreviewRenderZone = document.getElementById("main-preview-render-zone"); // Sửa id
const removePostImgBtn = document.getElementById("remove-main-preview-btn"); // Sửa id
const communityPostInput = document.getElementById("main-post-textarea"); // Sửa id

let authenticatedUser = null;
let base64PostMediaString = null; 
let detectedMediaType = "image";

onAuthStateChanged(firebaseAuthentication, (user) => {
    authenticatedUser = user;
});

// Xử lý đính kèm file (Ảnh / Video) dưới 1.5MB để tối ưu Base64
if (postImageInput) {
    postImageInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 1.5 * 1024 * 1024) {
            alert("Tập tin quá lớn! Vũ trụ chỉ nhận file dưới 1.5MB để truyền tải nhanh.");
            postImageInput.value = "";
            return;
        }

        detectedMediaType = file.type.startsWith("video/") ? "video" : "image";

        const reader = new FileReader();
        reader.onload = (event) => {
            base64PostMediaString = event.target.result;
            postPreviewRenderZone.innerHTML = "";

            if (detectedMediaType === "video") {
                postPreviewRenderZone.innerHTML = `<video src="${base64PostMediaString}" autoplay muted loop style="max-width:100%; max-height:150px; border-radius:8px;"></video>`;
            } else {
                postPreviewRenderZone.innerHTML = `<img src="${base64PostMediaString}" alt="Preview" style="max-width:100%; max-height:150px; border-radius:8px;">`;
            }
            postImagePreviewBox.style.display = "block";
        };
        reader.readAsDataURL(file);
    });
}

if (removePostImgBtn) {
    removePostImgBtn.addEventListener("click", () => {
        base64PostMediaString = null;
        postImageInput.value = "";
        postImagePreviewBox.style.display = "none";
        postPreviewRenderZone.innerHTML = "";
    });
}

// Bắt sự kiện Click nút phóng bài viết
if (createCommunityPostButton) {
    createCommunityPostButton.addEventListener("click", createNewCommunityPost);
}

// THÊM TÍNH NĂNG: Bấm Enter để đăng bài (Nhấn Shift + Enter nếu muốn xuống dòng)
if (communityPostInput) {
    communityPostInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault(); // Ngăn hành vi xuống dòng mặc định của textarea
            createNewCommunityPost();
        }
    });
}

// Hàm xử lý đăng bài chính
async function createNewCommunityPost() {
    const communityPostContent = communityPostInput.value.trim();

    if (communityPostContent === "" && !base64PostMediaString) return;
    if (!authenticatedUser) { alert("Tín hiệu thất bại! Bạn chưa đăng nhập."); return; }

    // Kích hoạt hiệu ứng ánh sáng bay lên quỹ đạo bài viết
    playCosmicLaunchEffect();

    createCommunityPostButton.disabled = true;
    createCommunityPostButton.innerHTML = `<i class="fa-solid fa-satellite fa-spin"></i>`;

    try {
        // LẤY AVATAR VÀ TÊN MỚI NHẤT TRÊN FIRESTORE ĐỂ ĐỒNG BỘ
        const userDoc = await getDoc(doc(firebaseDatabase, "users", authenticatedUser.uid));
        let displayName = "Phi hành gia";
        let userAvatar = ""; // Chuỗi chứa Base64 avatar của bạn

        if (userDoc.exists()) {
            const userData = userDoc.data();
            displayName = userData.displayName || displayName;
            userAvatar = userData.photoURL || ""; 
        }

        await addDoc(collection(firebaseDatabase, "posts"), {
            authorId: authenticatedUser.uid,
            authorEmail: authenticatedUser.email,
            authorDisplayName: displayName,
            authorAvatar: userAvatar, // Gửi kèm avatar chính chủ vào bài đăng
            content: communityPostContent,
            attachedImage: base64PostMediaString, 
            mediaType: base64PostMediaString ? detectedMediaType : null,
            createdAt: serverTimestamp(),
            reactions: {},
            commentCount: 0
        });

        // Reset Form
        communityPostInput.value = "";
        base64PostMediaString = null;
        if (postImageInput) postImageInput.value = "";
        if (postImagePreviewBox) postImagePreviewBox.style.display = "none";
        postPreviewRenderZone.innerHTML = "";
    } catch (error) {
        console.error("Lỗi khi đăng tải bài viết:", error);
        alert("Lỗi truyền tải dữ liệu vào không gian!");
    } finally {
        createCommunityPostButton.disabled = false;
        createCommunityPostButton.innerHTML = `<i class="fa-solid fa-paper-plane"></i>`;
    }
}

// HIỆU ỨNG ÁNH SÁNG PHÓNG BÀI VIẾT (Bay từ nút đăng sang khu vực bài viết cá nhân)
function playCosmicLaunchEffect() {
    const startRect = createCommunityPostButton.getBoundingClientRect();
    const targetPanel = document.getElementById("my-posts-fixed-panel") || document.getElementById("community-post-feed-container");
    const targetRect = targetPanel.getBoundingClientRect();

    const beam = document.createElement("div");
    beam.style.position = "fixed";
    beam.style.top = `${startRect.top + startRect.height / 2}px`;
    beam.style.left = `${startRect.left + startRect.width / 2}px`;
    beam.style.width = "10px";
    beam.style.height = "10px";
    beam.style.borderRadius = "50%";
    beam.style.background = "linear-gradient(90deg, #38bdf8, #a855f7)";
    beam.style.boxShadow = "0 0 20px #38bdf8, 0 0 40px #a855f7";
    beam.style.zIndex = "99999";
    beam.style.pointerEvents = "none";
    beam.style.transition = "all 0.8s cubic-bezier(0.25, 1, 0.5, 1)";

    document.body.appendChild(beam);

    // Kích hoạt hiệu ứng di chuyển hình học tịnh tiến trong tích tắc
    setTimeout(() => {
        beam.style.top = `${targetRect.top + 40}px`;
        beam.style.left = `${targetRect.left + targetRect.width / 2}px`;
        beam.style.transform = "scale(3)";
        beam.style.opacity = "0";
    }, 50);

    setTimeout(() => { beam.remove(); }, 850);
}