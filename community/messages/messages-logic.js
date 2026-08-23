import { firebaseAuthentication as auth, firebaseDatabase as db } from "../../shared/firebase-connection.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, updateDoc, writeBatch, Timestamp, increment, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { startPresenceTracking, isUserActive } from "../../shared/presence-handler.js";
import { resolveDisplayName, isGeneratedDisplayName } from "../../shared/user-identity.js";
import { repairFriendship } from "../../shared/friendship-service.js";
import { uploadMedia } from "../../shared/cloudinary-media-service.js";
import { soundManager, playUiSound } from "../../shared/audio/sound-manager.js?v=6";
import { getDefaultAvatarUrl, resolveAvatarUrl } from "../../shared/default-avatar.js";
import { clearNoteReactions, listenNoteReactions, NOTE_REACTIONS, setNoteReaction } from "../../shared/note-reactions.js";
import { createChatSettingsManager } from "./messages-chat-settings.js?v=10";
import "./messages-enhancements.js?v=3";
import "./messages-responsive.js?v=3";
import { renderInteractiveText, installInteractiveTextInteractions } from "../../shared/interactive-text.js?v=2";
installInteractiveTextInteractions();
const $ = id => document.getElementById(id);
const DEFAULT_AVATAR = getDefaultAvatarUrl({ uid: "vhht-member", displayName: "VHHT" });
const conversationId = (first, second) => [first, second].sort().join("_");
const escapeMessageHtml = value => { const node = document.createElement("div"); node.textContent = String(value || ""); return node.innerHTML; };
const messagesViewport = $("messages-list");
const jumpToLatestButton = $("jump-to-latest-message");

function syncJumpToLatestButton() {
    if (!messagesViewport || !jumpToLatestButton) return;
    const distanceFromBottom = messagesViewport.scrollHeight - messagesViewport.scrollTop - messagesViewport.clientHeight;
    const shouldShow = messagesViewport.scrollHeight > messagesViewport.clientHeight + 24 && distanceFromBottom > 160;
    jumpToLatestButton.hidden = !shouldShow;
    jumpToLatestButton.setAttribute("aria-hidden", String(!shouldShow));
}

messagesViewport?.addEventListener("scroll", syncJumpToLatestButton, { passive: true });
jumpToLatestButton?.addEventListener("click", () => {
    playUiSound("click-primary");
    messagesViewport.scrollTo({ top: messagesViewport.scrollHeight, behavior: "smooth" });
});
const CHAT_REACTIONS = { like: ["👍", "Thích"], love: ["❤️", "Yêu thích"], haha: ["😂", "Haha"], wow: ["😮", "Wow"], sad: ["😡", "Phẫn nộ"], sorry: ["😢", "Buồn"] };
const sharedPostTime = value => {
    const millis = typeof value?.toMillis === "function" ? value.toMillis() : value?.seconds ? value.seconds * 1000 : Date.now();
    return new Date(millis).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
};
let stopSharedPostComments = null;
const meaningfulName = (profile, fallback = "") => {
    const resolved = resolveDisplayName(profile || {});
    if (!isGeneratedDisplayName(resolved, profile?.email)) return resolved;
    return !isGeneratedDisplayName(fallback, profile?.email) ? String(fallback).trim() : resolved;
};

function closeSharedPostDetail() {
    stopSharedPostComments?.(); stopSharedPostComments = null;
    document.querySelector(".chat-post-detail-overlay")?.classList.remove("show");
    document.body.classList.remove("chat-post-detail-open");
}

function closeEmbeddedPostDetail() {
    const overlay=document.querySelector(".embedded-post-detail-overlay");
    if(!overlay)return;overlay.classList.remove("show");document.body.classList.remove("chat-post-detail-open");
    const frame=overlay.querySelector("iframe");if(frame)frame.src="about:blank";
}

async function checkSharedPostAccess(post) {
    if (post.moderationStatus === "deleted") {
        return { allowed: false, title: "Bài viết đã bị ADMIN xóa", detail: "Bài viết này đã bị gỡ khỏi cộng đồng và không còn được phép mở từ tin nhắn." };
    }
    if (post.moderationStatus === "hidden" || post.deletedByAdmin === true) {
        return { allowed: false, title: "Bài viết đang bị ADMIN ẩn", detail: "Bài viết đang trong quá trình kiểm duyệt nên chỉ chủ bài viết có thể xem trạng thái tại hồ sơ cá nhân." };
    }
    if (post.authorId === me.uid) return { allowed: true };
    if (post.privacy === "private") {
        return { allowed: false, title: "Bài viết chỉ dành cho tác giả", detail: "Tác giả đã đặt quyền riêng tư thành “Chỉ mình tôi”." };
    }
    if (post.privacy === "friends") {
        const [ownSnapshot, authorSnapshot] = await Promise.all([
            getDoc(doc(db, "users", me.uid)),
            getDoc(doc(db, "users", post.authorId))
        ]);
        const own = ownSnapshot.data() || {}, author = authorSnapshot.data() || {};
        const isFriend = (own.friends || []).includes(post.authorId) && (author.friends || []).includes(me.uid);
        if (!isFriend) return { allowed: false, title: "Bài viết chỉ dành cho bạn bè", detail: "Bạn không còn là bạn bè hai chiều với tác giả hoặc quyền xem bài viết đã thay đổi." };
    }
    return { allowed: true };
}

function showEmbeddedPostDenied(overlay, title, detail) {
    const denied = overlay.querySelector(".embedded-post-denied");
    overlay.querySelector(".embedded-post-loading").hidden = true;
    overlay.querySelector("iframe").hidden = true;
    denied.hidden = false;
    denied.querySelector("strong").textContent = title;
    denied.querySelector("p").textContent = detail;
}

async function openExactSharedPostDetail(sharedPost) {
    let overlay=document.querySelector(".embedded-post-detail-overlay");
    if(!overlay){
        overlay=document.createElement("div");overlay.className="embedded-post-detail-overlay";
        overlay.innerHTML='<div class="embedded-post-loading"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Đang kiểm tra quyền xem…</span></div><div class="embedded-post-denied" hidden><i class="fa-solid fa-lock"></i><strong>Bạn không có quyền xem bài đăng này</strong><p>Bài viết có thể đã bị xóa hoặc tác giả đã thay đổi quyền riêng tư.</p><button type="button">Đóng</button></div><iframe title="Chi tiết bài viết" allow="fullscreen"></iframe>';
        document.body.appendChild(overlay);overlay.querySelector(".embedded-post-denied button").onclick=closeEmbeddedPostDetail;overlay.onclick=event=>{if(event.target===overlay)closeEmbeddedPostDetail()};
    }
    const loading=overlay.querySelector(".embedded-post-loading"),denied=overlay.querySelector(".embedded-post-denied"),frame=overlay.querySelector("iframe");
    loading.hidden=false;denied.hidden=true;frame.hidden=true;overlay.classList.add("show");document.body.classList.add("chat-post-detail-open");
    try{
        const postSnapshot=await getDoc(doc(db,"posts",sharedPost.id));
        if(!postSnapshot.exists()){showEmbeddedPostDenied(overlay,"Bài viết không còn tồn tại","Tác giả đã xóa vĩnh viễn bài viết hoặc liên kết chia sẻ không còn hợp lệ.");return}
        const access=await checkSharedPostAccess(postSnapshot.data());
        if(!access.allowed){showEmbeddedPostDenied(overlay,access.title,access.detail);return}
        frame.onload=()=>{loading.hidden=true;frame.hidden=false};
        frame.src=`../community-feed-page.html?post=${encodeURIComponent(sharedPost.id)}&embed=1`;
    }catch(error){showEmbeddedPostDenied(overlay,"Không thể kiểm tra quyền xem","Kết nối tới dữ liệu bài viết gặp sự cố. Vui lòng thử lại sau.")}
}

window.addEventListener("message",event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==="vhht-close-embedded-post")closeEmbeddedPostDetail();
    if(event.data?.type==="vhht-embedded-post-denied"){
        const overlay=document.querySelector(".embedded-post-detail-overlay");if(!overlay)return;
        overlay.querySelector(".embedded-post-loading").hidden=true;overlay.querySelector("iframe").hidden=true;overlay.querySelector(".embedded-post-denied").hidden=false;
    }
});

async function openSharedPostDetail(sharedPost) {
    let overlay = document.querySelector(".chat-post-detail-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "chat-post-detail-overlay";
        overlay.innerHTML = '<section class="chat-post-detail" role="dialog" aria-modal="true" aria-label="Chi tiết bài viết"><header><span><i class="fa-regular fa-newspaper"></i> Bài viết được chia sẻ</span><button type="button" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></header><div class="chat-post-detail-body"></div></section>';
        document.body.appendChild(overlay);
        const header = overlay.querySelector("header");
        header.innerHTML = '<div class="chat-detail-tabs" role="tablist"><button type="button" class="active" data-chat-detail-tab="post"><i class="fa-regular fa-newspaper"></i> Bài viết</button><button type="button" data-chat-detail-tab="comments"><i class="fa-regular fa-comments"></i> Bình luận</button></div><button type="button" class="chat-detail-close" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button>';
        overlay.querySelector(".chat-detail-close").onclick = closeSharedPostDetail;
        overlay.querySelectorAll("[data-chat-detail-tab]").forEach(tab => tab.onclick = () => {
            overlay.querySelectorAll("[data-chat-detail-tab]").forEach(item => item.classList.toggle("active", item === tab));
            const comments = overlay.querySelector(".chat-post-comments");
            if (tab.dataset.chatDetailTab === "comments") {
                comments?.scrollIntoView({ behavior: "smooth", block: "start" });
                setTimeout(() => comments?.querySelector("input")?.focus(), 250);
            } else overlay.querySelector(".chat-post-detail-body")?.scrollTo({ top: 0, behavior: "smooth" });
        });
        overlay.onclick = event => { if (event.target === overlay) closeSharedPostDetail(); };
    }
    const body = overlay.querySelector(".chat-post-detail-body");
    body.innerHTML = '<div class="chat-post-loading"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Đang mở bài viết…</span></div>';
    overlay.classList.add("show");
    document.body.classList.add("chat-post-detail-open");
    try {
        const snapshot = await getDoc(doc(db, "posts", sharedPost.id));
        if (!snapshot.exists()) throw new Error("Bài viết không còn tồn tại");
        const post = snapshot.data();
        if (post.privacy === "private" && post.authorId !== me.uid) throw new Error("Bài viết đã được chuyển sang chế độ riêng tư");
        const authorSnapshot = post.authorId ? await getDoc(doc(db, "users", post.authorId)) : null;
        const author = authorSnapshot?.data?.() || {};
        if (post.privacy === "friends" && post.authorId !== me.uid) {
            const canView = (author.friends || []).includes(me.uid) || (ownProfile?.friends || []).includes(post.authorId);
            if (!canView) throw new Error("Bài viết này chỉ dành cho bạn bè của tác giả");
        }
        const authorName = meaningfulName(author, post.authorDisplayName || sharedPost.authorName);
        const avatar = author.photoURL || author.profileImage || post.authorAvatar || DEFAULT_AVATAR;
        const mediaItems = post.attachedImages?.length
            ? post.attachedImages
            : (post.attachedImage || post.mediaUrl ? [{ url: post.attachedImage || post.mediaUrl, type: post.mediaType || "image" }] : []);
        const mediaHtml = mediaItems.length ? `<div class="chat-shared-media media-${Math.min(mediaItems.length, 4)}">${mediaItems.slice(0, 4).map((media, index) => {
            const url = escapeMessageHtml(media.url || media.mediaUrl || "");
            const type = media.type || media.mediaType || "image";
            return `<figure>${type === "video" ? `<video src="${url}" controls preload="metadata" playsinline></video>` : `<img src="${url}" alt="Ảnh bài viết">`}${index === 3 && mediaItems.length > 4 ? `<b>+${mediaItems.length - 4}</b>` : ""}</figure>`;
        }).join("")}</div>` : "";
        const myReaction=post.reactions?.[me.uid];
        body.innerHTML = `<article class="chat-shared-post"><div class="chat-shared-author"><img src="${escapeMessageHtml(avatar)}" alt=""><span><strong>${escapeMessageHtml(authorName)}</strong><small>${post.privacy === "friends" ? "Bạn bè" : "Công khai"}</small></span></div>${post.content ? `<p>${renderInteractiveText(post.content)}</p>` : ""}${mediaHtml}<footer><span data-chat-react-count><i class="fa-regular fa-heart"></i> ${Object.keys(post.reactions || {}).length}</span><span data-chat-comment-count><i class="fa-regular fa-comment"></i> ${post.commentCount || 0} bình luận</span></footer><div class="chat-post-actions"><button type="button" data-chat-like class="${myReaction?'active':''}"><i class="fa-${myReaction?'solid':'regular'} fa-heart"></i> ${myReaction?'Đã thích':'Thích'}</button><button type="button" data-focus-chat-comment><i class="fa-regular fa-comment"></i> Bình luận</button></div><section class="chat-post-comments"><div class="chat-post-comments-list"><div class="chat-post-loading compact"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div><form><img src="${escapeMessageHtml(resolveProfileAvatar(ownProfile,true))}" alt=""><input maxlength="1000" placeholder="Viết bình luận…"><button aria-label="Gửi bình luận"><i class="fa-solid fa-paper-plane"></i></button></form></section></article>`;
        const article=body.querySelector(".chat-shared-post"),commentInput=article.querySelector(".chat-post-comments input"),likeButton=article.querySelector("[data-chat-like]"),commentsSection=article.querySelector(".chat-post-comments");
        const postPane=document.createElement("section");postPane.className="chat-post-view active";postPane.setAttribute("aria-label","Nội dung bài viết");
        const postCard=document.createElement("div");postCard.className="chat-post-card";
        const authorBlock=article.querySelector(".chat-shared-author"),postText=article.querySelector(":scope > p"),postMedia=article.querySelector(".chat-shared-media"),postStats=article.querySelector(":scope > footer"),postActions=article.querySelector(".chat-post-actions");
        [authorBlock,postText,postMedia].filter(Boolean).forEach(node=>postCard.appendChild(node));postPane.append(postCard,postStats,postActions);article.prepend(postPane);
        commentsSection.classList.add("chat-comments-view");commentsSection.insertAdjacentHTML("afterbegin",'<h3><i class="fa-regular fa-comments"></i> HỘI THOẠI QUỸ ĐẠO</h3>');
        authorBlock.querySelector("small").textContent=sharedPostTime(post.createdAt);
        const setDetailView=view=>{const isComments=view==="comments";postPane.classList.toggle("active",!isComments);commentsSection.classList.toggle("active",isComments);overlay.querySelectorAll("[data-chat-detail-tab]").forEach(tab=>{const selected=tab.dataset.chatDetailTab===view;tab.classList.toggle("active",selected);tab.setAttribute("aria-selected",String(selected))});body.scrollTop=0;if(isComments)setTimeout(()=>commentInput.focus(),180)};
        overlay.querySelectorAll("[data-chat-detail-tab]").forEach(tab=>tab.onclick=()=>setDetailView(tab.dataset.chatDetailTab));setDetailView("post");
        const authorButton=article.querySelector(".chat-shared-author");authorButton.setAttribute("role","button");authorButton.tabIndex=0;authorButton.onclick=()=>openProfileFromChat(post.authorId);authorButton.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();authorButton.click()}};
        const shareIcon=document.createElement("button");shareIcon.type="button";shareIcon.className="chat-post-share-icon";shareIcon.title="Chia sẻ bài viết";shareIcon.setAttribute("aria-label","Chia sẻ bài viết");shareIcon.innerHTML='<i class="fa-solid fa-share-nodes"></i>';article.prepend(shareIcon);
        const shareAction=document.createElement("button");shareAction.type="button";shareAction.innerHTML='<i class="fa-solid fa-share-nodes"></i> Chia sẻ';article.querySelector(".chat-post-actions").appendChild(shareAction);
        shareIcon.onclick=shareAction.onclick=()=>openChatShareDialog(sharedPost,post);
        likeButton.onclick=async()=>{const latest=await getDoc(doc(db,"posts",sharedPost.id)),reactions={...(latest.data()?.reactions||{})};if(reactions[me.uid])delete reactions[me.uid];else reactions[me.uid]="love";await updateDoc(doc(db,"posts",sharedPost.id),{reactions});likeButton.classList.toggle("active",!!reactions[me.uid]);likeButton.innerHTML=`<i class="fa-${reactions[me.uid]?'solid':'regular'} fa-heart"></i> ${reactions[me.uid]?'Đã thích':'Thích'}`;article.querySelector("[data-chat-react-count]").innerHTML=`<i class="fa-regular fa-heart"></i> ${Object.keys(reactions).length}`};
        postCard.prepend(shareIcon);
        const picker=document.createElement("div");picker.className="chat-reaction-picker";picker.innerHTML=Object.entries(CHAT_REACTIONS).map(([type,[emoji,label]])=>`<button type="button" data-reaction="${type}" title="${label}">${emoji}</button>`).join("")+'<button type="button" data-reaction="clear" title="Gỡ cảm xúc">×</button>';postActions.appendChild(picker);
        let activeChatReaction=myReaction;const applyReactionView=reactions=>{const type=reactions[me.uid],reaction=CHAT_REACTIONS[type];activeChatReaction=type||null;likeButton.classList.toggle("active",!!reaction);likeButton.innerHTML=reaction?`<span>${reaction[0]}</span> ${reaction[1]}`:'<span>👍</span> Thích';article.querySelector("[data-chat-react-count]").innerHTML=`<i class="fa-regular fa-heart"></i> ${Object.keys(reactions).length} Cosmic Reacts`};
        const saveReaction=async type=>{const latest=await getDoc(doc(db,"posts",sharedPost.id)),reactions={...(latest.data()?.reactions||{})};if(type==="clear"||reactions[me.uid]===type)delete reactions[me.uid];else reactions[me.uid]=type;await updateDoc(doc(db,"posts",sharedPost.id),{reactions});applyReactionView(reactions);postActions.classList.remove("picker-open")};
        picker.querySelectorAll("button").forEach(button=>button.onclick=event=>{event.stopPropagation();saveReaction(button.dataset.reaction).catch(console.warn)});
        likeButton.onclick=event=>{if(event.pointerType==="touch"||matchMedia("(hover: none), (pointer: coarse)").matches){postActions.classList.toggle("picker-open");return}saveReaction(activeChatReaction?"clear":"like").catch(console.warn)};
        likeButton.oncontextmenu=event=>{event.preventDefault();postActions.classList.toggle("picker-open")};applyReactionView(post.reactions||{});
        article.querySelector("[data-focus-chat-comment]").onclick=()=>setDetailView("comments");
        article.querySelector(".chat-post-comments form").onsubmit=async event=>{event.preventDefault();const content=commentInput.value.trim();if(!content)return;const button=event.currentTarget.querySelector("button");button.disabled=true;try{await addDoc(collection(db,"posts",sharedPost.id,"comments"),{authorId:me.uid,authorDisplayName:meaningfulName(ownProfile,me.displayName),authorAvatar:resolveProfileAvatar(ownProfile,true),content,parentId:null,commentReactions:{},createdAt:serverTimestamp()});commentInput.value="";if(post.authorId&&post.authorId!==me.uid)await addDoc(collection(db,"notifications"),{recipientId:post.authorId,postAuthorId:post.authorId,actorId:me.uid,actorName:meaningfulName(ownProfile,me.displayName),type:"comment",postId:sharedPost.id,message:"đã bình luận bài viết bạn chia sẻ trong tin nhắn",isRead:false,createdAt:serverTimestamp()})}finally{button.disabled=false}};
        stopSharedPostComments?.();
        stopSharedPostComments=onSnapshot(query(collection(db,"posts",sharedPost.id,"comments"),orderBy("createdAt","asc")),snapshot=>{const list=article.querySelector(".chat-post-comments-list"),comments=[];snapshot.forEach(item=>comments.push({id:item.id,...item.data()}));list.innerHTML=comments.length?comments.map(comment=>`<div class="chat-post-comment" data-author-id="${escapeMessageHtml(comment.authorId)}"><img src="${escapeMessageHtml(comment.authorAvatar||DEFAULT_AVATAR)}" alt=""><div><strong>${escapeMessageHtml(comment.authorDisplayName||"Thành viên VHHT")}</strong><p>${renderInteractiveText(comment.content||"")}</p></div></div>`).join(""):'<p class="chat-no-comments">Chưa có bình luận. Hãy bắt đầu cuộc trò chuyện.</p>';article.querySelector("[data-chat-comment-count]").innerHTML=`<i class="fa-regular fa-comment"></i> ${comments.length} bình luận`;updateDoc(doc(db,"posts",sharedPost.id),{commentCount:comments.length}).catch(console.warn);list.querySelectorAll(".chat-post-comment").forEach(node=>{getDoc(doc(db,"users",node.dataset.authorId)).then(userSnapshot=>{if(!userSnapshot.exists())return;const data=userSnapshot.data();node.querySelector("img").src=resolveProfileAvatar(data);node.querySelector("strong").textContent=meaningfulName(data,node.querySelector("strong").textContent)})})});
    } catch (error) {
        body.innerHTML = `<div class="chat-post-unavailable"><i class="fa-solid fa-link-slash"></i><strong>Không thể mở bài viết</strong><p>${escapeMessageHtml(error.message || "Vui lòng thử lại sau")}</p></div>`;
    }
}

