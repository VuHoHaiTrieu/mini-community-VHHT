import { firebaseAuthentication as auth, firebaseDatabase as db } from "../../shared/firebase-connection.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { uploadImage, validateImage } from "../../shared/cloudinary-media-service.js";
import("./friend-suggestions.js").catch(error=>console.warn("Không thể tải gợi ý bạn bè",error));

const $ = id => document.getElementById(id);
const DEFAULT_AVATAR = "../../shared/assets/default-avatar.svg";
let me = null;
let profileId = null;
let isOwner = false;
let resolveAuthentication;
const authenticationReady = new Promise(resolve => { resolveAuthentication = resolve; });

onAuthStateChanged(auth, async user => {
    resolveAuthentication(user);
    if (!user) return;
    me = user;
    profileId = new URLSearchParams(location.search).get("uid") || user.uid;
    isOwner = profileId === user.uid;
    const data = (await getDoc(doc(db, "users", profileId))).data() || {};
    setupPrivacy(data);
    setupFriendsModal(data);
    document.body.classList.toggle("admin-profile", data.role === "admin");
    if (!isOwner) hideEmptyPrivateFields();
});

function setupPrivacy(data) {
    const visibility = $("profile-account-visibility");
    visibility.value = data.accountVisibility || "private";
    if (isOwner) {
        visibility.onchange = () => setDoc(doc(db, "users", me.uid), { accountVisibility: visibility.value }, { merge: true });
        return;
    }
    visibility.closest("label")?.remove();
    $("remove-avatar-button").hidden = true;
    $("remove-cover-button").hidden = true;
    const account = document.querySelector(".account-info");
    if (data.accountVisibility !== "public") {
        account.replaceChildren();
        const title = document.createElement("h2");
        title.textContent = "Thông tin riêng tư";
        const message = document.createElement("p");
        message.className = "private-information";
        message.textContent = "Chủ hồ sơ không công khai thông tin tài khoản.";
        account.append(title, message);
    } else {
        $("profile-uid-readonly")?.closest("p")?.remove();
        $("profile-created-at")?.closest("p")?.remove();
    }
}

$("avatar-file-selector")?.addEventListener("change", event => openPhotoPositionEditor(event.target.files[0], "avatar"));
$("cover-file-selector")?.addEventListener("change", event => openPhotoPositionEditor(event.target.files[0], "cover"));

