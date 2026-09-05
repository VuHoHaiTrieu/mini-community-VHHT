import { firebaseAuthentication as auth, firebaseDatabase as db } from "../../shared/firebase-connection.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { uploadImage, validateImage } from "../../shared/cloudinary-media-service.js";
import { removeFriendship } from "../../shared/friendship-service.js";
import { getDefaultAvatarUrl, resolveAvatarUrl } from "../../shared/default-avatar.js";
import { writePublicProfile } from "../../shared/secure-profile-service.js";
import("./friend-suggestions.js").catch(error=>console.warn("Không thể tải gợi ý bạn bè",error));

const $ = id => document.getElementById(id);
const DEFAULT_AVATAR = getDefaultAvatarUrl({ uid: "vhht-member", displayName: "VHHT" });
let me = null;
let profileId = null;
let isOwner = false;
let currentPhotoProfileData = {};
let resolveAuthentication;
const authenticationReady = new Promise(resolve => { resolveAuthentication = resolve; });

onAuthStateChanged(auth, async user => {
    resolveAuthentication(user);
    if (!user) return;
    me = user;
    profileId = new URLSearchParams(location.search).get("uid") || user.uid;
    isOwner = profileId === user.uid;
    const data = (await getDoc(doc(db, "users", profileId))).data() || {};
    currentPhotoProfileData = data;
    setupPrivacy(data);
    setupFriendsModal(data);
    document.body.classList.toggle("admin-profile", data.role === "admin");
    if (!isOwner) hideEmptyPrivateFields();
});

function setupPrivacy(data) {
    const visibility = $("profile-account-visibility");
    if (!visibility) return;
    const publicOption=visibility?.querySelector('option[value="public"]');if(publicOption)publicOption.textContent="Công khai email và mã ID";
    visibility.value = data.accountVisibility || "private";
    if (isOwner) {
        visibility.onchange = () => writePublicProfile(me.uid, { accountVisibility: visibility.value });
        return;
    }
    // Hồ sơ realtime dựng lại nhiều lần nên không được xóa node cài đặt khỏi DOM.
    // Trung tâm cài đặt vốn chỉ dành cho chủ tài khoản; với khách chỉ cần ẩn an toàn.
    visibility.closest("label")?.setAttribute("hidden", "");
    const removeAvatarButton = $("remove-avatar-button");
    const removeCoverButton = $("remove-cover-button");
    if (removeAvatarButton) removeAvatarButton.hidden = true;
    if (removeCoverButton) removeCoverButton.hidden = true;
}

$("avatar-file-selector")?.addEventListener("change", event => openPhotoPositionEditor(event.target.files[0], "avatar"));
$("cover-file-selector")?.addEventListener("change", event => openPhotoPositionEditor(event.target.files[0], "cover"));

