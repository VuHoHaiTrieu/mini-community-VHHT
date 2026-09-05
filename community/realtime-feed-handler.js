import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import "./create-post-handler.js?v=post-foundation-5";
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, setDoc, arrayUnion, arrayRemove, serverTimestamp, getDoc, getDocs, addDoc, where, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { uploadMedia, validateImage, validateVideo } from "../shared/cloudinary-media-service.js";
import { acceptFriendship, declineFriendRequest } from "../shared/friendship-service.js";
import { resolveDisplayName } from "../shared/user-identity.js";
import { resolveAvatarUrl, applyAvatarFallback } from "../shared/default-avatar.js";
import { soundManager, playUiSound } from "../shared/audio/sound-manager.js?v=6";
import { renderInteractiveText, installInteractiveTextInteractions } from "../shared/interactive-text.js?v=2";
import { writePublicProfile } from "../shared/secure-profile-service.js";

installInteractiveTextInteractions();
window.__VHHT_COMMUNITY_RUNTIME_READY__ = true;

let receivedInitialMessageNotificationSnapshot = false;
let receivedInitialActivityNotificationSnapshot = false;

const embeddedPostMode = new URLSearchParams(location.search).get("embed") === "1";
if (embeddedPostMode) document.documentElement.classList.add("embedded-post-detail-mode");

/* ==========================================================================
   DOM ELEMENTS SELECTORS
   ========================================================================== */
const communityPostFeedContainer = document.getElementById("community-post-feed-container");
const myOwnPostsContainer = document.getElementById("my-own-posts-container");
const currentUserDisplayName = document.getElementById("community-current-user-display-name");
const myPostsFixedPanel = document.getElementById("my-posts-fixed-panel");
const toggleMyPostsPanelButton = document.getElementById("toggle-my-posts-panel-button");
const notificationBadge = document.getElementById("notification-badge");
const feedFilterDock = document.getElementById("feed-filter-dock");
const feedFilterToggle = document.getElementById("feed-filter-toggle");
const feedFilterPanel = document.getElementById("feed-filter-panel");
const feedFilterClose = document.getElementById("feed-filter-close");
const feedFilterReset = document.getElementById("feed-filter-reset");
const feedFilterIndicator = document.getElementById("feed-filter-indicator");
const feedFilterSummary = document.getElementById("feed-filter-summary");
const feedFilterModeButtons = [...document.querySelectorAll("[data-feed-mode]")];
const feedFriendControls = document.getElementById("feed-friend-controls");
const feedAllFriends = document.getElementById("feed-all-friends");
const feedFriendSearch = document.getElementById("feed-friend-search");
const feedFriendList = document.getElementById("feed-friend-list");
const feedViewSwitcher = document.getElementById("feed-view-switcher");
const feedViewButtons = [...document.querySelectorAll("[data-feed-view]")];
const feedToolbarFilter = document.getElementById("feed-toolbar-filter");
const feedToolbarRefresh = document.getElementById("feed-toolbar-refresh");
const feedToolbarCreate = document.getElementById("feed-toolbar-create");
const feedSortTrigger = document.getElementById("feed-sort-trigger");
const feedSortMenu = document.getElementById("feed-sort-menu");
const feedSortLabel = document.getElementById("feed-sort-label");
const feedSortButtons = [...document.querySelectorAll("[data-feed-sort]")];

const postDetailsOverlay = document.getElementById("post-details-overlay");
const postDetailsModal = postDetailsOverlay?.querySelector(".post-details-modal");
const mobileDetailTabButtons = [...document.querySelectorAll(".mobile-detail-tab")];
const closeModalButton = document.getElementById("close-modal-button");
const modalPostAuthor = document.getElementById("modal-post-author");
const modalPostAvatar = document.getElementById("modal-post-avatar");
const modalPostText = document.getElementById("modal-post-text");
const modalPostImageContainer = document.getElementById("modal-post-image-container");
const modalPostTime = document.getElementById("modal-post-time");
const modalPostShareButton = document.getElementById("modal-post-share-button");
const modalPostShareCount = document.getElementById("modal-post-share-count");
const modalPostSaveButton = document.getElementById("modal-post-save-button");
const modalPostReportButton = document.getElementById("modal-post-report-button");
const modalPostOverflow = document.getElementById("modal-post-overflow");
const modalPostOverflowTrigger = document.getElementById("modal-post-overflow-trigger");
const modalPostOverflowMenu = document.getElementById("modal-post-overflow-menu");
const modalCommentCount = document.getElementById("modal-comment-count");

const modalLikeButton = document.getElementById("modal-like-button");
const clearMyPostReactionBtn = document.getElementById("clear-my-post-reaction-btn");
const currentUserReactionIcon = document.getElementById("current-user-reaction-icon");
const reactionBtnText = document.getElementById("reaction-btn-text");
const summaryActiveEmojis = document.getElementById("summary-active-emojis");
const modalReactionSummary = document.getElementById("modal-reaction-summary");
const summaryReactionCount = document.getElementById("summary-reaction-count");

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
let postDetailReturnFocus = null;

const mediaLightboxContainer = document.getElementById("media-lightbox-container");
const closeLightboxBtn = document.getElementById("close-lightbox-btn");
const lightboxZoomWrapper = document.getElementById("lightbox-zoom-wrapper");
const lightboxZoomIn = document.getElementById("lightbox-zoom-in");
const lightboxZoomOut = document.getElementById("lightbox-zoom-out");
const lightboxZoomReset = document.getElementById("lightbox-zoom-reset");
const lightboxZoomValue = document.getElementById("lightbox-zoom-value");

const reactionDetailsOverlay = document.getElementById("reaction-details-overlay");
const closeReactModalBtn = document.getElementById("close-react-modal-btn");
const reactTabsHeader = document.getElementById("react-tabs-header");
const reactUsersList = document.getElementById("react-users-list");

const communityLogoutButton = document.getElementById("community-logout-button");
const profileAvatarButton = document.getElementById("community-profile-avatar");
const accountTrigger = document.getElementById("community-account-trigger");
const accountMenu = document.getElementById("community-account-menu");
const accountMenuAvatar = document.getElementById("community-account-menu-avatar");
const accountMenuName = document.getElementById("community-account-menu-name");
const onlineStatusButton = document.getElementById("community-user-status");
const onlineStatusText = document.getElementById("online-status-text");
const escapeHTML = value => { const node=document.createElement("div");node.textContent=value??"";return node.innerHTML; };
const relationshipId = value => typeof value === "string" ? value : value?.uid || value?.id || value?.userId || value?.friendId || null;
const relationshipIds = values => [...new Set((Array.isArray(values) ? values : []).map(relationshipId).filter(Boolean))];
const hasRelationship = (values, uid) => relationshipIds(values).includes(uid);

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
let presenceHeartbeatTimer = 0;
let presenceHeartbeatHandler = null;
let stopActivityNotifications = null;
let stopMessageNotifications = null;
let stopSavedPosts = null;
let stopPostsFeed = null;
let postsFeedGeneration = 0;

const directConversationId = (first, second) => [first, second].sort().join("_");

async function shareCurrentPostToFriend(friendId, messageText = "") {
    if (!authenticatedUser || !currentActivePostId || !currentActivePostData) return;
    if (currentActivePostData.privacy === "private") throw new Error("Bài viết chỉ mình bạn xem không thể chia sẻ.");
    const [ownSnapshot, friendSnapshot] = await Promise.all([
        getDoc(doc(firebaseDatabase, "users", authenticatedUser.uid)),
        getDoc(doc(firebaseDatabase, "users", friendId))
    ]);
    if (!friendSnapshot.exists()) throw new Error("Không tìm thấy người bạn này.");
    const own = ownSnapshot.data() || {}, friend = friendSnapshot.data() || {};
    if (!hasRelationship(own.friends, friendId) && !hasRelationship(friend.friends, authenticatedUser.uid)) {
        throw new Error("Bạn chỉ có thể chia sẻ bài viết cho bạn bè.");
    }
    const id = directConversationId(authenticatedUser.uid, friendId);
    const media = currentActivePostData.attachedImages?.[0] || (currentActivePostData.attachedImage ? { url: currentActivePostData.attachedImage, type: currentActivePostData.mediaType } : null);
    await setDoc(doc(firebaseDatabase, "conversations", id), { members: [authenticatedUser.uid, friendId], updatedAt: serverTimestamp() }, { merge: true });
    await addDoc(collection(firebaseDatabase, "conversations", id, "messages"), {
        senderId: authenticatedUser.uid,
        recipientId: friendId,
        content: messageText.trim(),
        sharedPost: {
            id: currentActivePostId,
            authorId: currentActivePostData.authorId,
            authorName: currentActivePostData.authorDisplayName || "Thành viên VHHT",
            content: currentActivePostData.content || "",
            mediaUrl: media?.url || null,
            mediaType: media?.type || null
        },
        createdAt: serverTimestamp(), readAt: null
    });
    await addDoc(collection(firebaseDatabase, "messageNotifications"), { recipientId: friendId, senderId: authenticatedUser.uid, conversationId: id, isRead: false, createdAt: serverTimestamp() });
    await Promise.all([
        addDoc(collection(firebaseDatabase,"posts",currentActivePostId,"shares"),{sharerId:authenticatedUser.uid,recipientId:friendId,createdAt:serverTimestamp()}),
        updateDoc(doc(firebaseDatabase,"posts",currentActivePostId),{shareCount:increment(1)})
    ]);
    currentActivePostData.shareCount = Number(currentActivePostData.shareCount || 0) + 1;
    if (modalPostShareCount) modalPostShareCount.textContent = compactBadgeCount(currentActivePostData.shareCount);
}

async function openPostSharersDialog() {
    if (!currentActivePostId) return;
    if (!authenticatedUser || currentActivePostData?.authorId !== authenticatedUser.uid) return;
    let overlay=document.querySelector(".post-sharers-overlay");
    if(!overlay){overlay=document.createElement("div");overlay.className="post-sharers-overlay";overlay.innerHTML='<section role="dialog" aria-modal="true"><header><div><small>LƯỢT CHIA SẺ</small><strong>Ai đã chia sẻ bài viết?</strong></div><button type="button" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></header><div class="post-sharers-list"></div></section>';document.body.appendChild(overlay);overlay.querySelector("header button").onclick=()=>overlay.classList.remove("show");overlay.onclick=event=>{if(event.target===overlay)overlay.classList.remove("show")}}
    const list=overlay.querySelector(".post-sharers-list");list.innerHTML='<p class="share-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải…</p>';overlay.classList.add("show");
    try{
        const snapshot=await getDocs(collection(firebaseDatabase,"posts",currentActivePostId,"shares"));
        const records=snapshot.docs.map(item=>item.data()).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        const uniqueIds=[...new Set(records.map(item=>item.sharerId).filter(Boolean))];
        const users=await Promise.all(uniqueIds.map(async uid=>{const snap=await getDoc(doc(firebaseDatabase,"users",uid));return{id:uid,...(snap.data()||{})}}));
        list.innerHTML=users.length?users.map(user=>{const name=resolveDisplayName(user);return `<button type="button" data-user="${user.id}"><img src="${escapeHTML(resolveAvatarUrl(user.photoURL||user.profileImage,{uid:user.id,displayName:name}))}" alt=""><span><strong>${escapeHTML(name)}</strong><small>Đã chia sẻ bài viết</small></span><i class="fa-solid fa-chevron-right"></i></button>`}).join(""):'<p class="share-empty">Chưa có lượt chia sẻ nào.</p>';
        list.querySelectorAll("[data-user]").forEach(button=>button.onclick=()=>openUserProfile(button.dataset.user));
    }catch(error){list.innerHTML='<p class="share-empty">Không thể tải danh sách chia sẻ lúc này.</p>'}
}

async function openFeedShareDialog() {
    if (!authenticatedUser || !currentActivePostData) return;
    let overlay = document.querySelector(".feed-share-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "feed-share-overlay";
        overlay.innerHTML = `<section class="feed-share-dialog" role="dialog" aria-modal="true" aria-label="Chia sẻ bài viết"><header><div><small>GỬI QUA TIN NHẮN</small><strong>Chia sẻ bài viết</strong></div><button type="button" data-close-share aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></header><textarea maxlength="500" placeholder="Viết lời nhắn đi kèm (không bắt buộc)…"></textarea><div class="feed-share-friends"></div></section>`;
        document.body.appendChild(overlay);
        overlay.querySelector("[data-close-share]").onclick = () => overlay.classList.remove("show");
        overlay.onclick = event => { if (event.target === overlay) overlay.classList.remove("show"); };
    }
    const list = overlay.querySelector(".feed-share-friends"), note = overlay.querySelector("textarea");
    list.innerHTML = '<p class="share-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải bạn bè…</p>';
    note.value = ""; overlay.classList.add("show");
    const [ownSnapshot, usersSnapshot] = await Promise.all([getDoc(doc(firebaseDatabase, "users", authenticatedUser.uid)), getDocs(collection(firebaseDatabase, "users"))]);
    const own = ownSnapshot.data() || {}, friendIds = new Set(relationshipIds(own.friends)), people = [];
    usersSnapshot.forEach(item => { const data = item.data(); if (item.id !== authenticatedUser.uid && (friendIds.has(item.id) || hasRelationship(data.friends, authenticatedUser.uid))) people.push({ id: item.id, ...data }); });
    list.innerHTML = people.length ? people.map(person => {const name=resolveDisplayName(person);return `<div class="feed-share-person" data-id="${person.id}"><img src="${escapeHTML(resolveAvatarUrl(person.photoURL||person.profileImage,{uid:person.id,displayName:name}))}" alt=""><strong>${escapeHTML(name)}</strong><button type="button" aria-label="Gửi cho ${escapeHTML(name)}"><i class="fa-solid fa-paper-plane"></i><span>Gửi</span></button></div>`}).join("") : '<p class="share-empty">Chưa có bạn bè phù hợp để chia sẻ.</p>';
    list.querySelectorAll(".feed-share-person button").forEach(button => button.onclick = async () => {
        const row = button.closest(".feed-share-person"); button.disabled = true;
        try { await shareCurrentPostToFriend(row.dataset.id, note.value); button.classList.add("sent"); button.innerHTML = '<i class="fa-solid fa-check"></i><span>Đã gửi</span>'; }
        catch (error) { button.disabled = false; button.title = error.message; }
    });
}
let currentActivePostId = null;
let currentActivePostData = null;
let currentSelectedReplyObj = null;
let unreadPostsWithNotifications = new Set();
let detectedCommentMediaType = "image";
let selectedCommentMediaFile = null;
let commentPreviewObjectUrl = null;

let postCardsMap = new Map();
let currentModalReactionData = {}; 
let currentReactionDirectoryData = {};
let currentReactionDirectoryTrigger = null;
let currentViewerFriends = [];
let currentUserRole = "user";
let feedFilterMode = "all";
let feedFriendProfiles = [];
const selectedFeedFriendIds = new Set();
let requestedPostOpened = false;
const DEFAULT_AVATAR = "../shared/assets/default-avatar.png?v=3";
const FEED_VIEW_STORAGE_PREFIX = "vhht_feed_view_";
let feedViewMode = window.matchMedia("(max-width: 800px)").matches ? "list" : "space";
let feedSortMode = "newest";
let feedVisibleLimit = 12;
const savedPostIds = new Set();

function savedPostDocumentId(postId) { return `${authenticatedUser.uid}_${postId}`; }
function updateSaveButton(button, postId) {
    if (!button || !postId) return;
    const saved = savedPostIds.has(postId);
    button.classList.toggle("is-saved", saved);
    button.setAttribute("aria-pressed", String(saved));
    const icon = button.querySelector("i");
    if (icon) icon.className = `${saved ? "fa-solid" : "fa-regular"} fa-bookmark`;
    const strong = button.querySelector("strong");
    if (strong) strong.textContent = saved ? "Bỏ lưu bài viết" : "Lưu bài viết";
    button.title = saved ? "Bỏ khỏi bài viết đã lưu" : "Lưu để xem lại";
}
function syncSavedPostUI() {
    postCardsMap.forEach((cardObj, postId) => updateSaveButton(cardObj.element.querySelector("[data-list-save]"), postId));
    updateSaveButton(modalPostSaveButton, currentActivePostId);
}
async function toggleSavedPost(postId) {
    if (!authenticatedUser || !postId) return;
    const reference = doc(firebaseDatabase, "savedPosts", savedPostDocumentId(postId));
    const wasSaved = savedPostIds.has(postId);
    if (wasSaved) await deleteDoc(reference);
    else await setDoc(reference, { userId: authenticatedUser.uid, postId, createdAt: serverTimestamp() });
    if (wasSaved) savedPostIds.delete(postId); else savedPostIds.add(postId);
    syncSavedPostUI();
    applyFeedFilter();
}
function listenToSavedPosts(userId) {
    stopSavedPosts?.();
    savedPostIds.clear();
    stopSavedPosts = onSnapshot(query(collection(firebaseDatabase, "savedPosts"), where("userId", "==", userId)), snapshot => {
        savedPostIds.clear();
        snapshot.forEach(item => savedPostIds.add(item.data().postId));
        syncSavedPostUI();
        applyFeedFilter();
    }, error => console.warn("Không thể đồng bộ bài viết đã lưu", error));
}

function postCreatedTime(postData = {}) {
    const value = postData.createdAt;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}
function compareFeedCards(a, b) {
    if (feedSortMode === "popular") {
        const score = card => Object.keys(card.postData?.reactions || {}).length + Number(card.postData?.commentCount || 0) * 2 + Number(card.postData?.shareCount || 0) * 3;
        return score(b) - score(a) || postCreatedTime(b.postData) - postCreatedTime(a.postData);
    }
    return postCreatedTime(b.postData) - postCreatedTime(a.postData);
}

function sortFeedCardsForList() {
    if (feedViewMode !== "list" || !communityPostFeedContainer) return;
    [...postCardsMap.values()]
        .sort(compareFeedCards)
        .forEach(cardObj => communityPostFeedContainer.appendChild(cardObj.element));
}

function syncFeedLoadMore() {
    if (!communityPostFeedContainer) return;
    communityPostFeedContainer.querySelector("[data-feed-load-more]")?.remove();
    if (feedViewMode !== "list") return;
    const eligible = [...postCardsMap.values()].filter(card => postMatchesFeedFilter(card.postData)).sort(compareFeedCards);
    eligible.forEach((card, index) => card.element.classList.toggle("feed-limit-hidden", index >= feedVisibleLimit));
    if (eligible.length <= feedVisibleLimit) return;
    const button = document.createElement("button"); button.type = "button"; button.className = "feed-load-more"; button.dataset.feedLoadMore = "";
    button.innerHTML = `<i class="fa-solid fa-chevron-down"></i><span>Xem thêm bài viết</span><small>Còn ${eligible.length - feedVisibleLimit} bài</small>`;
    button.onclick = () => { feedVisibleLimit += 10; applyFeedFilter(); };
    communityPostFeedContainer.appendChild(button);
}

