import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import "./create-post-handler.js";
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, setDoc, arrayUnion, arrayRemove, serverTimestamp, getDoc, getDocs, addDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { uploadMedia, validateImage, validateVideo } from "../shared/cloudinary-media-service.js";
import { acceptFriendship } from "../shared/friendship-service.js";
import { resolveDisplayName } from "../shared/user-identity.js";

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
const postDetailsModal = postDetailsOverlay?.querySelector(".post-details-modal");
const mobileDetailTabButtons = [...document.querySelectorAll(".mobile-detail-tab")];
const closeModalButton = document.getElementById("close-modal-button");
const modalPostAuthor = document.getElementById("modal-post-author");
const modalPostAvatar = document.getElementById("modal-post-avatar");
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

const communityLogoutButton = document.getElementById("community-logout-button");
const profileAvatarButton = document.getElementById("community-profile-avatar");
const onlineStatusButton = document.getElementById("community-user-status");
const onlineStatusText = document.getElementById("online-status-text");
const escapeHTML = value => { const node=document.createElement("div");node.textContent=value??"";return node.innerHTML; };

function setMobileDetailView(view = "post") {
    if (!postDetailsModal) return;
    const normalizedView = view === "comments" ? "comments" : "post";
    postDetailsModal.dataset.mobileView = normalizedView;
    mobileDetailTabButtons.forEach(button => {
        const selected = button.dataset.detailView === normalizedView;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-selected", String(selected));
    });
}
mobileDetailTabButtons.forEach(button => button.addEventListener("click", () => setMobileDetailView(button.dataset.detailView)));

/* ==========================================================================
   STATE ENGINE CONFIGURATIONS
   ========================================================================== */
let authenticatedUser = null;
let currentActivePostId = null;
let currentActivePostData = null;
let currentSelectedReplyObj = null;
let unreadPostsWithNotifications = new Set();
let detectedCommentMediaType = "image";
let selectedCommentMediaFile = null;
let commentPreviewObjectUrl = null;

let postCardsMap = new Map();
let currentModalReactionData = {}; 
let currentViewerFriends = [];
let currentUserRole = "user";
let requestedPostOpened = false;
const DEFAULT_AVATAR = "../shared/assets/default-avatar.svg";

function openUserProfile(userId) {
    if(userId){const adminMode=currentUserRole==="admin";const source=adminMode?"&from=community-admin":"";sessionStorage.setItem("vhht_profile_return_source",adminMode?"community-admin":"community");window.location.href=`./profile-user/user-profile.html?uid=${encodeURIComponent(userId)}${source}`}
}

function resolvePostAvatar(postData) { return postData.authorAvatar || postData.photoURL || DEFAULT_AVATAR; }

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
    if (userDoc.exists()) { const data=userDoc.data();if(data.accountStatus==="suspended"){await firebaseAuthentication.signOut();location.href="../authentication/login-page.html";return} currentUserDisplayName.innerText=resolveDisplayName(data,user); currentViewerFriends=data.friends||[];currentUserRole=data.role||"user"; if(profileAvatarButton) profileAvatarButton.src=data.photoURL||data.profileImage||DEFAULT_AVATAR; setStatusUI(data.showActivityStatus!==false);if(data.role==="admin")installAdminModeButton(); }
    const heartbeat=()=>document.visibilityState==="visible"&&setDoc(doc(firebaseDatabase,"users",user.uid),{lastActiveAt:serverTimestamp()},{merge:true});heartbeat();setInterval(heartbeat,45000);document.addEventListener("visibilitychange",heartbeat);
    listenToNotificationsRealtime();
    listenToMessageNotifications();
});

function listenToMessageNotifications(){const badge=document.getElementById("message-badge");onSnapshot(collection(firebaseDatabase,"messageNotifications"),snap=>{let count=0;snap.forEach(d=>{const n=d.data();if(n.recipientId===authenticatedUser?.uid&&!n.isRead)count++});if(badge){badge.textContent=count;badge.hidden=!count}})}

/* ==========================================================================
   CANVAS VŨ TRỤ ĐỘNG CHẬM RÃI (GIỮ NGUYÊN GIAO DIỆN LẤP LÁNH)
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
   MODAL THÔNG BÁO / ĐIỀU HƯỚNG BẢN TIN CHUẨN UX
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
   CAMERA WORLD DRAGGING CHUẨN XÁC KHÔNG GIẬT HÌNH
   ========================================================================== */
// Unified mouse/touch/pen panning. Pointer capture keeps the drag stable even when a finger crosses a card.
let activeSpacePointerId = null;
let pendingFloatingPostTapId = null;
communityPostFeedContainer.addEventListener("pointerdown", event => {
    if (event.isPrimary === false || postDetailsOverlay?.classList.contains("active")) return;
    if (event.target.closest("button,a,input,textarea,select,label")) return;
    activeSpacePointerId = event.pointerId;
    pendingFloatingPostTapId = event.target.closest(".community-post-card")?.id || null;
    isDraggingSpace = true;
    dragThresholdPassed = false;
    startDragX = event.clientX - worldOffsetX;
    startDragY = event.clientY - worldOffsetY;
    communityPostFeedContainer.setPointerCapture?.(event.pointerId);
});
communityPostFeedContainer.addEventListener("pointermove", event => {
    if (!isDraggingSpace || event.pointerId !== activeSpacePointerId) return;
    const nextX = event.clientX - startDragX;
    const nextY = event.clientY - startDragY;
    if (Math.abs(nextX - worldOffsetX) > 6 || Math.abs(nextY - worldOffsetY) > 6) dragThresholdPassed = true;
    worldOffsetX = nextX;
    worldOffsetY = nextY;
    if (event.pointerType !== "mouse") event.preventDefault();
});
const finishSpacePointer = event => {
    if (activeSpacePointerId !== null && event.pointerId !== activeSpacePointerId) return;
    const tappedPostId = event.type === "pointerup" && !dragThresholdPassed ? pendingFloatingPostTapId : null;
    if (activeSpacePointerId !== null) communityPostFeedContainer.releasePointerCapture?.(activeSpacePointerId);
    isDraggingSpace = false;
    activeSpacePointerId = null;
    pendingFloatingPostTapId = null;
    if (tappedPostId && !postDetailsOverlay?.classList.contains("active")) {
        const tappedPost = postCardsMap.get(tappedPostId);
        if (tappedPost?.postData) openPostDetailsModal(tappedPostId, tappedPost.postData);
    }
};
communityPostFeedContainer.addEventListener("pointerup", finishSpacePointer);
communityPostFeedContainer.addEventListener("pointercancel", finishSpacePointer);