document.addEventListener("keydown", event => { if (event.key === "Escape") closeSharedPostDetail(); });

function mountConversationStarfield() {
    const sidebar = document.querySelector(".conversation-sidebar");
    if (!sidebar || sidebar.querySelector(".conversation-starfield")) return;
    const field = document.createElement("div");
    field.className = "conversation-starfield";
    field.setAttribute("aria-hidden", "true");
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 28; index += 1) {
        const star = document.createElement("i");
        star.className = `cosmic-sidebar-star ${index % 5 === 0 ? "is-cross" : "is-dot"}`;
        star.style.setProperty("--star-x", `${4 + Math.random() * 92}%`);
        star.style.setProperty("--star-y", `${2 + Math.random() * 94}%`);
        star.style.setProperty("--star-size", `${1 + Math.random() * 2.2}px`);
        star.style.setProperty("--star-delay", `${-Math.random() * 5}s`);
        star.style.setProperty("--star-duration", `${2.8 + Math.random() * 3.8}s`);
        fragment.appendChild(star);
    }
    field.appendChild(fragment);
    sidebar.prepend(field);
}

mountConversationStarfield();
let me = null, friends = [], activeFriend = null, stopMessages = null, stopConversation = null, stopConversationList = null, typingTimer = null;
let openedConversationSerial = 0, renderedMessageIds = new Set(), receivedFirstMessageSnapshot = false;
let forceConversationEndUntil = 0;
let lastMessageRenderSignature = "";
let messageMediaPreviewUrl = "";
let messageMediaViewerScale = 1;
let messageMediaViewerX = 0;
let messageMediaViewerY = 0;
let messageMediaViewerPointers = new Map();
let messageMediaViewerPinchDistance = 0;
let messageMediaViewerPinchScale = 1;
const reconciledSharedMessages = new Set();
let ownProfile = null, activeConversationFilter = "all", unreadCounts = new Map(), selectedNoteFriend = null;
const conversationActivityByFriend = new Map();
const notesByUser = new Map(), stopNoteListeners = [];
let stopSelectedNoteReactions = null;
let selectedNoteReactionItems = [];
let notesExpiryTimer = null;
let activeUnreadBoundaryId = null;
let noteAudienceIds = [];
const viewedUnreadConversations = new Set();
let stopOwnProfile = null;
let selectedMessageReply = null;
let selectedSendEffect = "none";
const visibleEffectMessages = new Set();
const messageEffectObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries=>{
    entries.forEach(entry=>{entry.target.dataset.effectVisible=String(entry.isIntersecting);if(entry.isIntersecting)visibleEffectMessages.add(entry.target);else visibleEffectMessages.delete(entry.target);entry.target.classList.toggle("effect-running",entry.isIntersecting&&!document.hidden)});
},{root:$("messages-list"),threshold:.18,rootMargin:"60px 0px"}):null;
function observeMessageEffects(container){visibleEffectMessages.clear();messageEffectObserver?.disconnect();container.querySelectorAll(".message-send-effect").forEach(bubble=>{if(messageEffectObserver)messageEffectObserver.observe(bubble);else bubble.classList.toggle("effect-running",!document.hidden)})}
document.addEventListener("visibilitychange",()=>visibleEffectMessages.forEach(bubble=>bubble.classList.toggle("effect-running",!document.hidden&&bubble.dataset.effectVisible==="true")));
let activeMessageActionMenu = null;
let suppressMessageMenuCloseUntil = 0;
let activeConversationData = {};
let activeConversationMessages = [];
const conversationNicknamesByFriend = new Map();
const chatSettings = createChatSettingsManager({
    db,
    getContext: () => ({
        me,
        ownProfile,
        friend: activeFriend,
        conversation: activeConversationData,
        messages: activeConversationMessages,
        conversationId: me && activeFriend ? conversationId(me.uid, activeFriend.id) : ""
    }),
    openMedia: (url, type) => openMessageMediaViewer(url, type),
    openProfile: userId => openProfileFromChat(userId),
    scrollToMessage: messageId => scrollToRepliedMessage(messageId),
    getDisplayName: profile => meaningfulName(profile, profile?.displayName || profile?.name || "Thành viên VHHT"),
    getAvatar: profile => resolveProfileAvatar(profile, (profile?.uid || profile?.id) === me?.uid)
});
const MESSAGE_REACTIONS = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢", angry: "😡" };
const CONVERSATION_THEMES = [
    { id: "default", label: "Mặc định", preview: "linear-gradient(145deg,#07101d,#11243a)" },
    { id: "cosmic", label: "Dải ngân hà", preview: "radial-gradient(circle at 25% 25%,#6754d8,transparent 35%),linear-gradient(145deg,#050817,#12324c)" },
    { id: "aurora", label: "Cực quang", preview: "radial-gradient(circle at 20% 25%,#10b981,transparent 38%),linear-gradient(145deg,#071822,#43257a)" },
    { id: "love", label: "Tình yêu", preview: "radial-gradient(circle at 25% 22%,#fb7185,transparent 38%),linear-gradient(145deg,#2a0c1a,#7e2254)" },
    { id: "cute", label: "Dễ thương", preview: "radial-gradient(circle at 25% 20%,#f9a8d4,transparent 36%),linear-gradient(145deg,#20204a,#69436f)" },
    { id: "friendship", label: "Bạn bè", preview: "radial-gradient(circle at 25% 20%,#fbbf24,transparent 35%),linear-gradient(145deg,#092334,#13634c)" }
];

function openProfileFromChat(profileUid){
    if(!profileUid)return;
    const returnChatUid=activeFriend?.id||profileUid;
    sessionStorage.setItem("vhht_profile_return_source","chat");
    sessionStorage.setItem("vhht_profile_return_chat_uid",returnChatUid);
    location.href=`../profile-user/user-profile.html?uid=${encodeURIComponent(profileUid)}&from=chat&chat=${encodeURIComponent(returnChatUid)}`;
}

function conversationNickname(userId, fallback = "") {
    return String(activeConversationData?.nicknames?.[userId] || fallback || "").trim();
}

async function hydrateConversationNickname(friend, row) {
    try {
        const id = conversationId(me.uid, friend.id);
        const snapshot = await getDoc(doc(db, "conversations", id));
        const nickname = String(snapshot.data()?.nicknames?.[friend.id] || "").trim();
        if (nickname) conversationNicknamesByFriend.set(friend.id, nickname);
        else conversationNicknamesByFriend.delete(friend.id);
        if (row?.isConnected) {
            const name = row.querySelector("strong");
            if (name) name.textContent = nickname || resolveDisplayName(friend);
        }
    } catch (error) {
        console.warn("conversation nickname", error);
    }
}

function appendSystemEventContent(bubble,message){
    const event=message.systemEvent||{},actorId=event.actorId||message.senderId,targetId=event.targetId||"";
    const actorProfile=actorId===me.uid?(ownProfile||me):(friends.find(friend=>friend.id===actorId)||activeFriend||{});
    const targetProfile=targetId===me.uid?(ownProfile||me):(friends.find(friend=>friend.id===targetId)||{});
    const actorName=meaningfulName(actorProfile,"Thành viên"),targetName=targetId?meaningfulName(targetProfile,"Thành viên"):"";
    let remaining=String(message.content||"");if(remaining.startsWith(actorName))remaining=remaining.slice(actorName.length);
    const line=document.createElement("span");line.className="message-text-content message-system-profile-event";
    const personButton=(id,name)=>{const button=document.createElement("button");button.type="button";button.className="message-system-person";button.textContent=name;button.onclick=click=>{click.stopPropagation();openProfileFromChat(id)};return button};
    line.appendChild(personButton(actorId,actorName));
    if(targetId&&targetName&&remaining.includes(targetName)){const [before,...after]=remaining.split(targetName);line.append(document.createTextNode(before),personButton(targetId,targetName),document.createTextNode(after.join(targetName)))}else line.append(document.createTextNode(remaining));
    bubble.appendChild(line);
}

function groupConsecutiveSystemEvents(list) {
    if (!list) return;
    const rows = [...list.children];
    const nearbyWindow = 10 * 60 * 1000;
    let index = 0;
    while (index < rows.length) {
        if (!rows[index]?.querySelector?.(".message-system-event")) { index += 1; continue; }
        const run = [];
        while (index < rows.length && rows[index]?.querySelector?.(".message-system-event")) {
            const previousTime = Number(run.at(-1)?.dataset.messageTime || 0);
            const currentTime = Number(rows[index]?.dataset.messageTime || 0);
            if (run.length && previousTime && currentTime && currentTime - previousTime > nearbyWindow) break;
            run.push(rows[index]);
            index += 1;
        }
        if (run.length < 2) continue;

        const group = document.createElement("section");
        group.className = "chat-system-event-group";
        group.setAttribute("aria-label", `${run.length} thay đổi trong đoạn chat`);
        const items = document.createElement("div");
        items.className = "chat-system-event-items";
        const hiddenCount = run.length;
        run.forEach((row, rowIndex) => {
            row.classList.add("system-event-collapsed-item");
            const previousRowTime = Number(run[rowIndex - 1]?.dataset.messageTime || 0);
            const currentRowTime = Number(row.dataset.messageTime || 0);
            if (previousRowTime && currentRowTime && Math.floor(previousRowTime / 60000) === Math.floor(currentRowTime / 60000)) row.classList.add("system-event-same-minute");
            items.appendChild(row);
        });
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "chat-system-event-toggle";
        toggle.setAttribute("aria-expanded", "false");
        const updateToggle = expanded => {
            toggle.innerHTML = expanded
                ? '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i><span>Thu gọn thay đổi</span>'
                : `<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>Xem ${hiddenCount} thay đổi đoạn chat</span>`;
        };
        updateToggle(false);
        toggle.addEventListener("click", event => {
            event.stopPropagation();
            const expanded = !group.classList.contains("expanded");
            group.classList.toggle("expanded", expanded);
            toggle.setAttribute("aria-expanded", String(expanded));
            updateToggle(expanded);
            window.VHHTAudio?.play?.("navigation");
        });
        group.append(items, toggle);
        list.insertBefore(group, rows[index] || null);
    }
}

function createConversationTimeDivider(timestamp) {
    const date = new Date(timestamp || Date.now());
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    const label = sameDay
        ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const divider = document.createElement('div');
    divider.className = 'conversation-time-divider';
    divider.setAttribute('role', 'separator');
    divider.innerHTML = `<time datetime="${date.toISOString()}">${label}</time>`;
    return divider;
}

function applyConversationPresentation() {
    const panel = document.querySelector(".chat-panel");
    chatSettings.refresh();
    if (!activeFriend) return;
    const displayedName = conversationNickname(activeFriend.id, resolveDisplayName(activeFriend));
    const headerName = $("chat-header")?.querySelector(".chat-contact strong");
    if (headerName) headerName.textContent = displayedName;
}