function setFeedViewMode(mode, { persist = true } = {}) {
    const nextMode = mode === "list" ? "list" : "space";
    feedViewMode = nextMode;
    document.documentElement.dataset.feedView = nextMode;
    communityPostFeedContainer?.setAttribute("data-view-mode", nextMode);
    communityPostFeedContainer?.setAttribute("aria-label", nextMode === "list" ? "Bảng tin dạng danh sách" : "Bảng tin không gian");
    feedViewButtons.forEach(button => {
        const active = button.dataset.feedView === nextMode;
        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("active", active);
    });
    postCardsMap.forEach(cardObj => {
        cardObj.element.tabIndex = nextMode === "space" ? 0 : -1;
        cardObj.element.setAttribute("role", nextMode === "space" ? "button" : "article");
        cardObj.element.setAttribute("aria-label", nextMode === "space" ? "Mở chi tiết bài viết" : "Bài viết trong bảng tin");
    });
    if (nextMode === "list") {
        cancelAnimationFrame(cameraInertiaFrame);
        isDraggingSpace = false;
        dragThresholdPassed = false;
        cameraVelocityX = cameraVelocityY = 0;
        activeSpacePointerId = null;
        pendingFloatingPostTapId = null;
        document.body.classList.remove("is-panning-space");
        sortFeedCardsForList();
        syncFeedLoadMore();
        requestAnimationFrame(() => communityPostFeedContainer?.scrollTo({ top: 0, behavior: "auto" }));
    } else {
        syncSpaceCamera();
    }
    if (persist && authenticatedUser?.uid) {
        try { localStorage.setItem(`${FEED_VIEW_STORAGE_PREFIX}${authenticatedUser.uid}`, nextMode); } catch (_) {}
    }
}

let feedReadingTimer = 0;
communityPostFeedContainer?.addEventListener("scroll", () => {
    if (feedViewMode !== "list") return;
    document.body.classList.add("community-feed-reading");
    clearTimeout(feedReadingTimer);
    feedReadingTimer = window.setTimeout(() => document.body.classList.remove("community-feed-reading"), 700);
}, { passive: true });

function restoreFeedViewMode(userId = "") {
    let stored = "";
    try { stored = userId ? localStorage.getItem(`${FEED_VIEW_STORAGE_PREFIX}${userId}`) || "" : ""; } catch (_) {}
    setFeedViewMode(stored === "space" || stored === "list" ? stored : (window.matchMedia("(max-width: 800px)").matches ? "list" : "space"), { persist: false });
}

function setFeedStatus(message = "", type = "info", { retry = false } = {}) {
    if (!communityPostFeedContainer) return;
    let status = communityPostFeedContainer.querySelector("[data-feed-status]");
    if (!message) { status?.remove(); return; }
    if (!status) {
        status = document.createElement("div");
        status.dataset.feedStatus = "";
        status.className = "community-feed-status";
        communityPostFeedContainer.appendChild(status);
    }
    status.dataset.type = type;
    status.setAttribute("role", type === "error" ? "alert" : "status");
    status.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    status.innerHTML = `<i class="fa-solid ${type === "error" ? "fa-triangle-exclamation" : type === "loading" ? "fa-circle-notch fa-spin" : "fa-satellite-dish"}"></i><span></span>${retry ? '<button type="button" data-feed-retry><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Thử lại</button>' : ""}`;
    status.querySelector("span").textContent = message;
    status.querySelector("[data-feed-retry]")?.addEventListener("click", () => {
        stopPostsFeed?.();
        listenToPostsFeed().catch(error => {
            console.error("Không thể tải lại bảng tin", error);
            setFeedStatus("Vẫn chưa thể tải bài viết. Hãy kiểm tra kết nối và Firestore Rules.", "error", { retry: true });
        });
    });
}

function setFeedFilterOpen(open) {
    if (!feedFilterDock) return;
    if (open && feedToolbarFilter) {
        const triggerRect = feedToolbarFilter.getBoundingClientRect();
        const popoverWidth = Math.min(334, window.innerWidth - 20);
        const preferredLeft = triggerRect.left + (triggerRect.width / 2) - (popoverWidth / 2);
        const left = Math.max(10, Math.min(preferredLeft, window.innerWidth - popoverWidth - 10));
        feedFilterDock.style.setProperty("--feed-filter-anchor-left", `${Math.round(left)}px`);
        feedFilterDock.style.setProperty("--feed-filter-anchor-top", `${Math.round(triggerRect.bottom + 9)}px`);
        setFeedSortMenu(false);
    }
    feedFilterDock.classList.toggle("collapsed", !open);
    feedFilterToggle?.setAttribute("aria-expanded", String(Boolean(open)));
    feedFilterPanel?.setAttribute("aria-hidden", String(!open));
    feedToolbarFilter?.setAttribute("aria-expanded", String(Boolean(open)));
    feedToolbarFilter?.classList.toggle("active", Boolean(open));
    if (open) {
        setMobileMemberSearch(false, false);
        setNotificationPanelOpen(false);
    }
}

function postMatchesFeedFilter(postData = {}) {
    if (feedFilterMode === "all") return true;
    if (feedFilterMode === "saved") return savedPostIds.has(postData._postId);
    if (feedFilterMode === "admin") return (postData._resolvedAuthorRole || postData.authorRole || postData.role) === "admin";
    const authorId = postData.authorId || "";
    if (!currentViewerFriends.includes(authorId)) return false;
    return selectedFeedFriendIds.size === 0 || selectedFeedFriendIds.has(authorId);
}

function applyFeedFilter() {
    let visibleCount = 0;
    postCardsMap.forEach(cardObj => {
        const visible = postMatchesFeedFilter(cardObj.postData);
        cardObj.filteredOut = !visible;
        cardObj.element.classList.toggle("feed-filter-hidden", !visible);
        cardObj.element.setAttribute("aria-hidden", String(!visible));
        if (visible) visibleCount += 1;
    });
    communityPostFeedContainer?.querySelector("[data-feed-filter-empty]")?.remove();
    if (feedFilterMode === "saved" && visibleCount === 0 && postCardsMap.size > 0) {
        const empty = document.createElement("div");
        empty.className = "feed-filter-empty";
        empty.dataset.feedFilterEmpty = "";
        empty.innerHTML = '<i class="fa-regular fa-bookmark"></i><strong>Chưa có bài viết đã lưu</strong><span>Mở menu ⋯ trên một bài viết và chọn “Lưu bài viết”.</span>';
        communityPostFeedContainer?.appendChild(empty);
    }
    sortFeedCardsForList();
    syncFeedLoadMore();
    if (feedFilterIndicator) feedFilterIndicator.hidden = feedFilterMode === "all";
    feedToolbarFilter?.classList.toggle("has-filter", feedFilterMode !== "all");
    feedToolbarFilter?.setAttribute("aria-label", feedFilterMode === "all" ? "Mở bộ lọc bài đăng" : `Mở bộ lọc đang áp dụng, ${visibleCount} bài phù hợp`);
    feedFilterToggle?.setAttribute("aria-label", feedFilterMode === "all" ? "Lọc bài đăng" : `Bộ lọc đang bật, ${visibleCount} bài đăng phù hợp`);
    if (!feedFilterSummary) return;
    if (feedFilterMode === "all") feedFilterSummary.textContent = `${visibleCount} bài đăng · Tất cả`;
    else if (feedFilterMode === "admin") feedFilterSummary.textContent = `${visibleCount} bài đăng · Quản trị viên`;
    else if (feedFilterMode === "saved") feedFilterSummary.textContent = `${visibleCount} bài đăng · Đã lưu`;
    else if (selectedFeedFriendIds.size) feedFilterSummary.textContent = `${visibleCount} bài đăng · ${selectedFeedFriendIds.size} bạn đã chọn`;
    else feedFilterSummary.textContent = `${visibleCount} bài đăng · Tất cả bạn bè`;
}

function renderFeedFriendOptions() {
    if (!feedFriendList) return;
    const keyword = (feedFriendSearch?.value || "").trim().toLocaleLowerCase("vi");
    const profiles = feedFriendProfiles.filter(profile => profile.name.toLocaleLowerCase("vi").includes(keyword));
    feedAllFriends?.classList.toggle("active", selectedFeedFriendIds.size === 0);
    if (!profiles.length) {
        feedFriendList.innerHTML = `<p>${feedFriendProfiles.length ? "Không tìm thấy bạn bè phù hợp." : "Bạn chưa có bạn bè để lọc."}</p>`;
        return;
    }
    feedFriendList.innerHTML = profiles.map(profile => `<button type="button" class="feed-friend-option${selectedFeedFriendIds.has(profile.id) ? " selected" : ""}" data-feed-friend="${escapeHTML(profile.id)}"><img src="${escapeHTML(profile.avatar)}" alt=""><span>${escapeHTML(profile.name)}</span><i class="fa-solid fa-check" aria-hidden="true"></i></button>`).join("");
    feedFriendList.querySelectorAll("[data-feed-friend]").forEach(button => button.addEventListener("click", () => {
        const id = button.dataset.feedFriend;
        if (selectedFeedFriendIds.has(id)) selectedFeedFriendIds.delete(id);
        else selectedFeedFriendIds.add(id);
        renderFeedFriendOptions();
        applyFeedFilter();
    }));
}

async function loadFeedFriendProfiles() {
    const snapshots = await Promise.all(currentViewerFriends.map(id => getDoc(doc(firebaseDatabase, "users", id)).catch(() => null)));
    feedFriendProfiles = snapshots.map((snapshot, index) => {
        const id = currentViewerFriends[index], data = snapshot?.data?.() || {}, name = resolveDisplayName(data) || "Thành viên VHHT";
        return { id, name, avatar: resolveAvatarUrl(data.photoURL || data.profileImage, { uid: id, displayName: name }) };
    }).sort((a, b) => a.name.localeCompare(b.name, "vi"));
    renderFeedFriendOptions();
}

