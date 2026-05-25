import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp, getDoc, addDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ==========================================================================
   DOM ELEMENTS SELECTORS
   ========================================================================== */
const communityPostFeedContainer = document.getElementById("community-post-feed-container");
const myOwnPostsContainer = document.getElementById("my-own-posts-container");
const currentUserDisplayName = document.getElementById("community-current-user-display-name");
const myPostsFixedPanel = document.getElementById("my-posts-fixed-panel");
const toggleMyPostsPanelButton = document.getElementById("toggle-my-posts-panel-button");
const notificationBadge = document.getElementById("notification-badge");

const postDetailsOverlay = document.getElementById("post-details-overlay");
const closeModalButton = document.getElementById("close-modal-button");
const modalPostAuthor = document.getElementById("modal-post-author");
const modalPostText = document.getElementById("modal-post-text");
const modalPostImageContainer = document.getElementById("modal-post-image-container");
const modalPostTime = document.getElementById("modal-post-time");

const modalLikeButton = document.getElementById("modal-like-button");
const clearMyPostReactionBtn = document.getElementById("clear-my-post-reaction-btn");
const currentUserReactionIcon = document.getElementById("current-user-reaction-icon");
const reactionBtnText = document.getElementById("reaction-btn-text");
const summaryActiveEmojis = document.getElementById("summary-active-emojis");
const modalReactionSummary = document.getElementById("modal-reaction-summary");
const summaryReactionCount = document.getElementById("summary-reaction-count");
const reactionTooltipList = document.getElementById("reaction-tooltip-list");

const modalCommentsTree = document.getElementById("modal-comments-tree");
const modalCommentInput = document.getElementById("modal-comment-input");
const submitCommentButton = document.getElementById("submit-comment-button");
const replyingToBanner = document.getElementById("replying-to-banner");
const replyingToText = document.getElementById("replying-to-text");
const cancelReplyButton = document.getElementById("cancel-reply-button");

const commentImageInput = document.getElementById("comment-image-input");
const commentImagePreviewBox = document.getElementById("comment-image-preview-box");
const commentPreviewRenderZone = document.getElementById("comment-preview-render-zone");
const removeCommentImgBtn = document.getElementById("remove-comment-img-btn");

const mediaLightboxContainer = document.getElementById("media-lightbox-container");
const closeLightboxBtn = document.getElementById("close-lightbox-btn");
const lightboxZoomWrapper = document.getElementById("lightbox-zoom-wrapper");

const reactionDetailsOverlay = document.getElementById("reaction-details-overlay");
const closeReactModalBtn = document.getElementById("close-react-modal-btn");
const reactTabsHeader = document.getElementById("react-tabs-header");
const reactUsersList = document.getElementById("react-users-list");

/* ==========================================================================
   STATE ENGINE CONFIGURATIONS
   ========================================================================== */
let authenticatedUser = null;
let currentActivePostId = null;
let currentActivePostData = null;
let currentSelectedReplyObj = null;
let unreadPostsWithNotifications = new Set();
let base64CommentMediaString = null;
let detectedCommentMediaType = "image";

let postCardsMap = new Map();
let currentModalReactionData = {}; 

// CAMERA DRAGGING SPACE STATE
let worldOffsetX = 0;
let worldOffsetY = 0;
let isDraggingSpace = false;
let startDragX = 0;
let startDragY = 0;
let dragThresholdPassed = false;

const EMOJI_MAP = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😡", sorry: "😢" };
const EMOJI_TEXT = { like: "Thích", love: "Yêu thích", haha: "Haha", wow: "Wow", sad: "Phẫn nộ", sorry: "Bi thương" };

onAuthStateChanged(firebaseAuthentication, async (user) => {
    authenticatedUser = user;
    if (!user) return;
    const userDoc = await getDoc(doc(firebaseDatabase, "users", user.uid));
    if (userDoc.exists()) currentUserDisplayName.innerText = userDoc.data().displayName || "Người dùng";
    listenToNotificationsRealtime();
});

/* ==========================================================================
   CANVAS VŨ TRỤ ĐỘNG CHẬM RÃI
   ========================================================================== */
const canvas = document.getElementById("cosmic-universe-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
let starsArray = [];
let shootingStarsArray = [];

if (canvas && ctx) {
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initStars();
    }
    window.addEventListener("resize", resizeCanvas);

    function initStars() {
        starsArray = [];
        const totalStars = Math.floor((canvas.width * canvas.height) / 4500);
        for (let i = 0; i < totalStars; i++) {
            starsArray.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: 0.6 + Math.random() * 1.8,
                alpha: Math.random(),
                speed: 0.002 + Math.random() * 0.005,
                shape: Math.random() > 0.5 ? "diamond" : "circle"
            });
        }
    }

    function drawDiamondStar(cx, cy, spikes, outerRadius, innerRadius, fillStyle) {
        let rot = Math.PI / 2 * 3;
        let x = cx, y = cy;
        let step = Math.PI / spikes;
        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius; y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y); rot += step;
            x = cx + Math.cos(rot) * innerRadius; y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y); rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath(); ctx.fillStyle = fillStyle; ctx.fill();
    }

    function createShootingStar() {
        const burstCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < burstCount; i++) {
            shootingStarsArray.push({
                x: Math.random() * (canvas.width * 0.7), y: 0,
                length: 50 + Math.random() * 70, speed: 7 + Math.random() * 10, alpha: 1
            });
        }
    }

    function scheduleShootingStars() {
        setTimeout(() => { createShootingStar(); scheduleShootingStars(); }, 4000 + Math.random() * 5000);
    }

    function animateUniverse() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        starsArray.forEach(star => {
            star.alpha += star.speed;
            if (star.alpha > 1 || star.alpha < 0.1) star.speed = -star.speed;
            const color = `rgba(255, 255, 255, ${star.alpha})`;
            if (star.shape === "diamond") {
                drawDiamondStar(star.x, star.y, 4, star.size * 2, star.size * 0.4, color);
            } else {
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill();
            }
        });
        for (let i = shootingStarsArray.length - 1; i >= 0; i--) {
            let s = shootingStarsArray[i]; s.x += s.speed; s.y += s.speed; s.alpha -= 0.012;
            if (s.alpha <= 0 || s.x > canvas.width || s.y > canvas.height) { shootingStarsArray.splice(i, 1); continue; }
            ctx.strokeStyle = `rgba(255, 255, 255, ${s.alpha})`; ctx.lineWidth = 1.2; ctx.beginPath();
            ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.length, s.y - s.length); ctx.stroke();
        }
        requestAnimationFrame(animateUniverse);
    }
    resizeCanvas(); scheduleShootingStars(); requestAnimationFrame(animateUniverse);
}