function ensureConversationSettingsDialog() {
    let dialog = document.querySelector(".conversation-settings-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "conversation-settings-dialog";
    dialog.innerHTML = `<div class="conversation-settings-shell"><header class="conversation-settings-header"><span class="conversation-settings-header-icon"><i class="fa-solid fa-sliders"></i></span><div><strong>Cài đặt đoạn chat</strong><small>Chỉ áp dụng cho cuộc trò chuyện này</small></div><button type="button" class="conversation-settings-close" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></header><div class="conversation-settings-body"><section class="conversation-settings-section"><h3 class="conversation-settings-title"><i class="fa-solid fa-user-pen"></i> Biệt danh trong đoạn chat</h3><div class="nickname-grid"></div><div class="nickname-actions"><button type="button" class="settings-secondary" data-reset-nicknames>Đặt lại</button><button type="button" class="settings-primary" data-save-nicknames>Lưu biệt danh</button></div></section><section class="conversation-settings-section"><h3 class="conversation-settings-title"><i class="fa-solid fa-palette"></i> Chủ đề cuộc trò chuyện</h3><div class="conversation-theme-grid"></div></section><section class="conversation-settings-section"><h3 class="conversation-settings-title"><i class="fa-solid fa-photo-film"></i> Ảnh, video và tệp đã gửi</h3><div class="chat-media-tabs"><button type="button" class="chat-media-tab active" data-media-filter="all">Tất cả</button><button type="button" class="chat-media-tab" data-media-filter="image">Ảnh</button><button type="button" class="chat-media-tab" data-media-filter="video">Video</button><button type="button" class="chat-media-tab" data-media-filter="file">Tệp</button></div><div class="chat-media-library"></div></section></div></div>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".conversation-settings-close").onclick = () => dialog.close();
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.querySelector("[data-reset-nicknames]").onclick = () => dialog.querySelectorAll(".nickname-field input").forEach(input => input.value = "");
    dialog.querySelector("[data-save-nicknames]").onclick = async event => {
        if (!me || !activeFriend) return;
        const button = event.currentTarget;
        const inputs = [...dialog.querySelectorAll(".nickname-field input")];
        button.disabled = true;
        try {
            await setDoc(doc(db, "conversations", conversationId(me.uid, activeFriend.id)), {
                members: [me.uid, activeFriend.id],
                nicknames: {
                    ...(activeConversationData?.nicknames || {}),
                    [me.uid]: inputs.find(input => input.dataset.uid === me.uid)?.value.trim() || "",
                    [activeFriend.id]: inputs.find(input => input.dataset.uid === activeFriend.id)?.value.trim() || ""
                }
            }, { merge: true });
            button.innerHTML = '<i class="fa-solid fa-check"></i> Đã lưu';
            setTimeout(() => { button.textContent = "Lưu biệt danh"; }, 1400);
        } catch (error) {
            button.textContent = "Không thể lưu";
            setTimeout(() => { button.textContent = "Lưu biệt danh"; }, 1800);
        } finally { button.disabled = false; }
    };
    dialog.querySelectorAll(".chat-media-tab").forEach(button => button.onclick = () => {
        dialog.querySelectorAll(".chat-media-tab").forEach(item => item.classList.toggle("active", item === button));
        renderConversationMediaLibrary(button.dataset.mediaFilter);
    });
    return dialog;
}

function renderConversationSettings() {
    if (!me || !activeFriend) return;
    const dialog = ensureConversationSettingsDialog();
    const identities = [
        { id: me.uid, label: "Biệt danh của bạn", name: resolveDisplayName(ownProfile || me), avatar: resolveProfileAvatar(ownProfile, true) },
        { id: activeFriend.id, label: `Biệt danh của ${resolveDisplayName(activeFriend)}`, name: resolveDisplayName(activeFriend), avatar: resolveProfileAvatar(activeFriend) }
    ];
    dialog.querySelector(".nickname-grid").innerHTML = identities.map(item => `<label class="nickname-field"><img src="${escapeMessageHtml(item.avatar)}" alt=""><span><small>${escapeMessageHtml(item.label)}</small><input data-uid="${escapeMessageHtml(item.id)}" maxlength="40" value="${escapeMessageHtml(conversationNickname(item.id, ""))}" placeholder="${escapeMessageHtml(item.name)}"></span></label>`).join("");
    const themeGrid = dialog.querySelector(".conversation-theme-grid");
    themeGrid.innerHTML = CONVERSATION_THEMES.map(theme => `<button type="button" class="conversation-theme-option ${(activeConversationData?.theme || "default") === theme.id ? "active" : ""}" data-theme="${theme.id}" style="--theme-preview:${theme.preview}"><span>${theme.label}</span><i class="fa-solid fa-check"></i></button>`).join("");
    themeGrid.querySelectorAll("button").forEach(button => button.onclick = async () => {
        const previous = activeConversationData?.theme || "default";
        activeConversationData = { ...activeConversationData, theme: button.dataset.theme };
        applyConversationPresentation();
        themeGrid.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
        try { await setDoc(doc(db, "conversations", conversationId(me.uid, activeFriend.id)), { members: [me.uid, activeFriend.id], theme: button.dataset.theme }, { merge: true }); }
        catch (error) { activeConversationData = { ...activeConversationData, theme: previous }; applyConversationPresentation(); }
    });
    renderConversationMediaLibrary(dialog.querySelector(".chat-media-tab.active")?.dataset.mediaFilter || "all");
}

function renderConversationMediaLibrary(filter = "all") {
    const library = document.querySelector(".conversation-settings-dialog .chat-media-library");
    if (!library) return;
    const mediaItems = activeConversationMessages.flatMap(message => {
        if (!message.mediaUrl || message.revoked || message.hiddenFor?.includes(me?.uid)) return [];
        const type = message.mediaType === "video" ? "video" : message.mediaType === "image" || !message.mediaType ? "image" : "file";
        return [{ url: message.mediaUrl, type, name: message.fileName || (type === "image" ? "Ảnh" : type === "video" ? "Video" : "Tệp") }];
    }).filter(item => filter === "all" || item.type === filter);
    if (!mediaItems.length) { library.innerHTML = '<p class="chat-media-empty">Chưa có nội dung nào trong mục này.</p>'; return; }
    library.innerHTML = mediaItems.map((item, index) => item.type === "file" ? `<a class="chat-media-item file" href="${escapeMessageHtml(item.url)}" target="_blank" rel="noopener"><i class="fa-solid fa-file-arrow-down"></i><span>${escapeMessageHtml(item.name)}</span></a>` : `<button type="button" class="chat-media-item" data-media-index="${index}">${item.type === "video" ? `<video src="${escapeMessageHtml(item.url)}" muted preload="metadata" playsinline></video><span><i class="fa-solid fa-play"></i> Video</span>` : `<img src="${escapeMessageHtml(item.url)}" alt="Ảnh đã gửi">`}</button>`).join("");
    library.querySelectorAll("button[data-media-index]").forEach(button => button.onclick = () => {
        const item = mediaItems[Number(button.dataset.mediaIndex)];
        document.querySelector(".conversation-settings-dialog")?.close();
        openMessageMediaViewer(item.url, item.type);
    });
}

function openConversationSettings() {
    if (!activeFriend) return;
    chatSettings.open();
}

function resolveProfileAvatar(profile, isOwn = false) {
    const storedAvatar = profile?.photoURL || profile?.profileImage;
    if (storedAvatar) return storedAvatar;
    const hasPersistedAvatarState = profile
        && (Object.prototype.hasOwnProperty.call(profile, "photoURL")
            || Object.prototype.hasOwnProperty.call(profile, "profileImage"));
    if (isOwn && !hasPersistedAvatarState && me?.photoURL) return me.photoURL;
    return resolveAvatarUrl("", { uid: profile?.uid || profile?.id || (isOwn ? me?.uid : ""), displayName: meaningfulName(profile) });
}

async function sendPostFromChat(friend, sharedPost, post, noteText) {
    const id=conversationId(me.uid,friend.id),media=post.attachedImages?.[0]||(post.attachedImage?{url:post.attachedImage,type:post.mediaType}:null);
    await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:friend.id,content:noteText.trim(),sharedPost:{id:sharedPost.id,authorId:post.authorId,authorName:post.authorDisplayName||sharedPost.authorName||"Thành viên VHHT",content:post.content||"",mediaUrl:media?.url||null,mediaType:media?.type||null},createdAt:serverTimestamp(),readAt:null});
    await markConversationActivity(friend.id);
    await Promise.all([
        addDoc(collection(db,"posts",sharedPost.id,"shares"),{sharerId:me.uid,recipientId:friend.id,createdAt:serverTimestamp()}),
        updateDoc(doc(db,"posts",sharedPost.id),{shareCount:increment(1)})
    ]);
    await addDoc(collection(db,"messageNotifications"),{recipientId:friend.id,senderId:me.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()});
}

function openChatShareDialog(sharedPost,post) {
    let overlay=document.querySelector(".chat-share-overlay");
    if(!overlay){overlay=document.createElement("div");overlay.className="chat-share-overlay";overlay.innerHTML='<section role="dialog" aria-modal="true"><header><div><small>GỬI QUA TIN NHẮN</small><strong>Chia sẻ với bạn bè</strong></div><button type="button" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></header><textarea maxlength="500" placeholder="Viết lời nhắn đi kèm…"></textarea><div class="chat-share-list"></div></section>';document.body.appendChild(overlay);overlay.querySelector("header button").onclick=()=>overlay.classList.remove("show");overlay.onclick=event=>{if(event.target===overlay)overlay.classList.remove("show")}}
    overlay.querySelector("textarea").value="";
    const list=overlay.querySelector(".chat-share-list");
    list.innerHTML=friends.length?friends.map(friend=>`<div data-id="${friend.id}"><img src="${escapeMessageHtml(resolveProfileAvatar(friend))}" alt=""><strong>${escapeMessageHtml(meaningfulName(friend))}</strong><button type="button" aria-label="Gửi"><i class="fa-solid fa-paper-plane"></i><span>Gửi</span></button></div>`).join(""):'<p>Chưa có bạn bè phù hợp để chia sẻ.</p>';
    list.querySelectorAll("button").forEach(button=>button.onclick=async()=>{const friend=friends.find(item=>item.id===button.closest("[data-id]").dataset.id);if(!friend)return;button.disabled=true;try{await sendPostFromChat(friend,sharedPost,post,overlay.querySelector("textarea").value);button.classList.add("sent");button.innerHTML='<i class="fa-solid fa-check"></i><span>Đã gửi</span>'}catch(error){button.disabled=false;button.title=error.message}});
    overlay.classList.add("show");
}

startPresenceTracking();
const mediaInput=document.createElement("input");mediaInput.type="file";mediaInput.accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";mediaInput.hidden=true;mediaInput.id="message-media-input";
const mediaButton=document.createElement("button");mediaButton.type="button";mediaButton.className="message-tool message-media-button";mediaButton.innerHTML='<i class="fa-solid fa-photo-film"></i>';mediaButton.title="Gửi ảnh hoặc video";mediaButton.onclick=()=>mediaInput.click();
const mediaPreview=document.createElement("section");mediaPreview.className="message-media-preview";mediaPreview.hidden=true;mediaPreview.setAttribute("aria-label","Ảnh hoặc video sắp gửi");
const clearSelectedMessageMedia=()=>{
    if(messageMediaPreviewUrl)URL.revokeObjectURL(messageMediaPreviewUrl);
    messageMediaPreviewUrl="";mediaInput.value="";mediaPreview.replaceChildren();mediaPreview.hidden=true;
    mediaButton.classList.remove("has-media");mediaButton.title="Gửi ảnh hoặc video";
    $("message-form").classList.remove("has-media-preview");
};
const renderSelectedMessageMedia=()=>{
    const file=mediaInput.files[0];
    if(!file){clearSelectedMessageMedia();return}
    if(messageMediaPreviewUrl)URL.revokeObjectURL(messageMediaPreviewUrl);
    messageMediaPreviewUrl=URL.createObjectURL(file);
    const visual=file.type.startsWith("video/")?document.createElement("video"):document.createElement("img");
    visual.src=messageMediaPreviewUrl;visual.className="message-media-preview-visual";
    if(visual.tagName==="VIDEO"){visual.controls=true;visual.muted=true;visual.playsInline=true;visual.preload="metadata"}
    const copy=document.createElement("span"),name=document.createElement("strong"),meta=document.createElement("small"),remove=document.createElement("button");
    name.textContent=file.name;meta.textContent=`${file.type.startsWith("video/")?"Video":"Ảnh"} · ${Math.max(1,Math.round(file.size/1024))} KB`;
    copy.append(name,meta);remove.type="button";remove.className="message-media-preview-remove";remove.setAttribute("aria-label","Bỏ tệp đã chọn");remove.innerHTML='<i class="fa-solid fa-xmark"></i>';remove.onclick=clearSelectedMessageMedia;
    mediaPreview.replaceChildren(visual,copy,remove);mediaPreview.hidden=false;mediaButton.classList.add("has-media");mediaButton.title=`Đã chọn: ${file.name}`;
    $("message-form").classList.add("has-media-preview");
    $("message-form").querySelector(".send-message-button").disabled=!activeFriend;
};
$("message-form").prepend(mediaPreview);$("message-form").insertBefore(mediaButton,$("message-input"));$("message-form").appendChild(mediaInput);
mediaInput.onchange=renderSelectedMessageMedia;

const replyPreview=document.createElement("section");
replyPreview.className="message-reply-preview";
replyPreview.hidden=true;
$('message-form').prepend(replyPreview);

function messagePreviewText(message={}) {
    if(message.revoked)return"Tin nhắn đã bị thu hồi";
    if(message.content?.trim())return message.content.trim();
    if(message.mediaUrl)return message.mediaType==="video"?"Video":"Ảnh";
    if(message.sharedPost)return"Bài viết được chia sẻ";
    if(message.noteReply)return`Trả lời ghi chú: ${message.noteReply.content||""}`;
    return"Tin nhắn";
}

function clearMessageReply(){
    selectedMessageReply=null;
    replyPreview.hidden=true;
    replyPreview.replaceChildren();
    $('message-form').classList.remove('has-reply-preview');
}

function selectMessageReply(messageId,message){
    if(message.revoked)return;
    const senderName=message.senderId===me.uid?"Bạn":resolveDisplayName(activeFriend||{});
    selectedMessageReply={id:messageId,senderId:message.senderId,senderName,content:messagePreviewText(message).slice(0,240)};
    replyPreview.innerHTML=`<span><small>Đang trả lời ${escapeMessageHtml(senderName)}</small><strong>${escapeMessageHtml(selectedMessageReply.content)}</strong></span><button type="button" aria-label="Hủy trả lời"><i class="fa-solid fa-xmark"></i></button>`;
    replyPreview.querySelector('button').onclick=clearMessageReply;
    replyPreview.hidden=false;
    $('message-form').classList.add('has-reply-preview');
    $('message-input').focus({preventScroll:true});
}

function closeMessageActionMenu(){
    activeMessageActionMenu?.remove();
    activeMessageActionMenu=null;
}

async function reactToMessage(reference,message,type){
    if(message.revoked)return;
    const reactions={...(message.reactions||{})};
    if(reactions[me.uid]===type)delete reactions[me.uid];else reactions[me.uid]=type;
    await updateDoc(reference,{reactions});
}

async function hideMessageForMe(reference,message){
    if((message.hiddenFor||[]).includes(me.uid))return;
    await updateDoc(reference,{hiddenFor:arrayUnion(me.uid)});
}

async function recallMessage(reference,message){
    if(message.senderId!==me.uid||message.revoked)return;
    await updateDoc(reference,{revoked:true,revokedAt:serverTimestamp(),content:"",mediaUrl:null,mediaType:null,mediaPublicId:null,sharedPost:null,noteReply:null,replyTo:null,reactions:{}});
}

async function remindMessage(message){
    if(!activeFriend)return;
    const content=`Đã nhắc lại: “${messagePreviewText(message).slice(0,280)}”`;
    const id=conversationId(me.uid,activeFriend.id);
    forceConversationEndUntil=Date.now()+1400;
    await addDoc(collection(db,'conversations',id,'messages'),{senderId:me.uid,recipientId:activeFriend.id,content,reminderOf:{content:messagePreviewText(message).slice(0,280)},createdAt:serverTimestamp(),readAt:null});
    await markConversationActivity(activeFriend.id);
    addDoc(collection(db,'messageNotifications'),{recipientId:activeFriend.id,senderId:me.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()}).catch(console.warn);
}

async function copyMessage(message){
    const text=messagePreviewText(message);
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else{const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove()}
}

function openMessageActionMenu(anchor,reference,message,{reactionsOnly=false}={}){
    closeMessageActionMenu();
    const menu=document.createElement('section');
    menu.className='message-action-menu';
    menu.setAttribute('role','dialog');
    menu.setAttribute('aria-label','Thao tác với tin nhắn');
    const reactionBar=document.createElement('div');
    reactionBar.className='message-action-reactions';
    Object.entries(MESSAGE_REACTIONS).forEach(([type,emoji])=>{
        const button=document.createElement('button');button.type='button';button.textContent=emoji;button.setAttribute('aria-label',`Thả ${emoji}`);
        button.classList.toggle('active',message.reactions?.[me.uid]===type);
        button.onclick=async()=>{await reactToMessage(reference,message,type);closeMessageActionMenu()};
        reactionBar.appendChild(button);
    });
    menu.appendChild(reactionBar);
    if(!reactionsOnly){
        const actions=document.createElement('div');actions.className='message-action-list';
        const addAction=(icon,label,handler,danger=false)=>{const button=document.createElement('button');button.type='button';button.className=danger?'danger':'';button.innerHTML=`<i class="${icon}"></i><span>${label}</span>`;button.onclick=async()=>{closeMessageActionMenu();try{await handler()}catch(error){console.error(label,error)}};actions.appendChild(button)};
        if(!message.revoked)addAction('fa-solid fa-reply','Trả lời',()=>selectMessageReply(reference.id,message));
        addAction('fa-regular fa-eye-slash','Xóa phía bạn',()=>hideMessageForMe(reference,message),true);
        if(!message.revoked){
            addAction('fa-solid fa-bell','Nhắc lại',()=>remindMessage(message));
            addAction('fa-regular fa-copy','Sao chép',()=>copyMessage(message));
        }
        if(message.senderId===me.uid&&!message.revoked)addAction('fa-solid fa-rotate-left','Thu hồi với mọi người',()=>recallMessage(reference,message),true);
        menu.appendChild(actions);
    }
    const compact=innerWidth<=760;
    if(compact)menu.classList.add('message-action-menu-mobile');
    if(reactionsOnly)menu.classList.add('reactions-only');
    document.body.appendChild(menu);activeMessageActionMenu=menu;
    const targetAnchor=anchor.classList?.contains('message-row')?(anchor.querySelector('.message')||anchor):anchor;
    const rect=targetAnchor.getBoundingClientRect(),viewport=window.visualViewport;
    const viewportLeft=viewport?.offsetLeft||0,viewportTop=viewport?.offsetTop||0;
    const viewportWidth=viewport?.width||innerWidth,viewportHeight=viewport?.height||innerHeight;
    const menuWidth=Math.min(compact?(reactionsOnly?286:272):350,viewportWidth-16,menu.offsetWidth||350);
    menu.style.width=`${menuWidth}px`;
    let left=rect.left+rect.width/2-menuWidth/2;
    left=Math.max(viewportLeft+8,Math.min(viewportLeft+viewportWidth-menuWidth-8,left));
    let top=rect.top-menu.offsetHeight-8;
    if(top<viewportTop+8)top=rect.bottom+8;
    top=Math.max(viewportTop+8,Math.min(viewportTop+viewportHeight-menu.offsetHeight-8,top));
    menu.style.left=`${left}px`;menu.style.top=`${top}px`;
    requestAnimationFrame(()=>menu.classList.add('show'));
}

function scrollToRepliedMessage(messageId){
    const target=$('messages-list').querySelector(`.message-row[data-message-id="${CSS.escape(messageId)}"]`);
    if(!target)return;
    target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('reply-target-flash');
    setTimeout(()=>target.classList.remove('reply-target-flash'),1200);
}

function bindMessageGestures(row,reference,message){
    let startX=0,startY=0,dragging=false,moved=false,activeBubble=null,activePointerId=null;
    row.addEventListener('pointerdown',event=>{
        if(event.button!==0||event.target.closest('button,a'))return;
        const bubble=event.target.closest('.message');
        if(!bubble||!row.contains(bubble)||bubble.classList.contains('message-system-event'))return;
        activeBubble=bubble;activePointerId=event.pointerId;
        startX=event.clientX;startY=event.clientY;dragging=false;moved=false;
    });
    row.addEventListener('pointermove',event=>{
        if(activePointerId!==event.pointerId||!activeBubble||event.pointerType==='mouse')return;
        const dx=event.clientX-startX,dy=event.clientY-startY;
        if(Math.abs(dx)>9||Math.abs(dy)>9)moved=true;
        if(message.senderId!==me.uid&&dx>0&&Math.abs(dx)>Math.abs(dy)){dragging=true;row.style.setProperty('--reply-drag',`${Math.min(68,dx)}px`)}
    });
    const finish=event=>{
        if(activePointerId!==event.pointerId||!activeBubble)return;
        const dx=event.clientX-startX;row.style.removeProperty('--reply-drag');startX=0;
        if(dragging&&dx>52){event.preventDefault();selectMessageReply(reference.id,message)}
        else if(!moved&&event.pointerType!=="mouse"){event.preventDefault();suppressMessageMenuCloseUntil=Date.now()+450;openMessageActionMenu(activeBubble,reference,message)}
        dragging=false;activeBubble=null;activePointerId=null;
    };
    row.addEventListener('pointerup',finish);row.addEventListener('pointercancel',()=>{row.style.removeProperty('--reply-drag');startX=0;dragging=false;moved=false;activeBubble=null;activePointerId=null});
    row.addEventListener('contextmenu',event=>{if(matchMedia('(pointer: coarse)').matches&&event.target.closest('.message:not(.message-system-event)'))event.preventDefault()});
}

function closeMessageMediaViewer() {
    const viewer = document.querySelector(".message-media-viewer");
    if (!viewer) return;
    viewer.classList.remove("show");
    viewer.querySelector(".message-media-viewer-stage")?.replaceChildren();
    document.body.classList.remove("message-media-viewer-open");
    messageMediaViewerPointers.clear();
}

function applyMessageMediaViewerTransform(viewer) {
    const visual = viewer.querySelector(".message-media-viewer-visual");
    if (!visual) return;
    visual.style.transform = `translate3d(${messageMediaViewerX}px,${messageMediaViewerY}px,0) scale(${messageMediaViewerScale})`;
    viewer.querySelector("[data-media-zoom-value]").textContent = `${Math.round(messageMediaViewerScale * 100)}%`;
}

function setMessageMediaViewerScale(viewer, nextScale) {
    messageMediaViewerScale = Math.min(5, Math.max(1, nextScale));
    if (messageMediaViewerScale === 1) messageMediaViewerX = messageMediaViewerY = 0;
    applyMessageMediaViewerTransform(viewer);
}

function ensureMessageMediaViewer() {
    let viewer = document.querySelector(".message-media-viewer");
    if (viewer) return viewer;
    viewer = document.createElement("div");
    viewer.className = "message-media-viewer";
    viewer.innerHTML = `<div class="message-media-viewer-stage"></div><div class="message-media-viewer-toolbar"><button type="button" data-media-zoom-out aria-label="Thu nhỏ"><i class="fa-solid fa-minus"></i></button><span data-media-zoom-value>100%</span><button type="button" data-media-zoom-in aria-label="Phóng to"><i class="fa-solid fa-plus"></i></button><button type="button" data-media-zoom-reset aria-label="Đặt lại"><i class="fa-solid fa-rotate-left"></i></button></div><button type="button" class="message-media-viewer-close" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button>`;
    document.body.appendChild(viewer);
    viewer.querySelector(".message-media-viewer-close").onclick = closeMessageMediaViewer;
    viewer.querySelector("[data-media-zoom-out]").onclick = () => setMessageMediaViewerScale(viewer, messageMediaViewerScale - .25);
    viewer.querySelector("[data-media-zoom-in]").onclick = () => setMessageMediaViewerScale(viewer, messageMediaViewerScale + .25);
    viewer.querySelector("[data-media-zoom-reset]").onclick = () => { messageMediaViewerX = messageMediaViewerY = 0; setMessageMediaViewerScale(viewer, 1); };
    viewer.addEventListener("wheel", event => { event.preventDefault(); setMessageMediaViewerScale(viewer, messageMediaViewerScale + (event.deltaY < 0 ? .18 : -.18)); }, { passive: false });
    const stage = viewer.querySelector(".message-media-viewer-stage");
    stage.addEventListener("pointerdown", event => {
        if (event.target.closest("video")) return;
        event.preventDefault();
        messageMediaViewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        stage.setPointerCapture?.(event.pointerId);
        if (messageMediaViewerPointers.size === 2) {
            const [first, second] = [...messageMediaViewerPointers.values()];
            messageMediaViewerPinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
            messageMediaViewerPinchScale = messageMediaViewerScale;
        }
    });
    stage.addEventListener("pointermove", event => {
        const previous = messageMediaViewerPointers.get(event.pointerId);
        if (!previous) return;
        event.preventDefault();
        messageMediaViewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (messageMediaViewerPointers.size === 2) {
            const [first, second] = [...messageMediaViewerPointers.values()];
            const distance = Math.hypot(first.x - second.x, first.y - second.y);
            setMessageMediaViewerScale(viewer, messageMediaViewerPinchScale * distance / (messageMediaViewerPinchDistance || distance));
        } else if (messageMediaViewerScale > 1) {
            messageMediaViewerX += event.clientX - previous.x;
            messageMediaViewerY += event.clientY - previous.y;
            applyMessageMediaViewerTransform(viewer);
        }
    }, { passive: false });
    const release = event => messageMediaViewerPointers.delete(event.pointerId);
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    viewer.addEventListener("click", event => { if (event.target === viewer) closeMessageMediaViewer(); });
    return viewer;
}

function openMessageMediaViewer(url, type = "image") {
    const viewer = ensureMessageMediaViewer();
    const stage = viewer.querySelector(".message-media-viewer-stage");
    const visual = document.createElement(type === "video" ? "video" : "img");
    visual.src = url;
    visual.className = "message-media-viewer-visual";
    if (visual.tagName === "VIDEO") { visual.controls = true; visual.autoplay = true; visual.playsInline = true; }
    else visual.alt = "Ảnh trong tin nhắn";
    stage.replaceChildren(visual);
    messageMediaViewerScale = 1; messageMediaViewerX = 0; messageMediaViewerY = 0;
    applyMessageMediaViewerTransform(viewer);
    viewer.classList.add("show");
    document.body.classList.add("message-media-viewer-open");
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.querySelector(".message-media-viewer.show")) closeMessageMediaViewer();
});

onAuthStateChanged(auth, async user => {
    if (!user) { location.href = "../../authentication/login-page.html"; return; }
    me = user;
    try {
        await loadFriends();
        subscribeToConversationList();
        stopOwnProfile?.();
        stopOwnProfile = onSnapshot(doc(db, "users", me.uid), snapshot => {
            if (!snapshot.exists()) return;
            const data = snapshot.data();
            ownProfile = { email: me.email || "", ...data, id: me.uid };
            const persistedFriendIds = new Set(data.friends || []);
            noteAudienceIds = friends.map(friend => friend.id).filter(id => persistedFriendIds.has(id));
            renderMessengerNotes();
        }, error => console.warn("Không thể đồng bộ hồ sơ trong tin nhắn", error));
        subscribeToMessengerNotes();
        const requested = new URLSearchParams(location.search).get("uid");
        if(requested&&!friends.some(friend=>friend.id===requested)&&requested!==me.uid){
            const requestedSnapshot=await getDoc(doc(db,"users",requested));
            if(requestedSnapshot.exists()){
                const contact={id:requested,...requestedSnapshot.data()};
                const adminConversation=contact.role==="admin";
                const canMessage=!adminConversation||(ownProfile.following||[]).includes(requested)||(contact.followers||[]).includes(me.uid);
                if(canMessage&&contact.accountStatus!=="suspended")friends.push(contact);
            }
            applyConversationView();
        }
        if (requested && friends.some(friend => friend.id === requested)) await openChat(requested);
    } catch (error) {
        console.error("Không thể tải bạn bè", error);
        $("friends-list").innerHTML = `<div class="message-load-error">${error.message || "Không thể tải danh sách bạn bè"}</div>`;
    }
});

async function loadFriends() {
    const ownReference = doc(db, "users", me.uid);
    const [ownSnapshot, usersSnapshot, notificationsSnapshot, conversationsSnapshot] = await Promise.all([
        getDoc(ownReference),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "notifications")),
        getDocs(query(collection(db,"conversations"),where("members","array-contains",me.uid))).catch(error=>{console.warn("Không thể tải liên hệ từ hội thoại",error);return{forEach(){}}})
    ]);
    const own = ownSnapshot.data() || {}, requestedFriendIds = new Set(own.friends || []), profiles = new Map();
    const acceptedFriendIds = new Set();
    ownProfile = { email: me.email || "", ...own, id: me.uid };
    usersSnapshot.forEach(snapshot => {
        const data = snapshot.data(); profiles.set(snapshot.id, data);
    });
    notificationsSnapshot.forEach(snapshot => {
        const notification = snapshot.data();
        const participants = [notification.actorId, notification.recipientId];
        if (!participants.includes(me.uid)) return;
        const otherUserId = participants.find(id => id && id !== me.uid);
        if (!otherUserId) return;
        if (notification.type === "friend_accepted"
            || (notification.type === "friend_request" && notification.friendRequestStatus === "accepted")) {
            acceptedFriendIds.add(otherUserId);
        }
    });
    // Danh sách của tài khoản đang đăng nhập là nguồn hiển thị. Không hợp nhất
    // quan hệ chỉ còn ở phía người khác vì đó có thể là dữ liệu cũ sau khi hủy bạn.
    const friendIds = new Set([...requestedFriendIds].filter(id => {
        const profile = profiles.get(id);
        if (!profile) return false;
        return profile.role !== "admin" || acceptedFriendIds.has(id);
    }));
    // Khôi phục quan hệ cũ đang chỉ nằm ở phía người bạn khi có lịch sử xác nhận
    // kết bạn rõ ràng. Không dùng mọi quan hệ ngược nên tài khoản lạ/Admin cũ
    // sẽ không bị kéo vào danh sách chỉ vì còn một ID dư trong Firestore.
    acceptedFriendIds.forEach(userId => {
        const profile = profiles.get(userId);
        if (profile && (profile.friends || []).includes(me.uid)) friendIds.add(userId);
    });
    const legacyConversations=[];
    conversationsSnapshot.forEach(snapshot=>{
        const conversation=snapshot.data(),otherId=(conversation.members||[]).find(id=>id&&id!==me.uid),profile=profiles.get(otherId);
        if(!profile||profile.accountStatus==="suspended")return;
        const allowed=profile.role!=="admin"||(own.following||[]).includes(otherId)||(profile.followers||[]).includes(me.uid);
        if(allowed){
            friendIds.add(otherId);
            conversationActivityByFriend.set(otherId,timestampMillis(conversation.lastMessageAt||conversation.updatedAt));
            if(!conversation.lastMessageAt)legacyConversations.push({conversationId:snapshot.id,otherId});
        }
    });
    // Dữ liệu cũ từng dùng updatedAt cho cả thao tác mở/cài đặt đoạn chat. Lấy thời
    // gian từ tin nhắn thật để một lần nhấp tuyệt đối không thể làm đổi thứ tự.
    await Promise.all(legacyConversations.map(async item=>{
        try{
            const latest=await getDocs(query(collection(db,"conversations",item.conversationId,"messages"),orderBy("createdAt","desc"),limit(1)));
            const latestMessage=latest.docs[0]?.data();
            const actualActivity=timestampMillis(latestMessage?.createdAt);
            if(actualActivity){
                conversationActivityByFriend.set(item.otherId,actualActivity);
                await setDoc(doc(db,"conversations",item.conversationId),{lastMessageAt:latestMessage.createdAt},{merge:true});
            }else conversationActivityByFriend.delete(item.otherId);
        }catch(error){
            console.warn("Chưa thể chuẩn hóa thời gian hội thoại cũ",item.conversationId,error);
        }
    }));
    friendIds.delete(me.uid);
    friends = [...friendIds].map(id => ({ ...(profiles.get(id) || {}), id })).filter(friend => friend.accountStatus !== "suspended");
    friends.sort((first, second) => resolveDisplayName(first).localeCompare(resolveDisplayName(second), "vi"));
    // Chỉ đưa quan hệ đã có ở phía hiện tại vào quyền xem ghi chú ngay lập tức.
    // Quan hệ phía ngược sẽ được thêm sau khi sửa hai chiều thành công.
    const synchronizedAudienceIds = new Set([...requestedFriendIds].filter(id => friendIds.has(id)));
    noteAudienceIds = friends.map(friend => friend.id).filter(id => synchronizedAudienceIds.has(id));
    applyConversationView();
    // Liên hệ từng trò chuyện không đồng nghĩa với bạn bè. Chỉ giữ quan hệ đã lưu
    // thật sự để thông báo "chưa là bạn bè" và quyền riêng tư hoạt động chính xác.
    ownProfile.friends = [...synchronizedAudienceIds];
    const asymmetricFriendIds = [...synchronizedAudienceIds].filter(id => !(profiles.get(id)?.friends || []).includes(me.uid));
    if (asymmetricFriendIds.length) {
        Promise.allSettled(asymmetricFriendIds.map(id => repairFriendship(me.uid, id)))
            .then(results => {
                results.forEach((result, index) => {
                    if (result.status === "fulfilled" && result.value === true) synchronizedAudienceIds.add(asymmetricFriendIds[index]);
                    else if (result.status === "rejected") console.warn("Chưa thể đồng bộ quan hệ bạn bè cũ", result.reason);
                });
                noteAudienceIds = friends.map(friend => friend.id).filter(id => synchronizedAudienceIds.has(id));
            });
    }
}

function subscribeToConversationList(){
    stopConversationList?.();
    stopConversationList=onSnapshot(query(collection(db,"conversations"),where("members","array-contains",me.uid)),async snapshot=>{
        const missing=[];
        snapshot.forEach(item=>{
            const data=item.data(),otherId=(data.members||[]).find(id=>id&&id!==me.uid);
            if(!otherId)return;
            const serverActivity=timestampMillis(data.lastMessageAt);
            if(serverActivity) conversationActivityByFriend.set(otherId,serverActivity);
            else conversationActivityByFriend.delete(otherId);
            if(!friends.some(friend=>friend.id===otherId))missing.push(otherId);
        });
        if(missing.length){
            const profiles=await Promise.all([...new Set(missing)].map(async id=>{const result=await getDoc(doc(db,"users",id));return result.exists()?{id,...result.data()}:null}));
            profiles.filter(Boolean).forEach(profile=>{
                const allowed=profile.accountStatus!=="suspended"&&(profile.role!=="admin"||(ownProfile?.following||[]).includes(profile.id)||(profile.followers||[]).includes(me.uid));
                if(allowed&&!friends.some(friend=>friend.id===profile.id))friends.push(profile);
            });
        }
        applyConversationView();
    },error=>console.warn("Không thể đồng bộ thứ tự cuộc trò chuyện",error));
}

async function markConversationActivity(friendId){
    if(!me||!friendId)return;
    conversationActivityByFriend.set(friendId,Date.now());
    applyConversationView();
    try{
        await setDoc(doc(db,"conversations",conversationId(me.uid,friendId)),{members:[me.uid,friendId],lastMessageAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
    }catch(error){
        console.warn("Tin nhắn đã gửi nhưng chưa thể đồng bộ thứ tự hội thoại",error);
    }
}

function renderFriends(items) {
    if ($("conversation-count")) $("conversation-count").textContent = items.length;
    const list = $("friends-list"); list.replaceChildren();
    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "conversation-empty-state";
        const searched = Boolean($("friend-filter")?.value.trim());
        const emptyStates = {
            unread: ["fa-circle-check", "Bạn đã đọc hết tin nhắn", "Tin nhắn mới chưa đọc sẽ xuất hiện tại đây."],
            active: ["fa-user-clock", "Chưa có ai đang hoạt động", "Bạn bè trực tuyến sẽ được ưu tiên hiển thị tại đây."],
            notes: ["fa-note-sticky", "Chưa có ghi chú mới", "Ghi chú 24 giờ của bạn bè sẽ xuất hiện tại đây."],
            all: ["fa-user-group", "Chưa có cuộc trò chuyện", "Kết bạn với thành viên khác để bắt đầu nhắn tin."]
        };
        const [icon, title, description] = searched
            ? ["fa-magnifying-glass", "Không tìm thấy người phù hợp", "Hãy thử một tên hiển thị khác."]
            : (emptyStates[activeConversationFilter] || emptyStates.all);
        empty.innerHTML = `<i class="fa-solid ${icon}"></i><strong>${title}</strong><small>${description}</small>`;
        list.appendChild(empty);
        return;
    }
    items.forEach(friend => {
        const row=document.createElement("div");row.className="friend-row";row.dataset.id=friend.id;row.dataset.uiSound="open-panel";row.tabIndex=0;row.setAttribute("role","button");
        const image=document.createElement("img");image.src=friend.photoURL||friend.profileImage||DEFAULT_AVATAR;
        const dot=document.createElement("i"),content=document.createElement("span"),name=document.createElement("strong"),status=document.createElement("small"),online=isUserActive(friend);
        const prefs=JSON.parse(localStorage.getItem(`vhht-chat-prefs:${me.uid}:${friend.id}`)||"{}");
        const badge=document.createElement("b"),unread=Math.max(unreadCounts.get(friend.id)||0,prefs.manualUnread?1:0);badge.className="friend-unread-badge";badge.textContent=unread;badge.hidden=!unread;
        const indicators=document.createElement("span");indicators.className="friend-state-indicators";if(prefs.pinned)indicators.innerHTML+='<i class="fa-solid fa-thumbtack" title="Đã ghim"></i>';if(prefs.mutedUntil>Date.now())indicators.innerHTML+='<i class="fa-solid fa-bell-slash" title="Đang tắt thông báo"></i>';
        const menuButton=document.createElement("button");menuButton.type="button";menuButton.className="friend-quick-menu";menuButton.title="Tùy chọn đoạn chat";menuButton.setAttribute("aria-label",`Tùy chọn đoạn chat với ${resolveDisplayName(friend)}`);menuButton.innerHTML='<i class="fa-solid fa-ellipsis"></i>';
        dot.className=`presence-dot ${online?"online":""}`;name.textContent=conversationNicknamesByFriend.get(friend.id)||resolveDisplayName(friend);status.className=online?"presence":"";status.textContent=prefs.mutedUntil>Date.now()?`Tắt thông báo đến ${new Date(prefs.mutedUntil).toLocaleString("vi-VN",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"})}`:formatActivity(friend);content.append(name,status);row.append(image,dot,content,indicators,badge,menuButton);
        row.onclick=event=>{if(!event.target.closest(".friend-quick-menu"))openChat(friend.id)};row.onkeydown=event=>{if((event.key==="Enter"||event.key===" ")&&!event.target.closest(".friend-quick-menu")){event.preventDefault();openChat(friend.id)}};
        menuButton.onclick=event=>{event.stopPropagation();openConversationQuickMenu(menuButton,friend)};list.appendChild(row);hydrateConversationNickname(friend,row);
    });
    document.dispatchEvent(new CustomEvent("friends-rendered"));
}

function openConversationQuickMenu(anchor, friend) {
    document.querySelector(".conversation-row-menu")?.remove();
    const key=`vhht-chat-prefs:${me.uid}:${friend.id}`,prefs=JSON.parse(localStorage.getItem(key)||"{}");
    const menu=document.createElement("div");menu.className="conversation-row-menu";
    const hasUnread=(unreadCounts.get(friend.id)||0)>0||prefs.manualUnread;
    menu.innerHTML=`<button data-action="read"><i class="fa-solid ${hasUnread?"fa-envelope-open":"fa-envelope"}"></i>${hasUnread?"Đánh dấu đã đọc":"Đánh dấu chưa đọc"}</button><button data-action="pin"><i class="fa-solid fa-thumbtack"></i>${prefs.pinned?"Bỏ ghim":"Ghim đoạn chat"}</button><button data-action="mute"><i class="fa-solid ${prefs.mutedUntil>Date.now()?"fa-bell":"fa-bell-slash"}"></i>${prefs.mutedUntil>Date.now()?"Bật lại thông báo":"Tắt thông báo"}</button><button class="danger" data-action="delete"><i class="fa-solid fa-trash-can"></i>Xóa đoạn chat</button>`;
    document.body.appendChild(menu);const rect=anchor.getBoundingClientRect();menu.style.left=`${Math.max(10,Math.min(innerWidth-menu.offsetWidth-10,rect.right-menu.offsetWidth))}px`;menu.style.top=`${Math.min(innerHeight-menu.offsetHeight-10,rect.bottom+6)}px`;
    const close=()=>menu.remove();setTimeout(()=>document.addEventListener("click",close,{once:true}),0);
    menu.onclick=event=>{event.stopPropagation();const action=event.target.closest("button")?.dataset.action;if(!action)return;
        if(action==="read"){if(hasUnread){prefs.manualUnread=false;unreadCounts.set(friend.id,0);markConversationRead(friend.id)}else prefs.manualUnread=true}
        if(action==="pin")prefs.pinned=!prefs.pinned;
        if(action==="mute"){if(prefs.mutedUntil>Date.now()){setConversationMute(friend,0).then(close);return}renderInlineMuteChoices(menu,friend,close);return}
        localStorage.setItem(key,JSON.stringify(prefs));close();
        if(action==="delete"){showChatConfirm({friend,title:"Xóa đoạn chat?",message:`Toàn bộ tin nhắn trong đoạn chat với ${resolveDisplayName(friend)} sẽ biến mất ở phía bạn. Người kia vẫn giữ nguyên tin nhắn, biệt danh và các tùy chỉnh đoạn chat.`,confirmText:"Xóa đoạn chat"}).then(confirmed=>{if(confirmed)deleteConversationForMe(friend).catch(error=>alert(error.message||"Không thể xóa đoạn chat."))});}
        applyConversationView();
    };
}

function renderInlineMuteChoices(menu,friend,close){
    const choices=[[3600000,"1 giờ"],[28800000,"8 giờ"],[86400000,"24 giờ"],[315360000000,"Đến khi bật lại"]];
    menu.classList.add("conversation-mute-menu");menu.innerHTML=`<header><button type="button" data-mute-back aria-label="Quay lại"><i class="fa-solid fa-arrow-left"></i></button><span><strong>Tắt thông báo</strong><small>Chọn thời gian</small></span></header>${choices.map(([duration,label])=>`<button type="button" data-mute-for="${duration}"><i class="fa-regular fa-clock"></i><span>${label}</span></button>`).join("")}`;
    menu.querySelector("[data-mute-back]").onclick=event=>{event.stopPropagation();close();const row=document.querySelector(`.friend-row[data-id="${CSS.escape(friend.id)}"] .friend-quick-menu`);if(row)openConversationQuickMenu(row,friend)};
    menu.querySelectorAll("[data-mute-for]").forEach(button=>button.onclick=event=>{event.stopPropagation();button.disabled=true;setConversationMute(friend,Number(button.dataset.muteFor)).then(close).catch(error=>{button.disabled=false;alert(error.message||"Không thể tắt thông báo.")})});
}

async function setConversationMute(friend,duration){
    const mutedUntil=duration?new Date(Date.now()+duration):null,id=conversationId(me.uid,friend.id);
    await setDoc(doc(db,"conversations",id),{members:[me.uid,friend.id]},{merge:true});
    await setDoc(doc(db,"conversations",id,"memberSettings",me.uid),{mutedUntil,updatedAt:serverTimestamp()},{merge:true});
    document.dispatchEvent(new CustomEvent("chat-mute-updated",{detail:{conversationId:id,friendId:friend.id,muted:Boolean(duration),mutedUntil:mutedUntil?.getTime?.()||0}}));
}

function showChatConfirm({friend,title,message,confirmText}){
    return new Promise(resolve=>{const dialog=document.createElement("dialog");dialog.className="chat-confirm-dialog";dialog.innerHTML=`<form method="dialog"><span class="chat-confirm-icon"><i class="fa-solid fa-trash-can"></i></span><div><h2>${escapeMessageHtml(title)}</h2><p>${escapeMessageHtml(message)}</p></div><footer><button value="cancel">Giữ đoạn chat</button><button class="danger" value="confirm">${escapeMessageHtml(confirmText)}</button></footer></form>`;document.body.appendChild(dialog);dialog.addEventListener("close",()=>{const accepted=dialog.returnValue==="confirm";dialog.remove();resolve(accepted)},{once:true});dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close("cancel")});dialog.showModal()});
}