// Keep the mobile composer attached to the visible viewport when the software keyboard opens.
const mobileComposerWrapper = document.querySelector(".community-create-post-container-wrapper");
const mobileComposerInput = document.getElementById("main-post-textarea");
function syncComposerWithVisualViewport() {
    if (!mobileComposerWrapper) return;
    if (!window.visualViewport || window.innerWidth > 800) {
        mobileComposerWrapper.style.removeProperty("--mobile-keyboard-offset");
        postDetailsOverlay?.style.removeProperty("--detail-viewport-height");
        postDetailsOverlay?.style.removeProperty("--detail-viewport-top");
        return;
    }
    const viewport = window.visualViewport;
    const keyboardOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    mobileComposerWrapper.style.setProperty("--mobile-keyboard-offset", `${Math.round(keyboardOffset)}px`);
    postDetailsOverlay?.style.setProperty("--detail-viewport-height", `${Math.round(viewport.height)}px`);
    postDetailsOverlay?.style.setProperty("--detail-viewport-top", `${Math.round(viewport.offsetTop)}px`);
}
if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncComposerWithVisualViewport);
    window.visualViewport.addEventListener("scroll", syncComposerWithVisualViewport);
}
mobileComposerInput?.addEventListener("focus", () => {
    syncComposerWithVisualViewport();
    setTimeout(syncComposerWithVisualViewport, 120);
    setTimeout(syncComposerWithVisualViewport, 320);
});
mobileComposerInput?.addEventListener("blur", () => setTimeout(syncComposerWithVisualViewport, 120));
modalCommentInput?.addEventListener("focus", () => {
    syncComposerWithVisualViewport();
    setTimeout(syncComposerWithVisualViewport, 120);
    setTimeout(syncComposerWithVisualViewport, 320);
});
modalCommentInput?.addEventListener("blur", () => setTimeout(syncComposerWithVisualViewport, 120));
window.addEventListener("orientationchange", () => setTimeout(syncComposerWithVisualViewport, 180));

/* ==========================================================================
   YÊU CẦU 1: CẢI TIẾN THUẬT TOÁN SINH TIN TRÔI - VÀO TRANG LÀ XUẤT HIỆN LUÔN
   ========================================================================== */
function generateAsteroidBlobShape() {
    const shapes = [
        "56% 44% 53% 47% / 46% 55% 45% 54%",
        "45% 55% 47% 53% / 56% 44% 54% 46%",
        "55% 45% 49% 51% / 47% 53% 45% 55%",
        "46% 54% 55% 45% / 53% 47% 56% 44%",
        "52% 48% 45% 55% / 55% 46% 54% 45%",
        "54% 46% 56% 44% / 45% 55% 48% 52%"
    ];
    return shapes[Math.floor(Math.random() * shapes.length)];
}

function getFloatingCardSize() {
    const viewportWidth = window.innerWidth;
    const variance = .9 + Math.random() * .18;
    if (viewportWidth <= 380) return { width: Math.round(Math.max(156, Math.min(184, viewportWidth - 24)) * variance), height: 126 };
    if (viewportWidth <= 600) return { width: Math.round(Math.max(168, Math.min(204, viewportWidth - 28)) * variance), height: 138 };
    if (viewportWidth <= 800) return { width: Math.round(224 * variance), height: 158 };
    return { width: Math.round(330 * variance), height: 230 };
}