/* ==========================================================================
   MODAL THÔNG BÁO / ĐIỀU HƯỚNG HIỆN ĐẠI (THAY THẾ PROMPT/CONFIRM)
   ========================================================================== */
function createCustomModalContainer() {
    let overlay = document.getElementById("custom-ux-dialog-overlay");
    if (!overlay) {
        overlay = document.createElement("div"); overlay.id = "custom-ux-dialog-overlay";
        overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(3,7,18,0.85); backdrop-filter:blur(8px); display:none; justify-content:center; align-items:center; z-index:99999; opacity:0; transition:opacity 0.25s ease;";
        overlay.innerHTML = `
            <div id="custom-ux-dialog-box" style="background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px; width:90%; max-width:420px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5); transform:scale(0.9); transition:transform 0.25s ease;">
                <h3 id="custom-ux-dialog-title" style="margin-top:0; color:#f8fafc; font-size:18px; margin-bottom:12px;">Hệ thống không gian</h3>
                <div id="custom-ux-dialog-body" style="margin-bottom:20px;">
                    <p id="custom-ux-dialog-text" style="color:#94a3b8; font-size:14px; margin:0; line-height:1.5;"></p>
                    <input type="text" id="custom-ux-dialog-input" style="display:none; width:100%; background:#1e293b; border:1px solid #334155; border-radius:8px; padding:10px; color:#f8fafc; margin-top:12px; font-size:14px; outline:none; box-sizing:border-box;">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:12px;">
                    <button id="custom-ux-dialog-cancel" style="background:transparent; border:1px solid #334155; color:#94a3b8; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:14px;">Hủy</button>
                    <button id="custom-ux-dialog-confirm" style="background:#38bdf8; border:none; color:#0f172a; font-weight:600; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:14px;">Xác nhận</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }
    return overlay;
}

function showCustomConfirm(message, onConfirm) {
    const overlay = createCustomModalContainer();
    document.getElementById("custom-ux-dialog-title").innerText = "XÁC NHẬN TÍN HIỆU";
    document.getElementById("custom-ux-dialog-text").innerText = message;
    document.getElementById("custom-ux-dialog-input").style.display = "none";
    const cancelBtn = document.getElementById("custom-ux-dialog-cancel");
    const confirmBtn = document.getElementById("custom-ux-dialog-confirm");
    cancelBtn.style.display = "block";
    
    overlay.style.display = "flex"; setTimeout(() => { overlay.style.opacity = "1"; document.getElementById("custom-ux-dialog-box").style.transform = "scale(1)"; }, 10);
    
    confirmBtn.onclick = () => { closeCustomDialog(); onConfirm(); };
    cancelBtn.onclick = closeCustomDialog;
}

function showCustomPrompt(message, defaultValue, onConfirm) {
    const overlay = createCustomModalContainer();
    document.getElementById("custom-ux-dialog-title").innerText = "CHỈNH SỬA TÍN HIỆU BẢN TIN";
    document.getElementById("custom-ux-dialog-text").innerText = message;
    const inputEl = document.getElementById("custom-ux-dialog-input");
    inputEl.style.display = "block"; inputEl.value = defaultValue;
    const cancelBtn = document.getElementById("custom-ux-dialog-cancel");
    const confirmBtn = document.getElementById("custom-ux-dialog-confirm");
    cancelBtn.style.display = "block";
    
    overlay.style.display = "flex"; setTimeout(() => { overlay.style.opacity = "1"; document.getElementById("custom-ux-dialog-box").style.transform = "scale(1)"; inputEl.focus(); }, 10);
    
    confirmBtn.onclick = () => { const val = inputEl.value; closeCustomDialog(); if(val !== null) onConfirm(val); };
    cancelBtn.onclick = closeCustomDialog;
}

function closeCustomDialog() {
    const overlay = document.getElementById("custom-ux-dialog-overlay");
    if(overlay) { overlay.style.opacity = "0"; document.getElementById("custom-ux-dialog-box").style.transform = "scale(0.9)"; setTimeout(() => { overlay.style.display = "none"; }, 250); }
}

/* ==========================================================================
   PHẦN 1: CAMERA WORLD DRAGGING CHUẨN XÁC KHÔNG GIẬT HÌNH
   ========================================================================== */
communityPostFeedContainer.addEventListener("mousedown", (e) => {
    if (e.target !== communityPostFeedContainer && !e.target.classList.contains("community-post-card") && !communityPostFeedContainer.contains(e.target)) return;
    isDraggingSpace = true; dragThresholdPassed = false;
    startDragX = e.clientX - worldOffsetX; startDragY = e.clientY - worldOffsetY;
});

document.addEventListener("mousemove", (e) => {
    if (!isDraggingSpace) return;
    const newX = e.clientX - startDragX; const newY = e.clientY - startDragY;
    if (Math.abs(newX - worldOffsetX) > 5 || Math.abs(newY - worldOffsetY) > 5) { dragThresholdPassed = true; }
    worldOffsetX = newX; worldOffsetY = newY;
});
document.addEventListener("mouseup", () => { isDraggingSpace = false; });

/* ==========================================================================
   PHẦN 2: THUẬT TOÁN ĐỊNH HÌNH THIÊN THẠCH BAO TRỌN NỘI DUNG VÀ DI CHUYỂN
   ========================================================================== */
function generateAsteroidBlobShape() {
    const r1 = 38 + Math.floor(Math.random() * 12); 
    const r2 = 38 + Math.floor(Math.random() * 12); 
    const r3 = 38 + Math.floor(Math.random() * 12); 
    const r4 = 38 + Math.floor(Math.random() * 12); 
    return `${r1}% ${100-r1}% ${r2}% ${100-r2}% / ${r3}% ${r4}% ${100-r4}% ${100-r3}%`;
}

function getRandomEdgePosition(cardWidth = 320, cardHeight = 220) {
    const edge = Math.floor(Math.random() * 4);
    let x = 0, y = 0, vx = 0, vy = 0;
    const speed = 0.15 + Math.random() * 0.25;
    switch (edge) {
        case 0: x = Math.random() * window.innerWidth; y = -cardHeight - 100; vx = (Math.random() - 0.5) * 0.2; vy = speed; break;
        case 1: x = window.innerWidth + 100; y = Math.random() * window.innerHeight; vx = -speed; vy = (Math.random() - 0.5) * 0.2; break;
        case 2: x = Math.random() * window.innerWidth; y = window.innerHeight + 100; vx = (Math.random() - 0.5) * 0.2; vy = -speed; break;
        case 3: x = -cardWidth - 100; y = Math.random() * window.innerHeight; vx = speed; vy = (Math.random() - 0.5) * 0.2; break;
    }
    return { x, y, vx, vy };
}

function initializeFloatingMovement(cardObj) {
    const el = cardObj.element;
    function updatePhysicsFrame() {
        if (currentActivePostId === el.id) { requestAnimationFrame(updatePhysicsFrame); return; }
        
        if (!cardObj.isOutside) {
            cardObj.x += cardObj.vx; cardObj.y += cardObj.vy;
            el.style.transform = `translate3d(${cardObj.x + worldOffsetX}px, ${cardObj.y + worldOffsetY}px, 0)`;
            
            const currentLeft = cardObj.x + worldOffsetX; const currentTop = cardObj.y + worldOffsetY;
            const buffer = 600;
            if (currentLeft < -buffer || currentLeft > window.innerWidth + buffer || currentTop < -buffer || currentTop > window.innerHeight + buffer) {
                cardObj.isOutside = true; el.style.opacity = "0";
                cardObj.respawnTimer = setTimeout(() => {
                    const newTrajectory = getRandomEdgePosition(cardObj.w, cardObj.h);
                    cardObj.x = newTrajectory.x - worldOffsetX; cardObj.y = newTrajectory.y - worldOffsetY;
                    cardObj.vx = newTrajectory.vx; cardObj.vy = newTrajectory.vy;
                    cardObj.isOutside = false; el.style.opacity = "1";
                }, 2000 + Math.random() * 3000);
            }
        } else {
            el.style.transform = `translate3d(${cardObj.x + worldOffsetX}px, ${cardObj.y + worldOffsetY}px, 0)`;
        }
        requestAnimationFrame(updatePhysicsFrame);
    }
    requestAnimationFrame(updatePhysicsFrame);
}

/* ==========================================================================
   PHẦN 3: REALTIME PIPELINE DATA FIRESTORE
   ========================================================================== */
function listenToNotificationsRealtime() {
    if (!authenticatedUser) return;
    const qNotif = query(collection(firebaseDatabase, "notifications"), where("postAuthorId", "==", authenticatedUser.uid), where("isRead", "==", false));
    onSnapshot(qNotif, (snapshot) => {
        unreadPostsWithNotifications.clear();
        snapshot.forEach(d => unreadPostsWithNotifications.add(d.data().postId));
        const count = unreadPostsWithNotifications.size;
        if (count > 0) { notificationBadge.innerText = count; notificationBadge.style.display = "flex"; }
        else { notificationBadge.style.display = "none"; }
        document.querySelectorAll(".my-own-post-card").forEach(card => {
            const pid = card.id.replace("my-post-", "");
            if (unreadPostsWithNotifications.has(pid)) card.classList.add("unread-post-indicator");
            else card.classList.remove("unread-post-indicator");
        });
    });
}

if (toggleMyPostsPanelButton) {
    toggleMyPostsPanelButton.addEventListener("click", (e) => {
        e.stopPropagation(); myPostsFixedPanel.classList.toggle("collapsed");
        if (!myPostsFixedPanel.classList.contains("collapsed") && unreadPostsWithNotifications.size > 0) {
            const qNotif = query(collection(firebaseDatabase, "notifications"), where("postAuthorId", "==", authenticatedUser.uid), where("isRead", "==", false));
            onSnapshot(qNotif, (snap) => { snap.forEach(async d => await updateDoc(doc(firebaseDatabase, "notifications", d.id), { isRead: true })); });
        }
    });
}

const postsQuery = query(collection(firebaseDatabase, "posts"), orderBy("createdAt", "desc"));
onSnapshot(postsQuery, (snapshot) => {
    const dbActiveIds = new Set();
    snapshot.forEach((docSnap) => {
        const postData = docSnap.data(); const postId = docSnap.id; dbActiveIds.add(postId);
        if (authenticatedUser && authenticatedUser.uid === postData.authorId) {
            createOrUpdateMyPost(postData, postId);
            if (postCardsMap.has(postId)) { const old = postCardsMap.get(postId); if (old.respawnTimer) clearTimeout(old.respawnTimer); old.element.remove(); postCardsMap.delete(postId); }
        } else {
            createOrUpdateFloatingPost(postData, postId);
        }
        if (currentActivePostId === postId) { currentModalReactionData = postData.reactions || {}; updateReactionDOM(currentModalReactionData); }
    });
    postCardsMap.forEach((v, k) => { if (!dbActiveIds.has(k)) { if (v.respawnTimer) clearTimeout(v.respawnTimer); v.element.remove(); postCardsMap.delete(k); } });
});

function createOrUpdateMyPost(postData, postId) {
    let card = document.getElementById(`my-post-${postId}`);
    const totalReactions = postData.reactions ? Object.keys(postData.reactions).length : 0;
    const totalComments = postData.commentCount || 0;
    if (!card) { card = document.createElement("div"); card.className = "my-own-post-card"; card.id = `my-post-${postId}`; myOwnPostsContainer.appendChild(card); }
    let mediaIndicatorHTML = "";
    if (postData.attachedImage) {
        mediaIndicatorHTML = postData.mediaType === "video" 
            ? `<div class="card-media-indicator"><i class="fa-solid fa-video"></i> Có Video ngắn</div>`
            : `<div class="card-media-indicator"><i class="fa-solid fa-image"></i> Có Hình ảnh</div>`;
    }
    card.innerHTML = `
        <div class="my-post-top">
            <div class="community-post-author">${postData.authorDisplayName || "User"}</div>
            <div class="post-menu-wrapper">
                <button class="post-menu-button">⋮</button>
                <div class="post-dropdown-menu">
                    <button class="edit-post-button">Sửa văn bản</button>
                    <button class="delete-post-button">Xóa tín hiệu</button>
                </div>
            </div>
        </div>
        <div class="community-post-content" style="cursor:pointer; margin-bottom: 6px;">
            ${postData.content || ""}
            ${mediaIndicatorHTML}
        </div>
        <div class="post-card-bottom-row">
            <div class="community-post-time">${formatPostDate(postData.createdAt)}</div>
            <div class="floating-card-stats">
                ${totalReactions > 0 ? `<span>👍 ${totalReactions}</span>` : ''}
                ${totalComments > 0 ? `<span>💬 ${totalComments}</span>` : ''}
            </div>
        </div>`;
    card.querySelector(".community-post-content").onclick = (e) => { e.stopPropagation(); openPostDetailsModal(postId, postData); };
    const btn = card.querySelector(".post-menu-button"); const dd = card.querySelector(".post-dropdown-menu");
    btn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll(".post-dropdown-menu, .comment-dropdown-menu").forEach(m => m.classList.remove("show-dropdown")); dd.classList.add("show-dropdown"); };
    card.querySelector(".edit-post-button").onclick = (e) => { e.stopPropagation(); editCommunityPost(postId); };
    card.querySelector(".delete-post-button").onclick = (e) => { e.stopPropagation(); deleteCommunityPost(postId); };
}

function createOrUpdateFloatingPost(postData, postId) {
    let cardObj = postCardsMap.get(postId);
    const totalReactions = postData.reactions ? Object.keys(postData.reactions).length : 0;
    const totalComments = postData.commentCount || 0;

    if (!cardObj) {
        const postCard = document.createElement("div"); postCard.className = "community-post-card asteroid-rock-node"; postCard.id = postId;
        communityPostFeedContainer.appendChild(postCard);

        const shapeBorderRadius = generateAsteroidBlobShape();
        postCard.style.borderRadius = shapeBorderRadius;

        const config = getRandomEdgePosition(330, 230);
        cardObj = { element: postCard, x: config.x - worldOffsetX, y: config.y - worldOffsetY, vx: config.vx, vy: config.vy, w: 330, h: 230, isOutside: false, respawnTimer: null };
        postCardsMap.set(postId, cardObj);
        initializeFloatingMovement(cardObj);
        
        postCard.addEventListener("click", (e) => {
            e.stopPropagation();
            if (dragThresholdPassed) return; // Nếu đang kéo camera thì không mở modal
            openPostDetailsModal(postId, postData);
        });
    }
    
    let mediaIndicatorHTML = "";
    if (postData.attachedImage) {
        mediaIndicatorHTML = postData.mediaType === "video" 
            ? `<div class="card-media-indicator"><i class="fa-solid fa-circle-play"></i> Xem Video</div>`
            : `<div class="card-media-indicator"><i class="fa-solid fa-image"></i> Xem Ảnh</div>`;
    }

    // Thiết kế bên trong lõi thiên thạch: Đảm bảo nội dung căn giữa gọn gàng không tràn ra rìa mấp mô
    cardObj.element.innerHTML = `
        <div class="asteroid-core-inner">
            <div class="community-post-author">${postData.authorDisplayName || "Phi hành gia"}</div>
            <div class="community-post-content">
                ${postData.content || ""}
                ${mediaIndicatorHTML}
            </div>
            <div class="post-card-bottom-row">
                <div class="community-post-time">${formatPostDate(postData.createdAt)}</div>
                <div class="floating-card-stats">
                    <span>👍 ${totalReactions}</span>
                    <span>💬 ${totalComments}</span>
                </div>
            </div>
        </div>
    `;
}

/* ==========================================================================
   PHẦN 4: HỆ THỐNG LIGHTBOX MATRIX ZOOM
   ========================================================================== */
let lightboxScale = 1; let isDraggingMedia = false;
let mediaStartX = 0, mediaStartY = 0; let mediaOffsetX = 0, mediaOffsetY = 0;
let targetZoomElement = null;

function bindZoomLightboxEvent(element, sourceUrl, isVideo = false) {
    element.addEventListener("click", (e) => {
        e.stopPropagation(); lightboxScale = 1; mediaOffsetX = 0; mediaOffsetY = 0; lightboxZoomWrapper.innerHTML = "";
        if (isVideo) {
            targetZoomElement = document.createElement("video"); targetZoomElement.src = sourceUrl; targetZoomElement.controls = true; targetZoomElement.autoplay = true; targetZoomElement.loop = true;
        } else {
            targetZoomElement = document.createElement("img"); targetZoomElement.src = sourceUrl;
        }
        lightboxZoomWrapper.appendChild(targetZoomElement); applyMediaTransformMatrix(); mediaLightboxContainer.style.display = "flex";
    });
}

function applyMediaTransformMatrix() { if (targetZoomElement) targetZoomElement.style.transform = `translate(${mediaOffsetX}px, ${mediaOffsetY}px) scale(${lightboxScale})`; }
if (lightboxZoomWrapper) {
    lightboxZoomWrapper.addEventListener("wheel", (e) => { e.preventDefault(); const zoomIntensity = 0.1; if (e.deltaY < 0) { lightboxScale += zoomIntensity; } else { lightboxScale = Math.max(0.4, lightboxScale - zoomIntensity); } applyMediaTransformMatrix(); });
    lightboxZoomWrapper.addEventListener("mousedown", (e) => { if (!targetZoomElement) return; isDraggingMedia = true; mediaStartX = e.clientX - mediaOffsetX; mediaStartY = e.clientY - mediaOffsetY; });
    document.addEventListener("mousemove", (e) => { if (!isDraggingMedia) return; mediaOffsetX = e.clientX - mediaStartX; mediaOffsetY = e.clientY - mediaStartY; applyMediaTransformMatrix(); });
    document.addEventListener("mouseup", () => { isDraggingMedia = false; });
}
if (closeLightboxBtn) closeLightboxBtn.onclick = (e) => { e.stopPropagation(); mediaLightboxContainer.style.display = "none"; lightboxZoomWrapper.innerHTML = ""; targetZoomElement = null; };

/* ==========================================================================
   PHẦN 5: CHAT ROOM DISCUSSION & ĐIỀU HƯỚNG BÌNH LUẬN THÔNG MINH
   ========================================================================== */
let commentsUnsubscribe = null;

async function openPostDetailsModal(postId, postData) {
    currentActivePostId = postId; currentActivePostData = postData; currentModalReactionData = postData.reactions || {}; currentSelectedReplyObj = null; replyingToBanner.style.display = "none";
    communityPostFeedContainer.classList.add("disable-space-interaction");
    document.querySelectorAll(".community-post-card").forEach(c => c.classList.add("blurred-post"));

    modalPostAuthor.innerText = postData.authorDisplayName || "User";
    modalPostText.innerText = postData.content || "";
    modalPostTime.innerText = formatPostDate(postData.createdAt);

    modalPostImageContainer.innerHTML = "";
    if (postData.attachedImage) {
        const isVid = postData.mediaType === "video"; const filename = isVid ? `Cosmic_Vid_${postId}.mp4` : `Cosmic_Img_${postId}.png`;
        modalPostImageContainer.innerHTML = `
            ${isVid ? `<video src="${postData.attachedImage}" class="shared-media-renderable" autoplay muted loop playsinline></video>` : `<img src="${postData.attachedImage}" class="shared-media-renderable" alt="Attachment">`}
            <a href="${postData.attachedImage}" download="${filename}" class="media-download-overlay-btn"><i class="fa-solid fa-download"></i></a>`;
        bindZoomLightboxEvent(modalPostImageContainer.querySelector(".shared-media-renderable"), postData.attachedImage, isVid);
    }

    updateReactionDOM(currentModalReactionData);
    if (commentsUnsubscribe) commentsUnsubscribe();
    const qComments = query(collection(firebaseDatabase, "posts", postId, "comments"), orderBy("createdAt", "asc"));
    commentsUnsubscribe = onSnapshot(qComments, (snap) => {
        const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        renderMessengerChatTree(arr);
        updateDoc(doc(firebaseDatabase, "posts", postId), { commentCount: arr.length });
    });
    postDetailsOverlay.style.display = "flex"; setTimeout(() => { postDetailsOverlay.classList.add("active"); }, 15);
}

function renderMessengerChatTree(allComments) {
    modalCommentsTree.innerHTML = "";
    const commentsMap = new Map();
    allComments.forEach(c => commentsMap.set(c.id, c));

    allComments.forEach(commentObj => {
        const wrapperNode = document.createElement("div");
        wrapperNode.id = `comment-node-id-${commentObj.id}`;
        const isMe = authenticatedUser && (commentObj.authorId === authenticatedUser.uid);
        wrapperNode.className = `comment-wrapper-node ${isMe ? 'align-right' : 'align-left'}`;

        const isPostAuthor = currentActivePostData && (commentObj.authorId === currentActivePostData.authorId);
        const authorBadgeHTML = isPostAuthor ? `<span class="author-badge">Tác giả</span>` : "";

        // Tích hợp tính năng bấm nhảy đến câu bình luận gốc và phồng sáng
        let replyContextHTML = "";
        if (commentObj.parentId && commentsMap.has(commentObj.parentId)) {
            const parentComment = commentsMap.get(commentObj.parentId);
            const truncatedContent = parentComment.content ? (parentComment.content.substring(0, 25) + "...") : "Tín hiệu ảnh/video";
            replyContextHTML = `<div class="reply-context-target" data-target-id="${commentObj.parentId}" style="cursor:pointer; text-decoration:underline;" title="Bấm để nhảy tới câu bình luận gốc">↳ Trả lời @${parentComment.authorDisplayName}: "${truncatedContent}"</div>`;
        }

        let commentMediaHTML = "";
        if (commentObj.attachedImage) {
            const isVid = commentObj.mediaType === "video"; const fn = isVid ? `Comment_Vid_${commentObj.id}.mp4` : `Comment_Img_${commentObj.id}.png`;
            commentMediaHTML = `
                <div class="comment-media-box-render">
                    ${isVid ? `<video src="${commentObj.attachedImage}" class="shared-media-renderable" autoplay muted loop playsinline></video>` : `<img src="${commentObj.attachedImage}" class="shared-media-renderable" alt="Media">`}
                    <a href="${commentObj.attachedImage}" download="${fn}" class="media-download-overlay-btn"><i class="fa-solid fa-download"></i></a>
                </div>`;
        }

        const commentReactsMap = commentObj.commentReactions || {};
        const uidsReacted = Object.keys(commentReactsMap);
        const hasIReacted = authenticatedUser && commentReactsMap[authenticatedUser.uid];
        
        let commentActiveIcon = "❤️"; let commentActiveText = "Yêu thích";
        if (hasIReacted && EMOJI_MAP[commentReactsMap[authenticatedUser.uid]]) {
            commentActiveIcon = EMOJI_MAP[commentReactsMap[authenticatedUser.uid]];
            commentActiveText = EMOJI_TEXT[commentReactsMap[authenticatedUser.uid]];
        }

        let summaryBadgeHTML = "";
        if (uidsReacted.length > 0) {
            const uniqueEmojis = new Set();
            uidsReacted.forEach(uid => { if (EMOJI_MAP[commentReactsMap[uid]]) uniqueEmojis.add(EMOJI_MAP[commentReactsMap[uid]]); });
            summaryBadgeHTML = `<div class="comment-summary-react-badge" title="${uidsReacted.length} người"><span>${Array.from(uniqueEmojis).join("")}</span><span>${uidsReacted.length}</span></div>`;
        }

        let commentManagementMenuHTML = "";
        if (isMe) {
            commentManagementMenuHTML = `
                <div class="comment-menu-relative">
                    <button class="comment-menu-trigger-btn">⋮</button>
                    <div class="comment-dropdown-menu" id="comment-menu-dropdown-${commentObj.id}">
                        <button class="edit-comment-btn">Sửa</button>
                        <button class="delete-comment-btn">Xóa</button>
                    </div>
                </div>`;
        }

        wrapperNode.innerHTML = `
            ${replyContextHTML}
            <div class="comment-main-box">
                ${commentManagementMenuHTML}
                <div class="comment-user-row">
                    <span class="comment-user">${commentObj.authorDisplayName}</span>
                    ${authorBadgeHTML}
                </div>
                <div class="comment-text">${commentObj.content}</div>
                ${commentMediaHTML}
                ${summaryBadgeHTML}
            </div>
            <div class="comment-meta-actions">
                <span>${formatPostDate(commentObj.createdAt)}</span>
                <span class="reply-trigger-btn" id="reply-btn-${commentObj.id}">Trả lời</span>
                <div class="comment-react-outer-flex">
                    <div class="comment-react-node-container">
                        <span class="comment-react-node-btn ${hasIReacted ? 'active-reacted' : ''}" style="${!hasIReacted ? 'opacity: 0.45;' : ''}" id="react-comment-btn-${commentObj.id}">
                            <span>${commentActiveIcon}</span> <span>${commentActiveText}</span>
                        </span>
                        <div class="comment-reaction-popover">
                            <span class="comment-react-emoji" data-type="like" data-cid="${commentObj.id}">👍</span>
                            <span class="comment-react-emoji" data-type="love" data-cid="${commentObj.id}">❤️</span>
                            <span class="comment-react-emoji" data-type="haha" data-cid="${commentObj.id}">😂</span>
                            <span class="comment-react-emoji" data-type="wow" data-cid="${commentObj.id}">😮</span>
                            <span class="comment-react-emoji" data-type="sad" data-cid="${commentObj.id}">😡</span>
                            <span class="comment-react-emoji" data-type="sorry" data-cid="${commentObj.id}">😢</span>
                        </div>
                    </div>
                    ${hasIReacted ? `<span class="cancel-comment-react-x" id="clear-comment-react-x-${commentObj.id}" style="color:#f43f5e; cursor:pointer; font-weight:700; margin-left:6px;" title="Xóa cảm xúc">&times;</span>` : ''}
                </div>
            </div>`;

        modalCommentsTree.appendChild(wrapperNode);

        if (commentObj.attachedImage) bindZoomLightboxEvent(wrapperNode.querySelector(".shared-media-renderable"), commentObj.attachedImage, commentObj.mediaType === "video");

        // Logic nhảy tới comment gốc và làm phồng sáng khi click
        if (commentObj.parentId) {
            const ctxLink = wrapperNode.querySelector(".reply-context-target");
            if (ctxLink) {
                ctxLink.onclick = (e) => {
                    e.stopPropagation();
                    const targetId = ctxLink.getAttribute("data-target-id");
                    const targetNode = document.getElementById(`comment-node-id-${targetId}`);
                    if (targetNode) {
                        targetNode.scrollIntoView({ behavior: "smooth", block: "center" });
                        targetNode.classList.remove("comment-flash-highlight");
                        void targetNode.offsetWidth; // Trigger reflow để kích hoạt lại animation
                        targetNode.classList.add("comment-flash-highlight");
                    }
                };
            }
        }

        if (isMe) {
            const trigger = wrapperNode.querySelector(".comment-menu-trigger-btn"); const dropdown = wrapperNode.querySelector(`#comment-menu-dropdown-${commentObj.id}`);
            trigger.onclick = (e) => { e.stopPropagation(); document.querySelectorAll(".post-dropdown-menu, .comment-dropdown-menu").forEach(m => m.classList.remove("show-dropdown")); dropdown.classList.add("show-dropdown"); };
            wrapperNode.querySelector(".edit-comment-btn").onclick = (e) => { e.stopPropagation(); editTargetComment(commentObj.id, commentObj.content); };
            wrapperNode.querySelector(".delete-comment-btn").onclick = (e) => { e.stopPropagation(); deleteTargetComment(commentObj.id); };
        }

        wrapperNode.querySelector(`#reply-btn-${commentObj.id}`).onclick = (e) => {
            e.stopPropagation(); currentSelectedReplyObj = { id: commentObj.id, authorDisplayName: commentObj.authorDisplayName };
            replyingToText.innerText = `Đang phản hồi @${commentObj.authorDisplayName}...`; replyingToBanner.style.display = "flex"; modalCommentInput.focus();
        };

        wrapperNode.querySelector(`#react-comment-btn-${commentObj.id}`).onclick = async (e) => {
            e.stopPropagation(); if (!authenticatedUser || !currentActivePostId) return;
            const commentRef = doc(firebaseDatabase, "posts", currentActivePostId, "comments", commentObj.id);
            if (!hasIReacted) { commentReactsMap[authenticatedUser.uid] = "love"; await updateDoc(commentRef, { commentReactions: commentReactsMap }); }
        };

        if (hasIReacted) {
            wrapperNode.querySelector(`#clear-comment-react-x-${commentObj.id}`).onclick = async (e) => {
                e.stopPropagation(); if (!authenticatedUser || !currentActivePostId) return;
                const commentRef = doc(firebaseDatabase, "posts", currentActivePostId, "comments", commentObj.id);
                delete commentReactsMap[authenticatedUser.uid]; await updateDoc(commentRef, { commentReactions: commentReactsMap });
            };
        }

        wrapperNode.querySelectorAll(".comment-react-emoji").forEach(emojiBtn => {
            emojiBtn.onclick = async (e) => {
                e.stopPropagation(); if (!authenticatedUser || !currentActivePostId) return;
                const type = emojiBtn.getAttribute("data-type"); const commentRef = doc(firebaseDatabase, "posts", currentActivePostId, "comments", commentObj.id);
                const freshReactsMap = commentObj.commentReactions || {}; freshReactsMap[authenticatedUser.uid] = type; await updateDoc(commentRef, { commentReactions: freshReactsMap });
            };
        });
    });
}

