import { firebaseAuthentication as auth, firebaseDatabase as db } from "../../shared/firebase-connection.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, collection, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, writeBatch, Timestamp, increment, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { startPresenceTracking, isUserActive } from "../../shared/presence-handler.js";
import { resolveDisplayName, isGeneratedDisplayName } from "../../shared/user-identity.js";
import { repairFriendship } from "../../shared/friendship-service.js";
import { uploadMedia } from "../../shared/cloudinary-media-service.js";
import "./messages-enhancements.js";
import "./messages-responsive.js?v=2";
const $ = id => document.getElementById(id);
const DEFAULT_AVATAR = "../../shared/assets/default-avatar.svg";
const conversationId = (first, second) => [first, second].sort().join("_");
const escapeMessageHtml = value => { const node = document.createElement("div"); node.textContent = String(value || ""); return node.innerHTML; };
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
        body.innerHTML = `<article class="chat-shared-post"><div class="chat-shared-author"><img src="${escapeMessageHtml(avatar)}" alt=""><span><strong>${escapeMessageHtml(authorName)}</strong><small>${post.privacy === "friends" ? "Bạn bè" : "Công khai"}</small></span></div>${post.content ? `<p>${escapeMessageHtml(post.content)}</p>` : ""}${mediaHtml}<footer><span data-chat-react-count><i class="fa-regular fa-heart"></i> ${Object.keys(post.reactions || {}).length}</span><span data-chat-comment-count><i class="fa-regular fa-comment"></i> ${post.commentCount || 0} bình luận</span></footer><div class="chat-post-actions"><button type="button" data-chat-like class="${myReaction?'active':''}"><i class="fa-${myReaction?'solid':'regular'} fa-heart"></i> ${myReaction?'Đã thích':'Thích'}</button><button type="button" data-focus-chat-comment><i class="fa-regular fa-comment"></i> Bình luận</button></div><section class="chat-post-comments"><div class="chat-post-comments-list"><div class="chat-post-loading compact"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div><form><img src="${escapeMessageHtml(resolveProfileAvatar(ownProfile,true))}" alt=""><input maxlength="1000" placeholder="Viết bình luận…"><button aria-label="Gửi bình luận"><i class="fa-solid fa-paper-plane"></i></button></form></section></article>`;
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
        stopSharedPostComments=onSnapshot(query(collection(db,"posts",sharedPost.id,"comments"),orderBy("createdAt","asc")),snapshot=>{const list=article.querySelector(".chat-post-comments-list"),comments=[];snapshot.forEach(item=>comments.push({id:item.id,...item.data()}));list.innerHTML=comments.length?comments.map(comment=>`<div class="chat-post-comment" data-author-id="${escapeMessageHtml(comment.authorId)}"><img src="${escapeMessageHtml(comment.authorAvatar||DEFAULT_AVATAR)}" alt=""><div><strong>${escapeMessageHtml(comment.authorDisplayName||"Thành viên VHHT")}</strong><p>${escapeMessageHtml(comment.content||"")}</p></div></div>`).join(""):'<p class="chat-no-comments">Chưa có bình luận. Hãy bắt đầu cuộc trò chuyện.</p>';article.querySelector("[data-chat-comment-count]").innerHTML=`<i class="fa-regular fa-comment"></i> ${comments.length} bình luận`;updateDoc(doc(db,"posts",sharedPost.id),{commentCount:comments.length}).catch(console.warn);list.querySelectorAll(".chat-post-comment").forEach(node=>{getDoc(doc(db,"users",node.dataset.authorId)).then(userSnapshot=>{if(!userSnapshot.exists())return;const data=userSnapshot.data();node.querySelector("img").src=resolveProfileAvatar(data);node.querySelector("strong").textContent=meaningfulName(data,node.querySelector("strong").textContent)})})});
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
let me = null, friends = [], activeFriend = null, stopMessages = null, stopConversation = null, typingTimer = null;
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
const notesByUser = new Map(), stopNoteListeners = [];
let notesExpiryTimer = null;
let activeUnreadBoundaryId = null;
let noteAudienceIds = [];
const viewedUnreadConversations = new Set();
let stopOwnProfile = null;
let selectedMessageReply = null;
let activeMessageActionMenu = null;
let suppressMessageMenuCloseUntil = 0;
const MESSAGE_REACTIONS = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢", angry: "😡" };