feedFilterToggle?.addEventListener("click", event => { event.stopPropagation(); setFeedFilterOpen(true); });
feedToolbarFilter?.addEventListener("click", event => { event.stopPropagation(); setFeedFilterOpen(feedFilterDock?.classList.contains("collapsed")); });
function setFeedSortMenu(open) {
    if (!feedSortMenu || !feedSortTrigger) return;
    if (open && window.innerWidth <= 800) {
        const triggerRect = feedSortTrigger.getBoundingClientRect();
        feedSortMenu.style.setProperty("--feed-sort-mobile-top", `${Math.round(triggerRect.bottom + 9)}px`);
    }
    feedSortMenu.hidden = !open;
    feedSortTrigger.setAttribute("aria-expanded", String(open));
}
feedSortTrigger?.addEventListener("click", event => { event.stopPropagation(); setFeedSortMenu(feedSortMenu.hidden); if (!feedSortMenu.hidden) setFeedFilterOpen(false); });
feedSortButtons.forEach(button => button.addEventListener("click", event => { event.stopPropagation(); feedSortMode = button.dataset.feedSort === "popular" ? "popular" : "newest"; feedVisibleLimit = 12; feedSortLabel.textContent = feedSortMode === "popular" ? "Nổi bật" : "Mới nhất"; feedSortButtons.forEach(item => { const active = item === button; item.classList.toggle("active", active); item.setAttribute("aria-checked", String(active)); }); setFeedSortMenu(false); applyFeedFilter(); communityPostFeedContainer?.scrollTo({ top: 0, behavior: "smooth" }); }));
feedToolbarRefresh?.addEventListener("click", async () => { feedToolbarRefresh.classList.add("is-refreshing"); stopPostsFeed?.(); try { await listenToPostsFeed(); } finally { setTimeout(() => feedToolbarRefresh.classList.remove("is-refreshing"), 550); } });
feedToolbarCreate?.addEventListener("click", () => { const toggle = document.getElementById("community-composer-toggle"); if (mobileComposerWrapper?.classList.contains("composer-collapsed")) toggle?.click(); setTimeout(() => mobileComposerInput?.focus(), 120); });
feedFilterClose?.addEventListener("click", () => setFeedFilterOpen(false));
feedFilterReset?.addEventListener("click", () => {
    feedFilterMode = "all";
    selectedFeedFriendIds.clear();
    if (feedFriendSearch) feedFriendSearch.value = "";
    feedFilterModeButtons.forEach(button => {
        const active = button.dataset.feedMode === "all";
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    if (feedFriendControls) feedFriendControls.hidden = true;
    renderFeedFriendOptions();
    applyFeedFilter();
});
feedFilterModeButtons.forEach(button => button.addEventListener("click", () => {
    feedFilterMode = button.dataset.feedMode;
    feedFilterModeButtons.forEach(item => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
    });
    if (feedFriendControls) feedFriendControls.hidden = feedFilterMode !== "friends";
    applyFeedFilter();
}));
feedAllFriends?.addEventListener("click", () => { selectedFeedFriendIds.clear(); renderFeedFriendOptions(); applyFeedFilter(); });
feedFriendSearch?.addEventListener("input", renderFeedFriendOptions);
document.addEventListener("pointerdown", event => { if (!feedFilterDock?.classList.contains("collapsed") && !feedFilterDock.contains(event.target) && !event.target.closest("#feed-toolbar-filter")) setFeedFilterOpen(false); if (!event.target.closest(".feed-sort-control")) setFeedSortMenu(false); });
document.addEventListener("keydown", event => { if (event.key === "Escape") { setFeedFilterOpen(false); setFeedSortMenu(false); } });
window.addEventListener("resize", () => {
    if (!feedFilterDock?.classList.contains("collapsed")) setFeedFilterOpen(true);
    else setFeedSortMenu(false);
});

function openUserProfile(userId) {
    if(userId){const adminMode=currentUserRole==="admin";const source=adminMode?"&from=community-admin":"";sessionStorage.setItem("vhht_profile_return_source",adminMode?"community-admin":"community");const target=new URL(`./profile-user/user-profile.html?uid=${encodeURIComponent(userId)}${source}`,location.href).href;if(embeddedPostMode&&window.parent!==window)window.parent.location.href=target;else window.location.href=target}
}

function resolvePostAvatar(postData, latestProfile = null) {
    const displayName = resolveDisplayName(latestProfile || postData);
    const identity = { uid: postData.authorId || latestProfile?.uid || "", displayName };
    const source = latestProfile
        ? (latestProfile.photoURL || latestProfile.profileImage || "")
        : (postData.authorAvatar || postData.photoURL || "");
    return resolveAvatarUrl(source, identity);
}

function setPostAvatar(image, postData, latestProfile = null) {
    if (!image) return;
    const identity = {
        uid: postData.authorId || latestProfile?.uid || "",
        displayName: resolveDisplayName(latestProfile || postData)
    };
    image.src = resolvePostAvatar(postData, latestProfile);
    applyAvatarFallback(image, identity);
}

// CAMERA DRAGGING SPACE STATE
let worldOffsetX = 0;
let worldOffsetY = 0;
let isDraggingSpace = false;
let startDragX = 0;
let startDragY = 0;
let dragThresholdPassed = false;
let cameraVelocityX = 0;
let cameraVelocityY = 0;
let lastCameraPointerX = 0;
let lastCameraPointerY = 0;
let lastCameraPointerTime = 0;
let cameraVisualFrame = 0;
let cameraInertiaFrame = 0;
let activeSpacePointerId = null;
let pendingFloatingPostTapId = null;
const spaceNavigationTools = document.querySelector(".space-navigation-tools");
const resetSpaceCameraButton = document.getElementById("reset-space-camera");

function syncSpaceReturnButton() {
    const threshold = window.innerWidth <= 800 ? 36 : 52;
    const cameraIsAway = Math.hypot(worldOffsetX, worldOffsetY) >= threshold;
    spaceNavigationTools?.classList.toggle("is-away", cameraIsAway);
    if (resetSpaceCameraButton) {
        resetSpaceCameraButton.tabIndex = cameraIsAway ? 0 : -1;
        resetSpaceCameraButton.setAttribute("aria-hidden", String(!cameraIsAway));
    }
}

function syncSpaceCamera() {
    if (cameraVisualFrame) return;
    cameraVisualFrame = requestAnimationFrame(() => {
        cameraVisualFrame = 0;
        document.documentElement.style.setProperty("--space-camera-x", `${worldOffsetX}px`);
        document.documentElement.style.setProperty("--space-camera-y", `${worldOffsetY}px`);
        document.documentElement.style.setProperty("--space-far-x", `${worldOffsetX * .035}px`);
        document.documentElement.style.setProperty("--space-far-y", `${worldOffsetY * .035}px`);
        document.documentElement.style.setProperty("--space-mid-x", `${worldOffsetX * .065}px`);
        document.documentElement.style.setProperty("--space-mid-y", `${worldOffsetY * .065}px`);
        document.documentElement.style.setProperty("--space-near-x", `${worldOffsetX * .11}px`);
        document.documentElement.style.setProperty("--space-near-y", `${worldOffsetY * .11}px`);
        syncSpaceReturnButton();
    });
}
syncSpaceReturnButton();
feedViewButtons.forEach(button => button.addEventListener("click", () => {
    setFeedViewMode(button.dataset.feedView);
    playUiSound("click-secondary");
}));
restoreFeedViewMode();

const EMOJI_MAP = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😡", sorry: "😢" };
const EMOJI_TEXT = { like: "Thích", love: "Yêu thích", haha: "Haha", wow: "Wow", sad: "Phẫn nộ", sorry: "Bi thương" };

onAuthStateChanged(firebaseAuthentication, async (user) => {
    if (presenceHeartbeatTimer) window.clearInterval(presenceHeartbeatTimer);
    if (presenceHeartbeatHandler) document.removeEventListener("visibilitychange", presenceHeartbeatHandler);
    stopActivityNotifications?.();
    stopMessageNotifications?.();
    stopSavedPosts?.();
    stopPostsFeed?.();
    presenceHeartbeatTimer = 0;
    presenceHeartbeatHandler = null;
    stopActivityNotifications = null;
    stopMessageNotifications = null;
    stopSavedPosts = null;
    stopPostsFeed = null;
    authenticatedUser = user;
    if (!user) {
        setFeedStatus("Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.", "error");
        return;
    }
    restoreFeedViewMode(user.uid);
    listenToSavedPosts(user.uid);

    // Hồ sơ và danh sách bạn bè chỉ làm giàu giao diện. Một lỗi Rules/mạng ở
    // các bước này không được phép ngăn bảng tin và các nút chính khởi động.
    const authDisplayName = resolveDisplayName({}, user);
    const authAvatar = resolveAvatarUrl(user.photoURL, { uid: user.uid, displayName: authDisplayName });
    if (currentUserDisplayName) currentUserDisplayName.textContent = authDisplayName;
    if (accountMenuName) accountMenuName.textContent = authDisplayName;
    if (profileAvatarButton) { profileAvatarButton.src = authAvatar; applyAvatarFallback(profileAvatarButton, { uid: user.uid, displayName: authDisplayName }); }
    if (accountMenuAvatar) { accountMenuAvatar.src = authAvatar; applyAvatarFallback(accountMenuAvatar, { uid: user.uid, displayName: authDisplayName }); }

    try {
        const userDoc = await getDoc(doc(firebaseDatabase, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.accountStatus === "suspended") {
                await firebaseAuthentication.signOut();
                location.href = "../authentication/login-page.html";
                return;
            }
            const viewerName = resolveDisplayName(data, user);
            const viewerAvatar = resolveAvatarUrl(data.photoURL || data.profileImage, { uid: user.uid, displayName: viewerName });
            if (currentUserDisplayName) currentUserDisplayName.textContent = viewerName;
            if (accountMenuName) accountMenuName.textContent = viewerName;
            currentViewerFriends = relationshipIds(data.friends);
            currentUserRole = data.role || "user";
            if (profileAvatarButton) { profileAvatarButton.src = viewerAvatar; applyAvatarFallback(profileAvatarButton, { uid: user.uid, displayName: viewerName }); }
            if (accountMenuAvatar) { accountMenuAvatar.src = viewerAvatar; applyAvatarFallback(accountMenuAvatar, { uid: user.uid, displayName: viewerName }); }
            setStatusUI(data.showActivityStatus !== false);
            if (data.role === "admin") installAdminModeButton();
        }
    } catch (error) {
        console.warn("Không thể tải hồ sơ, bảng tin sẽ dùng thông tin đăng nhập dự phòng.", error);
    }

    try {
        await loadFeedFriendProfiles();
    } catch (error) {
        console.warn("Không thể tải hồ sơ bạn bè để lọc bảng tin.", error);
        feedFriendProfiles = [];
        renderFeedFriendOptions();
    }
    applyFeedFilter();
    listenToPostsFeed().catch(error => {
        console.error("Không thể khởi động bảng tin", error);
        setFeedStatus("Không thể tải bài viết. Hãy kiểm tra Firestore Rules hoặc kết nối mạng.", "error", { retry: true });
    });
    if(embeddedPostMode){
        const requestedId=new URLSearchParams(location.search).get("post");
        if(requestedId){
            const requestedSnapshot=await getDoc(doc(firebaseDatabase,"posts",requestedId));
            if(requestedSnapshot.exists()){
                const requestedPost=requestedSnapshot.data();const moderationStatus=requestedPost.moderationStatus||(requestedPost.deletedByAdmin===true?"hidden":"active");let allowed=moderationStatus==="active"&&(!requestedPost.privacy||requestedPost.privacy==="public"||requestedPost.authorId===user.uid||requestedPost.privacy==="friends"&&currentViewerFriends.includes(requestedPost.authorId));
                if(moderationStatus==="active"&&requestedPost.privacy==="friends"&&!allowed){const authorSnapshot=await getDoc(doc(firebaseDatabase,"users",requestedPost.authorId));allowed=(authorSnapshot.data()?.friends||[]).includes(user.uid)}
                if(allowed){requestedPostOpened=true;setTimeout(()=>openPostDetailsModal(requestedId,requestedPost),60)}
                else parent.postMessage({type:"vhht-embedded-post-denied"},location.origin);
            }else parent.postMessage({type:"vhht-embedded-post-denied"},location.origin);
        }
    }
    const heartbeat=()=>document.visibilityState==="visible"&&writePublicProfile(user.uid,{lastActiveAt:serverTimestamp()}).catch(error=>console.warn("Không thể cập nhật trạng thái hoạt động",error));
    presenceHeartbeatHandler=heartbeat;
    heartbeat();
    presenceHeartbeatTimer=window.setInterval(heartbeat,45000);
    document.addEventListener("visibilitychange",heartbeat);
    listenToNotificationsRealtime();
    listenToMessageNotifications();
});

function listenToMessageNotifications() {
    const badge = document.getElementById("message-badge");
    if (!badge || !authenticatedUser?.uid) return;
    const ownNotifications = query(
        collection(firebaseDatabase, "messageNotifications"),
        where("recipientId", "==", authenticatedUser.uid)
    );
    stopMessageNotifications = onSnapshot(ownNotifications, snapshot => {
        const isInitial = !receivedInitialMessageNotificationSnapshot;
        receivedInitialMessageNotificationSnapshot = true;
        const newlyAddedIds = new Set(isInitial ? [] : snapshot.docChanges()
            .filter(change => change.type === "added")
            .map(change => change.doc.id));
        let unreadCount = 0;
        let hasNew = false;
        snapshot.forEach(item => {
            const notification = item.data();
            if (notification.isRead) return;
            unreadCount += 1;
            if (newlyAddedIds.has(item.id)) hasNew = true;
        });
        badge.textContent = compactBadgeCount(unreadCount);
        badge.hidden = unreadCount === 0;
        badge.style.display = unreadCount ? "grid" : "none";
        badge.setAttribute("aria-label", `${unreadCount} tin nhắn chưa đọc`);
        if (hasNew && document.visibilityState === "visible") playUiSound("receive-message");
    }, error => {
        console.error("Không thể cập nhật số tin nhắn chưa đọc", error);
    });
}

/* ==========================================================================
   CANVAS VŨ TRỤ ĐỘNG CHẬM RÃI (GIỮ NGUYÊN GIAO DIỆN LẤP LÁNH)
   ========================================================================== */
const canvas = document.getElementById("cosmic-universe-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
let starsArray = [];
let shootingStarsArray = [];

if (canvas && ctx) {
    const compactCanvas = matchMedia("(max-width: 800px), (pointer: coarse)").matches;
    const reducedCanvasMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvasFps = reducedCanvasMotion ? 8 : compactCanvas ? 24 : 40;
    const canvasFrameInterval = 1000 / canvasFps;
    let lastCanvasFrame = 0;
    let canvasAnimationFrame = 0;
    function resizeCanvas() {
        const ratio = Math.min(window.devicePixelRatio || 1, compactCanvas ? 1 : 1.35);
        canvas.width = Math.round(window.innerWidth * ratio);
        canvas.height = Math.round(window.innerHeight * ratio);
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        initStars();
    }
    window.addEventListener("resize", resizeCanvas);

    function initStars() {
        starsArray = [];
        const viewportArea = window.innerWidth * window.innerHeight;
        // A narrow phone used to receive only ~40 stars from the area formula,
        // making the universe look empty. Keep a dense static field on compact
        // screens while retaining the low-power 24 FPS/DPR limits above.
        const totalStars = compactCanvas
            ? Math.min(165, Math.max(110, Math.round(viewportArea / 4200)))
            : Math.min(230, Math.max(150, Math.round(viewportArea / 5200)));
        for (let i = 0; i < totalStars; i++) {
            const distance = Math.random();
            starsArray.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                depth: .035 + (1 - distance) * .22,
                size: distance < .72 ? .35 + Math.random() * .75 : .9 + Math.random() * 1.35,
                alpha: .24 + Math.random() * .7,
                speed: .0015 + Math.random() * .0035,
                shape: Math.random() > .78 ? "diamond" : "circle",
                tint: Math.random() > .84 ? (Math.random() > .5 ? "174, 224, 255" : "205, 190, 255") : "255, 255, 255"
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
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const isCompactScreen = viewportWidth <= 640;
        const burstCount = Math.floor(Math.random() * (isCompactScreen ? 2 : 3)) + 1;
        for (let i = 0; i < burstCount; i++) {
            const edge = Math.floor(Math.random() * 4);
            const margin = 30;
            let x;
            let y;

            if (edge === 0) {
                x = Math.random() * viewportWidth;
                y = -margin;
            } else if (edge === 1) {
                x = viewportWidth + margin;
                y = Math.random() * viewportHeight;
            } else if (edge === 2) {
                x = Math.random() * viewportWidth;
                y = viewportHeight + margin;
            } else {
                x = -margin;
                y = Math.random() * viewportHeight;
            }

            // Aim at a different inner point each time so meteors can cross the
            // feed from every edge/corner instead of sharing one diagonal path.
            const targetX = viewportWidth * (0.15 + Math.random() * 0.7);
            const targetY = viewportHeight * (0.15 + Math.random() * 0.7);
            const directionX = targetX - x;
            const directionY = targetY - y;
            const directionLength = Math.hypot(directionX, directionY) || 1;
            const speed = 7 + Math.random() * 10;

            shootingStarsArray.push({
                x,
                y,
                velocityX: directionX / directionLength * speed,
                velocityY: directionY / directionLength * speed,
                tailX: directionX / directionLength,
                tailY: directionY / directionLength,
                length: 50 + Math.random() * 70,
                alpha: 1
            });
        }
    }

    function scheduleShootingStars() {
        setTimeout(() => { if (!document.hidden) createShootingStar(); scheduleShootingStars(); }, 5000 + Math.random() * (compactCanvas ? 8000 : 5000));
    }

    function animateUniverse(time = 0) {
        canvasAnimationFrame = requestAnimationFrame(animateUniverse);
        if (document.hidden || time - lastCanvasFrame < canvasFrameInterval) return;
        lastCanvasFrame = time;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        starsArray.forEach(star => {
            star.alpha += star.speed;
            if (star.alpha > 1 || star.alpha < 0.1) star.speed = -star.speed;
            const color = `rgba(${star.tint}, ${star.alpha})`;
            const drawX = ((star.x + worldOffsetX * star.depth) % window.innerWidth + window.innerWidth) % window.innerWidth;
            const drawY = ((star.y + worldOffsetY * star.depth) % window.innerHeight + window.innerHeight) % window.innerHeight;
            if (star.shape === "diamond") {
                drawDiamondStar(drawX, drawY, 4, star.size * 2, star.size * 0.4, color);
            } else {
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(drawX, drawY, star.size, 0, Math.PI * 2); ctx.fill();
            }
        });
        for (let i = shootingStarsArray.length - 1; i >= 0; i--) {
            let s = shootingStarsArray[i]; s.x += s.velocityX; s.y += s.velocityY; s.alpha -= 0.012;
            const outsideMargin = s.length + 40;
            if (s.alpha <= 0 || s.x < -outsideMargin || s.x > window.innerWidth + outsideMargin || s.y < -outsideMargin || s.y > window.innerHeight + outsideMargin) { shootingStarsArray.splice(i, 1); continue; }
            ctx.strokeStyle = `rgba(255, 255, 255, ${s.alpha})`; ctx.lineWidth = 1.2; ctx.beginPath();
            ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.tailX * s.length, s.y - s.tailY * s.length); ctx.stroke();
        }
    }
    resizeCanvas(); if (!reducedCanvasMotion) scheduleShootingStars(); canvasAnimationFrame = requestAnimationFrame(animateUniverse);
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
                <div class="custom-dialog-heading">
                    <span class="custom-dialog-icon" aria-hidden="true"><i class="fa-solid fa-circle-question"></i></span>
                    <h3 id="custom-ux-dialog-title">Xác nhận</h3>
                </div>
                <div id="custom-ux-dialog-body" style="margin-bottom:20px;">
                    <p id="custom-ux-dialog-text" style="color:#94a3b8; font-size:14px; margin:0; line-height:1.5;"></p>
                    <input type="text" id="custom-ux-dialog-input" style="display:none; width:100%; background:#1e293b; border:1px solid #334155; border-radius:8px; padding:10px; color:#f8fafc; margin-top:12px; font-size:14px; outline:none; box-sizing:border-box;">
                </div>
                <div class="custom-dialog-actions">
                    <button id="custom-ux-dialog-cancel" style="background:transparent; border:1px solid #334155; color:#94a3b8; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:14px;">Hủy</button>
                    <button id="custom-ux-dialog-confirm" style="background:#38bdf8; border:none; color:#0f172a; font-weight:600; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:14px;">Xác nhận</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }
    return overlay;
}

function showCustomConfirm(message, onConfirm, options = {}) {
    const overlay = createCustomModalContainer();
    const box = document.getElementById("custom-ux-dialog-box");
    const title = document.getElementById("custom-ux-dialog-title");
    box.querySelector(".custom-dialog-icon i").className = `fa-solid ${options.icon || "fa-circle-question"}`;
    title.innerText = options.title || "Xác nhận";
    document.getElementById("custom-ux-dialog-text").innerText = message;
    document.getElementById("custom-ux-dialog-input").style.display = "none";
    const cancelBtn = document.getElementById("custom-ux-dialog-cancel");
    const confirmBtn = document.getElementById("custom-ux-dialog-confirm");
    box.classList.toggle("is-danger-confirm", options.variant === "danger");
    cancelBtn.textContent = options.cancelLabel || "Hủy";
    confirmBtn.textContent = options.confirmLabel || "Xác nhận";
    confirmBtn.disabled = false;
    cancelBtn.style.display = "block";
    overlay.style.display = "flex"; setTimeout(() => { overlay.style.opacity = "1"; document.getElementById("custom-ux-dialog-box").style.transform = "scale(1)"; }, 10);
    confirmBtn.onclick = async () => {
        if (options.pendingLabel) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = options.pendingLabel;
        }
        try {
            await onConfirm();
            closeCustomDialog();
        } catch (error) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = options.confirmLabel || "Xác nhận";
            throw error;
        }
    };
    cancelBtn.onclick = closeCustomDialog;
}

function showCustomPrompt(message, defaultValue, onConfirm, options = {}) {
    const overlay = createCustomModalContainer();
    const box = document.getElementById("custom-ux-dialog-box");
    box.classList.remove("is-danger-confirm");
    box.querySelector(".custom-dialog-icon i").className = `fa-solid ${options.icon || "fa-pen-to-square"}`;
    document.getElementById("custom-ux-dialog-title").innerText = options.title || "Chỉnh sửa nội dung";
    document.getElementById("custom-ux-dialog-text").innerText = message;
    const inputEl = document.getElementById("custom-ux-dialog-input");
    inputEl.style.display = "block"; inputEl.value = defaultValue;
    const cancelBtn = document.getElementById("custom-ux-dialog-cancel");
    const confirmBtn = document.getElementById("custom-ux-dialog-confirm");
    cancelBtn.textContent = options.cancelLabel || "Hủy";
    confirmBtn.textContent = options.confirmLabel || "Lưu thay đổi";
    confirmBtn.disabled = false;
    cancelBtn.style.display = "block";
    overlay.style.display = "flex"; setTimeout(() => { overlay.style.opacity = "1"; document.getElementById("custom-ux-dialog-box").style.transform = "scale(1)"; inputEl.focus(); }, 10);
    confirmBtn.onclick = async () => {
        const val = inputEl.value.trim();
        if (!val) { inputEl.focus(); return; }
        if (options.pendingLabel) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = options.pendingLabel;
        }
        try {
            await onConfirm(val);
            closeCustomDialog();
        } catch (error) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = options.confirmLabel || "Lưu thay đổi";
            throw error;
        }
    };
    inputEl.onkeydown = (event) => {
        if (event.key === "Enter") { event.preventDefault(); confirmBtn.click(); }
    };
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
communityPostFeedContainer.addEventListener("pointerdown", event => {
    if (feedViewMode === "list" || event.isPrimary === false || postDetailsOverlay?.classList.contains("active")) return;
    if (event.target.closest("button,a,input,textarea,select,label")) return;
    activeSpacePointerId = event.pointerId;
    pendingFloatingPostTapId = event.target.closest(".community-post-card")?.id || null;
    isDraggingSpace = true;
    dragThresholdPassed = false;
    startDragX = event.clientX - worldOffsetX;
    startDragY = event.clientY - worldOffsetY;
    cameraVelocityX = cameraVelocityY = 0;
    lastCameraPointerX = event.clientX;
    lastCameraPointerY = event.clientY;
    lastCameraPointerTime = performance.now();
    cancelAnimationFrame(cameraInertiaFrame);
    document.body.classList.add("is-panning-space");
    communityPostFeedContainer.setPointerCapture?.(event.pointerId);
});
communityPostFeedContainer.addEventListener("pointermove", event => {
    if (!isDraggingSpace || event.pointerId !== activeSpacePointerId) return;
    const nextX = event.clientX - startDragX;
    const nextY = event.clientY - startDragY;
    if (Math.abs(nextX - worldOffsetX) > 6 || Math.abs(nextY - worldOffsetY) > 6) dragThresholdPassed = true;
    worldOffsetX = nextX;
    worldOffsetY = nextY;
    const now = performance.now();
    const elapsed = Math.max(8, now - lastCameraPointerTime);
    cameraVelocityX = (event.clientX - lastCameraPointerX) / elapsed * 16;
    cameraVelocityY = (event.clientY - lastCameraPointerY) / elapsed * 16;
    lastCameraPointerX = event.clientX;
    lastCameraPointerY = event.clientY;
    lastCameraPointerTime = now;
    syncSpaceCamera();
    if (event.pointerType !== "mouse") event.preventDefault();
});
const finishSpacePointer = event => {
    if (activeSpacePointerId !== null && event.pointerId !== activeSpacePointerId) return;
    const tappedPostId = event.type === "pointerup" && !dragThresholdPassed ? pendingFloatingPostTapId : null;
    if (activeSpacePointerId !== null) communityPostFeedContainer.releasePointerCapture?.(activeSpacePointerId);
    isDraggingSpace = false;
    document.body.classList.remove("is-panning-space");
    activeSpacePointerId = null;
    pendingFloatingPostTapId = null;
    if (tappedPostId && !postDetailsOverlay?.classList.contains("active")) {
        const tappedPost = postCardsMap.get(tappedPostId);
        if (tappedPost?.postData) { playUiSound("open-panel"); openPostDetailsModal(tappedPostId, tappedPost.postData); }
    }
    if (!tappedPostId && dragThresholdPassed && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const glide = () => {
            cameraVelocityX *= .88;
            cameraVelocityY *= .88;
            if (Math.hypot(cameraVelocityX, cameraVelocityY) < .18 || document.hidden) return;
            worldOffsetX += cameraVelocityX;
            worldOffsetY += cameraVelocityY;
            syncSpaceCamera();
            cameraInertiaFrame = requestAnimationFrame(glide);
        };
        cameraInertiaFrame = requestAnimationFrame(glide);
    }
};
communityPostFeedContainer.addEventListener("pointerup", finishSpacePointer);
communityPostFeedContainer.addEventListener("pointercancel", finishSpacePointer);

resetSpaceCameraButton?.addEventListener("click", () => {
    cancelAnimationFrame(cameraInertiaFrame);
    const fromX = worldOffsetX, fromY = worldOffsetY, started = performance.now();
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 360;
    const reset = now => {
        const progress = duration ? Math.min(1, (now - started) / duration) : 1;
        const eased = 1 - Math.pow(1 - progress, 3);
        worldOffsetX = fromX * (1 - eased);
        worldOffsetY = fromY * (1 - eased);
        syncSpaceCamera();
        if (progress < 1) requestAnimationFrame(reset);
    };
    requestAnimationFrame(reset);
});

// Keep the mobile composer attached to the visible viewport when the software keyboard opens.
const mobileComposerWrapper = document.querySelector(".community-create-post-container-wrapper");
const mobileComposerInput = document.getElementById("main-post-textarea");
let lastComposerPressSoundAt = 0;

function syncSpaceControlPlacement() {
    if (!spaceNavigationTools) return;
    if (window.innerWidth > 800 || !mobileComposerWrapper) {
        spaceNavigationTools.style.removeProperty("--space-control-bottom");
        return;
    }
    const composerRect = mobileComposerWrapper.getBoundingClientRect();
    const visibleBottom = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight;
    const composerIsCollapsed = mobileComposerWrapper.classList.contains("composer-collapsed");
    const composerIsVisible = composerRect.height > 0 && composerRect.top < visibleBottom && composerRect.bottom > 0;
    if (composerIsCollapsed || !composerIsVisible) {
        spaceNavigationTools.style.removeProperty("--space-control-bottom");
        return;
    }
    const clearance = Math.max(76, window.innerHeight - composerRect.top + 10);
    spaceNavigationTools.style.setProperty("--space-control-bottom", `${Math.round(clearance)}px`);
}