if (commentImageInput) {
    commentImageInput.addEventListener("change", (e) => {
        const file = e.target.files[0]; if (!file) return;
        detectedCommentMediaType = file.type.startsWith("video/") ? "video" : "image";
        const reader = new FileReader();
        reader.onload = (event) => {
            base64CommentMediaString = event.target.result; commentPreviewRenderZone.innerHTML = "";
            if (detectedCommentMediaType === "video") { commentPreviewRenderZone.innerHTML = `<video src="${base64CommentMediaString}" autoplay muted loop></video>`; } 
            else { commentPreviewRenderZone.innerHTML = `<img src="${base64CommentMediaString}" alt="Preview">`; }
            commentImagePreviewBox.style.display = "block";
        };
        reader.readAsDataURL(file);
    });
}
if (removeCommentImgBtn) { removeCommentImgBtn.onclick = (e) => { e.stopPropagation(); base64CommentMediaString = null; commentImageInput.value = ""; commentImagePreviewBox.style.display = "none"; }; }

submitCommentButton.onclick = executeSubmitComment;
modalCommentInput.onkeydown = (e) => { if (e.key === "Enter") executeSubmitComment(); };

async function executeSubmitComment() {
    const text = modalCommentInput.value.trim(); if (!text && !base64CommentMediaString) return; if (!currentActivePostId) return;
    try {
        await addDoc(collection(firebaseDatabase, "posts", currentActivePostId, "comments"), {
            parentId: currentSelectedReplyObj ? currentSelectedReplyObj.id : null,
            authorId: authenticatedUser.uid, authorDisplayName: currentUserDisplayName.innerText,
            content: text, attachedImage: base64CommentMediaString, mediaType: base64CommentMediaString ? detectedCommentMediaType : null,
            commentReactions: {}, createdAt: serverTimestamp()
        });
        modalCommentInput.value = ""; currentSelectedReplyObj = null; replyingToBanner.style.display = "none"; base64CommentMediaString = null; commentImagePreviewBox.style.display = "none";
    } catch (err) { console.error(err); }
}

