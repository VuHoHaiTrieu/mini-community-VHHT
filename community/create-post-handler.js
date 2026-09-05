import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { collection, addDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { uploadMedia, validateImage, validateVideo } from "../shared/cloudinary-media-service.js";
import { rememberAuthoredPost } from "../shared/authored-post-cache.js";
import { resolveDisplayName } from "../shared/user-identity.js";
import { playUiSound } from "../shared/audio/sound-manager.js?v=6";

// ĐÃ SỬA ĐÚNG ID THEO HTML CỦA BẠN
const createCommunityPostButton = document.getElementById("create-community-post-button");
const postImageInput = document.getElementById("main-post-file-input"); // Sửa id
const postImagePreviewBox = document.getElementById("main-post-preview-box"); // Sửa id
const postPreviewRenderZone = document.getElementById("main-preview-render-zone"); // Sửa id
const removePostImgBtn = document.getElementById("remove-main-preview-btn"); // Sửa id
const communityPostInput = document.getElementById("main-post-textarea"); // Sửa id
const postPrivacyInput = document.getElementById("main-post-privacy");

let authenticatedUser = null;
let selectedPostMediaFiles = [];
let postPreviewObjectUrls = [];
const uploadStatus = createUploadStatus();
const draftStatus = createDraftStatus();
let draftSaveTimer = null;
initializePrivacyControl();

onAuthStateChanged(firebaseAuthentication, (user) => {
    authenticatedUser = user;
    if (user) restoreComposerDraft(user.uid);
});

function draftKey(uid) { return `vhht_post_draft_${uid}`; }
function extractPostReferences(content = "") {
    const hashtags = [...content.matchAll(/(^|\s)#([\p{L}\p{N}_]{2,50})/gu)].map(match => match[2].toLocaleLowerCase("vi"));
    const mentions = [...content.matchAll(/(^|\s)@([a-z0-9._]{4,24})/gi)].map(match => match[2].toLowerCase());
    return { hashtags: [...new Set(hashtags)].slice(0, 20), mentions: [...new Set(mentions)].slice(0, 20) };
}
function createDraftStatus() {
    const element = document.createElement("small");
    element.className = "composer-draft-status";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    document.querySelector(".community-create-post-container-wrapper")?.appendChild(element);
    return element;
}
function saveComposerDraft() {
    if (!authenticatedUser || !communityPostInput) return;
    const content = communityPostInput.value;
    if (!content.trim()) {
        localStorage.removeItem(draftKey(authenticatedUser.uid));
        draftStatus.textContent = "";
        return;
    }
    localStorage.setItem(draftKey(authenticatedUser.uid), JSON.stringify({
        content: content.slice(0, 10000),
        privacy: postPrivacyInput?.value || "public",
        updatedAt: Date.now()
    }));
    draftStatus.textContent = "Đã lưu nháp trên thiết bị này";
}
function scheduleDraftSave() {
    window.clearTimeout(draftSaveTimer);
    draftStatus.textContent = communityPostInput?.value.trim() ? "Đang lưu nháp…" : "";
    draftSaveTimer = window.setTimeout(saveComposerDraft, 500);
}
function restoreComposerDraft(uid) {
    if (!communityPostInput || communityPostInput.value) return;
    try {
        const draft = JSON.parse(localStorage.getItem(draftKey(uid)) || "null");
        if (!draft?.content) return;
        communityPostInput.value = String(draft.content).slice(0, 10000);
        if (postPrivacyInput && ["public", "friends", "private"].includes(draft.privacy)) {
            postPrivacyInput.value = draft.privacy;
            postPrivacyInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
        draftStatus.textContent = "Đã khôi phục bản nháp";
    } catch {
        localStorage.removeItem(draftKey(uid));
    }
}
communityPostInput?.addEventListener("input", scheduleDraftSave);
postPrivacyInput?.addEventListener("change", scheduleDraftSave);

// Xử lý đính kèm file (Ảnh / Video) dưới 1.5MB để tối ưu Base64
if (postImageInput) {
    postImageInput.addEventListener("change", async (e) => {
        const files = [...e.target.files];
        if (!files.length) return;
        if (files.length > 4 || (files.some(file=>file.type.startsWith("video/")) && files.length > 1)) {
            alert("Bạn có thể chọn tối đa 4 ảnh hoặc một video cho mỗi bài viết.");
            postImageInput.value = "";
            return;
        }
        try {
            for (const file of files) {
                if (file.type.startsWith("image/")) validateImage(file);
                else await validateVideo(file);
            }
        } catch (error) {
            alert(error.message);
            postImageInput.value = "";
            return;
        }

        selectedPostMediaFiles = files;
        postPreviewObjectUrls.forEach(url=>URL.revokeObjectURL(url));
        postPreviewObjectUrls = files.map(file=>URL.createObjectURL(file));
        postPreviewRenderZone.replaceChildren();
        files.forEach((file,index)=>{const isVideo=file.type.startsWith("video/"),preview=document.createElement(isVideo?"video":"img");preview.src=postPreviewObjectUrls[index];preview.style.cssText="max-width:100%;max-height:150px;border-radius:8px;object-fit:cover";if(isVideo){preview.controls=true;preview.preload="metadata"}else preview.alt=`Xem trước ảnh bài viết ${index+1}`;postPreviewRenderZone.appendChild(preview)});
        postImagePreviewBox.style.display = "block";
        document.querySelector(".community-create-post-container-wrapper")?.classList.add("has-selected-media");
    });
}

if (removePostImgBtn) {
    removePostImgBtn.addEventListener("click", () => {
        selectedPostMediaFiles = [];
        postPreviewObjectUrls.forEach(url=>URL.revokeObjectURL(url));
        postPreviewObjectUrls = [];
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

    if (communityPostContent === "" && !selectedPostMediaFiles.length) { playUiSound("warning"); return; }
    if (!authenticatedUser) { playUiSound("error"); alert("Tín hiệu thất bại! Bạn chưa đăng nhập."); return; }

    createCommunityPostButton.disabled = true;
    createCommunityPostButton.innerHTML = `<i class="fa-solid fa-satellite fa-spin"></i>`;

    try {
        // LẤY AVATAR VÀ TÊN MỚI NHẤT TRÊN FIRESTORE ĐỂ ĐỒNG BỘ
        const userDoc = await getDoc(doc(firebaseDatabase, "users", authenticatedUser.uid)).catch(error => {
            console.warn("Không thể đọc hồ sơ khi đăng bài; dùng dữ liệu Firebase Auth dự phòng.", error);
            return null;
        });
        let displayName = resolveDisplayName({}, authenticatedUser);
        let userAvatar = authenticatedUser.photoURL || "";
        let authorRole = "user";
        let friendIds = [];

        if (userDoc?.exists()) {
            const userData = userDoc.data();
            displayName = resolveDisplayName(userData,authenticatedUser);
            userAvatar = userData.photoURL || ""; 
            authorRole = userData.role || "user";
            friendIds = userData.friends || [];
        }

        const uploadedMedia = [];
        if (selectedPostMediaFiles.length) {
            setUploadProgress(0, "Đang tải media lên Cloudinary");
            for (let index=0;index<selectedPostMediaFiles.length;index+=1) {
                const media=await uploadMedia(selectedPostMediaFiles[index],percent=>setUploadProgress(Math.round((index*100+percent)/selectedPostMediaFiles.length),`Đang tải tệp ${index+1}/${selectedPostMediaFiles.length}`));
                uploadedMedia.push(media);
            }
        }
        const media=uploadedMedia[0]||null;

        const privacy = postPrivacyInput?.value || "public";
        const references = extractPostReferences(communityPostContent);
        const audienceIds = privacy === "public" ? [] : privacy === "private"
            ? [authenticatedUser.uid]
            : [...new Set([authenticatedUser.uid, ...friendIds])];
        const newPostRef = await addDoc(collection(firebaseDatabase, "posts"), {
            authorId: authenticatedUser.uid,
            authorDisplayName: displayName,
            authorAvatar: userAvatar, // Gửi kèm avatar chính chủ vào bài đăng
            authorRole,
            content: communityPostContent,
            hashtags: references.hashtags,
            mentions: references.mentions,
            attachedImage: media?.mediaUrl || null,
            attachedImages: uploadedMedia.map(item=>({ url:item.mediaUrl,type:item.mediaType,publicId:item.mediaPublicId })),
            mediaType: media?.mediaType || null,
            mediaUrl: media?.mediaUrl || null,
            mediaPublicId: media?.mediaPublicId || null,
            mediaFormat: media?.mediaFormat || null,
            mediaBytes: media?.mediaBytes || null,
            mediaWidth: media?.mediaWidth || null,
            mediaHeight: media?.mediaHeight || null,
            mediaDuration: media?.mediaDuration || null,
            privacy,
            audienceIds,
            moderationStatus: null,
            deletedByAdmin: false,
            createdAt: serverTimestamp(),
            reactions: {},
            commentCount: 0
        });
        rememberAuthoredPost(authenticatedUser.uid,newPostRef.id);
        const mentionedRecipientIds = new Set();
        await Promise.all(references.mentions.map(async username => {
            const alias = await getDoc(doc(firebaseDatabase, "usernames", username)).catch(() => null);
            const recipientId = alias?.data?.()?.uid;
            if (!recipientId || recipientId === authenticatedUser.uid) return;
            if (privacy === "private" || (privacy === "friends" && !friendIds.includes(recipientId))) return;
            mentionedRecipientIds.add(recipientId);
            await addDoc(collection(firebaseDatabase, "notifications"), {
                recipientId,
                postAuthorId: authenticatedUser.uid,
                actorId: authenticatedUser.uid,
                actorName: displayName,
                type: "mention",
                postId: newPostRef.id,
                message: "đã nhắc đến bạn trong một bài viết",
                isRead: false,
                createdAt: serverTimestamp()
            });
        })).catch(error => console.warn("Bài đã đăng nhưng chưa thể gửi đủ thông báo nhắc tên", error));
        if (privacy !== "private") await Promise.all(friendIds.filter(friendId => !mentionedRecipientIds.has(friendId)).map(friendId => addDoc(collection(firebaseDatabase,"notifications"),{recipientId:friendId,actorId:authenticatedUser.uid,actorName:displayName,type:"friend_post",postId:newPostRef.id,message:`vừa đăng một bài viết ${communityPostContent?`“${communityPostContent.slice(0,55)}${communityPostContent.length>55?'…':''}”`:"có ảnh/video"}`,isRead:false,createdAt:serverTimestamp()}))).catch(error=>console.warn("Bài đã đăng nhưng chưa thể tạo thông báo bạn bè",error));
        playMeteorLaunchEffect();
        playUiSound("save-submit");

        // Reset Form
        communityPostInput.value = "";
        localStorage.removeItem(draftKey(authenticatedUser.uid));
        draftStatus.textContent = "";
        selectedPostMediaFiles = [];
        postPreviewObjectUrls.forEach(url=>URL.revokeObjectURL(url));
        postPreviewObjectUrls = [];
        if (postImageInput) postImageInput.value = "";
        if (postImagePreviewBox) postImagePreviewBox.style.display = "none";
        document.querySelector(".community-create-post-container-wrapper")?.classList.remove("has-selected-media");
        postPreviewRenderZone.innerHTML = "";
        resetUploadProgress();
    } catch (error) {
        playUiSound("error");
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

function initializePrivacyControl(){
    if(!postPrivacyInput||document.getElementById("main-privacy-control"))return;
    const options={
        public:{icon:"fa-earth-asia",label:"Công khai",description:"Mọi thành viên có thể xem"},
        friends:{icon:"fa-user-group",label:"Bạn bè",description:"Chỉ bạn bè của bạn"},
        private:{icon:"fa-lock",label:"Chỉ mình tôi",description:"Chỉ bạn có thể xem"}
    };
    postPrivacyInput.hidden=true;
    const control=document.createElement("div");control.id="main-privacy-control";control.className="post-privacy-control";
    const trigger=document.createElement("button");trigger.type="button";trigger.className="post-privacy-trigger";trigger.setAttribute("aria-haspopup","listbox");trigger.setAttribute("aria-expanded","false");
    const menu=document.createElement("div");menu.className="post-privacy-menu";menu.setAttribute("role","listbox");menu.hidden=true;
    const renderTrigger=()=>{const option=options[postPrivacyInput.value]||options.public;trigger.replaceChildren();const icon=document.createElement("i");icon.className=`fa-solid ${option.icon}`;const text=document.createElement("span");text.textContent=option.label;const arrow=document.createElement("i");arrow.className="fa-solid fa-chevron-down";trigger.append(icon,text,arrow);trigger.title=option.description};
    Object.entries(options).forEach(([value,option])=>{const button=document.createElement("button");button.type="button";button.dataset.value=value;button.setAttribute("role","option");const icon=document.createElement("i");icon.className=`fa-solid ${option.icon}`;const content=document.createElement("span"),label=document.createElement("strong"),description=document.createElement("small");label.textContent=option.label;description.textContent=option.description;content.append(label,description);const check=document.createElement("i");check.className="fa-solid fa-check privacy-check";button.append(icon,content,check);button.onclick=()=>{postPrivacyInput.value=value;postPrivacyInput.dispatchEvent(new Event("change",{bubbles:true}));menu.hidden=true;trigger.setAttribute("aria-expanded","false");renderTrigger();updateSelected()};menu.appendChild(button)});
    const updateSelected=()=>menu.querySelectorAll("button").forEach(button=>{const selected=button.dataset.value===postPrivacyInput.value;button.classList.toggle("selected",selected);button.setAttribute("aria-selected",String(selected))});
    trigger.onclick=()=>{menu.hidden=!menu.hidden;trigger.setAttribute("aria-expanded",String(!menu.hidden));if(!menu.hidden)menu.querySelector(".selected")?.focus()};
    document.addEventListener("click",event=>{if(control.contains(event.target))return;menu.hidden=true;trigger.setAttribute("aria-expanded","false")});
    control.append(trigger,menu);postPrivacyInput.insertAdjacentElement("afterend",control);renderTrigger();updateSelected();
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
    beam.style.width = "28px";
    beam.style.height = "28px";
    beam.style.borderRadius = "50%";
    beam.style.background = "radial-gradient(circle at 35% 30%, #fff 0 8%, #67e8f9 18%, #6366f1 55%, #1e1b4b 100%)";
    beam.style.boxShadow = "0 0 20px #38bdf8, 0 0 55px #a855f7";
    beam.style.zIndex = "99999";
    beam.style.pointerEvents = "none";
    beam.style.transition = "all 1.05s cubic-bezier(0.18, .75, .22, 1)";
    beam.style.setProperty("--trail-angle","-35deg");
    const trail=document.createElement("span");trail.style.cssText="position:absolute;right:70%;top:40%;width:150px;height:10px;border-radius:999px;background:linear-gradient(90deg,transparent,#8b5cf6aa,#67e8f9);filter:blur(4px);transform:rotate(-20deg);transform-origin:right center";beam.appendChild(trail);

    document.body.appendChild(beam);

    // Kích hoạt hiệu ứng di chuyển hình học tịnh tiến trong tích tắc
    setTimeout(() => {
        beam.style.top = `${targetRect.top + 40}px`;
        beam.style.left = `${targetRect.left + targetRect.width / 2}px`;
        beam.style.transform = "rotate(240deg) scale(.65)";
        beam.style.opacity = "0";
    }, 50);

    setTimeout(() => { beam.remove(); }, 1150);
}

function playMeteorLaunchEffect() {
    const startRect = createCommunityPostButton.getBoundingClientRect();
    const meteor = document.createElement("div");
    meteor.className = "post-launch-meteor";
    meteor.style.left = `${startRect.left + startRect.width / 2 - 29}px`;
    meteor.style.top = `${startRect.top + startRect.height / 2 - 21}px`;
    document.body.appendChild(meteor);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        meteor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: "ease-out" }).finished.finally(() => meteor.remove());
        return;
    }

    const endX = Math.random() < .5 ? window.innerWidth * (.08 + Math.random() * .22) : window.innerWidth * (.7 + Math.random() * .22);
    const endY = Math.max(110, window.innerHeight * (.2 + Math.random() * .42));
    const deltaX = endX - (startRect.left + startRect.width / 2);
    const deltaY = endY - (startRect.top + startRect.height / 2);
    const flight = meteor.animate([
        { transform: "translate3d(0,0,0) rotate(-12deg) scale(.42)", opacity: 0 },
        { offset: .16, transform: `translate3d(${deltaX * .12}px,${deltaY * .08}px,0) rotate(55deg) scale(1)`, opacity: 1 },
        { offset: .72, transform: `translate3d(${deltaX * .72}px,${deltaY * .68}px,0) rotate(260deg) scale(.82)`, opacity: 1 },
        { transform: `translate3d(${deltaX}px,${deltaY}px,0) rotate(430deg) scale(.25)`, opacity: 0 }
    ], { duration: 1080, easing: "cubic-bezier(.2,.72,.2,1)", fill: "forwards" });
    flight.finished.finally(() => meteor.remove());
}