if (mobileComposerWrapper && "ResizeObserver" in window) {
    new ResizeObserver(syncSpaceControlPlacement).observe(mobileComposerWrapper);
}
if (mobileComposerWrapper && "MutationObserver" in window) {
    new MutationObserver(syncSpaceControlPlacement).observe(mobileComposerWrapper, {
        attributes: true,
        attributeFilter: ["class", "style"]
    });
}
mobileComposerInput?.addEventListener("pointerdown", () => {
    const now = performance.now();
    if (now - lastComposerPressSoundAt < 220) return;
    lastComposerPressSoundAt = now;
    playUiSound("click-neutral");
});
function syncComposerWithVisualViewport() {
    if (!mobileComposerWrapper) return;
    if (!window.visualViewport || window.innerWidth > 800) {
        mobileComposerWrapper.style.removeProperty("--mobile-keyboard-offset");
        postDetailsOverlay?.style.removeProperty("--detail-viewport-height");
        postDetailsOverlay?.style.removeProperty("--detail-viewport-top");
        syncSpaceControlPlacement();
        return;
    }
    const viewport = window.visualViewport;
    const keyboardOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    mobileComposerWrapper.style.setProperty("--mobile-keyboard-offset", `${Math.round(keyboardOffset)}px`);
    postDetailsOverlay?.style.setProperty("--detail-viewport-height", `${Math.round(viewport.height)}px`);
    postDetailsOverlay?.style.setProperty("--detail-viewport-top", `${Math.round(viewport.offsetTop)}px`);
    syncSpaceControlPlacement();
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
window.addEventListener("resize", syncSpaceControlPlacement, { passive: true });
requestAnimationFrame(syncSpaceControlPlacement);

/* ==========================================================================
   YÊU CẦU 1: CẢI TIẾN THUẬT TOÁN SINH TIN TRÔI - VÀO TRANG LÀ XUẤT HIỆN LUÔN
   ========================================================================== */
let meteorVisualSequence = Math.floor(Math.random() * 6);
function generateAsteroidVisual() {
    const shapes = [
        "polygon(8% 27%,18% 10%,42% 4%,67% 8%,88% 23%,98% 49%,91% 75%,72% 94%,43% 98%,17% 88%,3% 62%)",
        "polygon(5% 39%,14% 16%,35% 5%,62% 3%,84% 17%,98% 40%,94% 68%,77% 91%,48% 98%,22% 91%,7% 72%)",
        "polygon(9% 20%,31% 5%,58% 7%,81% 15%,97% 38%,92% 67%,78% 88%,53% 98%,25% 92%,4% 70%,2% 43%)",
        "polygon(4% 31%,20% 9%,49% 3%,74% 10%,94% 30%,98% 57%,86% 82%,61% 97%,34% 95%,12% 79%,2% 54%)",
        "polygon(7% 25%,25% 7%,54% 3%,80% 13%,96% 35%,94% 64%,79% 87%,50% 98%,21% 89%,3% 65%)",
        "polygon(3% 42%,12% 19%,37% 5%,65% 4%,88% 20%,98% 47%,90% 73%,69% 94%,39% 97%,14% 84%,4% 64%)"
    ];
    const palettes = [
        ["#293044", "#090c14", "#64748b"],
        ["#28283d", "#080a12", "#7c6f9e"],
        ["#26313b", "#080c11", "#55798b"],
        ["#302a35", "#0b0910", "#80637b"]
    ];
    const craterLayouts = [
        ["29%", "27%", "16%", "11%", "72%", "69%", "25%", "18%", "118deg"],
        ["70%", "24%", "22%", "15%", "31%", "73%", "17%", "13%", "42deg"],
        ["22%", "58%", "13%", "20%", "76%", "39%", "19%", "12%", "151deg"],
        ["54%", "22%", "25%", "12%", "68%", "75%", "14%", "20%", "74deg"],
        ["78%", "54%", "16%", "24%", "27%", "28%", "21%", "14%", "132deg"],
        ["38%", "72%", "23%", "14%", "69%", "27%", "12%", "19%", "18deg"]
    ];
    const index = meteorVisualSequence++ % shapes.length;
    const palette = palettes[index % palettes.length];
    const craters = craterLayouts[index];
    const jitterPercent = value => `${Math.max(6, Math.min(88, Number.parseFloat(value) + (Math.random() * 8 - 4))).toFixed(1)}%`;
    return {
        shape: shapes[index], light: palette[0], dark: palette[1], edge: palette[2],
        rotation: `${(-2.2 + Math.random() * 4.4).toFixed(2)}deg`,
        craterOneX: jitterPercent(craters[0]), craterOneY: jitterPercent(craters[1]), craterOneW: jitterPercent(craters[2]), craterOneH: jitterPercent(craters[3]),
        craterTwoX: jitterPercent(craters[4]), craterTwoY: jitterPercent(craters[5]), craterTwoW: jitterPercent(craters[6]), craterTwoH: jitterPercent(craters[7]),
        ridgeAngle: craters[8]
    };
}

let lastMeteorCollisionSoundAt = 0;
function playMeteorCollisionSound(relativeSpeed) {
    const now = performance.now();
    if (document.hidden || relativeSpeed < .22 || now - lastMeteorCollisionSoundAt < 1800 || Math.random() > .58) return;
    lastMeteorCollisionSoundAt = now;
    playUiSound("click-neutral");
}

function getFloatingCardSize() {
    const viewportWidth = window.innerWidth;
    const variance = .9 + Math.random() * .18;
    if (viewportWidth <= 430) return { width: Math.round(Math.min(246, viewportWidth - 28)), height: 174 };
    if (viewportWidth <= 600) return { width: Math.round(Math.min(260, viewportWidth - 30)), height: 174 };
    if (viewportWidth <= 800) return { width: Math.round(258 + Math.random() * 18), height: 184 };
    return { width: Math.round(330 * variance), height: 230 };
}

// Cải tiến hàm định vị: Nếu là `isInitialLoad` (vừa vào trang/reload), tin nhắn sẽ xuất hiện trực tiếp TRONG màn hình
function getRandomScreenOrEdgePosition(cardWidth = 320, cardHeight = 220, isInitialLoad = false) {
    const isCompact = window.matchMedia("(max-width: 800px)").matches;
    const speedScale = isCompact ? 0.58 : 1;
    const speed = (0.55 + Math.random() * 0.65) * speedScale;
    
    if (isInitialLoad) {
        // Chọn điểm ít bị chiếm nhất để các bài phủ đều vùng nhìn thấy thay vì
        // cùng rơi vào một cụm ngẫu nhiên.
        const sidePadding = isCompact ? 12 : 80;
        const topSafe = isCompact ? 130 + (Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--vhht-safe-top")) || 0) : 90;
        const bottomSafe = isCompact ? 108 : 96;
        const availableX = Math.max(0, window.innerWidth - cardWidth - sidePadding * 2);
        const availableY = Math.max(0, window.innerHeight - cardHeight - topSafe - bottomSafe);
        const existingCards = [...postCardsMap.values()].filter(item => !item.isOutside && !item.filteredOut);
        let best = null;
        const candidateCount = Math.max(18, existingCards.length * 8);
        for (let index = 0; index < candidateCount; index += 1) {
            const columnBias = (index % 5 + .5) / 5;
            const rowBias = ((index * 3) % 7 + .5) / 7;
            const candidateX = sidePadding + Math.max(0, Math.min(availableX, availableX * columnBias + (Math.random() - .5) * Math.min(42, availableX * .12)));
            const candidateY = topSafe + Math.max(0, Math.min(availableY, availableY * rowBias + (Math.random() - .5) * Math.min(52, availableY * .1)));
            const centerX = candidateX + cardWidth / 2;
            const centerY = candidateY + cardHeight / 2;
            const nearest = existingCards.length ? Math.min(...existingCards.map(item => Math.hypot(centerX - (item.x + worldOffsetX + item.w / 2), centerY - (item.y + worldOffsetY + item.h / 2)))) : Number.POSITIVE_INFINITY;
            const edgeRoom = Math.min(centerX, window.innerWidth - centerX, centerY - topSafe, window.innerHeight - bottomSafe - centerY);
            const score = (Number.isFinite(nearest) ? nearest : Math.min(window.innerWidth, window.innerHeight) * .7) + edgeRoom * .16;
            if (!best || score > best.score) best = { x: candidateX, y: candidateY, score };
        }
        const x = best?.x ?? sidePadding + availableX / 2;
        const y = best?.y ?? topSafe + availableY / 2;
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
        if (feedViewMode === "list") { setTimeout(() => requestAnimationFrame(updatePhysicsFrame), 300); return; }
        if (cardObj.filteredOut) { setTimeout(() => requestAnimationFrame(updatePhysicsFrame), 350); return; }
        if (reducedMotionQuery.matches) {
            el.style.transform = `translate3d(${cardObj.x + worldOffsetX}px, ${cardObj.y + worldOffsetY}px, 0)`;
            setTimeout(() => requestAnimationFrame(updatePhysicsFrame), 500);
            return;
        }
        if (currentActivePostId === el.id) { requestAnimationFrame(updatePhysicsFrame); return; }
        
        if (!cardObj.isOutside) {
            const now = performance.now();
            // Mỗi thiên thạch đi trên một đường thẳng. Hướng chỉ thay đổi khi
            // va chạm hoặc khi tái sinh từ một cạnh màn hình.
            if (now >= cardObj.nextCollisionRoll) {
                cardObj.canCollide = Math.random() < .62;
                cardObj.collisionModeUntil = cardObj.canCollide ? now + 4500 + Math.random() * 3500 : now;
                cardObj.nextCollisionRoll = now + 5000 + Math.random() * 7000;
            }
            if (cardObj.canCollide && now > cardObj.collisionModeUntil) cardObj.canCollide = false;
            cardObj.x += cardObj.vx; cardObj.y += cardObj.vy;
            postCardsMap.forEach(other => {
                if (other === cardObj || other.isOutside || other.filteredOut || !cardObj.canCollide || !other.canCollide || performance.now()<cardObj.collisionUntil || performance.now()<other.collisionUntil) return;
                const dx = (cardObj.x + cardObj.w / 2) - (other.x + other.w / 2);
                const dy = (cardObj.y + cardObj.h / 2) - (other.y + other.h / 2);
                // The visible rock occupies less space than its rectangular DOM
                // box. These tighter radii prevent invisible early collisions.
                const collisionWidth = (cardObj.w + other.w) * .385;
                const collisionHeight = (cardObj.h + other.h) * .36;
                const ellipseDistance = (dx * dx) / (collisionWidth * collisionWidth) + (dy * dy) / (collisionHeight * collisionHeight);
                if (ellipseDistance < 1) {
                    const distance=Math.hypot(dx,dy)||1,nx=dx/distance,ny=dy/distance;
                    const relative=(cardObj.vx-other.vx)*nx+(cardObj.vy-other.vy)*ny;
                    if(relative < -.015){
                        cardObj.vx-=1.06*relative*nx;cardObj.vy-=1.06*relative*ny;other.vx+=1.06*relative*nx;other.vy+=1.06*relative*ny;
                        const penetration = Math.max(2, (1 - Math.sqrt(ellipseDistance)) * Math.min(collisionWidth, collisionHeight) * .52);
                        cardObj.x+=nx*penetration;cardObj.y+=ny*penetration;other.x-=nx*penetration;other.y-=ny*penetration;
                        playMeteorCollisionSound(Math.abs(relative));
                        cardObj.collisionUntil=other.collisionUntil=performance.now()+760;
                        cardObj.element.classList.add("meteor-impact");other.element.classList.add("meteor-impact");setTimeout(()=>{cardObj.element.classList.remove("meteor-impact");other.element.classList.remove("meteor-impact")},420);
                    }
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
            const compactViewport = window.matchMedia("(max-width: 800px)").matches;
            if (compactViewport) {
                const wrapPadding = 34;
                const safeTop = 118;
                const safeBottom = 98;
                if (currentLeft < -cardObj.w - wrapPadding) cardObj.x = window.innerWidth - cardObj.w * .18 - worldOffsetX;
                else if (currentLeft > window.innerWidth + wrapPadding) cardObj.x = -cardObj.w * .82 - worldOffsetX;
                if (currentTop < safeTop - cardObj.h - wrapPadding) cardObj.y = window.innerHeight - safeBottom - cardObj.h * .18 - worldOffsetY;
                else if (currentTop > window.innerHeight - safeBottom + wrapPadding) cardObj.y = safeTop - cardObj.h * .82 - worldOffsetY;
                el.style.opacity = "1";
                requestAnimationFrame(updatePhysicsFrame);
                return;
            }
            const buffer = 260;
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
let latestNotificationItems = [];
let activeNotificationFilter = "all";
const notificationActorCache = new Map();
const notificationFilterMatch = item => activeNotificationFilter === "all"
    || (activeNotificationFilter === "reaction" && item.type === "reaction")
    || (activeNotificationFilter === "comment" && ["comment", "reply", "comment_reply"].includes(item.type))
    || (activeNotificationFilter === "other" && !["reaction", "comment", "reply", "comment_reply"].includes(item.type));
const compactBadgeCount = count => count > 99 ? "99+" : String(count);
const isSystemNotification = item => ["admin_moderation", "moderation_appeal", "admin_announcement", "system"].includes(item.type);
const notificationTypeIcon = item => {
    if (item.type === "reaction") return "fa-heart";
    if (item.type === "comment") return "fa-comment";
    if (["reply", "comment_reply"].includes(item.type)) return "fa-reply";
    if (item.type === "friend_request") return "fa-user-plus";
    if (item.type === "friend_accepted") return "fa-user-check";
    if (item.type === "friend_post") return "fa-file-lines";
    if (isSystemNotification(item)) return "fa-shield-halved";
    return "fa-bell";
};
async function hydrateNotificationActors(items) {
    const actorIds = [...new Set(items.filter(item => item.actorId && !isSystemNotification(item)).map(item => item.actorId))];
    await Promise.all(actorIds.map(async uid => {
        if (notificationActorCache.has(uid)) return;
        try {
            const snapshot = await getDoc(doc(firebaseDatabase, "users", uid));
            notificationActorCache.set(uid, snapshot.exists() ? { id: uid, ...snapshot.data() } : null);
        } catch (error) { console.warn("Không thể tải người gửi thông báo", uid, error); }
    }));
    items.forEach(item => {
        const actor = notificationActorCache.get(item.actorId);
        if (!actor) return;
        item._actorName = resolveDisplayName(actor);
        item._actorAvatar = resolveAvatarUrl(actor.photoURL || actor.profileImage, { uid: item.actorId, displayName: item._actorName });
    });
}

function renderNotificationItems() {
    const items = latestNotificationItems.filter(notificationFilterMatch);
    myOwnPostsContainer.innerHTML=items.length?items.map(n=>{const system=isSystemNotification(n),storedName=/^(một thành viên|thành viên vhht)$/i.test(String(n.actorName||'').trim())?'':n.actorName,actorName=system?'Quản trị viên VHHT':(n._actorName||storedName||'Tài khoản không còn tồn tại'),leading=system?`<span class="notification-system-icon"><i class="fa-solid fa-shield-halved"></i></span>`:`<img class="notification-avatar" src="${escapeHTML(n._actorAvatar||resolveAvatarUrl('',{uid:n.actorId||'unknown',displayName:actorName}))}" alt="">`;return `<button class="notification-item ${n.isRead?'':'unread'} ${n.friendRequestStatus?`request-${n.friendRequestStatus}`:''}" data-id="${n.id}" data-type="${n.type||''}" data-post="${n.postId||''}" data-comment="${n.commentId||''}" data-user="${n.actorId||''}" data-owner="${n.type==='friend_post'?(n.actorId||''):(n.postAuthorId||n.recipientId||'')}"><span class="notification-leading">${leading}<span class="notification-type-badge"><i class="fa-solid ${notificationTypeIcon(n)}"></i></span></span><span class="notification-copy"><strong>${escapeHTML(actorName)}</strong><span>${escapeHTML(notificationActionText(n))}</span><small>${formatPostDate(n.createdAt)}</small>${n.type==='friend_request'&&!n.friendRequestStatus?`<span class="friend-request-actions"><em class="quick-accept" data-actor="${n.actorId}">Đồng ý</em><em class="quick-decline" data-actor="${n.actorId}">Từ chối</em></span>`:n.friendRequestStatus?`<span class="request-resolution"><i class="fa-solid ${n.friendRequestStatus==='accepted'?'fa-circle-check':'fa-circle-xmark'}"></i> ${n.friendRequestStatus==='accepted'?'Đã đồng ý':'Đã từ chối'}</span>`:''}</span></button>`}).join(""):`<div class="empty-notifications"><i class="fa-regular fa-bell-slash"></i><strong>Không có thông báo trong mục này</strong><span>Thông báo mới sẽ xuất hiện tại đây.</span></div>`;
    myOwnPostsContainer.querySelectorAll(".notification-item").forEach(item=>item.onclick=async()=>{await updateDoc(doc(firebaseDatabase,"notifications",item.dataset.id),{isRead:true});sessionStorage.setItem("returnToNotifications","1");if(item.dataset.post){const owner=item.dataset.owner||authenticatedUser.uid;location.href=`profile-user/user-profile.html?uid=${encodeURIComponent(owner)}&post=${encodeURIComponent(item.dataset.post)}${item.dataset.comment?`&comment=${encodeURIComponent(item.dataset.comment)}`:''}&from=notifications`}else if(item.dataset.user)openUserProfile(item.dataset.user)});
    myOwnPostsContainer.querySelectorAll(".quick-accept").forEach(action=>action.onclick=async e=>{e.stopPropagation();const uid=action.dataset.actor,row=action.closest(".notification-item");row.disabled=true;try{await acceptFriendship(authenticatedUser.uid,uid);await addDoc(collection(firebaseDatabase,"notifications"),{recipientId:uid,actorId:authenticatedUser.uid,actorName:currentUserDisplayName.innerText,type:"friend_accepted",message:"đã đồng ý lời mời kết bạn của bạn",isRead:false,createdAt:serverTimestamp()});await updateDoc(doc(firebaseDatabase,"notifications",row.dataset.id),{isRead:true,friendRequestStatus:"accepted",resolvedAt:serverTimestamp()})}catch(error){console.error("Không thể chấp nhận lời mời",error);row.disabled=false}});
    myOwnPostsContainer.querySelectorAll(".quick-decline").forEach(action=>action.onclick=async e=>{e.stopPropagation();const row=action.closest(".notification-item");row.disabled=true;await declineFriendRequest(authenticatedUser.uid,action.dataset.actor);await updateDoc(doc(firebaseDatabase,"notifications",row.dataset.id),{isRead:true,friendRequestStatus:"declined",resolvedAt:serverTimestamp()})});
}

document.getElementById("notification-filters")?.addEventListener("click", event => {
    const button = event.target.closest("[data-notification-filter]");
    if (!button) return;
    activeNotificationFilter = button.dataset.notificationFilter;
    document.querySelectorAll("[data-notification-filter]").forEach(item => item.classList.toggle("active", item === button));
    renderNotificationItems();
});

function listenToNotificationsRealtime() {
    if (!authenticatedUser) return;
    const ownNotifications = query(
        collection(firebaseDatabase, "notifications"),
        where("recipientId", "==", authenticatedUser.uid)
    );
    stopActivityNotifications = onSnapshot(ownNotifications, snapshot => {
        const isInitialSnapshot=!receivedInitialActivityNotificationSnapshot;
        receivedInitialActivityNotificationSnapshot=true;
        const hasGenuineNewNotification=!isInitialSnapshot&&snapshot.docChanges().some(change=>{const item=change.doc.data();return change.type==="added"&&(item.recipientId||item.postAuthorId)===authenticatedUser.uid&&!item.isRead});
        latestNotificationItems=[];snapshot.forEach(d=>{const n=d.data();latestNotificationItems.push({id:d.id,...n})});
        latestNotificationItems.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        const unread=latestNotificationItems.filter(n=>!n.isRead).length,topBadge=document.getElementById("top-notification-badge");
        [notificationBadge,topBadge].forEach(b=>{if(!b)return;b.innerText=compactBadgeCount(unread);b.hidden=!unread;b.style.display=unread?"grid":"none"});
        hydrateNotificationActors(latestNotificationItems).then(renderNotificationItems);
        if(hasGenuineNewNotification&&document.visibilityState==="visible"&&myPostsFixedPanel?.classList.contains("collapsed"))playUiSound("notification");
    });
}

const communityNotificationsButton = document.getElementById("community-notifications-button");

function setNotificationPanelOpen(open) {
    if (!myPostsFixedPanel) return;
    if (open) setFeedFilterOpen(false);
    setMobileMemberSearch(false, false);
    myPostsFixedPanel.classList.toggle("collapsed", !open);
    const expanded = String(Boolean(open));
    toggleMyPostsPanelButton?.setAttribute("aria-expanded", expanded);
    communityNotificationsButton?.setAttribute("aria-expanded", expanded);
}

function toggleNotificationPanel() {
    if (!myPostsFixedPanel) return;
    setNotificationPanelOpen(myPostsFixedPanel.classList.contains("collapsed"));
}

if (toggleMyPostsPanelButton) {
    toggleMyPostsPanelButton.addEventListener("click", (e) => {
        e.stopPropagation();
        const searchWasOpen = Boolean(memberSearchPanel?.classList.contains("mobile-search-expanded"));
        setMobileMemberSearch(false, false);
        if (searchWasOpen) requestAnimationFrame(() => setNotificationPanelOpen(true));
        else toggleNotificationPanel();
        // Chỉ đánh dấu đã đọc khi người dùng bấm đúng thông báo.
    });
}
myPostsFixedPanel?.addEventListener("click", event => {
    if (!myPostsFixedPanel.classList.contains("collapsed") || event.target.closest("#toggle-my-posts-panel-button")) return;
    event.stopPropagation();
    setNotificationPanelOpen(true);
});

async function listenToPostsFeed() {
const listenerGeneration=++postsFeedGeneration;
const listenerUserId=authenticatedUser?.uid;
setFeedStatus("Đang đồng bộ bài viết…", "loading");
const migrationSnapshot=await getDoc(doc(firebaseDatabase,"system","securityMigration")).catch(()=>null);
if(!listenerUserId||authenticatedUser?.uid!==listenerUserId||listenerGeneration!==postsFeedGeneration)return;
const migrationData=migrationSnapshot?.data?.()||{};
const secureMode=migrationData.status==="complete"&&migrationData.schemaVersion===2;
const feedSources = {};
const sourceErrors = new Set();
const removeFeedCard = postId => {
    const card = postCardsMap.get(postId);
    if (card?.respawnTimer) clearTimeout(card.respawnTimer);
    card?.inlineCommentsUnsubscribe?.();
    card?.element?.remove();
    postCardsMap.delete(postId);
};
const renderFeedSources = () => {
    const merged = new Map(Object.values(feedSources).flatMap(source => [...source]));
    const dbActiveIds = new Set();
    merged.forEach((postData, postId) => {
        // Community là không gian khám phá bài của thành viên khác. Bài của
        // người đang đăng nhập chỉ được quản lý và hiển thị trong hồ sơ.
        if (postData.authorId === listenerUserId) {
            removeFeedCard(postId);
            if (!embeddedPostMode && currentActivePostId === postId) document.getElementById("close-modal-button")?.click();
            return;
        }
        const moderationStatus=postData.moderationStatus||(postData.deletedByAdmin===true?"hidden":"active");
        const canView=moderationStatus==="active"&&(!postData.privacy||postData.privacy==="public"||postData.authorId===authenticatedUser?.uid||(postData.privacy==="friends"&&currentViewerFriends.includes(postData.authorId)));
        if(!canView){
            removeFeedCard(postId);
            if(currentActivePostId===postId)document.getElementById("close-modal-button")?.click();
            return;
        }
        dbActiveIds.add(postId);
        
        createOrUpdateFloatingPost(postData, postId);
        
        if (currentActivePostId === postId) { currentActivePostData = postData; currentModalReactionData = postData.reactions || {}; updateReactionDOM(currentModalReactionData); if(modalPostShareCount)modalPostShareCount.textContent=compactBadgeCount(Number(postData.shareCount||0)); }
        const requestedId=new URLSearchParams(location.search).get("post");if(!requestedPostOpened&&requestedId===postId){requestedPostOpened=true;setTimeout(()=>openPostDetailsModal(postId,postData),100)}
    });
    
    postCardsMap.forEach((v, k) => { if (!dbActiveIds.has(k)) removeFeedCard(k); });
    if (dbActiveIds.size) setFeedStatus();
    else if (sourceErrors.size) setFeedStatus("Không thể tải bài viết. Kiểm tra Firestore Rules và indexes.", "error", { retry: true });
    else setFeedStatus("Chưa có bài viết phù hợp từ thành viên khác.", "empty");
};
const sourceQueries = secureMode ? {
    public: query(collection(firebaseDatabase, "posts"), where("privacy", "==", "public"), where("moderationStatus", "==", null), where("deletedByAdmin", "==", false)),
    audience: query(collection(firebaseDatabase, "posts"), where("privacy", "==", "friends"), where("audienceIds", "array-contains", authenticatedUser.uid), where("moderationStatus", "==", null), where("deletedByAdmin", "==", false))
} : { legacy: query(collection(firebaseDatabase,"posts"),orderBy("createdAt","desc")) };
const unsubscribers = Object.entries(sourceQueries).map(([source, sourceQuery]) => onSnapshot(sourceQuery, snapshot => {
    sourceErrors.delete(source);
    feedSources[source] = new Map(snapshot.docs.map(item => [item.id, item.data()]));
    renderFeedSources();
}, error => {
    sourceErrors.add(source);
    console.error(`Không thể tải nguồn bài viết ${source}`, error);
    renderFeedSources();
}));
stopPostsFeed = () => {
    if(listenerGeneration===postsFeedGeneration)postsFeedGeneration++;
    unsubscribers.forEach(unsubscribe => unsubscribe());
};
}

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
            ${renderInteractiveText(postData.content)}
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
    card.querySelector(".community-post-content").onclick = (e) => { e.stopPropagation(); playUiSound("open-panel"); openPostDetailsModal(postId, postData); };
    card.querySelector(".profile-link").onclick = (e) => { e.stopPropagation(); openUserProfile(postData.authorId); };
    const btn = card.querySelector(".post-menu-button"); const dd = card.querySelector(".post-dropdown-menu");
    btn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll(".post-dropdown-menu, .comment-dropdown-menu").forEach(m => m.classList.remove("show-dropdown")); dd.classList.add("show-dropdown"); };
    card.querySelector(".edit-post-button").onclick = (e) => { e.stopPropagation(); editCommunityPost(postId); };
    card.querySelector(".delete-post-button").onclick = (e) => { e.stopPropagation(); deleteCommunityPost(postId); };
}

const listPostMedia = post => post.attachedImages?.length
    ? post.attachedImages.filter(item => item?.url)
    : (post.attachedImage ? [{ url: post.attachedImage, type: post.mediaType || "image" }] : []);

function renderListComments(cardObj) {
    const section = cardObj.element.querySelector(".feed-list-comments");
    if (!section || cardObj.inlineCommentsUnsubscribe) return;
    const list = section.querySelector(".feed-list-comments-items");
    list.innerHTML = '<p class="feed-list-comments-state"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải bình luận…</p>';
    cardObj.inlineCommentsUnsubscribe = onSnapshot(query(collection(firebaseDatabase, "posts", cardObj.element.id, "comments"), orderBy("createdAt", "asc")), snapshot => {
        const comments = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        const recent = comments.slice(-20);
        list.innerHTML = recent.length ? recent.map(comment => `<article class="feed-list-comment" data-list-comment-id="${escapeHTML(comment.id)}"><img src="${escapeHTML(resolveAvatarUrl(comment.authorAvatar, { uid: comment.authorId, displayName: comment.authorDisplayName }))}" alt=""><div><button type="button" data-comment-author="${escapeHTML(comment.authorId || "")}">${escapeHTML(comment.authorDisplayName || "Thành viên VHHT")}</button><p>${renderInteractiveText(comment.content || "")}</p>${comment.attachedImage ? (comment.mediaType === "video" ? `<video src="${escapeHTML(comment.attachedImage)}" controls preload="metadata" playsinline></video>` : `<img class="feed-list-comment-media" src="${escapeHTML(comment.attachedImage)}" alt="Ảnh bình luận" loading="lazy">`) : ""}<small>${formatPostDate(comment.createdAt)}</small></div></article>`).join("") : '<p class="feed-list-comments-state">Chưa có bình luận. Hãy bắt đầu cuộc trò chuyện.</p>';
        list.querySelectorAll("[data-comment-author]").forEach(button => button.onclick = () => openUserProfile(button.dataset.commentAuthor));
        list.querySelectorAll(".feed-list-comment-media").forEach(image => bindZoomLightboxEvent(image, image.src, false));
        if (cardObj.pendingListCommentId) {
            const target = list.querySelector(`[data-list-comment-id="${CSS.escape(cardObj.pendingListCommentId)}"]`);
            if (target) { target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }); cardObj.pendingListCommentId = null; }
        }
    }, error => {
        console.warn("Không thể tải bình luận trực tiếp", error);
        list.innerHTML = '<p class="feed-list-comments-state is-error">Không thể tải bình luận lúc này.</p>';
    });
}

async function submitListComment(event, cardObj) {
    event.preventDefault();
    const form = event.currentTarget, input = form.querySelector("input"), button = form.querySelector("button[type=submit]");
    const content = input.value.trim();
    if (!content || !authenticatedUser) return;
    button.disabled = true;
    try {
        const post = cardObj.postData;
        const commentRef = await addDoc(collection(firebaseDatabase, "posts", cardObj.element.id, "comments"), {
            parentId: null, authorId: authenticatedUser.uid,
            authorDisplayName: currentUserDisplayName?.innerText || "Thành viên VHHT",
            authorAvatar: profileAvatarButton?.src || "",
            content, attachedImage: null, mediaType: null, commentReactions: {}, createdAt: serverTimestamp()
        });
        cardObj.pendingListCommentId = commentRef.id;
        await updateDoc(doc(firebaseDatabase, "posts", cardObj.element.id), { commentCount: increment(1) });
        await createActivityNotification(post.authorId, "comment", cardObj.element.id, "đã bình luận bài viết của bạn", commentRef.id);
        input.value = "";
    } catch (error) {
        console.error("Không thể gửi bình luận trực tiếp", error);
        alert("Không thể gửi bình luận. Hãy kiểm tra kết nối rồi thử lại.");
    } finally { button.disabled = false; }
}

async function setListPostReaction(cardObj, type) {
    if (!authenticatedUser) return;
    const previous = { ...(cardObj.postData.reactions || {}) };
    const reactions = { ...previous };
    if (reactions[authenticatedUser.uid] === type) delete reactions[authenticatedUser.uid];
    else reactions[authenticatedUser.uid] = type;
    cardObj.postData.reactions = reactions;
    try {
        await updateDoc(doc(firebaseDatabase, "posts", cardObj.element.id), { reactions });
        if (reactions[authenticatedUser.uid] && previous[authenticatedUser.uid] !== type) await createActivityNotification(cardObj.postData.authorId, "reaction", cardObj.element.id, `đã bày tỏ ${EMOJI_TEXT[type] || "cảm xúc"} với bài viết của bạn`);
    } catch (error) {
        cardObj.postData.reactions = previous;
        console.warn("Không thể cập nhật cảm xúc", error);
        throw error;
    }
}

function reportListPost(cardObj) {
    showCustomPrompt("Mô tả lý do bạn cho rằng bài viết này vi phạm. Nội dung sẽ chỉ được quản trị viên xem.", "", async reason => {
        const cleanReason = reason.trim();
        if (cleanReason.length < 10) { alert("Lý do báo cáo cần ít nhất 10 ký tự."); throw new Error("Lý do báo cáo quá ngắn"); }
        const postId = cardObj.element.id;
        const reportRef = doc(firebaseDatabase, "postReports", `${postId}_${authenticatedUser.uid}`);
        const existingReport = await getDoc(reportRef);
        if (existingReport.exists()) { alert(existingReport.data().status === "pending" ? "Báo cáo này đang chờ quản trị viên xử lý." : "Báo cáo này đã được quản trị viên xử lý."); return; }
        await setDoc(reportRef, {
            postId, postAuthorId: cardObj.postData.authorId, reporterId: authenticatedUser.uid,
            reason: cleanReason.slice(0, 1000), status: "pending", createdAt: serverTimestamp()
        });
        alert("Đã gửi báo cáo. Quản trị viên sẽ xem xét nội dung này.");
    }, { title: "Báo cáo bài viết", icon: "fa-flag", cancelLabel: "Hủy", confirmLabel: "Gửi báo cáo", pendingLabel: "Đang gửi…" });
}
modalPostReportButton?.addEventListener("click", event => {
    event.stopPropagation();
    modalPostOverflowMenu.hidden = true; modalPostOverflowTrigger?.setAttribute("aria-expanded", "false");
    if (!currentActivePostId || !currentActivePostData || currentActivePostData.authorId === authenticatedUser?.uid) return;
    reportListPost({ element: { id: currentActivePostId }, postData: currentActivePostData });
});
modalPostSaveButton?.addEventListener("click", async event => {
    event.stopPropagation();
    if (!currentActivePostId || modalPostSaveButton.disabled) return;
    modalPostSaveButton.disabled = true;
    try {
        await toggleSavedPost(currentActivePostId);
        playUiSound("save-submit");
    } catch (error) {
        console.error("Không thể thay đổi trạng thái lưu bài viết", error);
        alert("Chưa thể lưu bài viết. Hãy kiểm tra kết nối và Firestore Rules.");
    } finally {
        modalPostSaveButton.disabled = false;
        modalPostOverflowMenu.hidden = true;
        modalPostOverflowTrigger?.setAttribute("aria-expanded", "false");
    }
});
modalPostOverflowTrigger?.addEventListener("click", event => {
    event.stopPropagation(); const opening = modalPostOverflowMenu.hidden;
    modalPostOverflowMenu.hidden = !opening; modalPostOverflowTrigger.setAttribute("aria-expanded", String(opening));
});
document.addEventListener("click", event => { if (!event.target.closest("#modal-post-overflow")) { if (modalPostOverflowMenu) modalPostOverflowMenu.hidden = true; modalPostOverflowTrigger?.setAttribute("aria-expanded", "false"); } });
document.addEventListener("click", event => { if (!event.target.closest(".feed-list-menu-wrap")) document.querySelectorAll(".feed-list-post-menu.show").forEach(menu => menu.classList.remove("show")); });

function bindListPostActions(cardObj) {
    const card = cardObj.element, post = cardObj.postData;
    const menu = card.querySelector(".feed-list-post-menu");
    if (menu && !menu.querySelector("[data-list-save]")) {
        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.dataset.listSave = "";
        saveButton.innerHTML = '<i class="fa-regular fa-bookmark"></i><span><strong>Lưu bài viết</strong><small>Xem lại trong bộ lọc Đã lưu</small></span>';
        menu.prepend(saveButton);
        updateSaveButton(saveButton, card.id);
        saveButton.addEventListener("click", async event => {
            event.stopPropagation();
            if (saveButton.disabled) return;
            saveButton.disabled = true;
            try {
                await toggleSavedPost(card.id);
                playUiSound("save-submit");
            } catch (error) {
                console.error("Không thể thay đổi trạng thái lưu bài viết", error);
                alert("Chưa thể lưu bài viết. Hãy kiểm tra kết nối và Firestore Rules.");
            } finally {
                saveButton.disabled = false;
                menu.classList.remove("show");
            }
        });
    }
    card.querySelector("[data-list-menu]")?.addEventListener("click", event => { event.stopPropagation(); menu?.classList.toggle("show"); });
    card.querySelector("[data-list-report]")?.addEventListener("click", event => { event.stopPropagation(); menu?.classList.remove("show"); reportListPost(cardObj); });
    card.querySelectorAll("[data-list-react]").forEach(button => button.addEventListener("click", async event => {
        event.stopPropagation();
        try { await setListPostReaction(cardObj, button.dataset.listReact); } catch { alert("Chưa thể cập nhật cảm xúc."); }
    }));
    card.querySelector("[data-list-reaction-summary]")?.addEventListener("click", event => { event.stopPropagation(); openReactionDetailsTabsModal(post.reactions || {}, event.currentTarget); });
    card.querySelectorAll("[data-list-comments]").forEach(button => button.addEventListener("click", event => {
        event.stopPropagation(); const section = card.querySelector(".feed-list-comments"); section.hidden = !section.hidden; if (!section.hidden) renderListComments(cardObj);
    }));
    card.querySelector("[data-list-share]")?.addEventListener("click", event => { event.stopPropagation(); currentActivePostId = card.id; currentActivePostData = cardObj.postData; openFeedShareDialog(); });
    card.querySelector(".feed-list-comment-form")?.addEventListener("submit", event => submitListComment(event, cardObj));
    card.querySelectorAll("[data-list-media]").forEach(item => {
        const media = listPostMedia(cardObj.postData)[Number(item.dataset.listMedia)], visual = item.querySelector("img,video");
        if (media && visual && media.type !== "video") bindZoomLightboxEvent(item, media.url, false);
    });
}

function configureListPostText(card) {
    const content = card.querySelector(".feed-list-content"), text = content?.textContent?.trim() || "";
    if (!content || (text.length <= 620 && text.split(/\r?\n/).length <= 9)) return;
    content.classList.add("is-collapsed");
    const button = document.createElement("button"); button.type = "button"; button.className = "feed-list-read-more"; button.textContent = "Xem thêm"; button.setAttribute("aria-expanded", "false");
    button.onclick = event => { event.stopPropagation(); const expanded = content.classList.toggle("is-expanded"); content.classList.toggle("is-collapsed", !expanded); button.textContent = expanded ? "Thu gọn" : "Xem thêm"; button.setAttribute("aria-expanded", String(expanded)); };
    content.insertAdjacentElement("afterend", button);
}

function createOrUpdateFloatingPost(postData, postId) {
    let cardObj = postCardsMap.get(postId);
    const keepListCommentsOpen = Boolean(cardObj?.element.querySelector(".feed-list-comments:not([hidden])"));
    cardObj?.inlineCommentsUnsubscribe?.();
    if (cardObj) cardObj.inlineCommentsUnsubscribe = null;
    const totalReactions = postData.reactions ? Object.keys(postData.reactions).length : 0;
    const totalComments = postData.commentCount || 0;

    if (!cardObj) {
        const postCard = document.createElement("div"); postCard.className = "community-post-card asteroid-rock-node"; postCard.id = postId;
        communityPostFeedContainer.appendChild(postCard);

        const meteorVisual = generateAsteroidVisual();
        postCard.style.setProperty("--meteor-shape", meteorVisual.shape);
        postCard.style.setProperty("--meteor-light", meteorVisual.light);
        postCard.style.setProperty("--meteor-dark", meteorVisual.dark);
        postCard.style.setProperty("--meteor-edge", meteorVisual.edge);
        postCard.style.setProperty("--meteor-rotation", meteorVisual.rotation);
        postCard.style.setProperty("--crater-one-x", meteorVisual.craterOneX);
        postCard.style.setProperty("--crater-one-y", meteorVisual.craterOneY);
        postCard.style.setProperty("--crater-one-w", meteorVisual.craterOneW);
        postCard.style.setProperty("--crater-one-h", meteorVisual.craterOneH);
        postCard.style.setProperty("--crater-two-x", meteorVisual.craterTwoX);
        postCard.style.setProperty("--crater-two-y", meteorVisual.craterTwoY);
        postCard.style.setProperty("--crater-two-w", meteorVisual.craterTwoW);
        postCard.style.setProperty("--crater-two-h", meteorVisual.craterTwoH);
        postCard.style.setProperty("--meteor-ridge-angle", meteorVisual.ridgeAngle);

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
            turnRate: .008 + Math.random() * .012,
            headingBias: Math.atan2(config.vy,config.vx)+(Math.random()-.5)*.55,
            nextCourseChange: now + 800 + Math.random() * 3600,
            minSpeed: compact ? .22 + Math.random() * .12 : .38 + Math.random() * .2,
            maxSpeed: compact ? .72 + Math.random() * .22 : 1.02 + Math.random() * .32,
            cruiseSpeed: Math.hypot(config.vx,config.vy)
        };
        postCardsMap.set(postId, cardObj);
        initializeFloatingMovement(cardObj);
        
        postCard.tabIndex = 0;
        postCard.setAttribute("role", "button");
        postCard.setAttribute("aria-label", "Mở chi tiết bài viết");
        postCard.addEventListener("keydown", event => {
            if (feedViewMode !== "space") return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            const currentPost = postCardsMap.get(postId)?.postData;
            if (currentPost) { playUiSound("open-panel"); openPostDetailsModal(postId, currentPost); }
        });
        if (feedViewMode === "list") { postCard.tabIndex = -1; postCard.setAttribute("role", "article"); postCard.setAttribute("aria-label", "Bài viết trong bảng tin"); }
    }
    
    cardObj.postData = { ...postData, _postId: postId };
    cardObj.element.dataset.authorId = postData.authorId || "";
    applyFeedFilter();
    let mediaIndicatorHTML = "";
    if (postData.attachedImage) {
        mediaIndicatorHTML = postData.mediaType === "video" 
            ? `<div class="card-media-indicator"><i class="fa-solid fa-circle-play"></i> Xem Video</div>`
            : `<div class="card-media-indicator"><i class="fa-solid fa-image"></i> Xem Ảnh</div>`;
    }
    const listMedia = listPostMedia(postData);
    const myReaction = authenticatedUser ? postData.reactions?.[authenticatedUser.uid] : null;
    const listMediaHTML = listMedia.length ? `<div class="feed-list-media media-count-${Math.min(listMedia.length, 4)}">${listMedia.slice(0, 4).map((item, index) => `<button type="button" data-list-media="${index}" aria-label="${item.type === "video" ? "Phát video" : "Phóng to ảnh"}">${item.type === "video" ? `<video src="${escapeHTML(item.url)}" controls preload="metadata" playsinline></video>` : `<img src="${escapeHTML(item.url)}" alt="Ảnh bài viết ${index + 1}" loading="lazy" decoding="async">`}${index === 3 && listMedia.length > 4 ? `<span>+${listMedia.length - 4}</span>` : ""}</button>`).join("")}</div>` : "";

    cardObj.element.innerHTML = `
        <div class="asteroid-core-inner">
            <div class="post-author-identity"><img src="${resolvePostAvatar(postData)}" alt=""><button class="community-post-author profile-link">${escapeHTML(postData.authorDisplayName || "Phi hành gia")}</button></div>
            <div class="community-post-content">
                <span class="floating-post-excerpt">${escapeHTML(postData.content)}</span>
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
        <article class="feed-list-post">
            <header><div class="post-author-identity"><img src="${resolvePostAvatar(postData)}" alt=""><span><button class="community-post-author profile-link">${escapeHTML(postData.authorDisplayName || "Thành viên VHHT")}</button><small>${formatPostDate(postData.createdAt)} · ${postData.privacy === "friends" ? '<i class="fa-solid fa-user-group"></i> Bạn bè' : '<i class="fa-solid fa-earth-asia"></i> Công khai'}</small></span></div><div class="feed-list-menu-wrap"><button type="button" data-list-menu aria-label="Tùy chọn bài viết"><i class="fa-solid fa-ellipsis"></i></button><div class="feed-list-post-menu"><button type="button" data-list-report><i class="fa-regular fa-flag"></i><span><strong>Báo cáo bài viết</strong><small>Gửi nội dung tới quản trị viên</small></span></button></div></div></header>
            <div class="feed-list-content">${renderInteractiveText(postData.content || "")}</div>
            ${listMediaHTML}
            <div class="feed-list-summary"><button type="button" data-list-reaction-summary><span>${[...new Set(Object.values(postData.reactions || {}).map(type => EMOJI_MAP[type]).filter(Boolean))].slice(0, 3).join("") || "♡"}</span><strong>${totalReactions}</strong> cảm xúc</button><button type="button" data-list-comments><strong>${totalComments}</strong> bình luận</button><span><strong>${Number(postData.shareCount || 0)}</strong> chia sẻ</span></div>
            <div class="feed-list-actions"><div class="feed-list-react-wrap"><button type="button" class="${myReaction ? "reacted" : ""}" data-list-react="${myReaction || "like"}">${myReaction ? EMOJI_MAP[myReaction] : '<i class="fa-regular fa-thumbs-up"></i>'}<span>${myReaction ? EMOJI_TEXT[myReaction] : "Thích"}</span></button><div class="feed-list-react-picker">${Object.entries(EMOJI_MAP).map(([type, emoji]) => `<button type="button" data-list-react="${type}" title="${EMOJI_TEXT[type]}">${emoji}</button>`).join("")}</div></div><button type="button" data-list-comments><i class="fa-regular fa-comment"></i><span>Bình luận</span></button><button type="button" data-list-share><i class="fa-solid fa-paper-plane"></i><span>Chia sẻ</span></button></div>
            <section class="feed-list-comments" hidden><div class="feed-list-comments-items"></div><form class="feed-list-comment-form"><img src="${escapeHTML(profileAvatarButton?.src || DEFAULT_AVATAR)}" alt=""><label><span class="sr-only">Viết bình luận</span><input maxlength="1000" placeholder="Viết bình luận…" autocomplete="off"></label><button type="submit" aria-label="Gửi bình luận"><i class="fa-solid fa-paper-plane"></i></button></form></section>
        </article>
    `;
    requestAnimationFrame(() => {
        const bounds = cardObj.element.getBoundingClientRect();
        cardObj.w = Math.max(1, bounds.width);
        cardObj.h = Math.max(1, bounds.height);
    });
    cardObj.element.querySelector(".profile-link").onclick = (e) => { e.stopPropagation(); openUserProfile(postData.authorId); };
    cardObj.element.querySelectorAll(".profile-link").forEach(link => link.onclick = event => { event.stopPropagation(); openUserProfile(postData.authorId); });
    bindListPostActions(cardObj);
    configureListPostText(cardObj.element);
    if (keepListCommentsOpen) {
        const commentsSection = cardObj.element.querySelector(".feed-list-comments");
        if (commentsSection) { commentsSection.hidden = false; renderListComments(cardObj); }
    }
    getDoc(doc(firebaseDatabase,"users",postData.authorId)).then(s=>{const u=s.data()||{},latest=s.exists()?u:null,name=resolveDisplayName(latest||postData);cardObj.element.querySelectorAll(".post-author-identity img").forEach(img=>{setPostAvatar(img,postData,latest);img.classList.remove("active-now")});cardObj.element.querySelectorAll(".profile-link").forEach(button=>button.textContent=name);cardObj.postData._resolvedAuthorRole=u.role||postData.authorRole||"user";if(u.role==="admin")cardObj.element.querySelectorAll(".post-author-identity").forEach(node=>node.classList.add("admin-author"));applyFeedFilter()});
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
}, { passive: true });

/* ==========================================================================
   HỆ THỐNG LIGHTBOX MATRIX ZOOM
   ========================================================================== */
let lightboxScale = 1; let isDraggingMedia = false;
let mediaStartX = 0, mediaStartY = 0; let mediaOffsetX = 0, mediaOffsetY = 0;
let targetZoomElement = null;
const lightboxPointers = new Map();
let lightboxPinchDistance = 0, lightboxPinchScale = 1;

function setLightboxScale(value) {
    lightboxScale = Math.max(1, Math.min(5, value));
    if (lightboxScale === 1) { mediaOffsetX = 0; mediaOffsetY = 0; }
    applyMediaTransformMatrix();
}

function closeMediaLightbox() {
    if (!mediaLightboxContainer) return;
    mediaLightboxContainer.style.display = "none";
    lightboxZoomWrapper.innerHTML = "";
    targetZoomElement = null;
    lightboxPointers.clear();
    document.body.classList.remove("community-media-viewer-open");
}

function bindZoomLightboxEvent(element, sourceUrl, isVideo = false) {
    element.addEventListener("click", (e) => {
        e.stopPropagation(); lightboxScale = 1; mediaOffsetX = 0; mediaOffsetY = 0; lightboxZoomWrapper.innerHTML = "";
        if (isVideo) {
            targetZoomElement = document.createElement("video"); targetZoomElement.src = sourceUrl; targetZoomElement.controls = true; targetZoomElement.preload = "metadata";
        } else {
            targetZoomElement = document.createElement("img"); targetZoomElement.src = sourceUrl;
        }
        lightboxZoomWrapper.appendChild(targetZoomElement); applyMediaTransformMatrix(); mediaLightboxContainer.style.display = "flex";document.body.classList.add("community-media-viewer-open");
    });
}

function applyMediaTransformMatrix() { if (targetZoomElement) targetZoomElement.style.transform = `translate3d(${mediaOffsetX}px, ${mediaOffsetY}px,0) scale(${lightboxScale})`;if(lightboxZoomValue)lightboxZoomValue.textContent=`${Math.round(lightboxScale*100)}%`; }
if (lightboxZoomWrapper) {
    lightboxZoomWrapper.addEventListener("wheel", (e) => { e.preventDefault();e.stopPropagation();setLightboxScale(lightboxScale+(e.deltaY<0?.15:-.15)); },{passive:false});
    lightboxZoomWrapper.addEventListener("mousedown", (e) => { if (!targetZoomElement) return; isDraggingMedia = true; mediaStartX = e.clientX - mediaOffsetX; mediaStartY = e.clientY - mediaOffsetY; });
    document.addEventListener("mousemove", (e) => { if (!isDraggingMedia) return; mediaOffsetX = e.clientX - mediaStartX; mediaOffsetY = e.clientY - mediaStartY; applyMediaTransformMatrix(); });
    document.addEventListener("mouseup", () => { isDraggingMedia = false; });
    lightboxZoomWrapper.addEventListener("pointerdown",event=>{event.stopPropagation();if(event.target.closest("video"))return;lightboxPointers.set(event.pointerId,event);lightboxZoomWrapper.setPointerCapture?.(event.pointerId);if(lightboxPointers.size===1){mediaStartX=event.clientX-mediaOffsetX;mediaStartY=event.clientY-mediaOffsetY}else if(lightboxPointers.size===2){const [a,b]=[...lightboxPointers.values()];lightboxPinchDistance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);lightboxPinchScale=lightboxScale}});
    lightboxZoomWrapper.addEventListener("pointermove",event=>{if(!lightboxPointers.has(event.pointerId))return;event.preventDefault();lightboxPointers.set(event.pointerId,event);if(lightboxPointers.size===2){const [a,b]=[...lightboxPointers.values()],distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);setLightboxScale(lightboxPinchScale*(distance/(lightboxPinchDistance||distance)))}else if(lightboxScale>1){mediaOffsetX=event.clientX-mediaStartX;mediaOffsetY=event.clientY-mediaStartY;applyMediaTransformMatrix()}},{passive:false});
    const releasePointer=event=>lightboxPointers.delete(event.pointerId);
    lightboxZoomWrapper.addEventListener("pointerup",releasePointer);lightboxZoomWrapper.addEventListener("pointercancel",releasePointer);
}
lightboxZoomIn?.addEventListener("click",event=>{event.stopPropagation();setLightboxScale(lightboxScale+.25)});
lightboxZoomOut?.addEventListener("click",event=>{event.stopPropagation();setLightboxScale(lightboxScale-.25)});
lightboxZoomReset?.addEventListener("click",event=>{event.stopPropagation();mediaOffsetX=mediaOffsetY=0;setLightboxScale(1)});
if (closeLightboxBtn) closeLightboxBtn.onclick = (e) => { e.stopPropagation();closeMediaLightbox(); };
mediaLightboxContainer?.addEventListener("click",event=>{if(event.target===mediaLightboxContainer)closeMediaLightbox()});
mediaLightboxContainer?.addEventListener("touchmove",event=>event.preventDefault(),{passive:false});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&targetZoomElement)closeMediaLightbox()});