cancelReplyButton.onclick = (e) => { e.stopPropagation(); currentSelectedReplyObj = null; replyingToBanner.style.display = "none"; };

function editTargetComment(commentId, currentContent) {
    showCustomPrompt("Chỉnh sửa nội dung bình luận của bạn:", currentContent, async (freshTxt) => {
        if (!freshTxt.trim() || !currentActivePostId) return;
        await updateDoc(doc(firebaseDatabase, "posts", currentActivePostId, "comments", commentId), { content: freshTxt.trim() });
    });
}

function deleteTargetComment(commentId) {
    showCustomConfirm("Bạn có chắc chắn muốn xóa phản hồi vũ trụ này không?", async () => {
        if (!currentActivePostId) return;
        await deleteDoc(doc(firebaseDatabase, "posts", currentActivePostId, "comments", commentId));
    });
}

/* ==========================================================================
   PHẦN 6: BỘ ĐIỀU HÀNH REACTION BÀI VIẾT GỐC (TÍCH HỢP X Ở CUỐI)
   ========================================================================== */
function updateReactionDOM(reactionsMap) {
    const listUIDs = Object.keys(reactionsMap);
    summaryReactionCount.innerText = `${listUIDs.length} Cosmic Reacts`;
    const uniqueEmojis = new Set();
    listUIDs.forEach(uid => { if (EMOJI_MAP[reactionsMap[uid]]) uniqueEmojis.add(EMOJI_MAP[reactionsMap[uid]]); });
    summaryActiveEmojis.innerHTML = Array.from(uniqueEmojis).join("");

    if (listUIDs.length === 0) {
        reactionTooltipList.innerHTML = "Chưa có tín hiệu cảm xúc";
    } else {
        reactionTooltipList.innerHTML = "";
        listUIDs.forEach(async (uid) => {
            const item = document.createElement("div"); item.id = `tooltip-user-${uid}`; item.innerText = `...`; reactionTooltipList.appendChild(item);
            const uDoc = await getDoc(doc(firebaseDatabase, "users", uid)); const name = uDoc.exists() ? (uDoc.data().displayName || "Astronaut") : "Astronaut";
            const node = document.getElementById(`tooltip-user-${uid}`); if (node) node.innerText = `${name} ${EMOJI_MAP[reactionsMap[uid]]}`;
        });
    }

    if (authenticatedUser && reactionsMap[authenticatedUser.uid]) {
        const type = reactionsMap[authenticatedUser.uid];
        currentUserReactionIcon.innerText = EMOJI_MAP[type]; reactionBtnText.innerText = EMOJI_TEXT[type];
        modalLikeButton.style.color = "#38bdf8"; clearMyPostReactionBtn.style.display = "flex";
    } else {
        currentUserReactionIcon.innerText = "👍"; reactionBtnText.innerText = "Thích";
        modalLikeButton.style.color = "#cbd5e1"; clearMyPostReactionBtn.style.display = "none";
    }
}