async function deleteConversationForMe(friend){
    const id=conversationId(me.uid,friend.id),snapshot=await getDocs(collection(db,"conversations",id,"messages"));
    const targets=snapshot.docs.filter(item=>!(item.data().hiddenFor||[]).includes(me.uid));
    for(let offset=0;offset<targets.length;offset+=400){const batch=writeBatch(db);targets.slice(offset,offset+400).forEach(item=>batch.update(item.ref,{hiddenFor:arrayUnion(me.uid)}));await batch.commit()}
    await markConversationRead(friend.id);if(activeFriend?.id===friend.id)$("messages-list").innerHTML='<div class="welcome-signal"><h2>Đoạn chat mới</h2><p>Các tin nhắn cũ đã được xóa ở phía bạn. Cài đặt của cuộc trò chuyện vẫn được giữ nguyên.</p></div>';
}

function timestampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    return Number(value) || 0;
}

function activeNoteFor(userId) {
    const note = notesByUser.get(userId);
    return note && timestampMillis(note.expiresAt) > Date.now() ? note : null;
}

function messengerNoteFingerprint(userId,note){return `${userId}:${timestampMillis(note?.createdAt)}:${String(note?.content||"")}`}
function isMessengerNoteSeen(userId,note){return localStorage.getItem(`vhht_note_seen_${userId}`)===messengerNoteFingerprint(userId,note)}
function markMessengerNoteSeen(userId,note){if(note)localStorage.setItem(`vhht_note_seen_${userId}`,messengerNoteFingerprint(userId,note))}

function sortFriendsForMessenger(items) {
    return [...items].sort((first, second) => {
        const firstNote = activeNoteFor(first.id), secondNote = activeNoteFor(second.id);
        if (!!firstNote !== !!secondNote) return firstNote ? -1 : 1;
        if (firstNote && secondNote) return timestampMillis(secondNote.createdAt) - timestampMillis(firstNote.createdAt);
        const firstOnline = isUserActive(first), secondOnline = isUserActive(second);
        if (firstOnline !== secondOnline) return firstOnline ? -1 : 1;
        const activityDifference = timestampMillis(second.lastActiveAt) - timestampMillis(first.lastActiveAt);
        return activityDifference || resolveDisplayName(first).localeCompare(resolveDisplayName(second), "vi");
    });
}

function applyConversationView() {
    if (!$("friends-list")) return;
    const term = $("friend-filter")?.value.trim().toLocaleLowerCase("vi-VN") || "";
    let visible = friends.filter(friend => {
        const hasRealConversation=conversationActivityByFriend.has(friend.id);
        const isTemporaryOpenContact=activeFriend?.id===friend.id;
        return (hasRealConversation||isTemporaryOpenContact)&&`${resolveDisplayName(friend)} ${conversationNicknamesByFriend.get(friend.id) || ""}`.toLocaleLowerCase("vi-VN").includes(term);
    });
    if (activeConversationFilter === "groups") {
        if ($("conversation-count")) $("conversation-count").textContent = "0";
        $("friends-list").innerHTML = '<div class="group-chat-placeholder"><span><i class="fa-solid fa-user-group"></i></span><strong>Nhóm chat</strong><p>Tính năng tạo và quản lý nhóm đang được chuẩn bị cho phiên bản tiếp theo.</p><button type="button" disabled>Sắp ra mắt</button></div>';
        return;
    }
    if (activeConversationFilter === "unread") visible = visible.filter(friend => (unreadCounts.get(friend.id) || 0) > 0);
    if (activeConversationFilter === "active") visible = visible.filter(friend => isUserActive(friend));
    if (activeConversationFilter === "notes") visible = visible.filter(friend => activeNoteFor(friend.id));
    visible=sortFriendsForMessenger(visible).sort((first,second)=>{
        const firstPrefs=JSON.parse(localStorage.getItem(`vhht-chat-prefs:${me.uid}:${first.id}`)||"{}"),secondPrefs=JSON.parse(localStorage.getItem(`vhht-chat-prefs:${me.uid}:${second.id}`)||"{}");
        const pinDifference=Number(Boolean(secondPrefs.pinned))-Number(Boolean(firstPrefs.pinned));
        if(pinDifference)return pinDifference;
        const firstActivity=conversationActivityByFriend.get(first.id)||0;
        const secondActivity=conversationActivityByFriend.get(second.id)||0;
        return secondActivity-firstActivity;
    });
    renderFriends(visible);
}