function openProfileFromChat(profileUid){
    if(!profileUid)return;
    const returnChatUid=activeFriend?.id||profileUid;
    sessionStorage.setItem("vhht_profile_return_source","chat");
    sessionStorage.setItem("vhht_profile_return_chat_uid",returnChatUid);
    location.href=`../profile-user/user-profile.html?uid=${encodeURIComponent(profileUid)}&from=chat&chat=${encodeURIComponent(returnChatUid)}`;
}

function resolveProfileAvatar(profile, isOwn = false) {
    const storedAvatar = profile?.photoURL || profile?.profileImage;
    if (storedAvatar) return storedAvatar;
    const hasPersistedAvatarState = profile
        && (Object.prototype.hasOwnProperty.call(profile, "photoURL")
            || Object.prototype.hasOwnProperty.call(profile, "profileImage"));
    if (isOwn && !hasPersistedAvatarState && me?.photoURL) return me.photoURL;
    return DEFAULT_AVATAR;
}

async function sendPostFromChat(friend, sharedPost, post, noteText) {
    const id=conversationId(me.uid,friend.id),media=post.attachedImages?.[0]||(post.attachedImage?{url:post.attachedImage,type:post.mediaType}:null);
    await setDoc(doc(db,"conversations",id),{members:[me.uid,friend.id],updatedAt:serverTimestamp()},{merge:true});
    await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:friend.id,content:noteText.trim(),sharedPost:{id:sharedPost.id,authorId:post.authorId,authorName:post.authorDisplayName||sharedPost.authorName||"Thành viên VHHT",content:post.content||"",mediaUrl:media?.url||null,mediaType:media?.type||null},createdAt:serverTimestamp(),readAt:null});
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
        const button=document.createElement('button');button.type='button';button.textContent=emoji;button.title=`Thả ${emoji}`;
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
    let startX=0,startY=0,longPressTimer=null,dragging=false;
    row.addEventListener('pointerdown',event=>{
        if(event.button!==0||event.target.closest('button,a'))return;
        startX=event.clientX;startY=event.clientY;dragging=false;
        if(event.pointerType!=='mouse')longPressTimer=setTimeout(()=>{longPressTimer=null;suppressMessageMenuCloseUntil=Date.now()+650;openMessageActionMenu(row,reference,message)},520);
    });
    row.addEventListener('pointermove',event=>{
        if(!startX||event.pointerType==='mouse')return;
        const dx=event.clientX-startX,dy=event.clientY-startY;
        if(Math.abs(dx)>9||Math.abs(dy)>9){clearTimeout(longPressTimer);longPressTimer=null}
        if(message.senderId!==me.uid&&dx>0&&Math.abs(dx)>Math.abs(dy)){dragging=true;row.style.setProperty('--reply-drag',`${Math.min(68,dx)}px`)}
    });
    const finish=event=>{
        clearTimeout(longPressTimer);longPressTimer=null;
        const dx=event.clientX-startX;row.style.removeProperty('--reply-drag');startX=0;
        if(dragging&&dx>52){event.preventDefault();selectMessageReply(reference.id,message)}
        dragging=false;
    };
    row.addEventListener('pointerup',finish);row.addEventListener('pointercancel',()=>{clearTimeout(longPressTimer);longPressTimer=null;row.style.removeProperty('--reply-drag');startX=0;dragging=false});
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
        if (requested && friends.some(friend => friend.id === requested)) await openChat(requested);
    } catch (error) {
        console.error("Không thể tải bạn bè", error);
        $("friends-list").innerHTML = `<div class="message-load-error">${error.message || "Không thể tải danh sách bạn bè"}</div>`;
    }
});