modalReactionSummary.onclick = (e) => { e.stopPropagation(); if (currentActivePostId) openReactionDetailsTabsModal(); };

async function openReactionDetailsTabsModal() {
    reactionUsersList.innerHTML = "Đang quét tín hiệu không gian..."; reactionDetailsOverlay.style.display = "flex";
    const uids = Object.keys(currentModalReactionData);
    const counts = { all: uids.length, like: 0, love: 0, haha: 0, wow: 0, sad: 0, sorry: 0 };
    uids.forEach(uid => { const type = currentModalReactionData[uid]; if (counts[type] !== undefined) counts[type]++; });

    reactTabsHeader.innerHTML = `
        <button class="react-tab-item active" data-tab="all">Tất cả (${counts.all})</button>
        <button class="react-tab-item" data-tab="like">👍 ${counts.like}</button>
        <button class="react-tab-item" data-tab="love">❤️ ${counts.love}</button>
        <button class="react-tab-item" data-tab="haha">😂 ${counts.haha}</button>
        <button class="react-tab-item" data-tab="wow">😮 ${counts.wow}</button>
        <button class="react-tab-item" data-tab="sad">😡 ${counts.sad}</button>
        <button class="react-tab-item" data-tab="sorry">😢 ${counts.sorry}</button>`;

    await renderUsersBySelectedTab("all");
    reactTabsHeader.querySelectorAll(".react-tab-item").forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation(); reactTabsHeader.querySelectorAll(".react-tab-item").forEach(b => b.classList.remove("active"));
            btn.classList.add("active"); await renderUsersBySelectedTab(btn.getAttribute("data-tab"));
        };
    });
}