function subscribeToMessengerNotes() {
    stopNoteListeners.splice(0).forEach(stop => stop());
    const userIds = [me.uid, ...friends.map(friend => friend.id)];
    userIds.forEach(userId => {
        const stop = onSnapshot(doc(db, "messengerNotes", userId), snapshot => {
            if (!snapshot.exists()) notesByUser.delete(userId);
            else {
                const note = snapshot.data();
                if (note.authorId === userId && timestampMillis(note.expiresAt) > Date.now()) {
                    notesByUser.set(userId, note);
                } else {
                    notesByUser.delete(userId);
                    if (userId === me.uid) deleteDoc(snapshot.ref).catch(console.warn);
                }
            }
            renderMessengerNotes();
            if (activeConversationFilter === "notes") applyConversationView();
        }, error => console.warn(`Không thể đọc ghi chú của ${userId}`, error));
        stopNoteListeners.push(stop);
    });
    const visibleNotes = query(collection(db, "messengerNotes"), where("visibleTo", "array-contains", me.uid));
    stopNoteListeners.push(onSnapshot(visibleNotes, snapshot => {
        snapshot.docChanges().forEach(change => {
            const note = change.doc.data();
            const userId = change.doc.id;
            if (change.type === "removed") notesByUser.delete(userId);
            else {
                const isCurrentFriend = friends.some(friend => friend.id === userId);
                if (isCurrentFriend && note.authorId === userId && timestampMillis(note.expiresAt) > Date.now()) notesByUser.set(userId, note);
                else notesByUser.delete(userId);
            }
        });
        renderMessengerNotes();
        if (activeConversationFilter === "notes") applyConversationView();
    }, error => console.warn("Không thể đồng bộ luồng ghi chú bạn bè", error)));
    renderMessengerNotes();
}

function renderMessengerNotes() {
    const rail = $("messenger-notes-rail");
    if (!rail || !me) return;
    rail.replaceChildren();
    rail.appendChild(createMessengerNoteTile(ownProfile || { id: me.uid }, true));
    sortFriendsForMessenger(friends).forEach(friend => rail.appendChild(createMessengerNoteTile(friend, false)));
    clearTimeout(notesExpiryTimer);
    const expirations = [...notesByUser.values()].map(note => timestampMillis(note.expiresAt)).filter(time => time > Date.now());
    if (expirations.length) {
        const delay = Math.min(2147483647, Math.max(1000, Math.min(...expirations) - Date.now() + 250));
        notesExpiryTimer = setTimeout(() => {
            for (const [userId, note] of notesByUser) {
                if (timestampMillis(note.expiresAt) <= Date.now()) {
                    notesByUser.delete(userId);
                    if (userId === me.uid) deleteDoc(doc(db, "messengerNotes", userId)).catch(console.warn);
                }
            }
            renderMessengerNotes();
            applyConversationView();
        }, delay);
    }
    syncActiveChatNote();
}

function syncActiveChatNote(){
    const info=$('chat-header')?.querySelector('.chat-contact > span');
    if(!info||!activeFriend)return;
    info.querySelector('.chat-contact-note')?.remove();
    const note=activeNoteFor(activeFriend.id);if(!note)return;
    const button=document.createElement('button');button.type='button';button.className='chat-contact-note';button.textContent=note.content;button.title=note.content;
    button.onclick=event=>{event.stopPropagation();openFriendNoteDetail(activeFriend,note)};info.appendChild(button);
}

function createMessengerNoteTile(profile, isOwn) {
    const note = activeNoteFor(profile.id);
    const online = !isOwn && isUserActive(profile);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `messenger-note-tile ${isOwn ? "is-own" : ""} ${note ? "has-note" : "no-note"} ${note&&isMessengerNoteSeen(profile.id,note)?"note-seen":""} ${online ? "is-online" : ""}`;
    button.dataset.userId = profile.id;
    const visual = document.createElement("span");
    visual.className = "messenger-note-visual";
    if (note || isOwn) {
        const bubble = document.createElement("span");
        bubble.className = "messenger-note-bubble";
        const bubbleText = document.createElement("span");
        bubbleText.textContent = note?.content || "Bạn đang nghĩ gì?";
        bubble.appendChild(bubbleText);
        visual.appendChild(bubble);
    }
    const image = document.createElement("img");
    image.src = resolveProfileAvatar(profile, isOwn);
    image.alt = isOwn ? "Ảnh đại diện của bạn" : resolveDisplayName(profile);
    visual.appendChild(image);
    if (isOwn) {
        const plus = document.createElement("i");
        plus.className = `note-own-action fa-solid ${note ? "fa-pen" : "fa-plus"}`;
        visual.appendChild(plus);
    } else if (online) {
        const dot = document.createElement("i");
        dot.className = "note-online-dot";
        visual.appendChild(dot);
    }
    const label = document.createElement("small");
    label.textContent = isOwn ? "Ghi chú của bạn" : resolveDisplayName(profile);
    button.append(visual, label);
    button.onclick = () => {
        if(note){markMessengerNoteSeen(profile.id,note);button.classList.add("note-seen")}
        if (isOwn) openOwnNoteEditor();
        else if (note) openFriendNoteDetail(profile, note);
        else {
            openChat(profile.id);
            if (innerWidth <= 760) document.querySelector(".messenger-shell")?.classList.add("mobile-chat-open");
        }
    };
    return button;
}

function noteExpiryText(note) {
    const remaining = Math.max(0, timestampMillis(note?.expiresAt) - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.max(1, Math.ceil((remaining % 3600000) / 60000));
    return hours > 0 ? `Còn ${hours} giờ ${minutes} phút` : `Còn ${minutes} phút`;
}

function openNoteDialog() {
    const dialog = $("messenger-note-dialog");
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("note-dialog-open");
}

function closeNoteDialog() {
    const dialog = $("messenger-note-dialog");
    if (dialog.open) dialog.close();
    document.body.classList.remove("note-dialog-open");
    stopSelectedNoteReactions?.();
    stopSelectedNoteReactions = null;
    selectedNoteFriend = null;
}

function openOwnNoteEditor() {
    const note = activeNoteFor(me.uid);
    selectedNoteFriend = null;
    $("note-dialog-avatar").src = resolveProfileAvatar(ownProfile, true);
    $("note-dialog-eyebrow").textContent = "Chỉ bạn bè nhìn thấy";
    $("messenger-note-dialog-title").textContent = note ? "Chỉnh sửa ghi chú" : "Tạo ghi chú mới";
    $("note-editor-content").hidden = false;
    $("note-detail-content").hidden = true;
    $("note-save-button").hidden = false;
    $("note-delete-button").hidden = !note;
    $("note-message-button").hidden = true;
    $("note-reply-field").hidden = true;
    renderMessengerNoteReactions(me.uid, true, Boolean(note));
    $("note-content-input").value = note?.content || "";
    showNoteFeedback();
    updateNoteCharacterCount();
    openNoteDialog();
    requestAnimationFrame(() => $("note-content-input").focus());
}

function openFriendNoteDetail(friend, note) {
    selectedNoteFriend = friend;
    $("note-dialog-avatar").src = friend.photoURL || friend.profileImage || DEFAULT_AVATAR;
    $("note-dialog-eyebrow").textContent = "Ghi chú của bạn bè";
    $("messenger-note-dialog-title").textContent = resolveDisplayName(friend);
    $("note-editor-content").hidden = true;
    $("note-detail-content").hidden = false;
    $("note-detail-text").textContent = note.content;
    $("note-detail-expiry").textContent = noteExpiryText(note);
    $("note-save-button").hidden = true;
    $("note-delete-button").hidden = true;
    $("note-message-button").hidden = false;
    $("note-reply-field").hidden = false;
    $("note-reply-input").value = "";
    renderMessengerNoteReactions(friend.id, false, true);
    openNoteDialog();
}

async function renderMessengerReactionList(reactions) {
    const summary=$("note-reaction-summary");
    selectedNoteReactionItems=reactions;
    const counts=reactions.reduce((result,item)=>{result[item.type]=(result[item.type]||0)+1;return result},{});
    const icons=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([type])=>NOTE_REACTIONS[type]?.[0]||"").join("");
    summary.hidden=false;summary.innerHTML=`<span>${icons||"♡"}</span><strong>${reactions.length}</strong><small>${reactions.length?"cảm xúc":"Chưa có cảm xúc"}</small>`;
}

async function openMessengerReactionViewer(filter="all") {
    const dialog=$("note-reaction-viewer"),filters=$("note-reaction-filters"),list=$("note-reaction-viewer-list"),items=selectedNoteReactionItems;
    $("note-reaction-viewer-count").textContent=`${items.length} người đã bày tỏ cảm xúc`;
    const counts=items.reduce((result,item)=>{result[item.type]=(result[item.type]||0)+1;return result},{});
    filters.replaceChildren();
    [["all","Tất cả",items.length],...Object.entries(NOTE_REACTIONS).filter(([type])=>counts[type]).map(([type,[emoji]])=>[type,emoji,counts[type]])].forEach(([type,label,count])=>{const button=document.createElement("button");button.type="button";button.classList.toggle("active",type===filter);button.innerHTML=`<span>${label}</span><b>${count}</b>`;button.onclick=()=>openMessengerReactionViewer(type);filters.appendChild(button)});
    list.innerHTML='<div class="note-reaction-viewer-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải danh sách…</div>';
    if(!dialog.open)dialog.showModal();
    const visible=filter==="all"?items:items.filter(item=>item.type===filter);
    const people=await Promise.all(visible.map(async reaction=>{const cached=friends.find(friend=>friend.id===reaction.reactorId);if(cached)return{...reaction,profile:cached};try{const snapshot=await getDoc(doc(db,"users",reaction.reactorId));return{...reaction,profile:{id:reaction.reactorId,...(snapshot.data()||{})}}}catch{return{...reaction,profile:{id:reaction.reactorId}}}}));
    list.replaceChildren();
    if(!people.length){list.innerHTML='<div class="note-reaction-viewer-empty"><i class="fa-regular fa-face-meh"></i><span>Chưa có cảm xúc trong mục này</span></div>';return}
    people.forEach(({reactorId,type,profile})=>{const name=resolveDisplayName(profile),row=document.createElement("article");row.innerHTML='<img alt=""><span><strong></strong><small></small></span><b></b>';row.querySelector("img").src=resolveProfileAvatar({...profile,id:reactorId});row.querySelector("img").alt=`Ảnh đại diện của ${name}`;row.querySelector("strong").textContent=name;row.querySelector("small").textContent=NOTE_REACTIONS[type]?.[1]||"Cảm xúc";row.querySelector("b").textContent=NOTE_REACTIONS[type]?.[0]||"♡";list.appendChild(row)});
}

async function renderMessengerNoteReactions(authorId,isOwn,hasNote) {
    const panel=$("note-reactions-panel"),picker=$("note-reaction-picker"),summary=$("note-reaction-summary"),list=$("note-reaction-list");
    stopSelectedNoteReactions?.();stopSelectedNoteReactions=null;
    panel.hidden=!hasNote;picker.hidden=isOwn;summary.hidden=!isOwn;list.hidden=true;
    if(!hasNote)return;
    if(isOwn){summary.onclick=()=>openMessengerReactionViewer();stopSelectedNoteReactions=listenNoteReactions(db,authorId,reactions=>renderMessengerReactionList(reactions),console.warn)}
    else{try{const snapshot=await getDoc(doc(db,"messengerNotes",authorId,"reactions",me.uid)),active=snapshot.data()?.type;picker.querySelectorAll("button").forEach(button=>button.classList.toggle("active",button.dataset.noteReaction===active))}catch(error){console.warn("Không thể tải cảm xúc ghi chú",error)}}
}

async function saveMessengerNoteReaction(type) {
    if(!selectedNoteFriend)return;
    const buttons=[...$("note-reaction-picker").querySelectorAll("button")],active=buttons.find(button=>button.classList.contains("active"))?.dataset.noteReaction,next=active===type?null:type;
    buttons.forEach(button=>button.disabled=true);
    try{await setNoteReaction(db,selectedNoteFriend.id,me.uid,next);buttons.forEach(button=>button.classList.toggle("active",button.dataset.noteReaction===next))}
    catch(error){console.error("Không thể cập nhật cảm xúc ghi chú",error)}
    finally{buttons.forEach(button=>button.disabled=false)}
}

function updateNoteCharacterCount() {
    $("note-character-count").textContent = `${$("note-content-input").value.length}/160`;
}

function showNoteFeedback(message = "", type = "error") {
    const feedback = $("note-form-feedback");
    feedback.textContent = message;
    feedback.className = `note-form-feedback ${type}`;
    feedback.hidden = !message;
}

function waitForFirestore(operation, timeoutMs = 12000) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error("Firestore không phản hồi trong thời gian cho phép.");
            error.code = "note-timeout";
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([operation, timeout]).finally(() => clearTimeout(timeoutId));
}

function noteWriteErrorMessage(error) {
    if (error?.code === "permission-denied") return "Firebase đang từ chối quyền ghi. Hãy kiểm tra Rules đã Publish trên Firebase Console và quan hệ bạn bè của tài khoản.";
    if (error?.code === "note-timeout") return "Firestore phản hồi quá lâu. Hãy kiểm tra mạng và đảm bảo firestore.rules mới đã được deploy.";
    if (error?.code === "unavailable" || !navigator.onLine) return "Thiết bị đang mất kết nối với Firestore. Hãy kiểm tra Internet rồi thử lại.";
    return `Không thể lưu ghi chú${error?.message ? `: ${error.message}` : "."}`;
}

async function reconcileSharedMessageRecord(messageId, message) {
    if (!me || message.senderId !== me.uid || !message.sharedPost?.id || !message.recipientId) return;
    const reconciliationKey = `${message.sharedPost.id}:${messageId}`;
    if (reconciledSharedMessages.has(reconciliationKey)) return;
    reconciledSharedMessages.add(reconciliationKey);
    try {
        const sharesReference = collection(db, "posts", message.sharedPost.id, "shares");
        const sharesSnapshot = await getDocs(sharesReference);
        const alreadyRepresented = sharesSnapshot.docs.some(item => {
            const share = item.data();
            return share.sharerId === me.uid && share.recipientId === message.recipientId;
        });
        if (!alreadyRepresented) {
            await addDoc(sharesReference, {
                sharerId: me.uid,
                recipientId: message.recipientId,
                createdAt: serverTimestamp()
            });
        }
        const postSnapshot = await getDoc(doc(db, "posts", message.sharedPost.id));
        if (!postSnapshot.exists()) return;
        const post = postSnapshot.data();
        const isActive = post.moderationStatus == null && post.deletedByAdmin !== true;
        const verifiedCount = sharesSnapshot.size + (alreadyRepresented ? 0 : 1);
        if (isActive && Number(post.shareCount || 0) < verifiedCount) {
            await updateDoc(postSnapshot.ref, { shareCount: verifiedCount });
        }
    } catch (error) {
        reconciledSharedMessages.delete(reconciliationKey);
        console.warn("Không thể đối soát lượt chia sẻ cũ", error);
    }
}