// Cải tiến hàm định vị: Nếu là `isInitialLoad` (vừa vào trang/reload), tin nhắn sẽ xuất hiện trực tiếp TRONG màn hình
function getRandomScreenOrEdgePosition(cardWidth = 320, cardHeight = 220, isInitialLoad = false) {
    const isCompact = window.matchMedia("(max-width: 800px)").matches;
    const speedScale = isCompact ? 0.58 : 1;
    const speed = (0.55 + Math.random() * 0.65) * speedScale;
    
    if (isInitialLoad) {
        // Sinh ngẫu nhiên hoàn toàn bên trong khung hình hiển thị (Safe Padding 80px) để vừa tải trang là thấy ngay
        const sidePadding = isCompact ? 12 : 80;
        const topSafe = isCompact ? 130 + (Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--vhht-safe-top")) || 0) : 90;
        const bottomSafe = isCompact ? 108 : 96;
        const availableX = Math.max(0, window.innerWidth - cardWidth - sidePadding * 2);
        const availableY = Math.max(0, window.innerHeight - cardHeight - topSafe - bottomSafe);
        const x = sidePadding + Math.random() * availableX;
        const y = topSafe + Math.random() * availableY;
        const angle = Math.random() * Math.PI * 2;
        return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
    } else {
        // Nếu tin trôi đã chạy ra ngoài hẳn màn hình, tiến hành tái sinh (respawn) từ các cạnh biên biên giới bay vào
        const edge = Math.floor(Math.random() * 4);
        let x = 0, y = 0, vx = 0, vy = 0;
        switch (edge) {
            case 0: x = Math.random() * window.innerWidth; y = -cardHeight - 50; vx = (Math.random() - 0.5) * 0.3; vy = speed; break;
            case 1: x = window.innerWidth + 50; y = Math.random() * window.innerHeight; vx = -speed; vy = (Math.random() - 0.5) * 0.3; break;
            case 2: x = Math.random() * window.innerWidth; y = window.innerHeight + 50; vx = (Math.random() - 0.5) * 0.3; vy = -speed; break;
            case 3: x = -cardWidth - 50; y = Math.random() * window.innerHeight; vx = speed; vy = (Math.random() - 0.5) * 0.3; break;
        }
        return { x, y, vx, vy };
    }
}

function initializeFloatingMovement(cardObj) {
    const el = cardObj.element;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    function updatePhysicsFrame() {
        if (document.hidden) { setTimeout(() => requestAnimationFrame(updatePhysicsFrame), 220); return; }
        if (reducedMotionQuery.matches) {
            el.style.transform = `translate3d(${cardObj.x + worldOffsetX}px, ${cardObj.y + worldOffsetY}px, 0)`;
            setTimeout(() => requestAnimationFrame(updatePhysicsFrame), 500);
            return;
        }
        if (currentActivePostId === el.id) { requestAnimationFrame(updatePhysicsFrame); return; }
        
        if (!cardObj.isOutside) {
            const now = performance.now();
            const wanderAngle = Math.sin(now * cardObj.wanderFrequency + cardObj.wanderPhase) * cardObj.wanderStrength;
            cardObj.vx += Math.cos(wanderAngle + cardObj.headingBias) * cardObj.turnRate;
            cardObj.vy += Math.sin(wanderAngle + cardObj.headingBias) * cardObj.turnRate;
            if (now >= cardObj.nextCourseChange) {
                cardObj.headingBias += (Math.random() - .5) * 1.7;
                cardObj.nextCourseChange = now + 1300 + Math.random() * 4200;
            }
            if (now >= cardObj.nextCollisionRoll) {
                cardObj.canCollide = Math.random() < .62;
                cardObj.collisionModeUntil = cardObj.canCollide ? now + 4500 + Math.random() * 3500 : now;
                cardObj.nextCollisionRoll = now + 5000 + Math.random() * 7000;
            }
            if (cardObj.canCollide && now > cardObj.collisionModeUntil) cardObj.canCollide = false;
            cardObj.x += cardObj.vx; cardObj.y += cardObj.vy;
            postCardsMap.forEach(other => {
                if (other === cardObj || other.isOutside || !cardObj.canCollide || !other.canCollide || performance.now()<cardObj.collisionUntil || performance.now()<other.collisionUntil) return;
                const dx = (cardObj.x + cardObj.w / 2) - (other.x + other.w / 2);
                const dy = (cardObj.y + cardObj.h / 2) - (other.y + other.h / 2);
                if ((cardObj.w + other.w) / 2 > Math.abs(dx) && (cardObj.h + other.h) / 2 > Math.abs(dy)) {
                    const distance=Math.hypot(dx,dy)||1,nx=dx/distance,ny=dy/distance;
                    const relative=(cardObj.vx-other.vx)*nx+(cardObj.vy-other.vy)*ny;
                    if(relative<0){cardObj.vx-=1.7*relative*nx;cardObj.vy-=1.7*relative*ny;other.vx+=1.7*relative*nx;other.vy+=1.7*relative*ny;}
                    cardObj.x+=nx*6;cardObj.y+=ny*6;other.x-=nx*6;other.y-=ny*6;
                    cardObj.collisionUntil=other.collisionUntil=performance.now()+900;
                    cardObj.element.classList.add("meteor-impact");other.element.classList.add("meteor-impact");setTimeout(()=>{cardObj.element.classList.remove("meteor-impact");other.element.classList.remove("meteor-impact")},420);
                }
            });
            const speed = Math.hypot(cardObj.vx, cardObj.vy);
            if (speed > cardObj.maxSpeed) { cardObj.vx = cardObj.vx / speed * cardObj.maxSpeed; cardObj.vy = cardObj.vy / speed * cardObj.maxSpeed; }
            if (speed < cardObj.minSpeed) {
                const safeSpeed = speed || 1;
                cardObj.vx = cardObj.vx / safeSpeed * cardObj.minSpeed;
                cardObj.vy = cardObj.vy / safeSpeed * cardObj.minSpeed;
            }
            el.style.transform = `translate3d(${cardObj.x + worldOffsetX}px, ${cardObj.y + worldOffsetY}px, 0)`;
            
            const currentLeft = cardObj.x + worldOffsetX; const currentTop = cardObj.y + worldOffsetY;
            const buffer = 400; 
            if (currentLeft < -buffer || currentLeft > window.innerWidth + buffer || currentTop < -buffer || currentTop > window.innerHeight + buffer) {
                cardObj.isOutside = true; el.style.opacity = "0";
                
                cardObj.respawnTimer = setTimeout(() => {
                    const newTrajectory = getRandomScreenOrEdgePosition(cardObj.w, cardObj.h, false);
                    cardObj.x = newTrajectory.x - worldOffsetX; cardObj.y = newTrajectory.y - worldOffsetY;
                    cardObj.vx = newTrajectory.vx; cardObj.vy = newTrajectory.vy;
                    cardObj.isOutside = false; el.style.opacity = "1";
                }, 100 + Math.random() * 200);
            }
        } else {
            el.style.transform = `translate3d(${cardObj.x + worldOffsetX}px, ${cardObj.y + worldOffsetY}px, 0)`;
        }
        requestAnimationFrame(updatePhysicsFrame);
    }
    requestAnimationFrame(updatePhysicsFrame);
}

/* ==========================================================================
   REALTIME PIPELINE DATA FIRESTORE
   ========================================================================== */
function listenToNotificationsRealtime() {
    if (!authenticatedUser) return;
    onSnapshot(collection(firebaseDatabase,"notifications"), snapshot => {
        const items=[]; snapshot.forEach(d=>{const n=d.data();if((n.recipientId||n.postAuthorId)===authenticatedUser.uid)items.push({id:d.id,...n})});
        items.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        const unread=items.filter(n=>!n.isRead).length, topBadge=document.getElementById("top-notification-badge");
        [notificationBadge,topBadge].forEach(b=>{if(!b)return;b.innerText=unread;b.hidden=!unread;b.style.display=unread?"flex":"none"});
        myOwnPostsContainer.innerHTML=items.length?items.map(n=>`<button class="notification-item ${n.isRead?'':'unread'} ${n.friendRequestStatus?`request-${n.friendRequestStatus}`:''}" data-id="${n.id}" data-post="${n.postId||''}" data-comment="${n.commentId||''}" data-user="${n.actorId||''}"><span class="notification-icon">${n.type==='friend_request'||n.type==='friend_accepted'?'🤝':n.type==='comment'||n.type==='reply'?'💬':n.type==='friend_post'?'📰':'✨'}</span><span><strong>${n.actorName||'Một thành viên'}</strong> ${notificationActionText(n)}<small>${formatPostDate(n.createdAt)}</small>${n.type==='friend_request'&&!n.friendRequestStatus?`<span class="friend-request-actions"><em class="quick-accept" data-actor="${n.actorId}">Đồng ý</em><em class="quick-decline" data-actor="${n.actorId}">Từ chối</em></span>`:n.friendRequestStatus?`<span class="request-resolution"><i class="fa-solid ${n.friendRequestStatus==='accepted'?'fa-circle-check':'fa-circle-xmark'}"></i> ${n.friendRequestStatus==='accepted'?'Đã đồng ý':'Đã từ chối'}</span>`:''}</span></button>`).join(""):'<div class="empty-notifications">Chưa có thông báo mới</div>';
        myOwnPostsContainer.querySelectorAll(".notification-item").forEach(item=>item.onclick=async()=>{await updateDoc(doc(firebaseDatabase,"notifications",item.dataset.id),{isRead:true});sessionStorage.setItem("returnToNotifications","1");if(item.dataset.post)location.href=`community-feed-page.html?post=${encodeURIComponent(item.dataset.post)}${item.dataset.comment?`&comment=${encodeURIComponent(item.dataset.comment)}`:''}&notifications=1`;else if(item.dataset.user)openUserProfile(item.dataset.user)});
        myOwnPostsContainer.querySelectorAll(".quick-accept").forEach(action=>action.onclick=async e=>{e.stopPropagation();const uid=action.dataset.actor,row=action.closest(".notification-item");row.disabled=true;try{await acceptFriendship(authenticatedUser.uid,uid);await addDoc(collection(firebaseDatabase,"notifications"),{recipientId:uid,actorId:authenticatedUser.uid,actorName:currentUserDisplayName.innerText,type:"friend_accepted",message:"đã đồng ý lời mời kết bạn của bạn",isRead:false,createdAt:serverTimestamp()});await updateDoc(doc(firebaseDatabase,"notifications",row.dataset.id),{isRead:true,friendRequestStatus:"accepted",resolvedAt:serverTimestamp(),message:"— Bạn đã đồng ý kết bạn"})}catch(error){console.error("Không thể chấp nhận lời mời",error);row.disabled=false}});
        myOwnPostsContainer.querySelectorAll(".quick-decline").forEach(action=>action.onclick=async e=>{e.stopPropagation();const row=action.closest(".notification-item");row.disabled=true;await setDoc(doc(firebaseDatabase,"users",authenticatedUser.uid),{friendRequests:arrayRemove(action.dataset.actor)},{merge:true});await updateDoc(doc(firebaseDatabase,"notifications",row.dataset.id),{isRead:true,friendRequestStatus:"declined",resolvedAt:serverTimestamp(),message:"— Bạn đã từ chối lời mời"})});
        items.filter(item=>item.actorId).forEach(async item=>{const userSnap=await getDoc(doc(firebaseDatabase,"users",item.actorId)),row=myOwnPostsContainer.querySelector(`[data-id="${item.id}"] strong`);if(row&&userSnap.exists())row.textContent=resolveDisplayName(userSnap.data())});
    });
}

if (toggleMyPostsPanelButton) {
    toggleMyPostsPanelButton.addEventListener("click", (e) => {
        e.stopPropagation(); myPostsFixedPanel.classList.toggle("collapsed");
        // Chỉ đánh dấu đã đọc khi người dùng bấm đúng thông báo.
    });
}

const postsQuery = query(collection(firebaseDatabase, "posts"), orderBy("createdAt", "desc"));
onSnapshot(postsQuery, (snapshot) => {
    const dbActiveIds = new Set();
    snapshot.forEach((docSnap) => {
        const postData = docSnap.data(); const postId = docSnap.id; dbActiveIds.add(postId);
        const canView=postData.deletedByAdmin!==true&&(!postData.privacy||postData.privacy==="public"||postData.authorId===authenticatedUser?.uid||(postData.privacy==="friends"&&currentViewerFriends.includes(postData.authorId)));
        if(!canView)return;
        
        if (authenticatedUser && authenticatedUser.uid === postData.authorId) {
            if (postCardsMap.has(postId)) {
                const ownCard = postCardsMap.get(postId);
                if (ownCard.respawnTimer) clearTimeout(ownCard.respawnTimer);
                ownCard.element.remove();
                postCardsMap.delete(postId);
            }
        } else {
            createOrUpdateFloatingPost(postData, postId);
        }
        
        if (currentActivePostId === postId) { currentModalReactionData = postData.reactions || {}; updateReactionDOM(currentModalReactionData); }
        const requestedId=new URLSearchParams(location.search).get("post");if(!requestedPostOpened&&requestedId===postId){requestedPostOpened=true;setTimeout(()=>openPostDetailsModal(postId,postData),100)}
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
            <div class="post-author-identity"><img src="${profileAvatarButton?.src||resolvePostAvatar(postData)}" alt=""><div><button class="community-post-author profile-link">${escapeHTML(currentUserDisplayName?.innerText||postData.authorDisplayName||"Thành viên VHHT")}</button><span class="own-post-label">Bài viết của bạn</span></div></div>
            <div class="post-menu-wrapper">
                <button class="post-menu-button">⋮</button>
                <div class="post-dropdown-menu">
                    <button class="edit-post-button">Sửa văn bản</button>
                    <button class="delete-post-button">Xóa tín hiệu</button>
                </div>
            </div>
        </div>
        <div class="community-post-content" style="cursor:pointer; margin-bottom: 6px;">
            ${escapeHTML(postData.content)}
            ${mediaIndicatorHTML}
        </div>
        <div class="post-card-bottom-row">
            <div class="community-post-time">${formatPostDate(postData.createdAt)}</div>
            <div class="floating-card-stats">
                ${totalReactions > 0 ? `<span>👍 ${totalReactions}</span>` : ''}
                ${totalComments > 0 ? `<span>💬 ${totalComments}</span>` : ''}
            </div>
        </div>`;
    card.querySelector(".post-author-identity")?.classList.toggle("admin-author",currentUserRole==="admin"||postData.authorRole==="admin");
    card.querySelector(".community-post-content").onclick = (e) => { e.stopPropagation(); openPostDetailsModal(postId, postData); };
    card.querySelector(".profile-link").onclick = (e) => { e.stopPropagation(); openUserProfile(postData.authorId); };
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

        // TRUYỀN THAM SỐ TRUE: Tin trôi xuất hiện ngay giữa màn hình lập tức khi reload trang
        const compact = window.matchMedia("(max-width: 800px)").matches;
        const cardSize = getFloatingCardSize();
        const cardWidth = cardSize.width;
        const cardHeight = cardSize.height;
        if (compact) postCard.style.width = `${cardWidth}px`;
        const config = getRandomScreenOrEdgePosition(cardWidth, cardHeight, true);
        const now = performance.now();
        cardObj = {
            element: postCard, x: config.x - worldOffsetX, y: config.y - worldOffsetY,
            vx: config.vx, vy: config.vy, w: cardWidth, h: cardHeight,
            isOutside: false, respawnTimer: null, canCollide: false, collisionUntil: 0,
            collisionModeUntil: 0, nextCollisionRoll: now + 1800 + Math.random() * 5000,
            wanderPhase: Math.random() * Math.PI * 2,
            wanderFrequency: .00035 + Math.random() * .00075,
            wanderStrength: .65 + Math.random() * 1.4,
            turnRate: .00055 + Math.random() * .00115,
            headingBias: Math.random() * Math.PI * 2,
            nextCourseChange: now + 800 + Math.random() * 3600,
            minSpeed: compact ? .22 + Math.random() * .12 : .38 + Math.random() * .2,
            maxSpeed: compact ? .72 + Math.random() * .22 : 1.02 + Math.random() * .32
        };
        postCardsMap.set(postId, cardObj);
        initializeFloatingMovement(cardObj);
        
        postCard.tabIndex = 0;
        postCard.setAttribute("role", "button");
        postCard.setAttribute("aria-label", "Mở chi tiết bài viết");
        postCard.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            const currentPost = postCardsMap.get(postId)?.postData;
            if (currentPost) openPostDetailsModal(postId, currentPost);
        });
    }
    
    cardObj.postData = postData;
    let mediaIndicatorHTML = "";
    if (postData.attachedImage) {
        mediaIndicatorHTML = postData.mediaType === "video" 
            ? `<div class="card-media-indicator"><i class="fa-solid fa-circle-play"></i> Xem Video</div>`
            : `<div class="card-media-indicator"><i class="fa-solid fa-image"></i> Xem Ảnh</div>`;
    }

    cardObj.element.innerHTML = `
        <div class="asteroid-core-inner">
            <div class="post-author-identity"><img src="${resolvePostAvatar(postData)}" alt=""><button class="community-post-author profile-link">${escapeHTML(postData.authorDisplayName || "Phi hành gia")}</button></div>
            <div class="community-post-content">
                ${escapeHTML(postData.content)}
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
    requestAnimationFrame(() => {
        const bounds = cardObj.element.getBoundingClientRect();
        cardObj.w = Math.max(cardObj.w, bounds.width);
        cardObj.h = Math.max(96, bounds.height);
    });
    cardObj.element.querySelector(".profile-link").onclick = (e) => { e.stopPropagation(); openUserProfile(postData.authorId); };
    getDoc(doc(firebaseDatabase,"users",postData.authorId)).then(s=>{const img=cardObj.element.querySelector(".post-author-identity img"),name=cardObj.element.querySelector(".profile-link"),u=s.data()||{};if(img)img.src=s.exists()?(u.photoURL||u.profileImage||DEFAULT_AVATAR):(postData.authorAvatar||DEFAULT_AVATAR);if(name)name.textContent=resolveDisplayName(u);if(img&&u.showActivityStatus!==false&&u.lastActiveAt?.seconds>Date.now()/1000-120)img.classList.add("active-now");if(u.role==="admin")cardObj.element.querySelector(".post-author-identity")?.classList.add("admin-author")});
}

let floatingResizeFrame = 0;
window.addEventListener("resize", () => {
    cancelAnimationFrame(floatingResizeFrame);
    floatingResizeFrame = requestAnimationFrame(() => {
        const compact = window.matchMedia("(max-width: 800px)").matches;
        const nextSize = getFloatingCardSize();
        postCardsMap.forEach(card => {
            card.w = nextSize.width;
            card.h = nextSize.height;
            card.element.style.width = compact ? `${nextSize.width}px` : "";
            card.x = Math.min(card.x, window.innerWidth - nextSize.width - 8 - worldOffsetX);
            card.y = Math.min(card.y, window.innerHeight - nextSize.height - 8 - worldOffsetY);
        });
    });
});

/* ==========================================================================
   HỆ THỐNG LIGHTBOX MATRIX ZOOM
   ========================================================================== */
let lightboxScale = 1; let isDraggingMedia = false;
let mediaStartX = 0, mediaStartY = 0; let mediaOffsetX = 0, mediaOffsetY = 0;
let targetZoomElement = null;

function bindZoomLightboxEvent(element, sourceUrl, isVideo = false) {
    element.addEventListener("click", (e) => {
        e.stopPropagation(); lightboxScale = 1; mediaOffsetX = 0; mediaOffsetY = 0; lightboxZoomWrapper.innerHTML = "";
        if (isVideo) {
            targetZoomElement = document.createElement("video"); targetZoomElement.src = sourceUrl; targetZoomElement.controls = true; targetZoomElement.preload = "metadata";
        } else {
            targetZoomElement = document.createElement("img"); targetZoomElement.src = sourceUrl;
        }
        lightboxZoomWrapper.appendChild(targetZoomElement); applyMediaTransformMatrix(); mediaLightboxContainer.style.display = "flex";document.body.style.overflow="hidden";
    });
}

function applyMediaTransformMatrix() { if (targetZoomElement) targetZoomElement.style.transform = `translate(${mediaOffsetX}px, ${mediaOffsetY}px) scale(${lightboxScale})`; }
if (lightboxZoomWrapper) {
    lightboxZoomWrapper.addEventListener("wheel", (e) => { e.preventDefault(); const zoomIntensity = 0.1; if (e.deltaY < 0) { lightboxScale += zoomIntensity; } else { lightboxScale = Math.max(0.4, lightboxScale - zoomIntensity); } applyMediaTransformMatrix(); });
    lightboxZoomWrapper.addEventListener("mousedown", (e) => { if (!targetZoomElement) return; isDraggingMedia = true; mediaStartX = e.clientX - mediaOffsetX; mediaStartY = e.clientY - mediaOffsetY; });
    document.addEventListener("mousemove", (e) => { if (!isDraggingMedia) return; mediaOffsetX = e.clientX - mediaStartX; mediaOffsetY = e.clientY - mediaStartY; applyMediaTransformMatrix(); });
    document.addEventListener("mouseup", () => { isDraggingMedia = false; });
}
if (closeLightboxBtn) closeLightboxBtn.onclick = (e) => { e.stopPropagation(); mediaLightboxContainer.style.display = "none"; lightboxZoomWrapper.innerHTML = ""; targetZoomElement = null;document.body.style.overflow=""; };

/* ==========================================================================
   CHAT ROOM DISCUSSION & ĐIỀU HƯỚNG BÌNH LUẬN THÔNG MINH
   ========================================================================== */
let commentsUnsubscribe = null;

async function openPostDetailsModal(postId, postData) {
    currentActivePostId = postId; currentActivePostData = postData; currentModalReactionData = postData.reactions || {}; currentSelectedReplyObj = null; replyingToBanner.style.display = "none";
    setMobileDetailView(new URLSearchParams(location.search).get("comment") ? "comments" : "post");
    communityPostFeedContainer.classList.add("disable-space-interaction");
    document.querySelectorAll(".community-post-card").forEach(c => c.classList.add("blurred-post"));

    modalPostAuthor.innerText = postData.authorDisplayName || "User";
    modalPostAvatar.src = resolvePostAvatar(postData);
    modalPostAuthor.onclick = () => openUserProfile(postData.authorId);
    modalPostAvatar.onclick = () => openUserProfile(postData.authorId);
    modalPostAuthor.closest(".modal-author-header")?.classList.remove("admin-author");getDoc(doc(firebaseDatabase,"users",postData.authorId)).then(s=>{const u=s.data()||{};modalPostAuthor.textContent=resolveDisplayName(u);modalPostAvatar.src=s.exists()?(u.photoURL||u.profileImage||DEFAULT_AVATAR):resolvePostAvatar(postData);if(u.role==="admin")modalPostAuthor.closest(".modal-author-header")?.classList.add("admin-author")});
    modalPostText.innerText = postData.content || "";
    modalPostTime.innerText = formatPostDate(postData.createdAt);

    modalPostImageContainer.innerHTML = "";
    const media=postData.attachedImages?.length?postData.attachedImages:(postData.attachedImage?[{url:postData.attachedImage,type:postData.mediaType}]:[]);
    modalPostImageContainer.classList.toggle("multi-media",media.length>1);
    postDetailsModal?.classList.toggle("has-post-media", media.length > 0);
    if (postDetailsModal) postDetailsModal.dataset.mediaCount = String(media.length);
    if (media.length) {
        const visibleMedia=media.slice(0,4);
        modalPostImageContainer.innerHTML=visibleMedia.map((item,index)=>`<div class="modal-media-tile">${item.type==="video"?`<video src="${item.url}" class="shared-media-renderable" controls playsinline></video>`:`<img src="${item.url}" class="shared-media-renderable" alt="Ảnh bài viết ${index+1}">`}${index===3&&media.length>4?`<span class="modal-media-more">+${media.length-4}</span>`:""}</div>`).join("");
        modalPostImageContainer.querySelectorAll(".shared-media-renderable").forEach((element,index)=>bindZoomLightboxEvent(element,media[index].url,media[index].type==="video"));
    }

    updateReactionDOM(currentModalReactionData);
    if (commentsUnsubscribe) commentsUnsubscribe();
    const qComments = query(collection(firebaseDatabase, "posts", postId, "comments"), orderBy("createdAt", "asc"));
    commentsUnsubscribe = onSnapshot(qComments, (snap) => {
        const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        renderMessengerChatTree(arr);
        const requestedCommentId=new URLSearchParams(location.search).get("comment");if(requestedCommentId)setTimeout(()=>{const target=document.getElementById(`comment-node-id-${requestedCommentId}`);if(target){target.scrollIntoView({behavior:"smooth",block:"center"});target.classList.add("comment-flash-highlight")}},120);
        updateDoc(doc(firebaseDatabase, "posts", postId), { commentCount: arr.length });
    });
    postDetailsOverlay.style.display = "flex";
    syncComposerWithVisualViewport();
    setTimeout(() => { postDetailsOverlay.classList.add("active"); }, 15);
}

function renderMessengerChatTree(allComments) {
    modalCommentsTree.innerHTML = "";
    const commentsMap = new Map();
    allComments.forEach(c => commentsMap.set(c.id, c));

    allComments.forEach(commentObj => {
        const wrapperNode = document.createElement("div");
        wrapperNode.id = `comment-node-id-${commentObj.id}`;
        const isMe = authenticatedUser && (commentObj.authorId === authenticatedUser.uid);
        wrapperNode.className = `comment-wrapper-node ${isMe ? 'align-right' : 'align-left'} ${commentObj.parentId?'is-reply':''}`;

        const isPostAuthor = currentActivePostData && (commentObj.authorId === currentActivePostData.authorId);
        const authorBadgeHTML = isPostAuthor ? `<span class="author-badge">Tác giả</span>` : "";

        let replyContextHTML = "";
        if (commentObj.parentId && commentsMap.has(commentObj.parentId)) {
            const parentComment = commentsMap.get(commentObj.parentId);
            const truncatedContent = parentComment.content ? (parentComment.content.substring(0, 25) + "...") : "Tín hiệu ảnh/video";
            replyContextHTML = `<div class="reply-context-target" data-target-id="${commentObj.parentId}" style="cursor:pointer; text-decoration:underline;" title="Bấm để nhảy tới câu bình luận gốc">↳ Trả lời @${escapeHTML(parentComment.authorDisplayName)}: "${escapeHTML(truncatedContent)}"</div>`;
        }

        let commentMediaHTML = "";
        if (commentObj.attachedImage) {
            const isVid = commentObj.mediaType === "video"; const fn = isVid ? `Comment_Vid_${commentObj.id}.mp4` : `Comment_Img_${commentObj.id}.png`;
            commentMediaHTML = `
                <div class="comment-media-box-render">
                    ${isVid ? `<video src="${commentObj.attachedImage}" class="shared-media-renderable" controls preload="metadata" playsinline></video>` : `<img src="${commentObj.attachedImage}" class="shared-media-renderable" alt="Media">`}
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
            <div class="comment-body-row">
            <img class="comment-author-avatar" data-comment-author="${commentObj.authorId}" src="${DEFAULT_AVATAR}" alt="">
            <div class="comment-content-stack">
            <div class="comment-main-box">
                ${commentManagementMenuHTML}
                <div class="comment-user-row">
                    <span class="comment-user">${escapeHTML(commentObj.authorDisplayName)}</span>
                    ${authorBadgeHTML}
                </div>
                <div class="comment-text">${escapeHTML(commentObj.content)}</div>
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
                            <span class="comment-react-emoji clear-comment-reaction" data-type="clear" data-cid="${commentObj.id}" title="Gỡ cảm xúc">&times;</span>
                        </div>
                    </div>
                    ${hasIReacted ? `<span class="cancel-comment-react-x" id="clear-comment-react-x-${commentObj.id}" style="color:#f43f5e; cursor:pointer; font-weight:700; margin-left:6px;" title="Xóa cảm xúc">&times;</span>` : ''}
                </div>
            </div></div></div>`;

        modalCommentsTree.appendChild(wrapperNode);
        getDoc(doc(firebaseDatabase, "users", commentObj.authorId)).then(userSnap => { const avatar = wrapperNode.querySelector(".comment-author-avatar"),name=wrapperNode.querySelector(".comment-user"); if (userSnap.exists()){const data=userSnap.data();if(avatar){avatar.src=data.photoURL||data.profileImage||DEFAULT_AVATAR;if(data.showActivityStatus!==false&&data.lastActiveAt?.seconds>Date.now()/1000-120)avatar.classList.add("active-now")}if(name)name.textContent=resolveDisplayName(data);if(data.role==="admin")wrapperNode.querySelector(".comment-user-row")?.classList.add("admin-author")}});
        wrapperNode.querySelector(".comment-author-avatar").onclick = () => openUserProfile(commentObj.authorId);
        wrapperNode.querySelector(".comment-user").onclick = () => openUserProfile(commentObj.authorId);

        if (commentObj.attachedImage) bindZoomLightboxEvent(wrapperNode.querySelector(".shared-media-renderable"), commentObj.attachedImage, commentObj.mediaType === "video");

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
                        void targetNode.offsetWidth; 
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
            e.stopPropagation();
            if (window.matchMedia("(hover: none), (pointer: coarse)").matches) {
                const container=e.currentTarget.closest(".comment-react-node-container");
                document.querySelectorAll(".reaction-container.picker-open,.comment-react-node-container.picker-open").forEach(item=>{if(item!==container)item.classList.remove("picker-open")});
                container?.classList.toggle("picker-open");
                return;
            }
            if (!authenticatedUser || !currentActivePostId) return;
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
                e.stopPropagation();
                emojiBtn.closest(".comment-react-node-container")?.classList.remove("picker-open");
                if (!authenticatedUser || !currentActivePostId) return;
                const type = emojiBtn.getAttribute("data-type"); const commentRef = doc(firebaseDatabase, "posts", currentActivePostId, "comments", commentObj.id);
                const freshReactsMap = commentObj.commentReactions || {};
                if (type === "clear") delete freshReactsMap[authenticatedUser.uid]; else freshReactsMap[authenticatedUser.uid] = type;
                await updateDoc(commentRef, { commentReactions: freshReactsMap });
            };
        });
    });
}

if (commentImageInput) {
    commentImageInput.addEventListener("change", async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
            if (file.type.startsWith("image/")) validateImage(file); else await validateVideo(file);
        } catch (error) {
            alert(error.message); commentImageInput.value = ""; return;
        }
        detectedCommentMediaType = file.type.startsWith("video/") ? "video" : "image";
        selectedCommentMediaFile = file;
        if (commentPreviewObjectUrl) URL.revokeObjectURL(commentPreviewObjectUrl);
        commentPreviewObjectUrl = URL.createObjectURL(file); commentPreviewRenderZone.replaceChildren();
        const preview = document.createElement(detectedCommentMediaType === "video" ? "video" : "img");
        preview.src = commentPreviewObjectUrl;
        if (detectedCommentMediaType === "video") { preview.controls = true; preview.preload = "metadata"; }
        else preview.alt = "Xem trước ảnh bình luận";
        commentPreviewRenderZone.appendChild(preview); commentImagePreviewBox.style.display = "block";
    });
}
if (removeCommentImgBtn) { removeCommentImgBtn.onclick = (e) => { e.stopPropagation(); selectedCommentMediaFile = null; if(commentPreviewObjectUrl)URL.revokeObjectURL(commentPreviewObjectUrl);commentPreviewObjectUrl=null;commentImageInput.value = ""; commentImagePreviewBox.style.display = "none";commentPreviewRenderZone.replaceChildren(); }; }