async function renderUsersBySelectedTab(tabType) {
    reactUsersList.innerHTML = ""; const uids = Object.keys(currentModalReactionData);
    const filteredUIDs = uids.filter(uid => tabType === "all" ? true : currentModalReactionData[uid] === tabType);
    if (filteredUIDs.length === 0) { reactUsersList.innerHTML = `<div style="text-align:center; font-size:12px; color:#475569; margin-top:20px;">Trống không như khoảng vô tận</div>`; return; }
    for (const uid of filteredUIDs) {
        const row = document.createElement("div"); row.className = "react-user-row-item";
        row.innerHTML = `<span class="username" id="modal-react-user-name-${uid}">Đang nạp...</span><span class="emoji-sign">${EMOJI_MAP[currentModalReactionData[uid]] || "👍"}</span>`;
        reactUsersList.appendChild(row);
        getDoc(doc(firebaseDatabase, "users", uid)).then(uDoc => { const nameEl = document.getElementById(`modal-react-user-name-${uid}`); if (nameEl) nameEl.innerText = uDoc.exists() ? (uDoc.data().displayName || "Astronaut") : "Astronaut"; });
    }
}

closeReactModalBtn.onclick = (e) => { e.stopPropagation(); reactionDetailsOverlay.style.display = "none"; };