/* ==========================================================================
   CHAT ROOM DISCUSSION & ĐIỀU HƯỚNG BÌNH LUẬN THÔNG MINH
   ========================================================================== */
let commentsUnsubscribe = null;

function configureExpandableModalPostText(content) {
    if (!modalPostText) return;
    const normalizedContent = String(content || "").trim();
    modalPostText.innerHTML = renderInteractiveText(normalizedContent);
    modalPostText.classList.remove("is-collapsible", "is-expanded");
    modalPostText.parentElement?.querySelector(".modal-post-read-more")?.remove();

    const shouldCollapse = normalizedContent.length > 220 || normalizedContent.split(/\r?\n/).length > 4;
    if (!shouldCollapse) return;

    modalPostText.classList.add("is-collapsible");
    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "modal-post-read-more";
    toggleButton.textContent = "Xem thêm";
    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.addEventListener("click", event => {
        event.stopPropagation();
        const expanded = modalPostText.classList.toggle("is-expanded");
        toggleButton.textContent = expanded ? "Thu gọn" : "Xem thêm";
        toggleButton.setAttribute("aria-expanded", String(expanded));
        playUiSound("click-neutral");
    });
    modalPostText.insertAdjacentElement("afterend", toggleButton);
}

async function openPostDetailsModal(postId, postData) {
    postDetailReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const sourceMeteor = postCardsMap.get(postId)?.element;
    const sourceRect = sourceMeteor?.getBoundingClientRect();
    if (postDetailsModal && sourceRect) {
        const sourceX = sourceRect.left + sourceRect.width / 2;
        const sourceY = sourceRect.top + sourceRect.height / 2;
        postDetailsModal.style.setProperty("--meteor-origin-x", `${sourceX - window.innerWidth / 2}px`);
        postDetailsModal.style.setProperty("--meteor-origin-y", `${sourceY - window.innerHeight / 2}px`);
        postDetailsModal.style.setProperty("--meteor-origin-scale", String(Math.max(.16, Math.min(.34, sourceRect.width / 1180))));
        postDetailsModal.classList.remove("meteor-detail-arriving");
        void postDetailsModal.offsetWidth;
        postDetailsModal.classList.add("meteor-detail-arriving");
        window.setTimeout(() => postDetailsModal?.classList.remove("meteor-detail-arriving"), 720);
    }
    currentActivePostId = postId; currentActivePostData = postData; currentModalReactionData = postData.reactions || {}; currentSelectedReplyObj = null; replyingToBanner.style.display = "none";
    updateSaveButton(modalPostSaveButton, postId);
    if (modalPostOverflow) modalPostOverflow.hidden = postData.authorId === authenticatedUser?.uid;
    if (modalCommentCount) modalCommentCount.textContent = compactBadgeCount(Number(postData.commentCount || 0));
    setMobileDetailView(new URLSearchParams(location.search).get("comment") ? "comments" : "post");
    communityPostFeedContainer.classList.add("disable-space-interaction");
    document.querySelectorAll(".community-post-card").forEach(c => c.classList.add("blurred-post"));

    modalPostAuthor.innerText = postData.authorDisplayName || "User";
    setPostAvatar(modalPostAvatar, postData);
    modalPostAuthor.onclick = () => openUserProfile(postData.authorId);
    modalPostAvatar.onclick = () => openUserProfile(postData.authorId);
    modalPostAuthor.closest(".modal-author-header")?.classList.remove("admin-author");getDoc(doc(firebaseDatabase,"users",postData.authorId)).then(s=>{const u=s.data()||{};modalPostAuthor.textContent=resolveDisplayName(s.exists()?u:postData);setPostAvatar(modalPostAvatar,postData,s.exists()?u:null);if(u.role==="admin")modalPostAuthor.closest(".modal-author-header")?.classList.add("admin-author")});
    configureExpandableModalPostText(postData.content || "");
    modalPostTime.innerText = formatPostDate(postData.createdAt);
    const isPostOwner = authenticatedUser?.uid === postData.authorId;
    if (modalPostShareButton) {
        modalPostShareButton.classList.toggle("owner-share-summary", isPostOwner);
        modalPostShareButton.title = isPostOwner ? "Xem người đã chia sẻ bài viết" : "Chia sẻ bài viết";
        modalPostShareButton.setAttribute("aria-label", modalPostShareButton.title);
        modalPostShareButton.onclick = isPostOwner ? openPostSharersDialog : openFeedShareDialog;
    }
    if (modalPostShareCount) modalPostShareCount.textContent = compactBadgeCount(Number(postData.shareCount || 0));
    getDocs(collection(firebaseDatabase,"posts",postId,"shares")).then(snapshot=>{
        if(currentActivePostId!==postId)return;
        const verifiedCount=Math.max(Number(postData.shareCount||0),snapshot.size);
        currentActivePostData.shareCount=verifiedCount;
        if(modalPostShareCount)modalPostShareCount.textContent=compactBadgeCount(verifiedCount);
    }).catch(error=>console.warn("Không thể đối chiếu lượt chia sẻ",error));
    modalPostImageContainer.innerHTML = "";
    const media=postData.attachedImages?.length?postData.attachedImages:(postData.attachedImage?[{url:postData.attachedImage,type:postData.mediaType}]:[]);
    modalPostImageContainer.classList.toggle("multi-media",media.length>1);
    postDetailsModal?.classList.toggle("has-post-media", media.length > 0);
    if (postDetailsModal) postDetailsModal.dataset.mediaCount = String(media.length);
    if (media.length) {
        const visibleMedia=media.slice(0,4);
        modalPostImageContainer.innerHTML=visibleMedia.map((item,index)=>{const safeUrl=escapeHTML(item.url);return `<div class="modal-media-tile">${item.type==="video"?`<video src="${safeUrl}" class="shared-media-renderable" controls playsinline></video>`:`<img src="${safeUrl}" class="shared-media-renderable" alt="Ảnh bài viết ${index+1}">`}${index===3&&media.length>4?`<span class="modal-media-more">+${media.length-4}</span>`:""}</div>`}).join("");
        modalPostImageContainer.querySelectorAll(".shared-media-renderable").forEach((element,index)=>bindZoomLightboxEvent(element,media[index].url,media[index].type==="video"));
    }

    updateReactionDOM(currentModalReactionData);
    if (commentsUnsubscribe) commentsUnsubscribe();
    const qComments = query(collection(firebaseDatabase, "posts", postId, "comments"), orderBy("createdAt", "asc"));
    commentsUnsubscribe = onSnapshot(qComments, (snap) => {
        const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        renderMessengerChatTree(arr);
        if (modalCommentCount) modalCommentCount.textContent = compactBadgeCount(arr.length);
        const requestedCommentId=new URLSearchParams(location.search).get("comment");if(requestedCommentId)setTimeout(()=>{const target=document.getElementById(`comment-node-id-${requestedCommentId}`);if(target){target.scrollIntoView({behavior:"smooth",block:"center"});target.classList.add("comment-flash-highlight")}},120);
        updateDoc(doc(firebaseDatabase, "posts", postId), { commentCount: arr.length }).catch(() => {});
    }, error => {
        console.warn("Không thể tải bình luận", error);
        postDetailsModal?.classList.remove("has-comments");
        modalCommentsTree.innerHTML = `<div class="modal-comments-empty is-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><strong>Chưa tải được thảo luận</strong><span>Kiểm tra kết nối rồi đóng và mở lại bài viết.</span></div>`;
    });
    postDetailsOverlay.style.display = "flex";
    postDetailsOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("post-detail-open");
    syncComposerWithVisualViewport();
    setTimeout(() => {
        postDetailsOverlay.classList.add("active");
        closeModalButton?.focus({ preventScroll: true });
    }, 15);
}

