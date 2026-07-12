import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { uploadMedia, validateImage, validateVideo } from "../shared/cloudinary-media-service.js";
import { rememberAuthoredPost } from "../shared/authored-post-cache.js";

// ĐÃ SỬA ĐÚNG ID THEO HTML CỦA BẠN
const createCommunityPostButton = document.getElementById("create-community-post-button");
const postImageInput = document.getElementById("main-post-file-input"); // Sửa id
const postImagePreviewBox = document.getElementById("main-post-preview-box"); // Sửa id
const postPreviewRenderZone = document.getElementById("main-preview-render-zone"); // Sửa id
const removePostImgBtn = document.getElementById("remove-main-preview-btn"); // Sửa id
const communityPostInput = document.getElementById("main-post-textarea"); // Sửa id
const postPrivacyInput = document.getElementById("main-post-privacy");

let authenticatedUser = null;
let detectedMediaType = "image";
let selectedPostMediaFile = null;
let postPreviewObjectUrl = null;
const uploadStatus = createUploadStatus();

onAuthStateChanged(firebaseAuthentication, (user) => {
    authenticatedUser = user;
});

// Xử lý đính kèm file (Ảnh / Video) dưới 1.5MB để tối ưu Base64
if (postImageInput) {
    postImageInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            if (file.type.startsWith("image/")) validateImage(file);
            else await validateVideo(file);
        } catch (error) {
            alert(error.message);
            postImageInput.value = "";
            return;
        }

        detectedMediaType = file.type.startsWith("video/") ? "video" : "image";
        selectedPostMediaFile = file;

        if (postPreviewObjectUrl) URL.revokeObjectURL(postPreviewObjectUrl);
        postPreviewObjectUrl = URL.createObjectURL(file);
        postPreviewRenderZone.replaceChildren();
        const preview = document.createElement(detectedMediaType === "video" ? "video" : "img");
        preview.src = postPreviewObjectUrl;
        preview.style.cssText = "max-width:100%;max-height:150px;border-radius:8px";
        if (detectedMediaType === "video") { preview.controls = true; preview.preload = "metadata"; }
        else preview.alt = "Xem trước ảnh bài viết";
        postPreviewRenderZone.appendChild(preview);
        postImagePreviewBox.style.display = "block";
        document.querySelector(".community-create-post-container-wrapper")?.classList.add("has-selected-media");
    });
}