function openChat(uid) {
    const selectedFriend = friends.find(friend => friend.id === uid);
    if (!selectedFriend || !me) return;
    if (innerWidth <= 760) document.querySelector(".messenger-shell")?.classList.add("mobile-chat-open");

    const previousFriend = activeFriend;
    if (previousFriend) {
        updateDoc(doc(db, "conversations", conversationId(me.uid, previousFriend.id)), {
            [`typing.${me.uid}`]: false
        }).catch(console.warn);
    }
    clearTimeout(typingTimer);
    stopMessages?.();
    stopConversation?.();

    activeFriend = selectedFriend;
    applyConversationView();
    chatSettings.close();
    const serial = ++openedConversationSerial;
    const id = conversationId(me.uid, uid);
    const online = isUserActive(selectedFriend);
    const header = $("chat-header");
    const list = $("messages-list");
    renderedMessageIds = new Set();
    receivedFirstMessageSnapshot = false;
    lastMessageRenderSignature = "";
    activeConversationData = {};
    activeConversationMessages = [];
    document.querySelector(".chat-panel").dataset.chatTheme = "default";
    chatSettings.refresh();
    forceConversationEndUntil = Date.now() + 1600;
    activeUnreadBoundaryId = null;
    clearMessageReply();closeMessageActionMenu();

    document.querySelectorAll(".friend-row").forEach(row => row.classList.toggle("active", row.dataset.id === uid));
    header.replaceChildren();
    const contact = document.createElement("div");
    contact.className = "chat-contact";
    const avatarWrap = document.createElement("div");
    avatarWrap.className = "chat-contact-avatar";
    const image = document.createElement("img");
    image.src = selectedFriend.photoURL || selectedFriend.profileImage || DEFAULT_AVATAR;
    image.alt = resolveDisplayName(selectedFriend);
    const dot = document.createElement("i");
    dot.className = `presence-dot ${online ? "online" : ""}`;
    avatarWrap.append(image, dot);
    const info = document.createElement("span");
    const name = document.createElement("strong");
    const status = document.createElement("small");
    name.textContent = resolveDisplayName(selectedFriend);
    status.className = online ? "presence" : "";
    status.classList.add("chat-activity-status");
    status.textContent = formatActivity(selectedFriend);
    info.append(name, status);
    const friendNote=activeNoteFor(selectedFriend.id);
    if(friendNote){const noteButton=document.createElement('button');noteButton.type='button';noteButton.className='chat-contact-note';noteButton.textContent=friendNote.content;noteButton.title=friendNote.content;noteButton.onclick=event=>{event.stopPropagation();openFriendNoteDetail(selectedFriend,friendNote)};info.appendChild(noteButton)}
    contact.append(avatarWrap, info);
    contact.tabIndex=0;contact.setAttribute('role','link');contact.title='Xem hồ sơ';
    const openProfile=()=>openProfileFromChat(selectedFriend.id);
    contact.onclick=event=>{if(!event.target.closest('.chat-contact-note'))openProfile()};
    contact.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openProfile()}};
    const headerActions = document.createElement("div");
    headerActions.className = "chat-header-actions";
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "chat-settings-trigger";
    settingsButton.title = "Cài đặt đoạn chat";
    settingsButton.setAttribute("aria-label", "Mở cài đặt đoạn chat");
    settingsButton.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
    settingsButton.onclick = event => { event.stopPropagation(); openConversationSettings(); };
    headerActions.appendChild(settingsButton);
    header.append(contact, headerActions);
    renderRelationshipNotice(selectedFriend,header);

    list.innerHTML = '<div class="conversation-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải tin nhắn…</div>';
    const messageInput = $("message-input");
    messageInput.disabled = false;
    $("message-form").querySelectorAll("button").forEach(button => button.disabled = false);
    window.setTimeout(() => {
        if (serial === openedConversationSerial && activeFriend?.id === uid) {
            messageInput.focus({ preventScroll: true });
        }
    }, innerWidth <= 760 ? 140 : 0);

    // Subscribe first so the initial tap always renders existing messages immediately.
    stopConversation = onSnapshot(doc(db, "conversations", id), snapshot => {
        if (serial !== openedConversationSerial) return;
        activeConversationData = snapshot.data() || {};
        const activeNickname = String(activeConversationData?.nicknames?.[uid] || "").trim();
        if (activeNickname) conversationNicknamesByFriend.set(uid, activeNickname);
        else conversationNicknamesByFriend.delete(uid);
        const conversationRowName = document.querySelector(`.friend-row[data-id="${CSS.escape(uid)}"] strong`);
        if (conversationRowName) conversationRowName.textContent = activeNickname || resolveDisplayName(selectedFriend);
        applyConversationPresentation();
        const currentStatus = header.querySelector(".chat-activity-status");
        if (!currentStatus) return;
        const typing = snapshot.data()?.typing?.[uid] === true;
        if (typing) {
            currentStatus.textContent = "Đang soạn";
            currentStatus.className = "chat-activity-status typing-status";
        } else {
            currentStatus.textContent = formatActivity(selectedFriend);
            currentStatus.className = `chat-activity-status ${online ? "presence" : ""}`;
        }
    });

    stopMessages = onSnapshot(
        query(collection(db, "conversations", id, "messages"), orderBy("createdAt", "asc")),
        snapshot => {
            if (serial !== openedConversationSerial) return;
            activeConversationMessages = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            chatSettings.refresh();
            if (document.querySelector(".conversation-settings-dialog[open]")) renderConversationMediaLibrary(document.querySelector(".chat-media-tab.active")?.dataset.mediaFilter || "all");
            const previousScrollHeight = list.scrollHeight;
            const previousScrollTop = list.scrollTop;
            const wasNearBottom = previousScrollHeight - previousScrollTop - list.clientHeight < 96;
            const fragment = document.createDocumentFragment();
            const nextIds = new Set();
            const unread = [];
            const existingRows = new Map([...list.querySelectorAll(".message-row[data-message-id]")].map(row => [row.dataset.messageId, row]));
            const isInitialSnapshot = !receivedFirstMessageSnapshot;
            if (isInitialSnapshot && !viewedUnreadConversations.has(id)) {
                const firstUnread = snapshot.docs.find(item => {
                    const message = item.data();
                    return message.recipientId === me.uid && !message.readAt;
                });
                activeUnreadBoundaryId = firstUnread?.id || null;
                if (activeUnreadBoundaryId) viewedUnreadConversations.add(id);
            }
            // A local serverTimestamp is briefly null. Keep pending messages at the
            // bottom so sending cannot move a new bubble to the top of the thread.
            const orderedDocs = [...snapshot.docs].sort((left, right) => {
                const leftTime = left.data().createdAt?.toMillis?.() ?? (left.data().createdAt?.seconds != null ? left.data().createdAt.seconds * 1000 : null);
                const rightTime = right.data().createdAt?.toMillis?.() ?? (right.data().createdAt?.seconds != null ? right.data().createdAt.seconds * 1000 : null);
                if (leftTime == null && rightTime == null) return 0;
                if (leftTime == null) return 1;
                if (rightTime == null) return -1;
                return leftTime - rightTime;
            });
            const renderSignature = orderedDocs.map(item => {
                const message = item.data();
                const outgoingReadState = message.senderId === me.uid ? Boolean(message.readAt) : false;
                return [item.id, message.senderId, message.content || "", message.mediaUrl || "", message.sharedPost?.id || "", outgoingReadState, Boolean(message.revoked), JSON.stringify(message.reactions||{}), JSON.stringify(message.hiddenFor||[]), message.replyTo?.id||"", JSON.stringify(message.systemEvent||{})].join(":");
            }).join("|");
            if (!isInitialSnapshot && renderSignature === lastMessageRenderSignature) return;
            lastMessageRenderSignature = renderSignature;
            const lastOwnMessage = [...orderedDocs].reverse().find(item => item.data().senderId === me.uid && !item.data().systemEvent);
            const lastReadOwnMessage = [...orderedDocs].reverse().find(item => { const value=item.data();return value.senderId===me.uid&&!value.systemEvent&&Boolean(value.readAt) });
            const visibleDocs=orderedDocs.filter(item=>!(item.data().hiddenFor||[]).includes(me.uid));
            visibleDocs.forEach((item,index) => {
                const message = item.data();
                const previous=visibleDocs[index-1]?.data(),next=visibleDocs[index+1]?.data();
                const messageMs=timestampMillis(message.createdAt),previousMs=timestampMillis(previous?.createdAt),nextMs=timestampMillis(next?.createdAt);
                const groupWindow=2*60*1000;
                const longGapWindow=10*60*1000;
                const samePrevious=previous&&!previous.systemEvent&&!message.systemEvent&&previous.senderId===message.senderId&&messageMs-previousMs<=groupWindow;
                const sameNext=next&&!next.systemEvent&&!message.systemEvent&&next.senderId===message.senderId&&nextMs-messageMs<=groupWindow;
                const elapsedSincePrevious=previous?messageMs-previousMs:0;
                const groupStart=!samePrevious,groupEnd=!sameNext,hasShortGap=Boolean(previous&&elapsedSincePrevious>groupWindow&&elapsedSincePrevious<longGapWindow),hasTimeGap=Boolean(previous&&elapsedSincePrevious>=longGapWindow);
                nextIds.add(item.id);
                if(hasTimeGap)fragment.appendChild(createConversationTimeDivider(messageMs));
                const rowSignature = [item.id, message.senderId, message.content || "", message.mediaUrl || "", message.mediaType || "", message.sharedPost?.id || "", message.sendEffect || "none", Boolean(message.readAt), item.id === lastOwnMessage?.id, item.id === lastReadOwnMessage?.id, Boolean(message.revoked), JSON.stringify(message.reactions||{}), message.replyTo?.id||"", JSON.stringify(message.systemEvent||{}),groupStart,groupEnd,hasShortGap,hasTimeGap].join(":");
                const cachedRow = existingRows.get(item.id);
                if (cachedRow?.dataset.renderSignature === rowSignature) {
                    if (item.id === activeUnreadBoundaryId) {
                        const divider = document.createElement("div");
                        divider.className = "unread-message-divider";
                        divider.innerHTML = '<span>Tin nhắn mới</span>';
                        fragment.appendChild(divider);
                    }
                    if (message.recipientId === me.uid && !message.readAt) unread.push(item.ref);
                    fragment.appendChild(cachedRow);
                    return;
                }
                const bubble = document.createElement("div");
                const meta = document.createElement("div");
                const time = document.createElement("time");
                bubble.className = `message ${message.senderId === me.uid ? "mine" : ""}`;
                if(["hearts","confetti","fire","gift","stars","neon","snow","galaxy"].includes(message.sendEffect))bubble.classList.add("message-send-effect",`effect-${message.sendEffect}`);
                bubble.dataset.messageId = item.id;
                if (message.systemEvent) bubble.classList.add("message-system-event");
                if (receivedFirstMessageSnapshot && !renderedMessageIds.has(item.id)) bubble.classList.add("is-new");
                if(message.revoked){
                    bubble.classList.add('message-revoked');
                    const revoked=document.createElement('p');revoked.className='message-revoked-label';revoked.innerHTML='<i class="fa-solid fa-ban"></i> Tin nhắn đã bị thu hồi';bubble.appendChild(revoked);
                }
                if (!message.revoked&&message.replyTo?.id) {
                    const quote=document.createElement('button');quote.type='button';quote.className='message-reply-quote';
                    quote.innerHTML=`<small><i class="fa-solid fa-reply"></i> ${escapeMessageHtml(message.replyTo.senderName||"Tin nhắn")}</small><span>${escapeMessageHtml(message.replyTo.content||"Tin nhắn")}</span>`;
                    quote.onclick=event=>{event.stopPropagation();scrollToRepliedMessage(message.replyTo.id)};bubble.appendChild(quote);
                }
                if (!message.revoked&&message.noteReply) {
                    const quote=document.createElement("button");quote.type="button";quote.className="message-note-reply";quote.innerHTML=`<small><i class="fa-regular fa-note-sticky"></i> Trả lời ghi chú</small><span>${escapeMessageHtml(message.noteReply.content||"Ghi chú")}</span>`;
                    quote.onclick=()=>{const owner=friends.find(friend=>friend.id===message.noteReply.authorId);const note=notesByUser.get(message.noteReply.authorId);if(owner&&note)openFriendNoteDetail(owner,note)};
                    bubble.appendChild(quote);
                }
                if (!message.revoked&&message.content) { if(message.systemEvent)appendSystemEventContent(bubble,message);else{const contentNode=document.createElement("p");contentNode.className="message-text-content";contentNode.innerHTML=renderInteractiveText(message.content);bubble.appendChild(contentNode)} }
                if (!message.revoked&&message.mediaUrl&&message.mediaType==="audio") {
                    const voice=document.createElement("div");voice.className="voice-message";const audio=document.createElement("audio");audio.src=message.mediaUrl;audio.preload="metadata";
                    const formatVoiceTime=value=>{const safe=Number.isFinite(Number(value))&&Number(value)>=0?Number(value):0;return `${Math.floor(safe/60)}:${String(Math.floor(safe%60)).padStart(2,"0")}`},storedDuration=Number(message.mediaDuration);
                    voice.innerHTML=`<button type="button" aria-label="Phát tin nhắn thoại"><i class="fa-solid fa-play"></i></button><span class="voice-waveform">${[10,18,27,14,31,22,12,26,18,32,14,24,10,19,27,13].map(height=>`<i style="height:${height}px"></i>`).join("")}</span><time>${formatVoiceTime(storedDuration)}</time>`;
                    const play=voice.querySelector("button"),duration=voice.querySelector("time");audio.onloadedmetadata=()=>{if(Number.isFinite(audio.duration))duration.textContent=formatVoiceTime(audio.duration)};audio.ontimeupdate=()=>{if(Number.isFinite(audio.currentTime))duration.textContent=formatVoiceTime(audio.currentTime)};audio.onended=()=>{play.innerHTML='<i class="fa-solid fa-play"></i>';duration.textContent=formatVoiceTime(Number.isFinite(audio.duration)?audio.duration:storedDuration)};play.onclick=()=>{if(audio.paused){audio.play();play.innerHTML='<i class="fa-solid fa-pause"></i>'}else{audio.pause();play.innerHTML='<i class="fa-solid fa-play"></i>'}};voice.appendChild(audio);bubble.appendChild(voice);
                } else if (!message.revoked&&message.mediaUrl) {
                    const mediaOpen = document.createElement("button");
                    mediaOpen.type = "button";
                    mediaOpen.className = "message-media-open";
                    mediaOpen.setAttribute("aria-label", message.mediaType === "video" ? "Mở video toàn màn hình" : "Mở ảnh toàn màn hình");
                    const media = message.mediaType === "video" ? document.createElement("video") : document.createElement("img");
                    media.src = message.mediaUrl;
                    media.className = "message-media";
                    if (media.tagName === "VIDEO") { media.muted = true; media.preload = "metadata"; media.playsInline = true; }
                    mediaOpen.appendChild(media);
                    if (message.mediaType === "video") mediaOpen.insertAdjacentHTML("beforeend", '<span class="message-video-play"><i class="fa-solid fa-play"></i></span>');
                    mediaOpen.onclick = event => { event.preventDefault(); event.stopPropagation(); openMessageMediaViewer(message.mediaUrl, message.mediaType); };
                    bubble.appendChild(mediaOpen);
                }
                if (!message.revoked&&message.sharedPost) {
                    const shared = document.createElement("button");
                    shared.type = "button";
                    shared.className = "shared-post-message";
                    const previewMedia = message.sharedPost.mediaUrl ? (message.sharedPost.mediaType === "video" ? `<video src="${escapeMessageHtml(message.sharedPost.mediaUrl)}" muted preload="metadata" playsinline></video>` : `<img src="${escapeMessageHtml(message.sharedPost.mediaUrl)}" alt="Ảnh xem trước bài viết">`) : '<span class="shared-post-placeholder"><i class="fa-regular fa-newspaper"></i></span>';
                    shared.innerHTML = `<span class="shared-post-kicker"><i class="fa-solid fa-share-nodes"></i> Bài viết được chia sẻ</span><span class="shared-post-preview">${previewMedia}<span class="shared-post-copy"><strong>${escapeMessageHtml(message.sharedPost.authorName || "Thành viên VHHT")}</strong><p>${renderInteractiveText(message.sharedPost.content || "Chạm để khám phá nội dung bài viết")}</p><span class="shared-post-open">Mở chi tiết <i class="fa-solid fa-arrow-right"></i></span></span></span>`;
                    let sharedPostOpenedAt = 0;
                    const activateSharedPost = event => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (Date.now() - sharedPostOpenedAt < 600) return;
                        sharedPostOpenedAt = Date.now();
                        openExactSharedPostDetail(message.sharedPost);
                    };
                    shared.onclick = activateSharedPost;
                    shared.onpointerup = event => {
                        if (event.pointerType === "touch" || event.pointerType === "pen") activateSharedPost(event);
                    };
                    bubble.appendChild(shared);
                    if(message.sharedPost.authorId)getDoc(doc(db,"users",message.sharedPost.authorId)).then(authorSnapshot=>{if(!authorSnapshot.exists())return;shared.querySelector("strong").textContent=meaningfulName(authorSnapshot.data(),message.sharedPost.authorName)}).catch(console.warn);
                    reconcileSharedMessageRecord(item.id, message);
                }
                const messageTime = message.createdAt?.toMillis?.()
                    ?? (message.createdAt?.seconds != null ? message.createdAt.seconds * 1000 : Date.now());
                time.textContent = new Date(messageTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
                meta.className = "message-meta";
                meta.appendChild(time);
                if (message.recipientId === me.uid && !message.readAt) unread.push(item.ref);
                bubble.appendChild(meta);
                const reactionEntries=Object.values(message.reactions||{});
                if(!message.revoked&&reactionEntries.length){
                    const summary=document.createElement('button');summary.type='button';summary.className='message-reaction-summary';
                    const unique=[...new Set(reactionEntries)].slice(0,3).map(type=>MESSAGE_REACTIONS[type]||type).join('');
                    summary.innerHTML=`<span>${unique}</span><b>${reactionEntries.length}</b>`;summary.title='Xem hoặc đổi cảm xúc';summary.onclick=event=>{event.stopPropagation();openMessageActionMenu(summary,item.ref,message,{reactionsOnly:true})};bubble.appendChild(summary);
                }
                if (item.id === activeUnreadBoundaryId) {
                    const divider = document.createElement("div");
                    divider.className = "unread-message-divider";
                    divider.innerHTML = '<span>Tin nhắn mới</span>';
                    fragment.appendChild(divider);
                }
                const row=document.createElement("div");row.className=`message-row ${message.senderId===me.uid?"mine":"theirs"} ${groupStart?"group-start":"group-middle"} ${groupEnd?"group-end":""} ${hasShortGap?"has-short-gap":""} ${hasTimeGap?"has-time-gap":""}`;row.dataset.messageId=item.id;row.dataset.renderSignature=rowSignature;
                row.dataset.messageTime=String(messageMs||0);
                const avatar=document.createElement("img");avatar.className="message-sender-avatar";avatar.src=resolveProfileAvatar(activeFriend,false);avatar.alt=resolveDisplayName(activeFriend||{});avatar.tabIndex=0;avatar.setAttribute("role","link");avatar.title="Xem hồ sơ";avatar.onclick=event=>{event.stopPropagation();openProfileFromChat(message.senderId)};avatar.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openProfileFromChat(message.senderId)}};
                if(message.senderId!==me.uid&&groupEnd&&!message.systemEvent)row.append(avatar,bubble);else row.append(bubble);fragment.appendChild(row);
                if(message.senderId===me.uid&&!message.systemEvent){
                    const isLatestSent=item.id===lastOwnMessage?.id&&!message.readAt,isLatestSeen=item.id===lastReadOwnMessage?.id&&Boolean(message.readAt);
                    if(isLatestSent||isLatestSeen){const delivery=document.createElement("span");delivery.className=`message-delivery-status ${isLatestSeen?"seen":"sent"}`;if(isLatestSeen){const seenAvatar=document.createElement("img");seenAvatar.src=resolveProfileAvatar(activeFriend,false);seenAvatar.alt=`${resolveDisplayName(activeFriend||{})} đã xem`;seenAvatar.title=`${resolveDisplayName(activeFriend||{})} đã xem`;delivery.appendChild(seenAvatar)}else delivery.textContent="Đã gửi";row.appendChild(delivery)}
                }
                const controls=document.createElement('div');controls.className='message-hover-actions';
                if(!message.revoked&&!message.systemEvent){
                    const react=document.createElement('button');react.type='button';react.className='message-hover-react';react.title='Thả cảm xúc';react.innerHTML='<i class="fa-regular fa-face-smile"></i>';react.onclick=event=>{event.stopPropagation();openMessageActionMenu(react,item.ref,message,{reactionsOnly:true})};
                    const reply=document.createElement('button');reply.type='button';reply.title='Trả lời';reply.innerHTML='<i class="fa-solid fa-reply"></i>';reply.onclick=event=>{event.stopPropagation();selectMessageReply(item.id,message)};controls.append(react,reply);
                }
                const more=document.createElement('button');more.type='button';more.title='Thao tác khác';more.innerHTML='<i class="fa-solid fa-ellipsis-vertical"></i>';more.onclick=event=>{event.stopPropagation();openMessageActionMenu(more,item.ref,message)};controls.appendChild(more);row.appendChild(controls);
                row.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'||matchMedia('(hover:hover) and (pointer:fine)').matches)row.classList.add('actions-visible')});
                row.addEventListener('pointerleave',()=>row.classList.remove('actions-visible'));
                bindMessageGestures(row,item.ref,message);
            });
            if(!visibleDocs.length){const empty=document.createElement("div");empty.className="welcome-signal";empty.innerHTML='<h2>Đoạn chat mới</h2><p>Hãy gửi tin nhắn đầu tiên để bắt đầu cuộc trò chuyện.</p>';fragment.appendChild(empty)}
            list.replaceChildren(fragment);
            observeMessageEffects(list);
            groupConsecutiveSystemEvents(list);
            syncJumpToLatestButton();
            renderedMessageIds = nextIds;
            receivedFirstMessageSnapshot = true;
            if (unread.length) {
                const readBatch = writeBatch(db);
                unread.forEach(reference => readBatch.update(reference, { readAt: serverTimestamp() }));
                readBatch.commit().catch(console.warn);
            }
            requestAnimationFrame(() => {
                if (serial !== openedConversationSerial) return;
                if (isInitialSnapshot || wasNearBottom || Date.now() < forceConversationEndUntil) {
                    const pinToEnd = () => list.scrollTo({ top: list.scrollHeight, behavior: "auto" });
                    pinToEnd();
                    requestAnimationFrame(pinToEnd);
                    if (isInitialSnapshot) {
                        list.querySelectorAll("img,video").forEach(media => {
                            if (media.tagName === "IMG" && !media.complete) media.addEventListener("load", pinToEnd, { once: true });
                            if (media.tagName === "VIDEO" && media.readyState < 1) media.addEventListener("loadedmetadata", pinToEnd, { once: true });
                        });
                        setTimeout(pinToEnd, 180);
                        setTimeout(pinToEnd, 600);
                    }
                }
                else list.scrollTop = previousScrollTop + (list.scrollHeight - previousScrollHeight);
                syncJumpToLatestButton();
            });
        },
        error => {
            if (serial !== openedConversationSerial) return;
            console.error("Không thể tải tin nhắn", error);
            list.innerHTML = '<div class="message-load-error">Không thể tải cuộc trò chuyện. Hãy thử lại.</div>';
        }
    );

    markConversationRead(uid);
}