async function loadFriends() {
    const ownReference = doc(db, "users", me.uid);
    const [ownSnapshot, usersSnapshot, notificationsSnapshot] = await Promise.all([
        getDoc(ownReference),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "notifications"))
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
    friendIds.delete(me.uid);
    friends = [...friendIds].map(id => ({ ...(profiles.get(id) || {}), id })).filter(friend => friend.accountStatus !== "suspended");
    friends.sort((first, second) => resolveDisplayName(first).localeCompare(resolveDisplayName(second), "vi"));
    // Chỉ đưa quan hệ đã có ở phía hiện tại vào quyền xem ghi chú ngay lập tức.
    // Quan hệ phía ngược sẽ được thêm sau khi sửa hai chiều thành công.
    const synchronizedAudienceIds = new Set([...requestedFriendIds].filter(id => friendIds.has(id)));
    noteAudienceIds = friends.map(friend => friend.id).filter(id => synchronizedAudienceIds.has(id));
    applyConversationView();
    ownProfile.friends = [...friendIds];
    const asymmetricFriendIds = [...friendIds].filter(id => !(profiles.get(id)?.friends || []).includes(me.uid));
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
        const row=document.createElement("button");row.type="button";row.className="friend-row";row.dataset.id=friend.id;
        const image=document.createElement("img");image.src=friend.photoURL||friend.profileImage||DEFAULT_AVATAR;
        const dot=document.createElement("i"),content=document.createElement("span"),name=document.createElement("strong"),status=document.createElement("small"),online=isUserActive(friend);
        const badge=document.createElement("b"),unread=unreadCounts.get(friend.id)||0;badge.className="friend-unread-badge";badge.textContent=unread;badge.hidden=!unread;
        dot.className=`presence-dot ${online?"online":""}`;name.textContent=resolveDisplayName(friend);status.className=online?"presence":"";status.textContent=formatActivity(friend);content.append(name,status);row.append(image,dot,content,badge);row.onclick=()=>openChat(friend.id);list.appendChild(row);
    });
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
    let visible = friends.filter(friend => resolveDisplayName(friend).toLocaleLowerCase("vi-VN").includes(term));
    if (activeConversationFilter === "groups") {
        if ($("conversation-count")) $("conversation-count").textContent = "0";
        $("friends-list").innerHTML = '<div class="group-chat-placeholder"><span><i class="fa-solid fa-user-group"></i></span><strong>Nhóm chat</strong><p>Tính năng tạo và quản lý nhóm đang được chuẩn bị cho phiên bản tiếp theo.</p><button type="button" disabled>Sắp ra mắt</button></div>';
        return;
    }
    if (activeConversationFilter === "unread") visible = visible.filter(friend => (unreadCounts.get(friend.id) || 0) > 0);
    if (activeConversationFilter === "active") visible = visible.filter(friend => isUserActive(friend));
    if (activeConversationFilter === "notes") visible = visible.filter(friend => activeNoteFor(friend.id));
    renderFriends(sortFriendsForMessenger(visible));
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
    button.className = `messenger-note-tile ${isOwn ? "is-own" : ""} ${note ? "has-note" : "no-note"} ${online ? "is-online" : ""}`;
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
    openNoteDialog();
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
    const serial = ++openedConversationSerial;
    const id = conversationId(me.uid, uid);
    const online = isUserActive(selectedFriend);
    const header = $("chat-header");
    const list = $("messages-list");
    renderedMessageIds = new Set();
    receivedFirstMessageSnapshot = false;
    lastMessageRenderSignature = "";
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
    header.appendChild(contact);

    list.innerHTML = '<div class="conversation-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải tin nhắn…</div>';
    $("message-input").disabled = false;
    $("message-form").querySelectorAll("button").forEach(button => button.disabled = false);

    // Subscribe first so the initial tap always renders existing messages immediately.
    stopConversation = onSnapshot(doc(db, "conversations", id), snapshot => {
        if (serial !== openedConversationSerial) return;
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
                return [item.id, message.senderId, message.content || "", message.mediaUrl || "", message.sharedPost?.id || "", outgoingReadState, Boolean(message.revoked), JSON.stringify(message.reactions||{}), JSON.stringify(message.hiddenFor||[]), message.replyTo?.id||""].join(":");
            }).join("|");
            if (!isInitialSnapshot && renderSignature === lastMessageRenderSignature) return;
            lastMessageRenderSignature = renderSignature;
            const lastOwnMessage = [...orderedDocs].reverse().find(item => item.data().senderId === me.uid);
            orderedDocs.forEach(item => {
                const message = item.data();
                if((message.hiddenFor||[]).includes(me.uid))return;
                nextIds.add(item.id);
                const rowSignature = [item.id, message.senderId, message.content || "", message.mediaUrl || "", message.mediaType || "", message.sharedPost?.id || "", Boolean(message.readAt), item.id === lastOwnMessage?.id, Boolean(message.revoked), JSON.stringify(message.reactions||{}), message.replyTo?.id||""].join(":");
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
                bubble.dataset.messageId = item.id;
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
                if (!message.revoked&&message.content) { const contentNode=document.createElement("p");contentNode.className="message-text-content";contentNode.textContent=message.content;bubble.appendChild(contentNode); }
                if (!message.revoked&&message.mediaUrl) {
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
                    shared.innerHTML = `<span class="shared-post-kicker"><i class="fa-solid fa-share-nodes"></i> Bài viết được chia sẻ</span><span class="shared-post-preview">${previewMedia}<span class="shared-post-copy"><strong>${escapeMessageHtml(message.sharedPost.authorName || "Thành viên VHHT")}</strong><p>${escapeMessageHtml(message.sharedPost.content || "Chạm để khám phá nội dung bài viết")}</p><span class="shared-post-open">Mở chi tiết <i class="fa-solid fa-arrow-right"></i></span></span></span>`;
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
                if (message.senderId === me.uid && item.id === lastOwnMessage?.id) {
                    const receipt = document.createElement("span");
                    receipt.className = `message-receipt ${message.readAt ? "seen" : ""}`;
                    receipt.innerHTML = message.readAt
                        ? '<i class="fa-solid fa-check-double"></i> Đã xem'
                        : '<i class="fa-solid fa-check"></i> Đã gửi';
                    meta.appendChild(receipt);
                } else if (message.recipientId === me.uid && !message.readAt) unread.push(item.ref);
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
                const row=document.createElement("div");row.className=`message-row ${message.senderId===me.uid?"mine":"theirs"}`;row.dataset.messageId=item.id;row.dataset.renderSignature=rowSignature;
                const senderProfile=message.senderId===me.uid?ownProfile:activeFriend,avatar=document.createElement("img");avatar.className="message-sender-avatar";avatar.src=resolveProfileAvatar(senderProfile,message.senderId===me.uid);avatar.alt=message.senderId===me.uid?"Ảnh đại diện của bạn":resolveDisplayName(activeFriend||{});avatar.tabIndex=0;avatar.setAttribute("role","link");avatar.title="Xem hồ sơ";avatar.onclick=event=>{event.stopPropagation();openProfileFromChat(message.senderId)};avatar.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openProfileFromChat(message.senderId)}};row.append(avatar,bubble);fragment.appendChild(row);
                const controls=document.createElement('div');controls.className='message-hover-actions';
                if(!message.revoked){
                    const react=document.createElement('button');react.type='button';react.className='message-hover-react';react.title='Thả cảm xúc';react.innerHTML='<i class="fa-regular fa-face-smile"></i>';react.onclick=event=>{event.stopPropagation();openMessageActionMenu(react,item.ref,message,{reactionsOnly:true})};
                    const reply=document.createElement('button');reply.type='button';reply.title='Trả lời';reply.innerHTML='<i class="fa-solid fa-reply"></i>';reply.onclick=event=>{event.stopPropagation();selectMessageReply(item.id,message)};controls.append(react,reply);
                }
                const more=document.createElement('button');more.type='button';more.title='Thao tác khác';more.innerHTML='<i class="fa-solid fa-ellipsis-vertical"></i>';more.onclick=event=>{event.stopPropagation();openMessageActionMenu(more,item.ref,message)};controls.appendChild(more);row.appendChild(controls);
                row.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'||matchMedia('(hover:hover) and (pointer:fine)').matches)row.classList.add('actions-visible')});
                row.addEventListener('pointerleave',()=>row.classList.remove('actions-visible'));
                bindMessageGestures(row,item.ref,message);
            });
            list.replaceChildren(fragment);
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
            });
        },
        error => {
            if (serial !== openedConversationSerial) return;
            console.error("Không thể tải tin nhắn", error);
            list.innerHTML = '<div class="message-load-error">Không thể tải cuộc trò chuyện. Hãy thử lại.</div>';
        }
    );

    setDoc(doc(db, "conversations", id), {
        members: [me.uid, uid],
        updatedAt: serverTimestamp()
    }, { merge: true }).catch(error => console.warn("Không thể cập nhật hội thoại", error));
    markConversationRead(uid);
}