modalLikeButton.onclick = async (e) => {
    e.stopPropagation(); if (!authenticatedUser || !currentActivePostId) return;
    const postRef = doc(firebaseDatabase, "posts", currentActivePostId);
    if (!currentModalReactionData[authenticatedUser.uid]) { currentModalReactionData[authenticatedUser.uid] = "like"; await updateDoc(postRef, { reactions: currentModalReactionData }); }
};

// Hàm hủy bỏ cảm xúc dùng chung
async function clearPostReactionLogic() {
    if (!authenticatedUser || !currentActivePostId) return;
    const postRef = doc(firebaseDatabase, "posts", currentActivePostId);
    delete currentModalReactionData[authenticatedUser.uid];
    await updateDoc(postRef, { reactions: currentModalReactionData });
}
clearMyPostReactionBtn.onclick = (e) => { e.stopPropagation(); clearPostReactionLogic(); };

// Lắng nghe sự kiện click trên thanh Emoji Popover bài viết gốc (Kèm nút xóa cuối dòng)
document.querySelectorAll(".react-emoji").forEach(emojiEl => {
    emojiEl.onclick = async (e) => {
        e.stopPropagation();
        const type = emojiEl.getAttribute("data-type");
        if (type === "clear") {
            await clearPostReactionLogic();
        } else {
            if (!authenticatedUser || !currentActivePostId) return;
            const postRef = doc(firebaseDatabase, "posts", currentActivePostId);
            currentModalReactionData[authenticatedUser.uid] = type;
            await updateDoc(postRef, { reactions: currentModalReactionData });
        }
    };
});