function renderMessengerChatTree(allComments) {
    closeFloatingCommentMenus();
    modalCommentsTree.innerHTML = "";
    postDetailsModal?.classList.toggle("has-comments", allComments.length > 0);
    if (!allComments.length) {
        modalCommentsTree.innerHTML = `<div class="modal-comments-empty"><i class="fa-regular fa-comments" aria-hidden="true"></i><strong>Chưa có bình luận</strong><span>Hãy mở đầu cuộc thảo luận bằng một phản hồi hữu ích.</span></div>`;
        return;
    }
    const commentsMap = new Map();
    allComments.forEach(c => commentsMap.set(c.id, c));

    allComments.forEach(commentObj => {
        const wrapperNode = document.createElement("div");
        wrapperNode.id = `comment-node-id-${commentObj.id}`;
        const isMe = authenticatedUser && (commentObj.authorId === authenticatedUser.uid);
        wrapperNode.className = `comment-wrapper-node ${isMe ? 'align-right' : 'align-left'} ${commentObj.parentId?'is-reply':''}`;

        const isPostAuthor = currentActivePostData && (commentObj.authorId === currentActivePostData.authorId);
        const authorBadgeHTML = isPostAuthor ? `<span class="author-badge">Tác giả</span>` : "";
        const initialAuthorName = commentObj.authorDisplayName || commentObj.authorName || "Thành viên VHHT";
        const initialAuthorAvatar = resolveAvatarUrl(commentObj.authorAvatar || commentObj.photoURL, { uid: commentObj.authorId, displayName: initialAuthorName });

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
            summaryBadgeHTML = `<button type="button" class="comment-summary-react-badge" aria-label="Xem ${uidsReacted.length} người đã bày tỏ cảm xúc" aria-haspopup="dialog" aria-controls="reaction-details-overlay" aria-expanded="false" title="Xem người đã bày tỏ cảm xúc"><span>${Array.from(uniqueEmojis).join("")}</span><span>${uidsReacted.length}</span></button>`;
        }

        let commentManagementMenuHTML = "";
        if (isMe) {
            commentManagementMenuHTML = `
                <div class="comment-menu-relative">
                    <button class="comment-menu-trigger-btn" type="button" aria-label="Tùy chọn bình luận" aria-haspopup="menu" aria-expanded="false"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button>
                    <div class="comment-dropdown-menu" id="comment-menu-dropdown-${commentObj.id}">
                        <button class="edit-comment-btn" type="button" role="menuitem"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i><span>Sửa bình luận</span></button>
                        <button class="delete-comment-btn" type="button" role="menuitem"><i class="fa-regular fa-trash-can" aria-hidden="true"></i><span>Xóa bình luận</span></button>
                    </div>
                </div>`;
        }

        wrapperNode.innerHTML = `
            ${replyContextHTML}
            <div class="comment-body-row">
            <img class="comment-author-avatar" data-comment-author="${commentObj.authorId}" src="${escapeHTML(initialAuthorAvatar)}" alt="Ảnh đại diện của ${escapeHTML(initialAuthorName)}">
            <div class="comment-content-stack">
            <div class="comment-main-box">
                ${commentManagementMenuHTML}
                <div class="comment-user-row">
                    <span class="comment-user">${escapeHTML(commentObj.authorDisplayName)}</span>
                    ${authorBadgeHTML}
                </div>
                <div class="comment-text">${renderInteractiveText(commentObj.content)}</div>
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
                            <span class="comment-react-emoji ${commentReactsMap[authenticatedUser?.uid] === 'like' ? 'is-selected' : ''}" data-type="like" data-cid="${commentObj.id}">👍</span>
                            <span class="comment-react-emoji ${commentReactsMap[authenticatedUser?.uid] === 'love' ? 'is-selected' : ''}" data-type="love" data-cid="${commentObj.id}">❤️</span>
                            <span class="comment-react-emoji ${commentReactsMap[authenticatedUser?.uid] === 'haha' ? 'is-selected' : ''}" data-type="haha" data-cid="${commentObj.id}">😂</span>
                            <span class="comment-react-emoji ${commentReactsMap[authenticatedUser?.uid] === 'wow' ? 'is-selected' : ''}" data-type="wow" data-cid="${commentObj.id}">😮</span>
                            <span class="comment-react-emoji ${commentReactsMap[authenticatedUser?.uid] === 'sad' ? 'is-selected' : ''}" data-type="sad" data-cid="${commentObj.id}">😡</span>
                            <span class="comment-react-emoji ${commentReactsMap[authenticatedUser?.uid] === 'sorry' ? 'is-selected' : ''}" data-type="sorry" data-cid="${commentObj.id}">😢</span>
                        </div>
                    </div>
                </div>
            </div></div></div>`;

        modalCommentsTree.appendChild(wrapperNode);
        getDoc(doc(firebaseDatabase, "users", commentObj.authorId)).then(userSnap => { const avatar = wrapperNode.querySelector(".comment-author-avatar"),name=wrapperNode.querySelector(".comment-user"); if (userSnap.exists()){const data=userSnap.data(),displayName=resolveDisplayName(data);if(avatar){avatar.src=resolveAvatarUrl(data.photoURL||data.profileImage,{uid:commentObj.authorId,displayName});avatar.alt=`Ảnh đại diện của ${displayName}`;if(data.showActivityStatus!==false&&data.lastActiveAt?.seconds>Date.now()/1000-120)avatar.classList.add("active-now")}if(name)name.textContent=displayName;if(data.role==="admin")wrapperNode.querySelector(".comment-user-row")?.classList.add("admin-author")}});
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
            trigger.onclick = (e) => {
                e.stopPropagation();
                const wasOpen = dropdown.classList.contains("show-dropdown");
                closeFloatingCommentMenus();
                if (wasOpen) return;
                dropdown._commentMenuHome = wrapperNode.querySelector(".comment-menu-relative");
                document.body.appendChild(dropdown);
                dropdown.classList.add("show-dropdown", "comment-menu-portal");
                trigger.setAttribute("aria-expanded", "true");
                dropdown._commentMenuTrigger = trigger;
                const triggerRect = trigger.getBoundingClientRect();
                const menuRect = dropdown.getBoundingClientRect();
                const viewportGap = 10;
                const left = Math.min(window.innerWidth - menuRect.width - viewportGap, Math.max(viewportGap, triggerRect.right - menuRect.width));
                const hasRoomBelow = triggerRect.bottom + menuRect.height + viewportGap <= window.innerHeight;
                const top = hasRoomBelow ? triggerRect.bottom + 7 : Math.max(viewportGap, triggerRect.top - menuRect.height - 7);
                dropdown.style.left = `${left}px`;
                dropdown.style.top = `${top}px`;
            };
            wrapperNode.querySelector(".edit-comment-btn").onclick = (e) => {
                e.stopPropagation();
                closeFloatingCommentMenus();
                editTargetComment(commentObj.id, commentObj.content);
            };
            wrapperNode.querySelector(".delete-comment-btn").onclick = (e) => {
                e.stopPropagation();
                closeFloatingCommentMenus();
                deleteTargetComment(commentObj.id);
            };
        }

        wrapperNode.querySelector(`#reply-btn-${commentObj.id}`).onclick = (e) => {
            e.stopPropagation(); currentSelectedReplyObj = { id: commentObj.id, authorDisplayName: commentObj.authorDisplayName };
            replyingToText.innerText = `Đang phản hồi @${commentObj.authorDisplayName}...`; replyingToBanner.style.display = "flex"; modalCommentInput.focus();
        };

        wrapperNode.querySelector(`#react-comment-btn-${commentObj.id}`).onclick = (e) => {
            e.stopPropagation();
            if (!authenticatedUser || !currentActivePostId) return;
            toggleReactionPicker(e.currentTarget.closest(".comment-react-node-container"));
        };

        const commentReactionSummary = wrapperNode.querySelector(".comment-summary-react-badge");
        if (commentReactionSummary) {
            commentReactionSummary.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                void openReactionDetailsTabsModal(commentReactsMap, commentReactionSummary);
            };
        }

        wrapperNode.querySelectorAll(".comment-react-emoji").forEach(emojiBtn => {
            emojiBtn.onclick = async (e) => {
                e.stopPropagation();
                emojiBtn.closest(".comment-react-node-container")?.classList.remove("picker-open");
                if (!authenticatedUser || !currentActivePostId) return;
                const type = emojiBtn.getAttribute("data-type"); const commentRef = doc(firebaseDatabase, "posts", currentActivePostId, "comments", commentObj.id);
                const freshReactsMap = { ...(commentObj.commentReactions || {}) };
                if (type === "clear" || freshReactsMap[authenticatedUser.uid] === type) delete freshReactsMap[authenticatedUser.uid];
                else freshReactsMap[authenticatedUser.uid] = type;
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
        syncCommentSubmitState();
    });
}
if (removeCommentImgBtn) { removeCommentImgBtn.onclick = (e) => { e.stopPropagation(); selectedCommentMediaFile = null; if(commentPreviewObjectUrl)URL.revokeObjectURL(commentPreviewObjectUrl);commentPreviewObjectUrl=null;commentImageInput.value = ""; commentImagePreviewBox.style.display = "none";commentPreviewRenderZone.replaceChildren(); syncCommentSubmitState(); }; }