submitCommentButton.onclick = executeSubmitComment;
modalCommentInput.onkeydown = (e) => { if (e.key === "Enter") executeSubmitComment(); };

async function executeSubmitComment() {
    const text = modalCommentInput.value.trim(); if (!text && !selectedCommentMediaFile) return; if (!currentActivePostId) return;
    submitCommentButton.disabled = true;
    try {
        const media = selectedCommentMediaFile ? await uploadMedia(selectedCommentMediaFile,percent=>submitCommentButton.title=`Đang tải ${percent}%`) : null;
        const newCommentRef = await addDoc(collection(firebaseDatabase, "posts", currentActivePostId, "comments"), {
            parentId: currentSelectedReplyObj ? currentSelectedReplyObj.id : null,
            authorId: authenticatedUser.uid, authorDisplayName: currentUserDisplayName.innerText,
            content: text, attachedImage: media?.mediaUrl||null, mediaType: media?.mediaType||null,
            mediaUrl:media?.mediaUrl||null,mediaPublicId:media?.mediaPublicId||null,mediaFormat:media?.mediaFormat||null,
            mediaBytes:media?.mediaBytes||null,mediaWidth:media?.mediaWidth||null,mediaHeight:media?.mediaHeight||null,mediaDuration:media?.mediaDuration||null,
            commentReactions: {}, createdAt: serverTimestamp()
        });
        const recipientId=currentSelectedReplyObj ? allCommentAuthorFallback(currentSelectedReplyObj.id) : currentActivePostData?.authorId;
        if(recipientId&&recipientId!==authenticatedUser.uid)await createActivityNotification(recipientId,currentSelectedReplyObj?"reply":"comment",currentActivePostId,currentSelectedReplyObj?"đã trả lời bình luận của bạn":"đã bình luận bài viết của bạn",newCommentRef.id);
        modalCommentInput.value = ""; currentSelectedReplyObj = null; replyingToBanner.style.display = "none"; selectedCommentMediaFile = null;if(commentPreviewObjectUrl)URL.revokeObjectURL(commentPreviewObjectUrl);commentPreviewObjectUrl=null;commentImageInput.value = ""; commentImagePreviewBox.style.display = "none";commentPreviewRenderZone.replaceChildren();
    } catch (err) { console.error(err); alert(err.message||"Không thể gửi bình luận"); }
    finally{submitCommentButton.disabled=false;submitCommentButton.title="Gửi phản hồi"}
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
   YÊU CẦU 2: BỘ ĐIỀU HÀNH REACTION BÀI VIẾT GỐC CHUẨN FACEBOOK + NÚT X XÓA
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

    // LOGIC ĐỔI MÀU / SÁNG NÚT LIKE BÀI VIẾT GỐC THEO TRẠNG THÁI TƯƠNG TÁC LIKE/EMOJI
    if (authenticatedUser && reactionsMap[authenticatedUser.uid]) {
        const type = reactionsMap[authenticatedUser.uid];
        currentUserReactionIcon.innerText = EMOJI_MAP[type]; reactionBtnText.innerText = EMOJI_TEXT[type];
        
        // Bừng sáng dựa theo loại cảm xúc được chọn (Love -> Đỏ, Haha -> Vàng, Thích -> Xanh lam)
        if (type === "love") {
            modalLikeButton.style.color = "#f43f5e";
        } else if (type === "haha" || type === "wow") {
            modalLikeButton.style.color = "#eab308";
        } else {
            modalLikeButton.style.color = "#38bdf8"; 
        }
        modalLikeButton.style.opacity = "1";
        clearMyPostReactionBtn.style.display = "none";
    } else {
        // Trạng thái mặc định: Tối màu, mờ nhẹ, không bật sáng khi chưa bấm
        currentUserReactionIcon.innerText = "👍"; reactionBtnText.innerText = "Thích";
        modalLikeButton.style.color = "#64748b"; // Màu slate-500 xám tối sang trọng
        modalLikeButton.style.opacity = "0.6";
        clearMyPostReactionBtn.style.display = "none"; // Ẩn dấu x đi khi không có react nào
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

// SỰ KIỆN CLICK TRỰC TIẾP NÚT LIKE: Bấm vào mới kích hoạt sáng trạng thái Like xanh lục
modalLikeButton.onclick = async (e) => {
    e.stopPropagation();
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches) {
        const container = modalLikeButton.closest(".reaction-container");
        document.querySelectorAll(".reaction-container.picker-open,.comment-react-node-container.picker-open").forEach(item => { if (item !== container) item.classList.remove("picker-open"); });
        container?.classList.toggle("picker-open");
        return;
    }
    if (!authenticatedUser || !currentActivePostId) return;
    const postRef = doc(firebaseDatabase, "posts", currentActivePostId);
    
    // Nếu chưa từng react gì, click vào sẽ tự động thành trạng thái Like và làm sáng nút lên
    if (!currentModalReactionData[authenticatedUser.uid]) { 
        currentModalReactionData[authenticatedUser.uid] = "like";
        await updateDoc(postRef, { reactions: currentModalReactionData }); 
        await createActivityNotification(currentActivePostData?.authorId,"reaction",currentActivePostId,"đã thích bài viết của bạn");
    }
};

async function clearPostReactionLogic() {
    if (!authenticatedUser || !currentActivePostId) return;
    const postRef = doc(firebaseDatabase, "posts", currentActivePostId);
    delete currentModalReactionData[authenticatedUser.uid];
    await updateDoc(postRef, { reactions: currentModalReactionData });
}

// BẤM DẤU X ĐỎ: Xóa bỏ react hiện tại đưa nút về trạng thái tối ban đầu
clearMyPostReactionBtn.onclick = (e) => { e.stopPropagation(); clearPostReactionLogic(); };

// CHỌN CẢM XÚC TRONG KHO POPOVER HOVER (Love, Haha, Wow...)
document.querySelectorAll(".react-emoji").forEach(emojiEl => {
    emojiEl.onclick = async (e) => {
        e.stopPropagation();
        emojiEl.closest(".reaction-container")?.classList.remove("picker-open");
        const type = emojiEl.getAttribute("data-type");
        if (type === "clear") {
            await clearPostReactionLogic();
        } else {
            if (!authenticatedUser || !currentActivePostId) return;
            const postRef = doc(firebaseDatabase, "posts", currentActivePostId);
            currentModalReactionData[authenticatedUser.uid] = type;
            await updateDoc(postRef, { reactions: currentModalReactionData });
            await createActivityNotification(currentActivePostData?.authorId,"reaction",currentActivePostId,`đã bày tỏ ${EMOJI_TEXT[type]||"cảm xúc"} với bài viết của bạn`);
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

document.addEventListener("click", event => {
    document.querySelectorAll(".post-dropdown-menu, .comment-dropdown-menu").forEach(m => m.classList.remove("show-dropdown"));
    if (!event.target.closest(".reaction-container,.comment-react-node-container")) document.querySelectorAll(".reaction-container.picker-open,.comment-react-node-container.picker-open").forEach(item => item.classList.remove("picker-open"));
});

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

// ==========================================================================
// ĐIỀU HƯỚNG SANG TRANG HỒ SƠ CÁ NHÂN (Đặt ở cuối file realtime-feed-handler.js)
// ==========================================================================
const profileBtn = document.getElementById("community-profile-button");
if (profileBtn) {
    profileBtn.onclick = () => {
        const adminMode=currentUserRole==="admin";sessionStorage.setItem("vhht_profile_return_source",adminMode?"community-admin":"community");const source=adminMode?"?from=community-admin":"";window.location.href = `./profile-user/user-profile.html${source}`;
    };
}

function installAdminModeButton(){if(document.getElementById("community-admin-mode-button"))return;const button=document.createElement("button");button.id="community-admin-mode-button";button.className="community-admin-mode-button";button.title="Mở Trung tâm quản trị";button.innerHTML='<span class="admin-mode-icon"><i class="fa-solid fa-shield-halved"></i></span><span><strong>Command Center</strong><small>Chế độ quản trị</small></span><i class="fa-solid fa-arrow-right"></i>';button.onclick=()=>location.href="../admin/admin-dashboard-page.html";document.querySelector(".community-logo")?.insertAdjacentElement("afterend",button)}
/* ==========================================================================
   XỬ LÝ ĐĂNG XUẤT KHỎI HỆ THỐNG VŨ TRỤ
   ========================================================================== */
if (communityLogoutButton) {
    communityLogoutButton.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    communityLogoutButton.style.cursor = "pointer";

    communityLogoutButton.addEventListener("mouseenter", () => {
        communityLogoutButton.style.color = "#ef4444"; 
        communityLogoutButton.style.textShadow = "0 0 10px rgba(239, 68, 68, 0.8), 0 0 20px rgba(239, 68, 68, 0.4)";
        communityLogoutButton.style.transform = "scale(1.15)"; 
    });

    communityLogoutButton.addEventListener("mouseleave", () => {
        communityLogoutButton.style.color = ""; 
        communityLogoutButton.style.textShadow = "";
        communityLogoutButton.style.transform = "";
    });

    communityLogoutButton.addEventListener("click", (e) => {
        e.stopPropagation();
        communityLogoutButton.style.transform = "scale(0.95)";
        communityLogoutButton.style.textShadow = "0 0 25px #f43f5e, 0 0 50px #ef4444";
        
        setTimeout(() => { communityLogoutButton.style.transform = "scale(1.15)"; }, 100);

        showCustomConfirm("Bạn có chắc chắn muốn ngắt kết nối đăng xuất khỏi vũ trụ không?", () => {
            firebaseAuthentication.signOut()
                .then(() => { window.location.href = "../authentication/login-page.html"; })
                .catch((error) => { console.error("Lỗi ngắt tín hiệu đăng xuất hệ thống:", error); });
        });
    });
}
function notificationActionText(item){if(item.message)return item.message;const reactionNames={like:"đã thích bài viết của bạn",love:"đã thả tim bài viết của bạn",haha:"đã bày tỏ Haha với bài viết của bạn",wow:"đã bày tỏ Wow với bài viết của bạn",sad:"đã bày tỏ buồn với bài viết của bạn",sorry:"đã bày tỏ thương tiếc với bài viết của bạn"};if(item.type==="reaction")return reactionNames[item.reactionType]||"đã bày tỏ cảm xúc với bài viết của bạn";if(item.type==="reply")return"đã trả lời bình luận của bạn";if(item.type==="comment")return"đã bình luận bài viết của bạn";if(item.type==="friend_request")return"đã gửi lời mời kết bạn";if(item.type==="friend_accepted")return"đã đồng ý lời mời kết bạn của bạn";if(item.type==="friend_post")return"vừa đăng một bài viết mới";return"đã tương tác với bạn"}

function allCommentAuthorFallback(commentId){const node=document.getElementById(`comment-node-id-${commentId}`);return node?.querySelector(".comment-author-avatar")?.dataset.commentAuthor||currentActivePostData?.authorId}
async function createActivityNotification(recipientId,type,postId,message,commentId=null){if(!authenticatedUser||recipientId===authenticatedUser.uid)return;await addDoc(collection(firebaseDatabase,"notifications"),{recipientId,postAuthorId:recipientId,actorId:authenticatedUser.uid,actorName:currentUserDisplayName.innerText,type,postId,commentId,message,isRead:false,createdAt:serverTimestamp()})}

function setStatusUI(isOnline){if(!onlineStatusButton)return;onlineStatusButton.classList.toggle("offline",!isOnline);onlineStatusText.textContent=isOnline?"Trực tuyến":"Ẩn hoạt động";document.querySelector(".profile-online-dot")?.classList.toggle("offline",!isOnline)}
if(onlineStatusButton)onlineStatusButton.onclick=async()=>{if(!authenticatedUser)return;const currentlyVisible=!onlineStatusButton.classList.contains("offline"),nextVisible=!currentlyVisible;await setDoc(doc(firebaseDatabase,"users",authenticatedUser.uid),{showActivityStatus:nextVisible,lastActiveAt:serverTimestamp()},{merge:true});setStatusUI(nextVisible)};
document.getElementById("community-messages-button")?.addEventListener("click",()=>location.href="./messages/messages-page.html");
document.getElementById("community-notifications-button")?.addEventListener("click",()=>myPostsFixedPanel.classList.remove("collapsed"));
if(new URLSearchParams(location.search).get("notifications")==="1"||sessionStorage.getItem("returnToNotifications")==="1"){myPostsFixedPanel.classList.remove("collapsed");sessionStorage.removeItem("returnToNotifications")}

const memberSearchInput = document.getElementById("community-user-search");
const memberSearchResults = document.getElementById("community-search-results");
let memberSearchTimer = null;
if (memberSearchInput && memberSearchResults) {
    memberSearchInput.addEventListener("input", () => {
        clearTimeout(memberSearchTimer);
        memberSearchTimer = setTimeout(async () => {
            const keyword = memberSearchInput.value.trim().toLocaleLowerCase("vi");
            if (!keyword) { memberSearchResults.classList.remove("visible"); memberSearchResults.innerHTML = ""; return; }
            const snapshot = await getDocs(collection(firebaseDatabase, "users"));
            const matches = [];
            snapshot.forEach(userDoc => {
                const data = userDoc.data();
                const nameMatches=(data.displayName||"").toLocaleLowerCase("vi").includes(keyword);
                const idIsPublic=data.accountVisibility==="public"||data.idVisibility==="public";
                const idMatches=idIsPublic&&userDoc.id.toLowerCase().includes(keyword);
                if(nameMatches||idMatches)matches.push({id:userDoc.id,idIsPublic,...data});
            });
            memberSearchResults.innerHTML = matches.slice(0, 8).map(member => `<button class="member-search-result" data-uid="${member.id}"><img src="${member.photoURL || member.profileImage || DEFAULT_AVATAR}" alt=""><span><strong>${member.displayName || "Thành viên"}</strong><small>${member.idIsPublic?member.id:"ID được chủ tài khoản ẩn"}</small></span></button>`).join("") || `<div class="empty-search-result">Không tìm thấy thành viên</div>`;
            memberSearchResults.classList.add("visible");
            memberSearchResults.querySelectorAll("[data-uid]").forEach(item => item.onclick = () => openUserProfile(item.dataset.uid));
        }, 250);
    });
}