$("message-form").onsubmit=async event=>{
    event.preventDefault();
    const input=$("message-input"),content=input.value.trim(),file=mediaInput.files[0];
    if((!content&&!file)||!activeFriend)return;
    const friend={...activeFriend},id=conversationId(me.uid,friend.id),sendButton=$("message-form").querySelector(".send-message-button"),list=$("messages-list");
    sendButton.disabled=true;forceConversationEndUntil=Date.now()+1800;
    try{
        const media=file?await uploadMedia(file,percent=>{mediaPreview.style.setProperty("--upload-progress",`${percent}%`);mediaPreview.classList.toggle("uploading",percent<100)}):null;
        setTyping(false);
        await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:friend.id,content,mediaUrl:media?.mediaUrl||null,mediaType:media?.mediaType||null,mediaPublicId:media?.mediaPublicId||null,replyTo:selectedMessageReply?{...selectedMessageReply}:null,createdAt:serverTimestamp(),readAt:null});
        input.value="";resizeMessageInput();clearSelectedMessageMedia();clearMessageReply();
        requestAnimationFrame(()=>list.scrollTo({top:list.scrollHeight,behavior:"auto"}));
        addDoc(collection(db,"messageNotifications"),{recipientId:friend.id,senderId:me.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()}).catch(console.warn);
    }catch(error){
        console.error("Không thể gửi tin nhắn",error);
        if(!input.value)input.value=content;
        resizeMessageInput();
    }finally{mediaPreview.classList.remove("uploading");mediaPreview.style.removeProperty("--upload-progress");sendButton.disabled=false;input.focus({preventScroll:true})}
};
function resizeMessageInput(){const input=$("message-input");input.style.height="44px";input.style.height=`${Math.min(120,Math.max(44,input.scrollHeight))}px`;input.style.overflowY=input.scrollHeight>120?"auto":"hidden"}
$("message-input").addEventListener("input",()=>{resizeMessageInput();if(!activeFriend)return;setTyping(true);clearTimeout(typingTimer);typingTimer=setTimeout(()=>setTyping(false),1800)});
async function setTyping(value){if(!me||!activeFriend)return;const id=conversationId(me.uid,activeFriend.id);await updateDoc(doc(db,"conversations",id),{[`typing.${me.uid}`]:value}).catch(console.warn)}
$("friend-filter").oninput=applyConversationView;
$("back-button").onclick=()=>location.href="../community-feed-page.html";

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
    menu.hidden = !menu.hidden;
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
        const badge = row.querySelector(".friend-unread-badge"), count = unreadCounts.get(row.dataset.id) || 0;
        if (!badge) return;
        badge.textContent = count;
        badge.hidden = !count;
    });
    if (activeConversationFilter === "unread") applyConversationView();
});