async function openPhotoPositionEditor(file, kind, options = {}) {
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
    const isAvatar = kind === "avatar";
    const currentFrame=isAvatar?$("user-avatar-render")?.getBoundingClientRect():$("cover-photo")?.getBoundingClientRect();
    const frameWidth=Math.max(1,Math.round(currentFrame?.width||(isAvatar?440:875))),frameHeight=Math.max(1,Math.round(currentFrame?.height||(isAvatar?440:225)));
    // Every newly selected photo starts from a predictable centered crop.
    // Saved coordinates are supplied only by the explicit "reposition" flow.
    const initialX=Number(options.positionX??50),initialY=Number(options.positionY??50),initialZoom=Number(options.zoom??1);
    overlay.innerHTML = `<div class="position-editor-card"><header><div><h3>Căn chỉnh ${isAvatar ? "ảnh đại diện" : "ảnh bìa"}</h3><p>Kéo trực tiếp trên ảnh để đặt đúng vùng bạn muốn hiển thị.</p></div><button data-editor-close aria-label="Đóng">×</button></header><div class="position-editor-body"><div class="position-editor-frame-note"><i class="fa-solid fa-hand-pointer"></i><span><strong>Kéo để căn chỉnh</strong><small>${frameWidth} × ${frameHeight}px · Cuộn hoặc chụm hai ngón để thu phóng</small></span></div><div class="position-preview ${isAvatar ? "avatar-position-preview" : "cover-position-preview"}"><canvas aria-label="Kéo để căn chỉnh ảnh"></canvas><span class="position-drag-hint"><i class="fa-solid fa-up-down-left-right"></i> Kéo ảnh</span></div><div class="position-coordinate-status" data-position-status></div><label>Vị trí ngang <input data-pos-x type="range" min="0" max="100" step="0.1" value="${initialX}"></label><label>Vị trí dọc <input data-pos-y type="range" min="0" max="100" step="0.1" value="${initialY}"></label><label>Thu phóng <input data-zoom type="range" min="1" max="3" step="0.01" value="${initialZoom}"></label><div class="profile-photo-upload-progress" hidden><span>Đang lưu: 0%</span><progress max="100" value="0"></progress></div></div><footer><button data-editor-cancel>Hủy</button><button class="save-position-photo"><i class="fa-solid fa-check"></i> ${options.positionOnly?"Lưu căn chỉnh":"Lưu ảnh"}</button></footer></div>`;
    const image = overlay.querySelector("canvas"),preview=overlay.querySelector(".position-preview"),x = overlay.querySelector("[data-pos-x]"), y = overlay.querySelector("[data-pos-y]"),zoom=overlay.querySelector("[data-zoom]"),previewBitmap=await createImageBitmap(file);
    preview.style.aspectRatio = `${frameWidth} / ${frameHeight}`;
    image.width=isAvatar?600:Math.min(1400,Math.max(700,frameWidth));image.height=isAvatar?600:Math.round(image.width*(frameHeight/frameWidth));
    const applyPosition = () => {
        const positionX=Number(x.value),positionY=Number(y.value),zoomValue=Number(zoom.value),targetRatio=image.width/image.height,sourceRatio=previewBitmap.width/previewBitmap.height;let cropWidth,cropHeight;
        if(sourceRatio>targetRatio){cropHeight=previewBitmap.height;cropWidth=cropHeight*targetRatio}else{cropWidth=previewBitmap.width;cropHeight=cropWidth/targetRatio}cropWidth/=zoomValue;cropHeight/=zoomValue;
        const sourceX=(previewBitmap.width-cropWidth)*(positionX/100),sourceY=(previewBitmap.height-cropHeight)*(positionY/100),context=image.getContext("2d",{alpha:false});context.clearRect(0,0,image.width,image.height);context.drawImage(previewBitmap,sourceX,sourceY,cropWidth,cropHeight,0,0,image.width,image.height);
        overlay.querySelector("[data-position-status]").textContent=`Vị trí: X ${positionX}% · Y ${positionY}% · Zoom ${Number(zoom.value).toFixed(2)}×`;
    };
    x.oninput = y.oninput = zoom.oninput = applyPosition;
    let dragState=null;
    const clamp=value=>Math.max(0,Math.min(100,value));
    const beginDrag=(clientX,clientY)=>{
        dragState={startClientX:clientX,startClientY:clientY,startX:Number(x.value),startY:Number(y.value)};
        preview.classList.add("dragging");
    };
    const moveDrag=(clientX,clientY)=>{
        if(!dragState)return;
        const bounds=preview.getBoundingClientRect(),targetRatio=image.width/image.height,sourceRatio=previewBitmap.width/previewBitmap.height,zoomValue=Number(zoom.value);let baseCropWidth,baseCropHeight;
        if(sourceRatio>targetRatio){baseCropHeight=previewBitmap.height;baseCropWidth=baseCropHeight*targetRatio}else{baseCropWidth=previewBitmap.width;baseCropHeight=baseCropWidth/targetRatio}
        const cropWidth=baseCropWidth/zoomValue,cropHeight=baseCropHeight/zoomValue;
        const overflowX=Math.max(1,bounds.width*((previewBitmap.width/cropWidth)-1)),overflowY=Math.max(1,bounds.height*((previewBitmap.height/cropHeight)-1));
        const deltaX=(clientX-dragState.startClientX)/overflowX*100,deltaY=(clientY-dragState.startClientY)/overflowY*100;
        x.value=String(clamp(dragState.startX-deltaX));y.value=String(clamp(dragState.startY-deltaY));applyPosition();
    };
    const stopDragging=()=>{dragState=null;preview.classList.remove("dragging")};
    const onMouseMove=event=>{if(!dragState)return;event.preventDefault();moveDrag(event.clientX,event.clientY)};
    const onMouseUp=()=>stopDragging();
    preview.addEventListener("mousedown",event=>{if(event.button!==0)return;event.preventDefault();beginDrag(event.clientX,event.clientY)});
    window.addEventListener("mousemove",onMouseMove);
    window.addEventListener("mouseup",onMouseUp);
    preview.addEventListener("touchstart",event=>{if(event.touches.length!==1)return;const touch=event.touches[0];beginDrag(touch.clientX,touch.clientY)},{passive:true});
    preview.addEventListener("touchmove",event=>{if(!dragState||event.touches.length!==1)return;event.preventDefault();const touch=event.touches[0];moveDrag(touch.clientX,touch.clientY)},{passive:false});
    preview.addEventListener("touchend",stopDragging);
    preview.addEventListener("touchcancel",stopDragging);
    applyPosition();
    preview.addEventListener("wheel",event=>{event.preventDefault();zoom.value=String(Math.max(1,Math.min(3,Number(zoom.value)+(event.deltaY<0 ? .08 : -.08))));applyPosition()},{passive:false});
    const close = () => { overlay.classList.remove("show"); document.body.classList.remove("profile-modal-open"); window.removeEventListener("mousemove",onMouseMove); window.removeEventListener("mouseup",onMouseUp); previewBitmap.close?.(); };
    overlay.querySelectorAll("[data-editor-close],[data-editor-cancel]").forEach(button => button.onclick = close);
    overlay.querySelector(".save-position-photo").onclick = async () => {
        const button = overlay.querySelector(".save-position-photo"), progress = overlay.querySelector(".profile-photo-upload-progress");
        button.disabled = true; progress.hidden = false;
        try {
            const positionX = Number(x.value), positionY = Number(y.value),zoomValue=Number(zoom.value);
            const preparedFile=await createPositionedProfileImage(file,isAvatar,positionX,positionY,zoomValue,frameWidth/frameHeight);
            const media = await uploadImage(preparedFile, percent => {
                progress.querySelector("span").textContent = `Đang tải: ${percent}%`;
                progress.querySelector("progress").value = percent;
            });
            let originalMedia = null;
            if (!options.positionOnly) {
                progress.querySelector("span").textContent = "Đang lưu ảnh nguồn để có thể căn chỉnh lại...";
                originalMedia = await uploadImage(file);
            }
            const payload = isAvatar
                ? { photoURL: media.mediaUrl, photoPublicId: media.mediaPublicId, ...(originalMedia ? { photoOriginalURL: originalMedia.mediaUrl, photoOriginalPublicId: originalMedia.mediaPublicId } : options.originalSourceURL ? { photoOriginalURL: options.originalSourceURL } : {}), avatarPositionX: 50, avatarPositionY: 50, avatarCropX:positionX,avatarCropY:positionY,avatarZoom:zoomValue,updatedAt: serverTimestamp() }
                : { coverURL: media.mediaUrl, coverPublicId: media.mediaPublicId, ...(originalMedia ? { coverOriginalURL: originalMedia.mediaUrl, coverOriginalPublicId: originalMedia.mediaPublicId } : options.originalSourceURL ? { coverOriginalURL: options.originalSourceURL } : {}), coverPositionX:50,coverPositionY:50,coverCropX:positionX,coverCropY:positionY,coverZoom:zoomValue,updatedAt: serverTimestamp() };
            const userReference=doc(db,"users",me.uid);
            await writePublicProfile(me.uid,payload);
            currentPhotoProfileData={...currentPhotoProfileData,...payload};
            const verifiedProfile=(await getDoc(userReference)).data()||{},savedUrl=isAvatar?verifiedProfile.photoURL:verifiedProfile.coverURL;
            if(savedUrl!==media.mediaUrl)throw new Error("Ảnh đã lên Cloudinary nhưng URL chưa được Firestore lưu lại.");
            if(isAvatar){
                await updateProfile(me,{photoURL:media.mediaUrl});
                const authoredPosts=await getDocs(query(collection(db,"posts"),where("authorId","==",me.uid)));
                await Promise.all(authoredPosts.docs.map(post=>updateDoc(post.ref,{authorAvatar:media.mediaUrl}))).catch(error=>console.warn("Avatar đã lưu nhưng chưa đồng bộ hết bài viết cũ",error));
            }
            if (isAvatar) {
                $("user-avatar-render").src = media.mediaUrl;
                $("user-avatar-render").style.objectPosition = "50% 50%";
                $("composer-avatar").src = media.mediaUrl;
            } else {
                $("cover-photo").style.backgroundImage = `url("${media.mediaUrl}")`;
                $("cover-photo").style.backgroundPosition = "50% 50%";
            }
            close();
            showProfileNotice("Ảnh đã được lưu trên Cloudinary", "success");
        } catch (error) {
            console.error(error); button.disabled = false; progress.hidden = true;
            showProfileNotice(error.message || "Không thể tải ảnh", "error");
        }
    };
    document.body.classList.add("profile-modal-open");
    overlay.classList.add("show");
}