async function openPhotoPositionEditor(file, kind) {
    if (!file) return;
    const authenticatedUser = me || await authenticationReady;
    if (!authenticatedUser) { showProfileNotice("Bạn cần đăng nhập để đổi ảnh hồ sơ", "error"); return; }
    profileId = profileId || new URLSearchParams(location.search).get("uid") || authenticatedUser.uid;
    isOwner = profileId === authenticatedUser.uid;
    me = authenticatedUser;
    if (!isOwner) { showProfileNotice("Bạn chỉ có thể thay ảnh trên hồ sơ của mình", "error"); return; }
    try { validateImage(file); } catch (error) { showProfileNotice(error.message, "error"); return; }
    let overlay = $("photo-position-editor");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "photo-position-editor";
        document.body.appendChild(overlay);
    }
    const previewUrl = URL.createObjectURL(file);
    const isAvatar = kind === "avatar";
    overlay.innerHTML = `<div class="position-editor-card"><header><div><h3>Căn chỉnh ${isAvatar ? "ảnh đại diện" : "ảnh bìa"}</h3><p>Kéo thanh để chọn vùng ảnh hiển thị.</p></div><button data-editor-close>×</button></header><div class="position-preview ${isAvatar ? "avatar-position-preview" : "cover-position-preview"}"><img alt="Xem trước ảnh"></div><label>Vị trí ngang <input data-pos-x type="range" min="0" max="100" value="50"></label><label>Vị trí dọc <input data-pos-y type="range" min="0" max="100" value="50"></label><div class="profile-photo-upload-progress" hidden><span>Đang tải: 0%</span><progress max="100" value="0"></progress></div><footer><button data-editor-cancel>Hủy</button><button class="save-position-photo"><i class="fa-solid fa-cloud-arrow-up"></i> Lưu ảnh</button></footer></div>`;
    const image = overlay.querySelector("img"), x = overlay.querySelector("[data-pos-x]"), y = overlay.querySelector("[data-pos-y]");
    image.src = previewUrl;
    const applyPosition = () => image.style.objectPosition = `${x.value}% ${y.value}%`;
    x.oninput = y.oninput = applyPosition;
    const close = () => { overlay.classList.remove("show"); URL.revokeObjectURL(previewUrl); };
    overlay.querySelectorAll("[data-editor-close],[data-editor-cancel]").forEach(button => button.onclick = close);
    overlay.querySelector(".save-position-photo").onclick = async () => {
        const button = overlay.querySelector(".save-position-photo"), progress = overlay.querySelector(".profile-photo-upload-progress");
        button.disabled = true; progress.hidden = false;
        try {
            const media = await uploadImage(file, percent => {
                progress.querySelector("span").textContent = `Đang tải: ${percent}%`;
                progress.querySelector("progress").value = percent;
            });
            const positionX = Number(x.value), positionY = Number(y.value);
            const payload = isAvatar
                ? { photoURL: media.mediaUrl, photoPublicId: media.mediaPublicId, avatarPositionX: positionX, avatarPositionY: positionY, updatedAt: serverTimestamp() }
                : { coverURL: media.mediaUrl, coverPublicId: media.mediaPublicId, coverPositionY: positionY, updatedAt: serverTimestamp() };
            const userReference=doc(db,"users",me.uid);
            await setDoc(userReference,payload,{merge:true});
            const verifiedProfile=(await getDoc(userReference)).data()||{},savedUrl=isAvatar?verifiedProfile.photoURL:verifiedProfile.coverURL;
            if(savedUrl!==media.mediaUrl)throw new Error("Ảnh đã lên Cloudinary nhưng URL chưa được Firestore lưu lại.");
            if(isAvatar){
                await updateProfile(me,{photoURL:media.mediaUrl});
                const authoredPosts=await getDocs(query(collection(db,"posts"),where("authorId","==",me.uid)));
                await Promise.all(authoredPosts.docs.map(post=>updateDoc(post.ref,{authorAvatar:media.mediaUrl}))).catch(error=>console.warn("Avatar đã lưu nhưng chưa đồng bộ hết bài viết cũ",error));
            }
            if (isAvatar) {
                $("user-avatar-render").src = media.mediaUrl;
                $("user-avatar-render").style.objectPosition = `${positionX}% ${positionY}%`;
                $("composer-avatar").src = media.mediaUrl;
            } else {
                $("cover-photo").style.backgroundImage = `url("${media.mediaUrl}")`;
                $("cover-photo").style.backgroundPosition = `50% ${positionY}%`;
            }
            close();
            showProfileNotice("Ảnh đã được lưu trên Cloudinary", "success");
        } catch (error) {
            console.error(error); button.disabled = false; progress.hidden = true;
            showProfileNotice(error.message || "Không thể tải ảnh", "error");
        }
    };
    overlay.classList.add("show");
}

$("remove-avatar-button")?.addEventListener("click",event=>{event.stopPropagation();confirmRemovePhoto("avatar")});
$("remove-cover-button")?.addEventListener("click",event=>{event.stopPropagation();confirmRemovePhoto("cover")});

function confirmRemovePhoto(kind) {
    if (!isOwner) return;
    let overlay = $("photo-delete-confirm");
    if (!overlay) { overlay = document.createElement("div"); overlay.id = "photo-delete-confirm"; document.body.appendChild(overlay); }
    const label = kind === "avatar" ? "ảnh đại diện" : "ảnh bìa";
    overlay.innerHTML = `<div><span class="photo-delete-icon"><i class="fa-regular fa-trash-can"></i></span><h3>Xóa ${label}?</h3><p>Ảnh sẽ được gỡ khỏi hồ sơ. Media trên Cloudinary không bị xóa từ frontend unsigned.</p><footer><button data-photo-cancel>Hủy</button><button class="confirm-photo-delete">Xóa ảnh</button></footer></div>`;
    overlay.classList.add("show");
    overlay.querySelector("[data-photo-cancel]").onclick = () => overlay.classList.remove("show");
    overlay.querySelector(".confirm-photo-delete").onclick = async () => {
        if (kind === "avatar") {
            await setDoc(doc(db, "users", me.uid), { photoURL: "", profileImage: "", photoPublicId: "" }, { merge: true });
            $("user-avatar-render").src = DEFAULT_AVATAR; $("composer-avatar").src = DEFAULT_AVATAR;
        } else {
            await setDoc(doc(db, "users", me.uid), { coverURL: "", coverPublicId: "" }, { merge: true });
            $("cover-photo").style.backgroundImage = "";
        }
        overlay.classList.remove("show"); $("profile-media-lightbox")?.classList.remove("show");
        showProfileNotice(`Đã xóa ${label}`, "success");
    };
}