function renderRelationshipNotice(contact,header){
    document.querySelector(".chat-relationship-notice")?.remove();
    if(!ownProfile||contact.role==="admin")return;
    const connected=(ownProfile.friends||[]).includes(contact.id)||(contact.friends||[]).includes(me.uid);
    if(connected)return;
    const notice=document.createElement("aside");notice.className="chat-relationship-notice";
    const name=resolveDisplayName(contact);
    notice.innerHTML=`<span class="relationship-notice-icon"><i class="fa-solid fa-user-plus"></i></span><span><strong>Bạn và <b></b> chưa là bạn bè</strong><small>Hai bạn vẫn có thể trò chuyện. Kết bạn để dễ dàng kết nối và xem nội dung dành cho bạn bè.</small></span><button type="button"><i class="fa-solid fa-user-plus"></i> Kết bạn</button>`;
    notice.querySelector("b").textContent=name;
    const action=notice.querySelector("button");
    if((contact.friendRequests||[]).includes(me.uid)){action.disabled=true;action.innerHTML='<i class="fa-solid fa-clock"></i> Đã gửi lời mời'}
    action.onclick=async()=>{action.disabled=true;try{await Promise.all([setDoc(doc(db,"users",contact.id),{friendRequests:arrayUnion(me.uid)},{merge:true}),addDoc(collection(db,"notifications"),{recipientId:contact.id,actorId:me.uid,actorName:resolveDisplayName(ownProfile),type:"friend_request",message:"đã gửi lời mời kết bạn",isRead:false,createdAt:serverTimestamp()})]);contact.friendRequests=[...new Set([...(contact.friendRequests||[]),me.uid])];action.innerHTML='<i class="fa-solid fa-clock"></i> Đã gửi lời mời'}catch(error){console.error(error);action.disabled=false;action.textContent="Thử lại"}};
    header.insertAdjacentElement("afterend",notice);
}

let voiceRecorder=null,voiceChunks=[],voiceTimer=null,voiceElapsed=0,voiceShouldSend=false,voiceStream=null;
let voiceAudioContext=null,voiceAnalyser=null,voiceWaveFrame=0,voiceWaveLevels=[],voiceWaveLastSample=0,voiceWaveWritten=0,voiceNoiseFloor=.012,voiceCalibrationUntil=0,voiceCalibrationSamples=[];
function formatRecordingTime(seconds){const safe=Math.max(0,Math.floor(Number(seconds)||0));return `${Math.floor(safe/60)}:${String(safe%60).padStart(2,"0")}`}
function resetVoiceWaveform(){
    cancelAnimationFrame(voiceWaveFrame);voiceWaveFrame=0;voiceWaveLastSample=0;voiceWaveLevels=[];voiceWaveWritten=0;voiceNoiseFloor=.012;voiceCalibrationUntil=0;voiceCalibrationSamples=[];
    voiceAnalyser?.disconnect?.();voiceAnalyser=null;
    if(voiceAudioContext&&voiceAudioContext.state!=="closed")voiceAudioContext.close().catch(()=>{});
    voiceAudioContext=null;
}
function startVoiceWaveform(stream,bar){
    resetVoiceWaveform();
    voiceCalibrationUntil=performance.now()+550;bar.classList.add("calibrating");
    const wave=bar.querySelector(".voice-record-live-wave");let columns=[];
    const syncWaveColumns=()=>{
        const targetCount=Math.max(24,Math.min(140,Math.floor(wave.clientWidth/(innerWidth<=430?3.5:5))));
        if(columns.length===targetCount)return;
        if(targetCount>voiceWaveLevels.length)voiceWaveLevels=[...voiceWaveLevels,...Array(targetCount-voiceWaveLevels.length).fill(3)];
        else{const wasFull=voiceWaveWritten>=voiceWaveLevels.length;voiceWaveLevels=wasFull?voiceWaveLevels.slice(-targetCount):voiceWaveLevels.slice(0,targetCount);voiceWaveWritten=wasFull?targetCount:Math.min(voiceWaveWritten,targetCount)}
        wave.innerHTML=Array.from({length:targetCount},(_,index)=>`<i class="${voiceWaveLevels[index]>3?"has-sound":""}" style="height:${voiceWaveLevels[index]}px"></i>`).join("");
        wave.style.setProperty("--voice-wave-columns",targetCount);columns=[...wave.children];
    };
    syncWaveColumns();
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    try{
        voiceAudioContext=new AudioContextClass();voiceAnalyser=voiceAudioContext.createAnalyser();
        voiceAnalyser.fftSize=256;voiceAnalyser.smoothingTimeConstant=.15;
        voiceAudioContext.createMediaStreamSource(stream).connect(voiceAnalyser);
    }catch(error){console.warn("Không thể phân tích mức âm lượng micro",error);bar.classList.remove("calibrating");resetVoiceWaveform();return}
    const samples=new Uint8Array(voiceAnalyser.fftSize);
    const draw=timestamp=>{
        if(!voiceAnalyser||!voiceRecorder)return;
        syncWaveColumns();
        if(voiceRecorder.state==="recording"&&timestamp-voiceWaveLastSample>=32){
            voiceWaveLastSample=timestamp;voiceAnalyser.getByteTimeDomainData(samples);
            let energy=0;for(const sample of samples){const normalized=(sample-128)/128;energy+=normalized*normalized}
            const rms=Math.sqrt(energy/samples.length),calibrating=timestamp<voiceCalibrationUntil;
            if(calibrating)voiceCalibrationSamples.push(rms);
            else{
                if(bar.classList.contains("calibrating")){
                    const sorted=[...voiceCalibrationSamples].sort((a,b)=>a-b),baseline=sorted[Math.floor(sorted.length*.6)]??.012;
                    voiceNoiseFloor=Math.min(.035,Math.max(.004,baseline));bar.classList.remove("calibrating");
                }else if(rms<voiceNoiseFloor*1.75)voiceNoiseFloor=Math.min(.06,Math.max(.004,voiceNoiseFloor*.975+rms*.025));
            }
            const signal=Math.max(0,rms-Math.max(.006,voiceNoiseFloor*1.32));
            const rawLevel=calibrating||signal<.0035?3:Math.min(29,Math.max(5,Math.round(4+signal*285))),previous=voiceWaveWritten?voiceWaveLevels[Math.min(voiceWaveWritten-1,voiceWaveLevels.length-1)]:3;
            const level=rawLevel===3?3:Math.round(previous*.08+rawLevel*.92);
            if(voiceWaveWritten<voiceWaveLevels.length){voiceWaveLevels[voiceWaveWritten]=level;voiceWaveWritten+=1}
            else{voiceWaveLevels.shift();voiceWaveLevels.push(level)}
            const waveformFull=voiceWaveWritten>=voiceWaveLevels.length,activeIndex=waveformFull?voiceWaveLevels.length-1:Math.max(0,voiceWaveWritten-1);
            columns.forEach((column,index)=>{
                column.style.height=`${voiceWaveLevels[index]}px`;
                column.classList.toggle("has-sound",voiceWaveLevels[index]>3);
                column.classList.toggle("is-recorded",waveformFull||index<voiceWaveWritten);
                column.classList.toggle("is-current",index===activeIndex);
                column.classList.toggle("is-recent",index<activeIndex&&index>=activeIndex-4);
            });
        }
        voiceWaveFrame=requestAnimationFrame(draw);
    };
    voiceWaveFrame=requestAnimationFrame(draw);
}
function ensureVoiceRecordingBar(){
    let bar=document.querySelector(".voice-recording-bar");if(bar)return bar;
    bar=document.createElement("div");bar.className="voice-recording-bar";bar.hidden=true;
    bar.innerHTML=`<button type="button" class="voice-record-delete" aria-label="Xóa bản ghi"><i class="fa-solid fa-trash"></i></button><div class="voice-record-track"><button type="button" class="voice-record-pause" aria-label="Tạm dừng ghi âm"><i class="fa-solid fa-pause"></i></button><span class="voice-record-live-wave" aria-label="Mức âm lượng trực tiếp"></span><time aria-label="Thời lượng ghi âm">0:00</time></div><button type="button" class="voice-record-send" aria-label="Gửi tin nhắn thoại"><i class="fa-solid fa-paper-plane"></i></button>`;
    $("message-form").appendChild(bar);
    bar.querySelector(".voice-record-delete").onclick=()=>finishVoiceRecording(false);
    bar.querySelector(".voice-record-send").onclick=()=>finishVoiceRecording(true);
    bar.querySelector(".voice-record-pause").onclick=()=>{
        if(!voiceRecorder)return;const pause=bar.querySelector(".voice-record-pause");
        if(voiceRecorder.state==="recording"){voiceRecorder.pause();bar.classList.add("paused");pause.innerHTML='<i class="fa-solid fa-play"></i>';pause.setAttribute("aria-label","Tiếp tục ghi âm")}
        else if(voiceRecorder.state==="paused"){voiceRecorder.resume();bar.classList.remove("paused");pause.innerHTML='<i class="fa-solid fa-pause"></i>';pause.setAttribute("aria-label","Tạm dừng ghi âm")}
    };
    return bar;
}
function resetVoiceRecordingUi(){
    clearInterval(voiceTimer);voiceTimer=null;resetVoiceWaveform();const bar=ensureVoiceRecordingBar();bar.hidden=true;bar.classList.remove("paused","calibrating");bar.querySelector("time").textContent="0:00";bar.querySelector(".voice-record-pause").innerHTML='<i class="fa-solid fa-pause"></i>';
    $("message-form").classList.remove("is-recording");const button=$("voice-record-button");button.classList.remove("recording");button.title="Gửi tin nhắn thoại";button.setAttribute("aria-label","Ghi âm tin nhắn");
}
function finishVoiceRecording(shouldSend){
    if(!voiceRecorder)return;voiceShouldSend=shouldSend;
    if(voiceRecorder.state!=="inactive")voiceRecorder.stop();
}
async function sendVoiceMessage(blob,recordedDuration=0){
    if(!activeFriend||!blob?.size)return;const button=$("voice-record-button"),friend={...activeFriend},id=conversationId(me.uid,friend.id);button.disabled=true;button.classList.add("uploading");
    try{const extension=blob.type.includes("ogg")?"ogg":"webm",file=new File([blob],`voice-${Date.now()}.${extension}`,{type:blob.type||"audio/webm"});const media=await uploadMedia(file);await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:friend.id,content:"",mediaUrl:media.mediaUrl,mediaType:"audio",mediaPublicId:media.mediaPublicId,mediaDuration:Math.max(1,Math.round(recordedDuration)),createdAt:serverTimestamp(),readAt:null});await markConversationActivity(friend.id);playUiSound("send-message");}
    catch(error){console.error(error);alert(error.message||"Không thể gửi tin nhắn thoại.")}finally{button.classList.remove("uploading");button.disabled=!activeFriend}
}
async function toggleVoiceRecording(){
    const button=$("voice-record-button");if(voiceRecorder&&voiceRecorder.state!=="inactive")return;
    try{
        voiceStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:false,latency:{ideal:.01}}});voiceChunks=[];voiceElapsed=0;voiceShouldSend=false;
        const mimeType=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm";
        voiceRecorder=new MediaRecorder(voiceStream,{mimeType});
        voiceRecorder.ondataavailable=event=>{if(event.data.size)voiceChunks.push(event.data)};
        voiceRecorder.onstop=()=>{
            const blob=new Blob(voiceChunks,{type:voiceRecorder.mimeType});const duration=voiceElapsed;const shouldSend=voiceShouldSend;
            voiceStream?.getTracks().forEach(track=>track.stop());voiceStream=null;voiceRecorder=null;resetVoiceRecordingUi();
            if(shouldSend&&blob.size)sendVoiceMessage(blob,duration);
        };
        voiceRecorder.start(250);const bar=ensureVoiceRecordingBar();bar.hidden=false;$("message-form").classList.add("is-recording");button.classList.add("recording");startVoiceWaveform(voiceStream,bar);
        voiceTimer=setInterval(()=>{if(voiceRecorder?.state==="recording"){voiceElapsed+=1;bar.querySelector("time").textContent=formatRecordingTime(voiceElapsed)}},1000);
        playUiSound("open-panel");
    }catch(error){resetVoiceRecordingUi();alert("Không thể mở micro. Hãy cấp quyền micro cho trình duyệt rồi thử lại.")}
}
$("voice-record-button").onclick=toggleVoiceRecording;

$("message-form").onsubmit=async event=>{
    event.preventDefault();
    const input=$("message-input"),content=input.value.trim(),file=mediaInput.files[0];
    if((!content&&!file)||!activeFriend)return;
    const friend={...activeFriend},id=conversationId(me.uid,friend.id),sendButton=$("message-form").querySelector(".send-message-button"),list=$("messages-list");
    sendButton.disabled=true;forceConversationEndUntil=Date.now()+1800;
    try{
        const media=file?await uploadMedia(file,percent=>{mediaPreview.style.setProperty("--upload-progress",`${percent}%`);mediaPreview.classList.toggle("uploading",percent<100)}):null;
        setTyping(false);
        await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:friend.id,content,mediaUrl:media?.mediaUrl||null,mediaType:media?.mediaType||null,mediaPublicId:media?.mediaPublicId||null,sendEffect:selectedSendEffect,replyTo:selectedMessageReply?{...selectedMessageReply}:null,createdAt:serverTimestamp(),readAt:null});
        await markConversationActivity(friend.id);
        playUiSound("send-message");
        input.value="";resizeMessageInput();syncMobileComposerLayout();clearSelectedMessageMedia();clearMessageReply();selectSendEffect("none");
        requestAnimationFrame(()=>list.scrollTo({top:list.scrollHeight,behavior:"auto"}));
        addDoc(collection(db,"messageNotifications"),{recipientId:friend.id,senderId:me.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()}).catch(console.warn);
    }catch(error){
        playUiSound("error");
        console.error("Không thể gửi tin nhắn",error);
        if(!input.value)input.value=content;
        resizeMessageInput();
    }finally{mediaPreview.classList.remove("uploading");mediaPreview.style.removeProperty("--upload-progress");sendButton.disabled=false;input.focus({preventScroll:true})}
};
function resizeMessageInput(){const input=$("message-input");input.style.height="44px";input.style.height=`${Math.min(120,Math.max(44,input.scrollHeight))}px`;input.style.overflowY=input.scrollHeight>120?"auto":"hidden"}
$("message-input").addEventListener("input",()=>{resizeMessageInput();if(!activeFriend)return;setTyping(true);clearTimeout(typingTimer);typingTimer=setTimeout(()=>setTyping(false),1800)});
$("message-input").addEventListener("blur",()=>{clearTimeout(typingTimer);setTyping(false)});
$("message-input").addEventListener("pointerdown", () => {
    if (!$("message-input").disabled) playUiSound("click-neutral");
});
async function setTyping(value){if(!me||!activeFriend)return;const id=conversationId(me.uid,activeFriend.id);await updateDoc(doc(db,"conversations",id),{[`typing.${me.uid}`]:value}).catch(console.warn)}
$("friend-filter").oninput=applyConversationView;
function resolveMessagesReturnTarget() {
    const requested = new URLSearchParams(location.search).get("returnTo");
    if (!requested) return "../community-feed-page.html";
    try {
        const target = new URL(requested, location.origin);
        return target.origin === location.origin && target.pathname.startsWith("/community/")
            ? `${target.pathname}${target.search}${target.hash}`
            : "../community-feed-page.html";
    } catch {
        return "../community-feed-page.html";
    }
}
const messagesReturnTarget = resolveMessagesReturnTarget();
const messagesBackButton = $("back-button");
messagesBackButton.title = new URLSearchParams(location.search).has("returnTo") ? "Quay lại trang trước" : "Quay lại cộng đồng";
messagesBackButton.setAttribute("aria-label", messagesBackButton.title);
messagesBackButton.onclick=async()=>{
    const effectsEnabled=!soundManager.settings.muted&&soundManager.settings.effectsEnabled;
    if(effectsEnabled){
        await Promise.race([soundManager.unlock(),new Promise(resolve=>window.setTimeout(resolve,160))]);
        playUiSound("back");
        await new Promise(resolve=>window.setTimeout(resolve,140));
    }
    location.href=messagesReturnTarget;
};

document.querySelectorAll(".conversation-filters [data-filter]").forEach(button => button.onclick = () => {
    activeConversationFilter = button.dataset.filter;
    document.querySelectorAll(".conversation-filters [data-filter]").forEach(item => item.classList.toggle("active", item.dataset.filter === activeConversationFilter));
    $("conversation-more-trigger").classList.toggle("active", ["active", "notes"].includes(activeConversationFilter));
    $("conversation-more-menu").hidden = true;
    $("conversation-more-trigger").setAttribute("aria-expanded", "false");
    applyConversationView();
});
$("conversation-more-trigger").onclick = event => {
    event.stopPropagation();
    const menu = $("conversation-more-menu");
    if(menu.parentElement!==document.body)document.body.appendChild(menu);
    menu.hidden = !menu.hidden;
    if(!menu.hidden){const rect=event.currentTarget.getBoundingClientRect();menu.style.left=`${Math.max(10,Math.min(innerWidth-menu.offsetWidth-10,rect.right-menu.offsetWidth))}px`;menu.style.top=`${Math.min(innerHeight-menu.offsetHeight-10,rect.bottom+7)}px`}
    $("conversation-more-trigger").setAttribute("aria-expanded", String(!menu.hidden));
};
document.addEventListener("click", event => {
    if (activeMessageActionMenu && Date.now()>=suppressMessageMenuCloseUntil && !event.target.closest('.message-action-menu') && !event.target.closest('.message-hover-actions') && !event.target.closest('.message-reaction-summary')) closeMessageActionMenu();
    if (!event.target.closest(".conversation-more-wrap")) {
        $("conversation-more-menu").hidden = true;
        $("conversation-more-trigger").setAttribute("aria-expanded", "false");
    }
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMessageActionMenu()});
document.addEventListener("message-unread-updated", event => {
    unreadCounts = new Map(Object.entries(event.detail || {}).map(([userId, count]) => [userId, Number(count) || 0]));
    unreadCounts.forEach((count, userId) => {
        if (count > 0 && activeFriend?.id !== userId) viewedUnreadConversations.delete(conversationId(me.uid, userId));
    });
    document.querySelectorAll(".friend-row").forEach(row => {
        const prefs=JSON.parse(localStorage.getItem(`vhht-chat-prefs:${me.uid}:${row.dataset.id}`)||"{}");
        const badge = row.querySelector(".friend-unread-badge"), count = Math.max(unreadCounts.get(row.dataset.id) || 0,prefs.manualUnread?1:0);
        if (!badge) return;
        badge.textContent = count;
        badge.hidden = !count;
    });
    if (activeConversationFilter === "unread") applyConversationView();
});

