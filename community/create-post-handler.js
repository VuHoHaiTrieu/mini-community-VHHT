import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const createCommunityPostButton = document.getElementById("create-community-post-button");
const postImageInput = document.getElementById("post-image-input");
const postImagePreviewBox = document.getElementById("post-image-preview-box");
const postPreviewRenderZone = document.getElementById("post-preview-render-zone");
const removePostImgBtn = document.getElementById("remove-post-img-btn");

let authenticatedUser = null;
let base64PostMediaString = null; 
let detectedMediaType = "image";

onAuthStateChanged(firebaseAuthentication, (user) => {
    authenticatedUser = user;
});

if (postImageInput) {
    postImageInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 1024 * 1024) {
            alert("Kích thước tệp quá lớn! Vui lòng chọn tệp dưới 1MB.");
            postImageInput.value = "";
            return;
        }

        detectedMediaType = file.type.startsWith("video/") ? "video" : "image";

        const reader = new FileReader();
        reader.onload = (event) => {
            base64PostMediaString = event.target.result;
            postPreviewRenderZone.innerHTML = "";

            if (detectedMediaType === "video") {
                postPreviewRenderZone.innerHTML = `<video src="${base64PostMediaString}" autoplay muted loop></video>`;
            } else {
                postPreviewRenderZone.innerHTML = `<img src="${base64PostMediaString}" alt="Preview">`;
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

if (createCommunityPostButton) {
    createCommunityPostButton.addEventListener("click", createNewCommunityPost);
}

async function createNewCommunityPost() {
    const communityPostInput = document.getElementById("community-post-input");
    const communityPostContent = communityPostInput.value.trim();

    if (communityPostContent === "" && !base64PostMediaString) return;
    if (!authenticatedUser) { alert("Bạn chưa đăng nhập"); return; }

    try {
        const userDoc = await getDoc(doc(firebaseDatabase, "users", authenticatedUser.uid));
        const displayName = userDoc.exists() ? (userDoc.data().displayName || "Người dùng") : "Người dùng";

        await addDoc(collection(firebaseDatabase, "posts"), {
            authorId: authenticatedUser.uid,
            authorEmail: authenticatedUser.email,
            authorDisplayName: displayName,
            content: communityPostContent,
            attachedImage: base64PostMediaString, 
            mediaType: base64PostMediaString ? detectedMediaType : null,
            createdAt: serverTimestamp(),
            reactions: {},
            commentCount: 0
        });

        communityPostInput.value = "";
        base64PostMediaString = null;
        if (postImageInput) postImageInput.value = "";
        if (postImagePreviewBox) postImagePreviewBox.style.display = "none";
        postPreviewRenderZone.innerHTML = "";
    } catch (error) {
        console.error("Lỗi khi đăng tải bài viết:", error);
    }
}