submitCommentButton.onclick = executeSubmitComment;
modalCommentInput.onkeydown = (e) => { if (e.key === "Enter") executeSubmitComment(); };
modalCommentInput.addEventListener("input", syncCommentSubmitState);

function syncCommentSubmitState() {
    const canSubmit = Boolean(modalCommentInput?.value.trim() || selectedCommentMediaFile);
    submitCommentButton.disabled = !canSubmit;
    submitCommentButton.title = canSubmit ? "Gửi phản hồi" : "Nhập nội dung để gửi phản hồi";
}

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
    finally{syncCommentSubmitState()}
}

cancelReplyButton.onclick = (e) => { e.stopPropagation(); currentSelectedReplyObj = null; replyingToBanner.style.display = "none"; };

function editTargetComment(commentId, currentContent) {
    showCustomPrompt("Cập nhật nội dung bình luận bên dưới.", currentContent, async (freshTxt) => {
        if (!freshTxt.trim() || !currentActivePostId) return;
        await updateDoc(doc(firebaseDatabase, "posts", currentActivePostId, "comments", commentId), { content: freshTxt.trim() });
    }, {
        title: "Chỉnh sửa bình luận",
        icon: "fa-pen-to-square",
        cancelLabel: "Hủy",
        confirmLabel: "Lưu thay đổi",
        pendingLabel: "Đang lưu..."
    });
}

function deleteTargetComment(commentId) {
    showCustomConfirm("Bình luận này sẽ bị xóa và không thể khôi phục. Bạn có muốn tiếp tục?", async () => {
        if (!currentActivePostId) return;
        await deleteDoc(doc(firebaseDatabase, "posts", currentActivePostId, "comments", commentId));
    }, {
        title: "Xóa bình luận?",
        icon: "fa-trash-can",
        variant: "danger",
        cancelLabel: "Hủy",
        confirmLabel: "Xóa bình luận",
        pendingLabel: "Đang xóa..."
    });
}

/* ==========================================================================
   YÊU CẦU 2: BỘ ĐIỀU HÀNH REACTION BÀI VIẾT GỐC CHUẨN FACEBOOK + NÚT X XÓA
   ========================================================================== */
function toggleReactionPicker(container) {
    if (!container) return;
    const willOpen = !container.classList.contains("picker-open");
    document.querySelectorAll(".reaction-container.picker-open,.comment-react-node-container.picker-open").forEach(item => item.classList.remove("picker-open"));
    if (!willOpen) return;
    container.classList.add("picker-open");
    const popover = container.querySelector(".reaction-popover,.comment-reaction-popover"), rect = container.getBoundingClientRect();
    if (!popover) return;
    if (popover.classList.contains("comment-reaction-popover")) {
        if (matchMedia("(max-width: 760px), (pointer: coarse)").matches) {
            container.classList.remove("picker-below");
            popover.classList.remove("viewport-contained-picker");
            // Anchor above the exact reaction button and shift only enough to
            // keep the complete picker inside the phone viewport.
            const pickerWidth = Math.min(316, window.innerWidth - 20);
            const centre = rect.left + rect.width / 2;
            const safeCentre = Math.min(Math.max(centre, 10 + pickerWidth / 2), window.innerWidth - 10 - pickerWidth / 2);
            const localCentre = safeCentre - rect.left;
            popover.style.setProperty("left", `${Math.round(localCentre)}px`, "important");
            popover.style.setProperty("right", "auto", "important");
            popover.style.setProperty("top", "auto", "important");
            popover.style.setProperty("bottom", "calc(100% + 8px)", "important");
            popover.style.setProperty("width", `${pickerWidth}px`, "important");
            popover.style.setProperty("transform", "translateX(-50%)", "important");
            return;
        }
        popover.classList.remove("viewport-contained-picker");
        const scrollRect = modalCommentsTree?.getBoundingClientRect();
        container.classList.toggle("picker-below", Boolean(scrollRect && rect.top - 56 < scrollRect.top));
        popover.style.removeProperty("left"); popover.style.removeProperty("top");
        return;
    }
    if (popover.classList.contains("reaction-popover")) {
        ["left", "right", "top", "bottom", "width", "transform"].forEach(property => popover.style.removeProperty(property));
        return;
    }
    const pickerWidth = popover.classList.contains("comment-reaction-popover") ? 268 : 286;
    const left = Math.min(Math.max(10, rect.left), window.innerWidth - pickerWidth - 10);
    const pickerHeight = 50;
    const top = rect.top > pickerHeight + 12 ? rect.top - pickerHeight - 8 : rect.bottom + 8;
    const modalRect = postDetailsModal?.getBoundingClientRect() || { left: 0, top: 0 };
    popover.style.left = `${Math.round(left - modalRect.left)}px`;
    popover.style.top = `${Math.round(top - modalRect.top)}px`;
}

function updateReactionDOM(reactionsMap) {
    const listUIDs = Object.keys(reactionsMap);
    summaryReactionCount.innerText = String(listUIDs.length);
    if (modalReactionSummary) {
        const label = `${listUIDs.length} lượt cảm xúc. Nhấn để xem danh sách`;
        modalReactionSummary.setAttribute("aria-label", label);
        modalReactionSummary.title = label;
    }
    const uniqueEmojis = new Set();
    listUIDs.forEach(uid => { if (EMOJI_MAP[reactionsMap[uid]]) uniqueEmojis.add(EMOJI_MAP[reactionsMap[uid]]); });
    summaryActiveEmojis.innerHTML = Array.from(uniqueEmojis).join("");
    const selectedType = authenticatedUser ? reactionsMap[authenticatedUser.uid] : null;
    document.querySelectorAll(".react-emoji[data-type]").forEach(button => {
        const selected = button.dataset.type === selectedType;
        button.classList.toggle("is-current", selected);
        button.setAttribute("aria-pressed", String(selected));
    });

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
        if (clearMyPostReactionBtn) clearMyPostReactionBtn.style.display = "none";
    } else {
        // Trạng thái mặc định: Tối màu, mờ nhẹ, không bật sáng khi chưa bấm
        currentUserReactionIcon.innerText = "👍"; reactionBtnText.innerText = "Thích";
        modalLikeButton.style.color = "#64748b"; // Màu slate-500 xám tối sang trọng
        modalLikeButton.style.opacity = "0.6";
        if (clearMyPostReactionBtn) clearMyPostReactionBtn.style.display = "none";
    }
}

modalReactionSummary?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void openReactionDetailsTabsModal(currentModalReactionData, modalReactionSummary);
});

async function openReactionDetailsTabsModal(reactionsMap = currentModalReactionData, trigger = modalReactionSummary) {
    if (!reactionDetailsOverlay || !reactUsersList || !reactTabsHeader) return;
    currentReactionDirectoryData = reactionsMap && typeof reactionsMap === "object" ? { ...reactionsMap } : {};
    currentReactionDirectoryTrigger = trigger || null;
    reactUsersList.innerHTML = '<div class="reaction-list-empty">Đang tải danh sách cảm xúc...</div>';
    reactionDetailsOverlay.hidden = false;
    reactionDetailsOverlay.classList.add("is-open");
    reactionDetailsOverlay.setAttribute("aria-hidden", "false");
    currentReactionDirectoryTrigger?.setAttribute("aria-expanded", "true");
    document.body.classList.add("reaction-directory-open");
    const reactionData = currentReactionDirectoryData;
    const uids = Object.keys(reactionData);
    const counts = { all: uids.length, like: 0, love: 0, haha: 0, wow: 0, sad: 0, sorry: 0 };
    uids.forEach(uid => { const type = reactionData[uid]; if (counts[type] !== undefined) counts[type]++; });

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
    reactUsersList.innerHTML = ""; const uids = Object.keys(currentReactionDirectoryData);
    const filteredUIDs = uids.filter(uid => tabType === "all" ? true : currentReactionDirectoryData[uid] === tabType);
    if (filteredUIDs.length === 0) { reactUsersList.innerHTML = '<div class="reaction-list-empty">Chưa có ai chọn cảm xúc này.</div>'; return; }
    for (const uid of filteredUIDs) {
        let profile = { id: uid, displayName: "Tài khoản không còn tồn tại" };
        try {
            const userSnapshot = await getDoc(doc(firebaseDatabase, "users", uid));
            if (userSnapshot.exists()) profile = { id: uid, ...userSnapshot.data() };
        } catch (error) {
            console.warn("Không thể tải người đã bày tỏ cảm xúc", uid, error);
        }
        const displayName = resolveDisplayName(profile);
        const avatar = resolveAvatarUrl(profile.photoURL || profile.profileImage, { uid, displayName });
        const reactionType = currentReactionDirectoryData[uid];
        const reactionLabels = { like: "Thích", love: "Yêu thích", haha: "Haha", wow: "Wow", sad: "Phẫn nộ", sorry: "Buồn" };
        const row = document.createElement("button");
        row.type = "button";
        row.className = "react-user-row-item";
        row.innerHTML = `<img class="react-user-row-avatar" src="${escapeHTML(avatar)}" alt=""><span class="react-user-row-copy"><strong>${escapeHTML(displayName)}</strong><small>${reactionLabels[reactionType] || "Đã bày tỏ cảm xúc"}</small></span><span class="emoji-sign">${EMOJI_MAP[reactionType] || "👍"}</span>`;
        row.onclick = () => openUserProfile(uid);
        reactUsersList.appendChild(row);
    }
}