$("note-content-input").addEventListener("input", updateNoteCharacterCount);
Object.entries(NOTE_REACTIONS).forEach(([type,[emoji,label]])=>{const button=document.createElement("button");button.type="button";button.dataset.noteReaction=type;button.textContent=emoji;button.title=label;button.setAttribute("aria-label",label);button.onclick=()=>saveMessengerNoteReaction(type);$("note-reaction-picker").appendChild(button)});
$("note-dialog-close").onclick = closeNoteDialog;
$("note-reaction-viewer-close").onclick=()=>$("note-reaction-viewer").close();
$("note-reaction-viewer").addEventListener("cancel",event=>{event.preventDefault();event.currentTarget.close()});
$("note-reaction-viewer").addEventListener("click",event=>{if(event.target===event.currentTarget)event.currentTarget.close()});
$("messenger-note-dialog").addEventListener("cancel", event => { event.preventDefault(); closeNoteDialog(); });
$("messenger-note-dialog").addEventListener("click", event => {
    if (event.target === $("messenger-note-dialog")) closeNoteDialog();
});
$("note-save-button").onclick = async () => {
    const input = $("note-content-input"), content = input.value.trim(), button = $("note-save-button");
    if (!content) {
        input.setCustomValidity("Hãy nhập nội dung ghi chú.");
        input.reportValidity();
        input.setCustomValidity("");
        return;
    }
    if (!navigator.onLine) {
        showNoteFeedback("Thiết bị đang ngoại tuyến. Hãy kết nối Internet trước khi chia sẻ ghi chú.");
        return;
    }
    showNoteFeedback();
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang chia sẻ';
    const previousNote = notesByUser.get(me.uid);
    try {
        const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
        const visibleTo = noteAudienceIds.filter(id => friends.some(friend => friend.id === id));
        await clearNoteReactions(db, me.uid);
        notesByUser.set(me.uid, { authorId: me.uid, content, createdAt: Timestamp.now(), expiresAt, visibleTo });
        renderMessengerNotes();
        closeNoteDialog();
        await waitForFirestore(setDoc(doc(db, "messengerNotes", me.uid), {
            authorId: me.uid,
            content,
            createdAt: serverTimestamp(),
            expiresAt,
            visibleTo
        }), 8000);
    } catch (error) {
        console.error("Không thể lưu ghi chú", error);
        if (previousNote) notesByUser.set(me.uid, previousNote);
        else notesByUser.delete(me.uid);
        renderMessengerNotes();
        openOwnNoteEditor();
        showNoteFeedback(noteWriteErrorMessage(error));
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Chia sẻ ghi chú';
    }
};
$("note-delete-button").onclick = async event => {
    const button = event.currentTarget;
    if (button.dataset.confirming !== "true") {
        button.dataset.confirming = "true";
        button.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Nhấn lại để xác nhận';
        setTimeout(() => {
            if (!button.isConnected) return;
            button.dataset.confirming = "false";
            button.innerHTML = '<i class="fa-regular fa-trash-can"></i> Xóa ghi chú';
        }, 2600);
        return;
    }
    button.disabled = true;
    try {
        await clearNoteReactions(db, me.uid);
        await waitForFirestore(deleteDoc(doc(db, "messengerNotes", me.uid)), 12000);
        closeNoteDialog();
    } catch (error) {
        console.error("Không thể xóa ghi chú", error);
        showNoteFeedback(noteWriteErrorMessage(error));
    } finally {
        button.disabled = false;
        button.dataset.confirming = "false";
        button.innerHTML = '<i class="fa-regular fa-trash-can"></i> Xóa ghi chú';
    }
};
$("note-message-button").onclick = async () => {
    if (!selectedNoteFriend) return;
    const friendId = selectedNoteFriend.id, input=$("note-reply-input"), content=input.value.trim();
    if(!content){input.focus();return}
    const note=notesByUser.get(friendId),button=$("note-message-button");button.disabled=true;
    try{
        const id=conversationId(me.uid,friendId);
        await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:friendId,content,noteReply:{authorId:friendId,content:note?.content||"Ghi chú",expiresAt:note?.expiresAt||null},createdAt:serverTimestamp(),readAt:null});
        await markConversationActivity(friendId);
        await addDoc(collection(db,"messageNotifications"),{recipientId:friendId,senderId:me.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()});
        closeNoteDialog();await openChat(friendId);
    }finally{button.disabled=false}
    if (innerWidth <= 760) document.querySelector(".messenger-shell")?.classList.add("mobile-chat-open");
};

async function markConversationRead(senderId){
    const prefKey=`vhht-chat-prefs:${me.uid}:${senderId}`,prefs=JSON.parse(localStorage.getItem(prefKey)||"{}");prefs.manualUnread=false;localStorage.setItem(prefKey,JSON.stringify(prefs));unreadCounts.set(senderId,0);
    const [notifications,messages]=await Promise.all([getDocs(collection(db,"messageNotifications")),getDocs(collection(db,"conversations",conversationId(me.uid,senderId),"messages"))]);
    const notificationUpdates=notifications.docs.filter(item=>{const value=item.data();return value.recipientId===me.uid&&value.senderId===senderId&&!value.isRead}).map(item=>updateDoc(item.ref,{isRead:true}));
    const unreadMessages=messages.docs.filter(item=>{const value=item.data();return value.recipientId===me.uid&&!value.readAt});
    for(let offset=0;offset<unreadMessages.length;offset+=400){const batch=writeBatch(db);unreadMessages.slice(offset,offset+400).forEach(item=>batch.update(item.ref,{readAt:serverTimestamp()}));await batch.commit()}
    await Promise.all(notificationUpdates);applyConversationView();
}

document.addEventListener("chat-mute-updated",event=>{const {friendId,mutedUntil=0}=event.detail||{};if(!friendId||!me)return;const key=`vhht-chat-prefs:${me.uid}:${friendId}`,prefs=JSON.parse(localStorage.getItem(key)||"{}");prefs.mutedUntil=Number(mutedUntil)||0;localStorage.setItem(key,JSON.stringify(prefs));applyConversationView()});
function formatActivity(user){if(user.showActivityStatus===false)return"Đã ẩn trạng thái hoạt động";if(isUserActive(user))return"Đang hoạt động";const seconds=user.lastActiveAt?.seconds;if(!seconds)return"Chưa có trạng thái hoạt động";const minutes=Math.max(1,Math.floor((Date.now()/1000-seconds)/60));if(minutes<60)return`Hoạt động ${minutes} phút trước`;const hours=Math.floor(minutes/60);if(hours<24)return`Hoạt động ${hours} giờ trước`;const days=Math.floor(hours/24);if(days<7)return`Hoạt động ${days} ngày trước`;return`Hoạt động ${new Date(seconds*1000).toLocaleDateString("vi-VN")}`}

const emojiPicker=document.createElement("div");
emojiPicker.className="message-emoji-picker";
emojiPicker.hidden=true;
emojiPicker.setAttribute("role","dialog");
emojiPicker.setAttribute("aria-label","Chọn biểu cảm");
["🙂","😂","❤️","👍","🎉","😮","😢","🔥"].forEach(emoji=>{const button=document.createElement("button");button.type="button";button.textContent=emoji;button.setAttribute("aria-label",`Thêm ${emoji}`);button.addEventListener("pointerdown",event=>event.preventDefault());button.onclick=()=>{const input=$("message-input"),start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.setRangeText(emoji,start,end,"end");input.dispatchEvent(new Event("input",{bubbles:true}));emojiPicker.hidden=true;$("message-emoji-button").setAttribute("aria-expanded","false");input.focus()};emojiPicker.appendChild(button)});
$("message-form").appendChild(emojiPicker);
$("message-emoji-button").setAttribute("aria-expanded","false");
$("message-emoji-button").onclick=event=>{event.stopPropagation();emojiPicker.hidden=!emojiPicker.hidden;$("message-emoji-button").setAttribute("aria-expanded",String(!emojiPicker.hidden))};
$("quick-chat-emoji").onclick=()=>{const input=$("message-input");input.value=chatSettings.getDefaultEmoji();input.dispatchEvent(new Event("input",{bubbles:true}));$("message-form").requestSubmit()};
document.addEventListener("click",event=>{if(!emojiPicker.hidden&&!event.target.closest(".message-emoji-picker,#message-emoji-button")){emojiPicker.hidden=true;$("message-emoji-button").setAttribute("aria-expanded","false")}});
const SEND_EFFECTS=[["none","Không hiệu ứng","fa-regular fa-message"],["hearts","Thả tim","fa-solid fa-heart"],["confetti","Pháo giấy","fa-solid fa-champagne-glasses"],["fire","Bùng cháy","fa-solid fa-fire"],["gift","Quà bất ngờ","fa-solid fa-gift"],["stars","Mưa sao","fa-solid fa-star"],["neon","Neon","fa-solid fa-bolt"],["snow","Tuyết rơi","fa-solid fa-snowflake"],["galaxy","Thiên hà","fa-solid fa-meteor"]];
const effectPicker=document.createElement("section");effectPicker.className="message-effect-picker";effectPicker.hidden=true;effectPicker.setAttribute("role","dialog");effectPicker.setAttribute("aria-label","Hiệu ứng gửi tin nhắn");effectPicker.innerHTML=`<header><span><i class="fa-solid fa-wand-magic-sparkles"></i><strong>Hiệu ứng tin nhắn</strong></span><small>Hiển thị khi tin nhắn được gửi</small></header><div>${SEND_EFFECTS.map(([key,label,icon])=>`<button type="button" data-send-effect="${key}" title="${label}"><span><i class="${icon}"></i></span><b>${label}</b></button>`).join("")}</div>`;$("message-form").appendChild(effectPicker);
const composerMoreMenu=document.createElement("section");
composerMoreMenu.className="composer-more-menu";
composerMoreMenu.hidden=true;
composerMoreMenu.setAttribute("role","menu");
composerMoreMenu.setAttribute("aria-label","Tiện ích trò chuyện");
const DEFAULT_QUICK_REPLIES=["Cảm ơn bạn nhé!","Mình đã nhận được tin nhắn.","Bạn gửi thêm thông tin giúp mình nhé.","Mình sẽ kiểm tra và phản hồi sớm.","Được rồi, mình đồng ý.","Khi nào thuận tiện bạn nhắn lại nhé."];
const quickReplyStorageKey=()=>`vhht:quick-replies:${me?.uid||"guest"}`;
function getCustomQuickReplies(){
    try{const saved=JSON.parse(localStorage.getItem(quickReplyStorageKey())||"[]");return Array.isArray(saved)?saved.filter(item=>typeof item==="string"&&item.trim()).slice(0,20):[]}
    catch{return[]}
}
function saveCustomQuickReplies(replies){localStorage.setItem(quickReplyStorageKey(),JSON.stringify(replies.slice(0,20)))}
const getQuickReplies=()=>[...getCustomQuickReplies(),...DEFAULT_QUICK_REPLIES];
function insertComposerText(text){
    const input=$("message-input"),start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
    const spacer=start>0&&!/\s$/.test(input.value.slice(0,start))?" ":"";
    input.setRangeText(`${spacer}${text}`,start,end,"end");
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.focus({preventScroll:true});
}
function renderComposerTools(view="home",status=""){
    if(view==="quick"){
        const replies=getQuickReplies();
        composerMoreMenu.innerHTML=`<header class="composer-tool-header"><button type="button" data-composer-back aria-label="Quay lại"><i class="fa-solid fa-arrow-left"></i></button><span><strong>Trả lời nhanh</strong><small>Chọn câu phù hợp rồi chỉnh sửa nếu cần</small></span><button type="button" class="composer-quick-settings" data-quick-settings aria-label="Cài đặt câu trả lời nhanh" title="Cài đặt câu trả lời nhanh"><i class="fa-solid fa-gear"></i></button></header><div class="composer-quick-replies">${replies.map((reply,index)=>`<button type="button" data-quick-reply="${index}"><i class="fa-regular fa-message"></i><span>${escapeMessageHtml(reply)}</span></button>`).join("")}</div>`;
        composerMoreMenu.querySelector("[data-composer-back]").onclick=event=>{event.stopPropagation();renderComposerTools()};
        composerMoreMenu.querySelector("[data-quick-settings]").onclick=event=>{event.stopPropagation();renderComposerTools("quick-settings")};
        composerMoreMenu.querySelectorAll("[data-quick-reply]").forEach(button=>button.onclick=event=>{event.stopPropagation();insertComposerText(replies[Number(button.dataset.quickReply)]);composerMoreMenu.hidden=true;$("composer-more-button").setAttribute("aria-expanded","false")});
        return;
    }
    if(view==="quick-settings"){
        const customReplies=getCustomQuickReplies();
        composerMoreMenu.innerHTML=`<header class="composer-tool-header"><button type="button" data-quick-back aria-label="Quay lại"><i class="fa-solid fa-arrow-left"></i></button><span><strong>Câu trả lời của bạn</strong><small>Lưu riêng cho tài khoản này trên thiết bị</small></span></header><div class="composer-quick-form"><input type="text" maxlength="180" placeholder="Nhập câu trả lời nhanh…" aria-label="Câu trả lời nhanh mới"><button type="button" data-add-quick aria-label="Thêm câu"><i class="fa-solid fa-plus"></i></button></div><p class="composer-quick-status" aria-live="polite">${status||`Bạn có ${customReplies.length}/20 câu tùy chỉnh.`}</p><div class="composer-custom-replies">${customReplies.length?customReplies.map((reply,index)=>`<div><span>${escapeMessageHtml(reply)}</span><button type="button" data-delete-quick="${index}" aria-label="Xóa câu trả lời"><i class="fa-regular fa-trash-can"></i></button></div>`).join(""):`<div class="composer-quick-empty"><i class="fa-regular fa-message"></i><span>Chưa có câu tùy chỉnh.</span></div>`}</div>`;
        composerMoreMenu.querySelector("[data-quick-back]").onclick=event=>{event.stopPropagation();renderComposerTools("quick")};
        const addQuickReply=event=>{event?.preventDefault();event?.stopPropagation();const input=composerMoreMenu.querySelector(".composer-quick-form input"),value=input.value.trim();if(!value){input.focus();return}const replies=getCustomQuickReplies();if(replies.some(reply=>reply.toLocaleLowerCase("vi")==value.toLocaleLowerCase("vi"))){renderComposerTools("quick-settings","Câu này đã có trong danh sách.");return}if(replies.length>=20){renderComposerTools("quick-settings","Bạn đã đạt giới hạn 20 câu tùy chỉnh.");return}saveCustomQuickReplies([value,...replies]);renderComposerTools("quick-settings","Đã thêm câu trả lời nhanh.");composerMoreMenu.querySelector(".composer-quick-form input")?.focus()};
        composerMoreMenu.querySelector("[data-add-quick]").onclick=addQuickReply;
        composerMoreMenu.querySelector(".composer-quick-form input").onkeydown=event=>{if(event.key==="Enter")addQuickReply(event)};
        composerMoreMenu.querySelectorAll("[data-delete-quick]").forEach(button=>button.onclick=event=>{event.stopPropagation();const replies=getCustomQuickReplies();replies.splice(Number(button.dataset.deleteQuick),1);saveCustomQuickReplies(replies);renderComposerTools("quick-settings","Đã xóa câu trả lời.")});
        return;
    }
    composerMoreMenu.innerHTML=`<header class="composer-tool-title"><strong>Tiện ích trò chuyện</strong><small>${status||"Các công cụ hỗ trợ, không trùng nút gửi bên ngoài"}</small></header><button type="button" data-composer-tool="search"><i class="fa-solid fa-magnifying-glass"></i><span><strong>Tìm trong cuộc trò chuyện</strong><small>Tìm lại nội dung đã trao đổi</small></span></button><button type="button" data-composer-tool="quick"><i class="fa-solid fa-reply"></i><span><strong>Trả lời nhanh</strong><small>Dùng mẫu câu rồi chỉnh sửa trước khi gửi</small></span></button><button type="button" data-composer-tool="location"><i class="fa-solid fa-location-dot"></i><span><strong>Chia sẻ vị trí hiện tại</strong><small>Tạo liên kết bản đồ sau khi bạn cho phép</small></span></button><button type="button" data-composer-tool="profile"><i class="fa-regular fa-address-card"></i><span><strong>Chia sẻ hồ sơ của tôi</strong><small>Chèn liên kết hồ sơ vào tin nhắn</small></span></button>`;
    composerMoreMenu.querySelector('[data-composer-tool="search"]').onclick=()=>{composerMoreMenu.hidden=true;$("composer-more-button").setAttribute("aria-expanded","false");chatSettings.open("search")};
    composerMoreMenu.querySelector('[data-composer-tool="quick"]').onclick=event=>{event.stopPropagation();renderComposerTools("quick")};
    composerMoreMenu.querySelector('[data-composer-tool="profile"]').onclick=()=>{const url=new URL("../profile-user/user-profile.html",location.href);url.searchParams.set("uid",me.uid);insertComposerText(url.href);composerMoreMenu.hidden=true;$("composer-more-button").setAttribute("aria-expanded","false")};
    composerMoreMenu.querySelector('[data-composer-tool="location"]').onclick=()=>{
        if(!navigator.geolocation){renderComposerTools("home","Trình duyệt này không hỗ trợ chia sẻ vị trí.");return}
        renderComposerTools("home","Đang lấy vị trí của bạn…");
        navigator.geolocation.getCurrentPosition(position=>{const {latitude,longitude}=position.coords;insertComposerText(`https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`);composerMoreMenu.hidden=true;$("composer-more-button").setAttribute("aria-expanded","false")},error=>renderComposerTools("home",error.code===1?"Bạn chưa cho phép truy cập vị trí.":"Chưa thể lấy vị trí. Vui lòng thử lại."),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
    };
}
renderComposerTools();
$("message-form").appendChild(composerMoreMenu);
const composerEffectPreview=document.createElement("span");composerEffectPreview.className="composer-effect-preview";composerEffectPreview.hidden=true;composerEffectPreview.setAttribute("aria-hidden","true");$("message-form").appendChild(composerEffectPreview);
const EFFECT_PREVIEW_GLYPHS={hearts:"💗 💕",confetti:"🎊 ✦",fire:"🔥",gift:"🎁 ✨",stars:"⭐ ✨",neon:"⚡",snow:"❄️ ❅",galaxy:"☄️ ✦"};
function selectSendEffect(effect){selectedSendEffect=SEND_EFFECTS.some(([key])=>key===effect)?effect:"none";effectPicker.querySelectorAll("[data-send-effect]").forEach(button=>button.classList.toggle("active",button.dataset.sendEffect===selectedSendEffect));$("message-effect-button").classList.toggle("active",selectedSendEffect!=="none");const form=$("message-form");[...form.classList].filter(name=>name.startsWith("composer-effect-")).forEach(name=>form.classList.remove(name));const active=selectedSendEffect!=="none";if(active)form.classList.add(`composer-effect-${selectedSendEffect}`);composerEffectPreview.hidden=!active;composerEffectPreview.textContent=EFFECT_PREVIEW_GLYPHS[selectedSendEffect]||"";if(innerWidth<=760&&form.classList.contains('composer-input-expanded')){form.classList.remove('composer-tools-revealed');syncMobileComposerLayout()}}
effectPicker.querySelectorAll("[data-send-effect]").forEach(button=>button.onclick=()=>{selectSendEffect(button.dataset.sendEffect);effectPicker.hidden=true;$("message-effect-button").setAttribute("aria-expanded","false");$("message-input").focus()});
$("message-effect-button").onclick=event=>{event.stopPropagation();effectPicker.hidden=!effectPicker.hidden;emojiPicker.hidden=true;$("message-effect-button").setAttribute("aria-expanded",String(!effectPicker.hidden));$("message-emoji-button").setAttribute("aria-expanded","false")};
function syncMobileComposerLayout(){const form=$("message-form"),hasText=Boolean($("message-input").value.trim());form.classList.toggle("composer-input-expanded",hasText);if(!hasText)form.classList.remove("composer-tools-revealed");const collapsed=hasText&&!form.classList.contains("composer-tools-revealed");const button=$("composer-more-button");button.innerHTML=`<i class="fa-solid ${collapsed?'fa-chevron-right':'fa-plus'}" aria-hidden="true"></i>`;button.title=collapsed?'Mở lại công cụ':'Mở thêm công cụ';button.setAttribute('aria-label',button.title)}
$("message-input").addEventListener("input",syncMobileComposerLayout);
$("composer-more-button").onclick=event=>{event.stopPropagation();const form=$("message-form"),expanded=form.classList.contains("composer-input-expanded"),revealed=form.classList.contains("composer-tools-revealed");if(innerWidth<=760&&expanded&&!revealed){form.classList.add("composer-tools-revealed");syncMobileComposerLayout();$("message-input").focus({preventScroll:true});return}effectPicker.hidden=!effectPicker.hidden;emojiPicker.hidden=true;$("composer-more-button").setAttribute("aria-expanded",String(!effectPicker.hidden));$("message-effect-button").setAttribute("aria-expanded",String(!effectPicker.hidden))};
document.addEventListener("click",event=>{if(!effectPicker.hidden&&!event.target.closest(".message-effect-picker,#message-effect-button")){effectPicker.hidden=true;$("message-effect-button").setAttribute("aria-expanded","false")}});selectSendEffect("none");syncMobileComposerLayout();
$("composer-more-button").onclick=event=>{
    event.stopPropagation();
    const form=$("message-form"),expanded=form.classList.contains("composer-input-expanded"),revealed=form.classList.contains("composer-tools-revealed");
    if(innerWidth<=760&&expanded&&!revealed){form.classList.add("composer-tools-revealed");syncMobileComposerLayout();$("message-input").focus({preventScroll:true});return}
    composerMoreMenu.hidden=!composerMoreMenu.hidden;effectPicker.hidden=true;emojiPicker.hidden=true;
    $("composer-more-button").setAttribute("aria-expanded",String(!composerMoreMenu.hidden));
    $("message-effect-button").setAttribute("aria-expanded","false");
};
document.addEventListener("click",event=>{if(!composerMoreMenu.hidden&&!event.target.closest(".composer-more-menu,#composer-more-button")){composerMoreMenu.hidden=true;$("composer-more-button").setAttribute("aria-expanded","false")}});
resizeMessageInput();