if (removePostImgBtn) {
    removePostImgBtn.addEventListener("click", () => {
        selectedPostMediaFile = null;
        if (postPreviewObjectUrl) URL.revokeObjectURL(postPreviewObjectUrl);
        postPreviewObjectUrl = null;
        postImageInput.value = "";
        postImagePreviewBox.style.display = "none";
        postPreviewRenderZone.innerHTML = "";
        document.querySelector(".community-create-post-container-wrapper")?.classList.remove("has-selected-media");
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

    if (communityPostContent === "" && !selectedPostMediaFile) return;
    if (!authenticatedUser) { alert("Tín hiệu thất bại! Bạn chưa đăng nhập."); return; }

    createCommunityPostButton.disabled = true;
    createCommunityPostButton.innerHTML = `<i class="fa-solid fa-satellite fa-spin"></i>`;

    try {
        // LẤY AVATAR VÀ TÊN MỚI NHẤT TRÊN FIRESTORE ĐỂ ĐỒNG BỘ
        const userDoc = await getDoc(doc(firebaseDatabase, "users", authenticatedUser.uid));
        let displayName = "Phi hành gia";
        let userAvatar = ""; // Chuỗi chứa Base64 avatar của bạn
        let authorRole = "user";
        let friendIds = [];

        if (userDoc.exists()) {
            const userData = userDoc.data();
            displayName = userData.displayName || displayName;
            userAvatar = userData.photoURL || ""; 
            authorRole = userData.role || "user";
            friendIds = userData.friends || [];
        }

        let media = null;
        if (selectedPostMediaFile) {
            setUploadProgress(0, "Đang tải media lên Cloudinary");
            media = await uploadMedia(selectedPostMediaFile, percent => setUploadProgress(percent, "Đang tải media lên Cloudinary"));
        }

        const newPostRef = await addDoc(collection(firebaseDatabase, "posts"), {
            authorId: authenticatedUser.uid,
            authorEmail: authenticatedUser.email,
            authorDisplayName: displayName,
            authorAvatar: userAvatar, // Gửi kèm avatar chính chủ vào bài đăng
            authorRole,
            content: communityPostContent,
            attachedImage: media?.mediaUrl || null,
            attachedImages: media ? [{ url: media.mediaUrl, type: media.mediaType, publicId: media.mediaPublicId }] : [],
            mediaType: media?.mediaType || null,
            mediaUrl: media?.mediaUrl || null,
            mediaPublicId: media?.mediaPublicId || null,
            mediaFormat: media?.mediaFormat || null,
            mediaBytes: media?.mediaBytes || null,
            mediaWidth: media?.mediaWidth || null,
            mediaHeight: media?.mediaHeight || null,
            mediaDuration: media?.mediaDuration || null,
            privacy: postPrivacyInput?.value || "public",
            createdAt: serverTimestamp(),
            reactions: {},
            commentCount: 0
        });
        const privacy = postPrivacyInput?.value || "public";
        rememberAuthoredPost(authenticatedUser.uid,newPostRef.id);
        if (privacy !== "private") await Promise.all(friendIds.map(friendId => addDoc(collection(firebaseDatabase,"notifications"),{recipientId:friendId,actorId:authenticatedUser.uid,actorName:displayName,type:"friend_post",postId:newPostRef.id,message:`vừa đăng một bài viết ${communityPostContent?`“${communityPostContent.slice(0,55)}${communityPostContent.length>55?'…':''}”`:"có ảnh/video"}`,isRead:false,createdAt:serverTimestamp()}))).catch(error=>console.warn("Bài đã đăng nhưng chưa thể tạo thông báo bạn bè",error));
        playCosmicLaunchEffect();

        // Reset Form
        communityPostInput.value = "";
        selectedPostMediaFile = null;
        if (postPreviewObjectUrl) URL.revokeObjectURL(postPreviewObjectUrl);
        postPreviewObjectUrl = null;
        if (postImageInput) postImageInput.value = "";
        if (postImagePreviewBox) postImagePreviewBox.style.display = "none";
        document.querySelector(".community-create-post-container-wrapper")?.classList.remove("has-selected-media");
        postPreviewRenderZone.innerHTML = "";
        resetUploadProgress();
    } catch (error) {
        console.error("Lỗi khi đăng tải bài viết:", error);
        resetUploadProgress();
        const denied = error?.code === "permission-denied";
        alert(denied ? "Firestore đang từ chối quyền tạo bài viết. Hãy kiểm tra Firestore Rules." : `Không thể đăng bài: ${error?.message || "Lỗi không xác định"}`);
    } finally {
        createCommunityPostButton.disabled = false;
        createCommunityPostButton.innerHTML = `<i class="fa-solid fa-paper-plane"></i>`;
    }
}

function createUploadStatus() {
    const status = document.createElement("div");
    status.className = "cloudinary-upload-status";
    status.hidden = true;
    status.innerHTML = '<span></span><progress max="100" value="0"></progress>';
    document.querySelector(".community-create-post-container-wrapper")?.appendChild(status);
    return status;
}

function setUploadProgress(percent, label) {
    uploadStatus.hidden = false;
    uploadStatus.querySelector("span").textContent = `${label}: ${percent}%`;
    uploadStatus.querySelector("progress").value = percent;
}

function resetUploadProgress() {
    uploadStatus.hidden = true;
    uploadStatus.querySelector("progress").value = 0;
    uploadStatus.querySelector("span").textContent = "";
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