function closePostDetailsModal() {
    postDetailsOverlay.classList.remove("active");
    setTimeout(() => {
        postDetailsOverlay.style.display = "none"; currentActivePostId = null; currentActivePostData = null; if (commentsUnsubscribe) commentsUnsubscribe();
        communityPostFeedContainer.classList.remove("disable-space-interaction");
        document.querySelectorAll(".community-post-card").forEach(c => c.classList.remove("blurred-post"));
    }, 300);
}
closeModalButton.onclick = (e) => { e.stopPropagation(); closePostDetailsModal(); };
postDetailsOverlay.onclick = (e) => { if (e.target === postDetailsOverlay) closePostDetailsModal(); };

document.addEventListener("click", () => { document.querySelectorAll(".post-dropdown-menu, .comment-dropdown-menu").forEach(m => m.classList.remove("show-dropdown")); });

function formatPostDate(timestamp) {
    if (!timestamp?.seconds) return "Vừa xong";
    const d = new Date(timestamp.seconds * 1000);
    return d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

window.deleteCommunityPost = (postId) => {
    showCustomConfirm("Hành tinh này sẽ tan biến vào hư không. Bạn có chắc chắn muốn xóa bài viết này?", async () => {
        await deleteDoc(doc(firebaseDatabase, "posts", postId));
    });
};
window.editCommunityPost = (postId) => {
    getDoc(doc(firebaseDatabase, "posts", postId)).then(dSnap => {
        const currentContent = dSnap.exists() ? (dSnap.data().content || "") : "";
        showCustomPrompt("Chỉnh sửa nội dung thông điệp bài viết:", currentContent, async (txt) => {
            if (!txt.trim()) return;
            await updateDoc(doc(firebaseDatabase, "posts", postId), { content: txt.trim(), updatedAt: serverTimestamp() });
        });
    });
};