function closeReactionDetailsModal() {
    if (!reactionDetailsOverlay) return;
    reactionDetailsOverlay.classList.remove("is-open");
    reactionDetailsOverlay.hidden = true;
    reactionDetailsOverlay.setAttribute("aria-hidden", "true");
    currentReactionDirectoryTrigger?.setAttribute("aria-expanded", "false");
    currentReactionDirectoryTrigger = null;
    currentReactionDirectoryData = {};
    document.body.classList.remove("reaction-directory-open");
}

if (closeReactModalBtn) closeReactModalBtn.onclick = (e) => { e.stopPropagation(); closeReactionDetailsModal(); };
if (reactionDetailsOverlay) reactionDetailsOverlay.onclick = (e) => { if (e.target === reactionDetailsOverlay) closeReactionDetailsModal(); };
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && reactionDetailsOverlay?.classList.contains("is-open")) closeReactionDetailsModal();
});

// SỰ KIỆN CLICK TRỰC TIẾP NÚT LIKE: Bấm vào mới kích hoạt sáng trạng thái Like xanh lục
modalLikeButton.onclick = async (e) => {
    e.stopPropagation();
    toggleReactionPicker(modalLikeButton.closest(".reaction-container"));
};

async function clearPostReactionLogic() {
    if (!authenticatedUser || !currentActivePostId) return;
    const postRef = doc(firebaseDatabase, "posts", currentActivePostId);
    delete currentModalReactionData[authenticatedUser.uid];
    await updateDoc(postRef, { reactions: currentModalReactionData });
}

// BẤM DẤU X ĐỎ: Xóa bỏ react hiện tại đưa nút về trạng thái tối ban đầu
if (clearMyPostReactionBtn) clearMyPostReactionBtn.onclick = (e) => { e.stopPropagation(); clearPostReactionLogic(); };

// CHỌN CẢM XÚC TRONG KHO POPOVER HOVER (Love, Haha, Wow...)
document.querySelectorAll(".react-emoji").forEach(emojiEl => {
    emojiEl.onclick = async (e) => {
        e.stopPropagation();
        emojiEl.closest(".reaction-container")?.classList.remove("picker-open");
        const type = emojiEl.getAttribute("data-type");
        if (!authenticatedUser || !currentActivePostId) return;
        const previous = { ...currentModalReactionData };
        const nextType = type === "clear" || previous[authenticatedUser.uid] === type ? null : type;
        if (nextType) currentModalReactionData[authenticatedUser.uid] = nextType;
        else delete currentModalReactionData[authenticatedUser.uid];
        updateReactionDOM(currentModalReactionData);
        try {
            await updateDoc(doc(firebaseDatabase, "posts", currentActivePostId), { reactions: currentModalReactionData });
            if(nextType && previous[authenticatedUser.uid] !== nextType) await createActivityNotification(currentActivePostData?.authorId,"reaction",currentActivePostId,`đã bày tỏ ${EMOJI_TEXT[nextType]||"cảm xúc"} với bài viết của bạn`);
        } catch (error) {
            currentModalReactionData = previous;
            updateReactionDOM(currentModalReactionData);
            console.warn("Không thể cập nhật cảm xúc", error);
        }
    };
});

function closePostDetailsModal() {
    if(embeddedPostMode){parent.postMessage({type:"vhht-close-embedded-post"},location.origin);return}
    postDetailsOverlay.classList.remove("active");
    postDetailsOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("post-detail-open");
    if (modalPostOverflowMenu) modalPostOverflowMenu.hidden = true;
    modalPostOverflowTrigger?.setAttribute("aria-expanded", "false");
    setTimeout(() => {
        postDetailsOverlay.style.display = "none"; currentActivePostId = null; currentActivePostData = null; if (commentsUnsubscribe) commentsUnsubscribe(); commentsUnsubscribe = null;
        communityPostFeedContainer.classList.remove("disable-space-interaction");
        document.querySelectorAll(".community-post-card").forEach(c => c.classList.remove("blurred-post"));
        if (postDetailReturnFocus?.isConnected) postDetailReturnFocus.focus({ preventScroll: true });
        postDetailReturnFocus = null;
    }, 300);
}
closeModalButton.onclick = (e) => { e.stopPropagation(); closePostDetailsModal(); };
postDetailsOverlay.onclick = (e) => { if (e.target === postDetailsOverlay) closePostDetailsModal(); };

postDetailsModal?.addEventListener("keydown", event => {
    if (!postDetailsOverlay.classList.contains("active")) return;
    if (event.key === "Escape") {
        if (modalPostOverflowMenu && !modalPostOverflowMenu.hidden) {
            modalPostOverflowMenu.hidden = true;
            modalPostOverflowTrigger?.setAttribute("aria-expanded", "false");
            modalPostOverflowTrigger?.focus();
        } else if (!targetZoomElement && !reactionDetailsOverlay?.classList.contains("is-open")) {
            closePostDetailsModal();
        }
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...postDetailsModal.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), [href], [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
});

document.addEventListener("click", event => {
    closeFloatingCommentMenus();
    if (!event.target.closest(".reaction-container,.comment-react-node-container")) document.querySelectorAll(".reaction-container.picker-open,.comment-react-node-container.picker-open").forEach(item => item.classList.remove("picker-open"));
});

function closeFloatingCommentMenus() {
    document.querySelectorAll(".post-dropdown-menu").forEach(menu => menu.classList.remove("show-dropdown"));
    document.querySelectorAll(".comment-dropdown-menu").forEach(menu => {
        menu.classList.remove("show-dropdown", "comment-menu-portal");
        menu.style.removeProperty("left");
        menu.style.removeProperty("top");
        if (menu._commentMenuTrigger) menu._commentMenuTrigger.setAttribute("aria-expanded", "false");
        if (menu._commentMenuHome && menu.parentNode !== menu._commentMenuHome) menu._commentMenuHome.appendChild(menu);
        menu._commentMenuTrigger = null;
    });
}

window.addEventListener("resize", closeFloatingCommentMenus, { passive: true });
modalCommentsTree?.addEventListener("scroll", closeFloatingCommentMenus, { passive: true });

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
    profileBtn.onclick = async () => {
        const adminMode=currentUserRole==="admin";sessionStorage.setItem("vhht_profile_return_source",adminMode?"community-admin":"community");const source=adminMode?"?from=community-admin":"";
        await navigateAfterSound(`./profile-user/user-profile.html${source}`, "click-secondary");
    };
}
document.getElementById("community-settings-button")?.addEventListener("click",async()=>{
    sessionStorage.setItem("vhht_profile_return_source", "community");
    await navigateAfterSound("./profile-user/user-profile.html?settings=index", "open-panel");
});
function setAccountMenuOpen(open) {
    if (!accountMenu || !accountTrigger) return;
    accountMenu.hidden = !open;
    accountTrigger.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("community-account-menu-open", open);
}
accountTrigger?.addEventListener("click", event => {
    event.stopPropagation();
    const shouldOpen = Boolean(accountMenu?.hidden);
    if (shouldOpen) setNotificationPanelOpen(false);
    setAccountMenuOpen(shouldOpen);
});
accountMenu?.addEventListener("click", event => event.stopPropagation());
document.addEventListener("pointerdown", event => { if (!event.target.closest(".community-account")) setAccountMenuOpen(false); });
document.addEventListener("keydown", event => { if (event.key === "Escape") { setAccountMenuOpen(false); accountTrigger?.focus(); } });

function installAdminModeButton(){if(document.getElementById("community-admin-mode-button"))return;const button=document.createElement("button");button.id="community-admin-mode-button";button.className="community-admin-mode-button";button.title="Mở Trung tâm quản trị";button.innerHTML='<span class="admin-mode-icon"><i class="fa-solid fa-shield-halved"></i></span><span><strong>Command Center</strong><small>Chế độ quản trị</small></span><i class="fa-solid fa-arrow-right"></i>';button.onclick=()=>location.href="../admin/admin-dashboard-page.html";document.querySelector(".community-logo")?.insertAdjacentElement("afterend",button)}
/* ==========================================================================
   XỬ LÝ ĐĂNG XUẤT KHỎI HỆ THỐNG VŨ TRỤ
   ========================================================================== */
if (communityLogoutButton) {
    communityLogoutButton.addEventListener("click", (e) => {
        e.stopPropagation();
        setAccountMenuOpen(false);
        showCustomConfirm(
            "Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng tài khoản trên thiết bị này.",
            async () => {
                playUiSound("warning");
                try {
                    await firebaseAuthentication.signOut();
                    window.location.href = "../authentication/login-page.html";
                } catch (error) {
                    console.error("Không thể đăng xuất:", error);
                    playUiSound("error");
                    throw error;
                }
            },
            {
                title: "Xác nhận đăng xuất",
                confirmLabel: "Đăng xuất",
                cancelLabel: "Tiếp tục sử dụng",
                pendingLabel: "Đang đăng xuất...",
                variant: "danger",
                icon: "fa-arrow-right-from-bracket"
            }
        );
    });
}
function notificationActionText(item){const reactionNames={like:"đã thích bài viết của bạn",love:"đã thả tim bài viết của bạn",haha:"đã bày tỏ Haha với bài viết của bạn",wow:"đã bày tỏ Wow với bài viết của bạn",sad:"đã bày tỏ cảm xúc buồn với bài viết của bạn",sorry:"đã bày tỏ thương tiếc với bài viết của bạn"};if(item.type==="reaction")return reactionNames[item.reactionType]||"đã bày tỏ cảm xúc với bài viết của bạn";if(["reply","comment_reply"].includes(item.type))return"đã trả lời bình luận của bạn";if(item.type==="comment")return"đã bình luận bài viết của bạn";if(item.type==="friend_request")return"đã gửi cho bạn lời mời kết bạn";if(item.type==="friend_accepted")return"đã chấp nhận lời mời kết bạn của bạn";if(item.type==="friend_post")return"vừa chia sẻ một bài viết mới";if(isSystemNotification(item))return item.message||"đã cập nhật trạng thái nội dung của bạn";return item.message||"đã tương tác với bạn"}

function allCommentAuthorFallback(commentId){const node=document.getElementById(`comment-node-id-${commentId}`);return node?.querySelector(".comment-author-avatar")?.dataset.commentAuthor||currentActivePostData?.authorId}
async function createActivityNotification(recipientId,type,postId,message,commentId=null){if(!authenticatedUser||recipientId===authenticatedUser.uid)return;await addDoc(collection(firebaseDatabase,"notifications"),{recipientId,postAuthorId:recipientId,actorId:authenticatedUser.uid,actorName:currentUserDisplayName.innerText,type,postId,commentId,message,isRead:false,createdAt:serverTimestamp()})}

function setStatusUI(isOnline){if(!onlineStatusButton)return;onlineStatusButton.classList.toggle("offline",!isOnline);onlineStatusText.textContent=isOnline?"Trực tuyến":"Ẩn hoạt động";document.querySelector(".profile-online-dot")?.classList.toggle("offline",!isOnline);document.querySelector(".community-account")?.classList.toggle("is-offline",!isOnline)}
if(onlineStatusButton)onlineStatusButton.onclick=async()=>{if(!authenticatedUser)return;const currentlyVisible=!onlineStatusButton.classList.contains("offline"),nextVisible=!currentlyVisible;await writePublicProfile(authenticatedUser.uid,{showActivityStatus:nextVisible,lastActiveAt:serverTimestamp()});setStatusUI(nextVisible)};
async function navigateAfterSound(target, sound = "click-secondary") {
    const effectsEnabled = !soundManager.settings.muted && soundManager.settings.effectsEnabled;
    if (effectsEnabled) {
        await Promise.race([
            soundManager.unlock(),
            new Promise(resolve => window.setTimeout(resolve, 160))
        ]);
        playUiSound(sound);
        await new Promise(resolve => window.setTimeout(resolve, 140));
    }
    location.href = target;
}
document.getElementById("community-messages-button")?.addEventListener("click",()=>navigateAfterSound("./messages/messages-page.html", "open-panel"));
communityNotificationsButton?.addEventListener("click", event => {
    event.stopPropagation();
    setAccountMenuOpen(false);
    toggleNotificationPanel();
});
if(new URLSearchParams(location.search).get("notifications")==="1"||sessionStorage.getItem("returnToNotifications")==="1"){
    myPostsFixedPanel?.classList.remove("collapsed");
    toggleMyPostsPanelButton?.setAttribute("aria-expanded", "true");
    communityNotificationsButton?.setAttribute("aria-expanded", "true");
    sessionStorage.removeItem("returnToNotifications");
}

const memberSearchInput = document.getElementById("community-user-search");
const memberSearchResults = document.getElementById("community-search-results");
const memberSearchPanel = document.getElementById("community-search-panel");
const mobileSearchToggle = document.getElementById("mobile-community-search-toggle");
let memberSearchTimer = null;
let memberSearchRequest = 0;
const normalizeMemberSearchValue = value => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .trim();
function setMobileMemberSearch(open,focus=true){
    if(!memberSearchPanel||!mobileSearchToggle)return;
    if(!open){
        memberSearchPanel.classList.remove("mobile-search-expanded");
        document.body.classList.remove("mobile-search-open");
        myPostsFixedPanel?.classList.remove("search-displaced");
        mobileSearchToggle.setAttribute("aria-expanded","false");
        mobileSearchToggle.setAttribute("aria-label","Mở tìm kiếm thành viên");
        memberSearchInput?.blur();
        return;
    }
    if(!matchMedia("(max-width: 800px)").matches)return;
    setFeedFilterOpen(false);
    if(open)myPostsFixedPanel?.classList.add("collapsed");
    memberSearchPanel.classList.toggle("mobile-search-expanded",open);
    document.body.classList.toggle("mobile-search-open",open);
    myPostsFixedPanel?.classList.toggle("search-displaced",open);
    mobileSearchToggle.setAttribute("aria-expanded",String(open));
    mobileSearchToggle.setAttribute("aria-label",open?"Thu gọn tìm kiếm thành viên":"Mở tìm kiếm thành viên");
    if(open&&focus)requestAnimationFrame(()=>memberSearchInput?.focus({preventScroll:true}));
    if(!open&&!memberSearchInput?.value){memberSearchResults?.classList.remove("visible")}
}
mobileSearchToggle?.addEventListener("click",event=>{
    event.stopPropagation();
    memberSearchInput?.focus({preventScroll:true});
});
document.addEventListener("pointerdown",event=>{
    if(!matchMedia("(max-width: 800px)").matches||!memberSearchPanel?.classList.contains("mobile-search-expanded")||memberSearchPanel.contains(event.target))return;
    if(toggleMyPostsPanelButton?.contains(event.target))return;
    if(!memberSearchInput?.value)setMobileMemberSearch(false,false);
});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&memberSearchPanel?.classList.contains("mobile-search-expanded"))setMobileMemberSearch(false,false)});
addEventListener("resize",()=>{if(innerWidth>800){memberSearchPanel?.classList.remove("mobile-search-expanded");document.body.classList.remove("mobile-search-open");myPostsFixedPanel?.classList.remove("search-displaced")}});
// Search behavior is isolated in community-member-search.js so feed failures cannot disable it.
if (false && memberSearchInput && memberSearchResults) {
    memberSearchInput.addEventListener("focus", () => { if (window.matchMedia("(min-width: 801px)").matches) playUiSound("search"); });
    memberSearchInput.addEventListener("input", () => {
        clearTimeout(memberSearchTimer);
        memberSearchTimer = setTimeout(async () => {
            const rawKeyword = memberSearchInput.value.trim();
            const requestId = ++memberSearchRequest;
            const keyword = normalizeMemberSearchValue(rawKeyword).replace(/^@/, "");
            const compactKeyword = keyword.replace(/\s+/g, "");
            if (!rawKeyword) { memberSearchResults.classList.remove("visible"); memberSearchResults.innerHTML = ""; return; }
            memberSearchResults.innerHTML = `<div class="empty-search-result search-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tìm thành viên…</div>`;
            memberSearchResults.classList.add("visible");
            try {
                const snapshot = await getDocs(collection(firebaseDatabase, "users"));
                if (requestId !== memberSearchRequest) return;
                const matches = [];
                snapshot.forEach(userDoc => {
                    const data = userDoc.data();
                    const displayName = normalizeMemberSearchValue(data.displayName);
                    const username = normalizeMemberSearchValue(data.usernameNormalized || data.username).replace(/^@/, "");
                    const memberId = normalizeMemberSearchValue(data.memberId).replace(/\s+/g, "");
                    const nameMatches = displayName.includes(keyword);
                    const usernameMatches = username.includes(keyword);
                    const idMatches = Boolean(memberId && memberId.includes(compactKeyword));
                    if (nameMatches || usernameMatches || idMatches) {
                        const matchedBy = idMatches ? "id" : (usernameMatches ? "username" : "name");
                        matches.push({ ...data, id: userDoc.id, matchedBy });
                    }
                });
                matches.sort((a, b) => {
                    const rank = { id: 0, username: 1, name: 2 };
                    return rank[a.matchedBy] - rank[b.matchedBy] || resolveDisplayName(a).localeCompare(resolveDisplayName(b), "vi");
                });
                memberSearchResults.innerHTML = matches.slice(0, 8).map(member => {
                    const name = resolveDisplayName(member);
                    const username = String(member.username || "").replace(/^@/, "");
                    const detail = member.matchedBy === "id"
                        ? "Tìm thấy bằng ID thành viên"
                        : (username ? `@${escapeHTML(username)}` : "Tài khoản thành viên");
                    return `<button class="member-search-result" data-uid="${member.id}"><img src="${resolveAvatarUrl(member.photoURL || member.profileImage, { uid: member.id, displayName: name })}" alt=""><span><strong>${escapeHTML(name)}</strong><small>${detail}</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`;
                }).join("") || `<div class="empty-search-result"><i class="fa-solid fa-user-slash"></i><strong>Không tìm thấy thành viên</strong><small>Thử tên hiển thị, @username hoặc ID khác.</small></div>`;
                memberSearchResults.classList.add("visible");
                memberSearchResults.querySelectorAll("[data-uid]").forEach(item => item.onclick = () => openUserProfile(item.dataset.uid));
            } catch (error) {
                console.error("Member search failed:", error);
                if (requestId !== memberSearchRequest) return;
                memberSearchResults.innerHTML = `<div class="empty-search-result search-error"><i class="fa-solid fa-triangle-exclamation"></i><strong>Chưa thể tìm kiếm</strong><small>Kiểm tra kết nối rồi thử lại.</small></div>`;
                memberSearchResults.classList.add("visible");
            }
        }, 250);
    });
}