$("note-content-input").addEventListener("input", updateNoteCharacterCount);
$("note-dialog-close").onclick = closeNoteDialog;
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
        await setDoc(doc(db,"conversations",id),{members:[me.uid,friendId],updatedAt:serverTimestamp()},{merge:true});
        await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:friendId,content,noteReply:{authorId:friendId,content:note?.content||"Ghi chú",expiresAt:note?.expiresAt||null},createdAt:serverTimestamp(),readAt:null});
        await addDoc(collection(db,"messageNotifications"),{recipientId:friendId,senderId:me.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()});
        closeNoteDialog();await openChat(friendId);
    }finally{button.disabled=false}
    if (innerWidth <= 760) document.querySelector(".messenger-shell")?.classList.add("mobile-chat-open");
};

function markConversationRead(senderId){getDocs(collection(db,"messageNotifications")).then(snapshot=>snapshot.forEach(item=>{const notification=item.data();if(notification.recipientId===me.uid&&notification.senderId===senderId&&!notification.isRead)updateDoc(item.ref,{isRead:true})})).catch(console.warn)}
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
document.addEventListener("click",event=>{if(!emojiPicker.hidden&&!event.target.closest(".message-emoji-picker,#message-emoji-button")){emojiPicker.hidden=true;$("message-emoji-button").setAttribute("aria-expanded","false")}});
resizeMessageInput();