async function createPositionedProfileImage(file,isAvatar,positionX,positionY,zoom,frameRatio=35/9){
    const bitmap=await createImageBitmap(file),targetWidth=isAvatar?800:1750,targetHeight=isAvatar?800:Math.max(320,Math.round(1750/frameRatio)),targetRatio=targetWidth/targetHeight,sourceRatio=bitmap.width/bitmap.height;
    let cropWidth,cropHeight;
    if(sourceRatio>targetRatio){cropHeight=bitmap.height;cropWidth=cropHeight*targetRatio}else{cropWidth=bitmap.width;cropHeight=cropWidth/targetRatio}
    cropWidth/=zoom;cropHeight/=zoom;
    const sourceX=(bitmap.width-cropWidth)*(positionX/100),sourceY=(bitmap.height-cropHeight)*(positionY/100),canvas=document.createElement("canvas");
    canvas.width=targetWidth;canvas.height=targetHeight;canvas.getContext("2d",{alpha:false}).drawImage(bitmap,sourceX,sourceY,cropWidth,cropHeight,0,0,targetWidth,targetHeight);bitmap.close?.();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error("Không thể tạo vùng ảnh đã căn chỉnh.")),"image/jpeg",.9));
    return new File([blob],`${isAvatar?"avatar":"cover"}-${Date.now()}.jpg`,{type:"image/jpeg"});
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
            await writePublicProfile(me.uid, { photoURL: "", profileImage: "", photoPublicId: "" });
            await updateProfile(me,{photoURL:null});
            const authoredPosts=await getDocs(query(collection(db,"posts"),where("authorId","==",me.uid)));
            await Promise.all(authoredPosts.docs.map(post=>updateDoc(post.ref,{authorAvatar:""}))).catch(error=>console.warn("Đã xóa avatar hồ sơ nhưng chưa xóa hết avatar trong bài cũ",error));
            const fallbackAvatar = getDefaultAvatarUrl({ uid: profileId, displayName: $("profile-name-heading")?.textContent || "VHHT" });
            $("user-avatar-render").src = fallbackAvatar; $("composer-avatar").src = fallbackAvatar;
        } else {
            await writePublicProfile(me.uid, { coverURL: "", coverPublicId: "" });
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
    box.dataset.mediaKind = kind;
    box.innerHTML = `<div class="profile-viewer-toolbar"><strong>${kind === "avatar" ? "Ảnh đại diện" : "Ảnh bìa"}</strong><span></span>${isOwner?'<button class="viewer-reposition" title="Căn chỉnh lại ảnh"><i class="fa-solid fa-crop-simple"></i>Căn chỉnh</button>':""}<button data-zoom-out title="Thu nhỏ"><i class="fa-solid fa-minus"></i></button><output>100%</output><button data-zoom-in title="Phóng to"><i class="fa-solid fa-plus"></i></button><button data-zoom-reset title="Đặt lại"><i class="fa-solid fa-rotate-left"></i></button><button data-viewer-download title="Tải ảnh"><i class="fa-solid fa-download"></i></button><button data-viewer-fullscreen title="Toàn màn hình"><i class="fa-solid fa-expand"></i></button>${isOwner ? '<button class="viewer-delete" title="Xóa ảnh"><i class="fa-regular fa-trash-can"></i></button>' : ""}<button class="viewer-close" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></div><div class="profile-viewer-stage"><img alt="Ảnh hồ sơ"></div>`;
    const image=box.querySelector("img"),output=box.querySelector("output");
    const viewerSource = kind === "avatar" && /googleusercontent\.com/i.test(source)
        ? source.replace(/=s\d+(?:-c)?(?=&|$)/i, "=s1024-c").replace(/\/s\d+(?:-c)?\//i, "/s1024-c/")
        : source;
    image.src = viewerSource;let scale=1,x=0,y=0,drag=null;const apply=()=>{image.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;output.textContent=`${Math.round(scale*100)}%`},setScale=value=>{scale=Math.max(.5,Math.min(5,value));if(scale===1)x=y=0;apply()},close=()=>{box.classList.remove("show");document.body.classList.remove("media-viewer-open");if(document.fullscreenElement===box)document.exitFullscreen?.().catch(()=>{});document.removeEventListener("keydown",onKey)};const onKey=e=>{if(e.key==="Escape")close();else if(e.key==="+")setScale(scale+.25);else if(e.key==="-")setScale(scale-.25)};
    box.querySelector("[data-zoom-in]").onclick=()=>setScale(scale+.25);box.querySelector("[data-zoom-out]").onclick=()=>setScale(scale-.25);box.querySelector("[data-zoom-reset]").onclick=()=>setScale(1);box.querySelector(".viewer-close").onclick=close;
    box.querySelector("[data-viewer-fullscreen]").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await box.requestFullscreen?.()}catch(error){console.warn("Không thể mở toàn màn hình",error)}};
    box.querySelector("[data-viewer-download]").onclick=async()=>{const button=box.querySelector("[data-viewer-download]");button.disabled=true;try{const response=await fetch(viewerSource);if(!response.ok)throw new Error("download-failed");const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download=`vhht-${kind}.jpg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch{window.open(viewerSource,"_blank","noopener,noreferrer")}finally{button.disabled=false}};
    box.querySelector(".viewer-reposition")?.addEventListener("click",async()=>{close();await openExistingPhotoPositionEditor(kind,source)});
    box.querySelector(".profile-viewer-stage").onwheel=e=>{e.preventDefault();setScale(scale+(e.deltaY<0?.15:-.15))};image.onpointerdown=e=>{if(scale<=1)return;drag={x:e.clientX,y:e.clientY,ox:x,oy:y};image.setPointerCapture(e.pointerId)};image.onpointermove=e=>{if(!drag)return;x=drag.ox+e.clientX-drag.x;y=drag.oy+e.clientY-drag.y;apply()};image.onpointerup=image.onpointercancel=()=>drag=null;
    box.querySelector(".viewer-delete")?.addEventListener("click", () => confirmRemovePhoto(kind));
    box.onclick = event => { if (event.target === box) close(); };document.addEventListener("keydown",onKey);document.body.classList.add("media-viewer-open");box.classList.add("show");apply();
}

async function openExistingPhotoPositionEditor(kind,source){
    try{
        const isAvatar=kind==="avatar";
        const originalSource=isAvatar?currentPhotoProfileData.photoOriginalURL:currentPhotoProfileData.coverOriginalURL;
        const editorSource=originalSource||source;
        const response=await fetch(editorSource,{cache:"force-cache"});
        if(!response.ok)throw new Error("Không thể tải ảnh hiện tại để căn chỉnh");
        const blob=await response.blob(),file=new File([blob],`${kind}-position.${blob.type.includes("png")?"png":"jpg"}`,{type:blob.type||"image/jpeg"});
        const savedX=Number(isAvatar?currentPhotoProfileData.avatarCropX:currentPhotoProfileData.coverCropX);
        const savedY=Number(isAvatar?currentPhotoProfileData.avatarCropY:currentPhotoProfileData.coverCropY);
        const savedZoom=Number(isAvatar?currentPhotoProfileData.avatarZoom:currentPhotoProfileData.coverZoom);
        await openPhotoPositionEditor(file,kind,{positionOnly:true,originalSourceURL:editorSource,positionX:originalSource&&Number.isFinite(savedX)?savedX:50,positionY:originalSource&&Number.isFinite(savedY)?savedY:50,zoom:originalSource&&savedZoom>=1?savedZoom:1.25});
    }catch(error){console.error(error);showProfileNotice(error.message||"Không thể mở công cụ căn chỉnh","error")}
}

function closePhotoActions(){
    const overlay=$("profile-photo-actions");
    if(overlay)overlay.classList.remove("show");
    document.body.classList.remove("profile-photo-actions-open");
}

function openPhotoActions(kind,source){
    let overlay=$("profile-photo-actions");
    if(!overlay){overlay=document.createElement("div");overlay.id="profile-photo-actions";document.body.appendChild(overlay)}
    const isAvatar=kind==="avatar",label=isAvatar?"ảnh đại diện":"ảnh bìa",inputId=isAvatar?"avatar-file-selector":"cover-file-selector";
    overlay.innerHTML=`<div class="profile-photo-actions-card" role="dialog" aria-modal="true" aria-label="Tùy chọn ${label}"><header><div><small>ẢNH HỒ SƠ</small><h3>Tùy chọn ${label}</h3></div><button type="button" data-photo-actions-close aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></header><div class="profile-photo-actions-list">${source?`<button type="button" data-photo-view><i class="fa-regular fa-image"></i><span><strong>Xem ${label}</strong><small>Mở ảnh ở chế độ toàn màn hình</small></span></button>`:""}${isOwner&&source?`<button type="button" data-photo-reposition><i class="fa-solid fa-crop-simple"></i><span><strong>Căn chỉnh lại</strong><small>Đổi vùng hiển thị mà không cần tải ảnh lại</small></span></button>`:""}${isOwner?`<button type="button" data-photo-change><i class="fa-solid fa-camera"></i><span><strong>Thay đổi ${label}</strong><small>Chọn và căn chỉnh một ảnh mới</small></span></button>${source?`<button type="button" class="danger" data-photo-remove><i class="fa-regular fa-trash-can"></i><span><strong>Xóa ${label}</strong><small>Gỡ ảnh hiện tại khỏi hồ sơ</small></span></button>`:""}`:""}</div></div>`;
    overlay.classList.add("show");document.body.classList.add("profile-photo-actions-open");
    overlay.onclick=event=>{if(event.target===overlay)closePhotoActions()};
    overlay.querySelector("[data-photo-actions-close]").onclick=closePhotoActions;
    overlay.querySelector("[data-photo-view]")?.addEventListener("click",()=>{closePhotoActions();openMedia(source,kind)});
    overlay.querySelector("[data-photo-reposition]")?.addEventListener("click",()=>{closePhotoActions();openExistingPhotoPositionEditor(kind,source)});
    overlay.querySelector("[data-photo-change]")?.addEventListener("click",()=>{closePhotoActions();$(inputId)?.click()});
    overlay.querySelector("[data-photo-remove]")?.addEventListener("click",()=>{closePhotoActions();confirmRemovePhoto(kind)});
}

$("user-avatar-render")?.addEventListener("click",event=>{event.stopPropagation();openPhotoActions("avatar",$("user-avatar-render").src)});
$("cover-photo")?.addEventListener("click", event => {
    if (event.target.closest("label,button")) return;
    const source = getComputedStyle($("cover-photo")).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]||"";
    openPhotoActions("cover",source);
});
$("avatar-upload-label")?.addEventListener("click",event=>{
    event.preventDefault();event.stopPropagation();
    openPhotoActions("avatar",$("user-avatar-render")?.src||"");
});
$("cover-upload-label")?.addEventListener("click",event=>{
    event.preventDefault();event.stopPropagation();
    const source=getComputedStyle($("cover-photo")).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]||"";
    openPhotoActions("cover",source);
});
window.addEventListener("vhht-profile-data",event=>{currentPhotoProfileData=event.detail?.profile||currentPhotoProfileData});

const actions = document.querySelector(".composer-actions");
const cancel = document.getElementById("profile-cancel-compose") || document.createElement("button");
if (!cancel.id) {
    cancel.id = "profile-cancel-compose";
    cancel.type = "button";
    cancel.className = "cancel-compose";
    cancel.innerHTML = '<span>Hủy bài đăng</span>';
    actions?.prepend(cancel);
}
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
        const [latestProfileSnapshot,ownSnapshot]=await Promise.all([getDoc(doc(db,"users",profileId)),getDoc(doc(db,"users",me.uid))]);
        const latestProfile=latestProfileSnapshot.data()||data,own=ownSnapshot.data()||{};
        const friendIds=(own.friends||[]).map(value=>typeof value==="string"?value:value?.uid||value?.id||value?.userId||value?.friendId).filter(Boolean);
        const allowed = isOwner || latestProfile.friendsVisibility === "public" || (latestProfile.friendsVisibility === "friends" && friendIds.includes(profileId));
        let modal = $("profile-friends-modal");
        if (!modal) { modal = document.createElement("div"); modal.id = "profile-friends-modal"; document.body.appendChild(modal); }
        const card = document.createElement("div"); card.className = "friends-modal-card";
        const close = document.createElement("button"); close.className = "friends-modal-close"; close.textContent = "×";
        card.appendChild(close);
        if (!allowed) {
            const message = document.createElement("p"); message.className = "friends-private"; message.textContent = "Chủ hồ sơ đã ẩn danh sách bạn bè."; card.appendChild(message);
        } else {
            const title = document.createElement("h3"); title.textContent = `Bạn bè (${(latestProfile.friends || []).length})`; card.appendChild(title);
            const list = document.createElement("div"); list.className = "profile-friends-modal-list";
            for (const uid of latestProfile.friends || []) {
                const snapshot = await getDoc(doc(db, "users", uid)); if (!snapshot.exists()) continue;
                const friend = snapshot.data(), row = document.createElement("div"); row.className = "profile-friend-row"; row.dataset.uid = uid;
                const image = document.createElement("img"); image.src = resolveAvatarUrl(friend.photoURL || friend.profileImage, { uid: friend.id, displayName: friend.displayName });
                const identity=document.createElement("button");identity.className="friend-row-identity";const name = document.createElement("strong"); name.textContent = friend.displayName || "Thành viên";identity.append(image,name);identity.onclick=()=>location.href=`user-profile.html?uid=${encodeURIComponent(uid)}`;row.append(identity);
                if(isOwner){const actions=document.createElement("div");actions.className="friend-row-actions";actions.innerHTML=`<button class="friend-message-action"><i class="fa-solid fa-comment-dots"></i><span>Nhắn tin</span></button><button class="friend-remove-action"><i class="fa-solid fa-user-minus"></i><span>Xóa bạn</span></button>`;actions.querySelector(".friend-message-action").onclick=()=>location.href=`../messages/messages-page.html?uid=${encodeURIComponent(uid)}`;actions.querySelector(".friend-remove-action").onclick=async event=>{const action=event.currentTarget;if(!await confirmFriendRemoval(friend.displayName||"thành viên này"))return;action.disabled=true;try{await removeFriendship(me.uid,uid);row.remove();showProfileNotice("Đã xóa khỏi danh sách bạn bè","success")}catch(error){action.disabled=false;showProfileNotice(error.message||"Không thể hủy kết bạn","error")}};row.append(actions)}
                list.appendChild(row);
            }
            card.appendChild(list);
        }
        modal.replaceChildren(card); modal.classList.add("show");
        close.onclick = () => modal.classList.remove("show"); modal.onclick = event => { if (event.target === modal) modal.classList.remove("show"); };
    };
}

function confirmFriendRemoval(friendName){
    return new Promise(resolve=>{
        let overlay=$("friend-list-remove-confirm");if(!overlay){overlay=document.createElement("div");overlay.id="friend-list-remove-confirm";document.body.appendChild(overlay)}
        overlay.innerHTML=`<div class="unfriend-dialog-card"><span class="unfriend-dialog-icon"><i class="fa-solid fa-user-minus"></i></span><h3>Xóa khỏi danh sách bạn bè?</h3><p>Bạn và <strong></strong> sẽ không còn là bạn bè. Thao tác được đồng bộ cho cả hai tài khoản.</p><footer><button data-cancel>Quay lại</button><button class="confirm-unfriend">Xóa bạn</button></footer></div>`;overlay.querySelector("strong").textContent=friendName;overlay.classList.add("show");let settled=false;const finish=value=>{if(settled)return;settled=true;overlay.classList.remove("show");resolve(value)};overlay.querySelector("[data-cancel]").onclick=()=>finish(false);overlay.querySelector(".confirm-unfriend").onclick=()=>finish(true);overlay.onclick=event=>{if(event.target===overlay)finish(false)};
    });
}

function showProfileNotice(message, type) {
    let box = $("profile-professional-toast");
    if (!box) { box = document.createElement("div"); box.id = "profile-professional-toast"; document.body.appendChild(box); }
    box.className = `show ${type}`; box.textContent = message;
    clearTimeout(box.timer); box.timer = setTimeout(() => box.classList.remove("show"), 3200);
}