function openMedia(source, kind) {
    if (!source) return;
    let box = $("profile-media-lightbox");
    if (!box) { box = document.createElement("div"); box.id = "profile-media-lightbox"; document.body.appendChild(box); }
    box.innerHTML = `<div class="profile-viewer-toolbar"><strong>${kind === "avatar" ? "Ảnh đại diện" : "Ảnh bìa"}</strong><span></span>${isOwner ? '<button class="viewer-delete"><i class="fa-regular fa-trash-can"></i> Xóa ảnh</button>' : ""}<button class="viewer-close" aria-label="Đóng">×</button></div><div class="profile-viewer-stage"><img alt="Ảnh hồ sơ"></div>`;
    box.querySelector("img").src = source;
    box.querySelector(".viewer-close").onclick = () => box.classList.remove("show");
    box.querySelector(".viewer-delete")?.addEventListener("click", () => confirmRemovePhoto(kind));
    box.onclick = event => { if (event.target === box || event.target.classList.contains("profile-viewer-stage")) box.classList.remove("show"); };
    box.classList.add("show");
}

$("user-avatar-render")?.addEventListener("click",()=>openMedia($("user-avatar-render").src,"avatar"));
$("cover-photo")?.addEventListener("click", event => {
    if (event.target.closest("label,button")) return;
    const source = getComputedStyle($("cover-photo")).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (source) openMedia(source, "cover");
});

const actions = document.querySelector(".composer-actions"), cancel = document.createElement("button");
cancel.type = "button"; cancel.className = "cancel-compose"; cancel.textContent = "Hủy bài đăng"; actions?.prepend(cancel);
cancel.onclick = () => {
    $("profile-post-content").value = ""; $("profile-post-media").value = "";
    $("profile-post-media").dispatchEvent(new Event("change")); $("profile-media-preview").replaceChildren();
};

function hideEmptyPrivateFields() {
    setTimeout(() => ["profile-biography-input", "profile-birthday-input", "profile-gender-input", "profile-location-input", "profile-work-input"].forEach(id => {
        const field = $(id); if (!field?.value) field?.closest("label")?.remove();
    }), 250);
}

function setupFriendsModal(data) {
    const count = $("friend-count"); count.style.cursor = "pointer";
    count.onclick = async () => {
        const own = (await getDoc(doc(db, "users", me.uid))).data() || {};
        const allowed = isOwner || data.friendsVisibility === "public" || (data.friendsVisibility === "friends" && (own.friends || []).includes(profileId));
        let modal = $("profile-friends-modal");
        if (!modal) { modal = document.createElement("div"); modal.id = "profile-friends-modal"; document.body.appendChild(modal); }
        const card = document.createElement("div"); card.className = "friends-modal-card";
        const close = document.createElement("button"); close.className = "friends-modal-close"; close.textContent = "×";
        card.appendChild(close);
        if (!allowed) {
            const message = document.createElement("p"); message.className = "friends-private"; message.textContent = "Chủ hồ sơ đã ẩn danh sách bạn bè."; card.appendChild(message);
        } else {
            const title = document.createElement("h3"); title.textContent = `Bạn bè (${(data.friends || []).length})`; card.appendChild(title);
            const list = document.createElement("div"); list.className = "profile-friends-modal-list";
            for (const uid of data.friends || []) {
                const snapshot = await getDoc(doc(db, "users", uid)); if (!snapshot.exists()) continue;
                const friend = snapshot.data(), row = document.createElement("button"); row.className = "profile-friend-row"; row.dataset.uid = uid;
                const image = document.createElement("img"); image.src = friend.photoURL || friend.profileImage || DEFAULT_AVATAR;
                const name = document.createElement("strong"); name.textContent = friend.displayName || "Thành viên";
                row.append(image, name); row.onclick = () => location.href = `user-profile.html?uid=${encodeURIComponent(uid)}`; list.appendChild(row);
            }
            card.appendChild(list);
        }
        modal.replaceChildren(card); modal.classList.add("show");
        close.onclick = () => modal.classList.remove("show"); modal.onclick = event => { if (event.target === modal) modal.classList.remove("show"); };
    };
}

function showProfileNotice(message, type) {
    let box = $("profile-professional-toast");
    if (!box) { box = document.createElement("div"); box.id = "profile-professional-toast"; document.body.appendChild(box); }
    box.className = `show ${type}`; box.textContent = message;
    clearTimeout(box.timer); box.timer = setTimeout(() => box.classList.remove("show"), 3200);
}
