import { firebaseAuthentication as auth, firebaseDatabase as db } from "../../shared/firebase-connection.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, addDoc, collection, query, orderBy, onSnapshot, serverTimestamp, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { startPresenceTracking, isUserActive } from "../../shared/presence-handler.js";
import { resolveDisplayName } from "../../shared/user-identity.js";
import { uploadMedia } from "../../shared/cloudinary-media-service.js";
import "./messages-enhancements.js";
const realtimeStyles=document.createElement("link");realtimeStyles.rel="stylesheet";realtimeStyles.href="./messages-realtime.css?v=2";document.head.appendChild(realtimeStyles);
const mediaStyles=document.createElement("link");mediaStyles.rel="stylesheet";mediaStyles.href="./messages-media.css?v=1";document.head.appendChild(mediaStyles);

const $ = id => document.getElementById(id);
const DEFAULT_AVATAR = "../../shared/assets/default-avatar.svg";
const conversationId = (first, second) => [first, second].sort().join("_");
let me = null, friends = [], activeFriend = null, stopMessages = null, stopConversation = null, typingTimer = null;

startPresenceTracking();
const mediaInput=document.createElement("input");mediaInput.type="file";mediaInput.accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";mediaInput.hidden=true;mediaInput.id="message-media-input";const mediaButton=document.createElement("button");mediaButton.type="button";mediaButton.className="message-tool message-media-button";mediaButton.innerHTML='<i class="fa-solid fa-photo-film"></i>';mediaButton.title="Gửi ảnh hoặc video";mediaButton.onclick=()=>mediaInput.click();$("message-form").insertBefore(mediaButton,$("message-input"));$("message-form").appendChild(mediaInput);
mediaInput.onchange=()=>{mediaButton.classList.toggle("has-media",!!mediaInput.files[0]);mediaButton.title=mediaInput.files[0]?`Đã chọn: ${mediaInput.files[0].name}`:"Gửi ảnh hoặc video"};

onAuthStateChanged(auth, async user => {
    if (!user) { location.href = "../../authentication/login-page.html"; return; }
    me = user;
    try {
        await loadFriends();
        const requested = new URLSearchParams(location.search).get("uid");
        if (requested && friends.some(friend => friend.id === requested)) await openChat(requested);
    } catch (error) {
        console.error("Không thể tải bạn bè", error);
        $("friends-list").innerHTML = `<div class="message-load-error">${error.message || "Không thể tải danh sách bạn bè"}</div>`;
    }
});

async function loadFriends() {
    const ownReference = doc(db, "users", me.uid);
    const [ownSnapshot, usersSnapshot] = await Promise.all([getDoc(ownReference), getDocs(collection(db, "users"))]);
    const own = ownSnapshot.data() || {}, friendIds = new Set(own.friends || []), profiles = new Map();
    usersSnapshot.forEach(snapshot => {
        const data = snapshot.data(); profiles.set(snapshot.id, data);
        if ((data.friends || []).includes(me.uid)) friendIds.add(snapshot.id);
    });
    friendIds.delete(me.uid);
    friends = [...friendIds].map(id => ({ id, ...(profiles.get(id) || {}) })).filter(friend => friend.accountStatus !== "suspended");
    friends.sort((first, second) => resolveDisplayName(first).localeCompare(resolveDisplayName(second), "vi"));
    renderFriends(friends);
    const missing = [...friendIds].filter(id => !(own.friends || []).includes(id));
    if (missing.length) setDoc(ownReference, { friends: arrayUnion(...missing) }, { merge: true }).catch(error => console.warn("Danh sách vẫn hiển thị nhưng chưa thể sửa dữ liệu bạn bè cũ", error));
}

function renderFriends(items) {
    $("conversation-count").textContent = items.length;
    const list = $("friends-list"); list.replaceChildren();
    if (!items.length) { const empty=document.createElement("div");empty.className="message-load-error";empty.textContent="Chưa có bạn bè để nhắn tin";list.appendChild(empty);return; }
    items.forEach(friend => {
        const row=document.createElement("button");row.className="friend-row";row.dataset.id=friend.id;
        const image=document.createElement("img");image.src=friend.photoURL||friend.profileImage||DEFAULT_AVATAR;
        const dot=document.createElement("i"),content=document.createElement("span"),name=document.createElement("strong"),status=document.createElement("small"),online=isUserActive(friend);
        dot.className=`presence-dot ${online?"online":""}`;name.textContent=resolveDisplayName(friend);status.className=online?"presence":"";status.textContent=formatActivity(friend);content.append(name,status);row.append(image,dot,content);row.onclick=()=>openChat(friend.id);list.appendChild(row);
    });
}

async function openChat(uid) {
    const previousFriend=activeFriend;if(previousFriend&&me)updateDoc(doc(db,"conversations",conversationId(me.uid,previousFriend.id)),{[`typing.${me.uid}`]:false}).catch(console.warn);clearTimeout(typingTimer);
    activeFriend = friends.find(friend => friend.id === uid); if (!activeFriend) return;
    document.querySelectorAll(".friend-row").forEach(row => row.classList.toggle("active", row.dataset.id === uid));
    const online=isUserActive(activeFriend),header=$("chat-header");header.replaceChildren();
    const contact=document.createElement("div");contact.className="chat-contact";const avatarWrap=document.createElement("div");avatarWrap.className="chat-contact-avatar";const image=document.createElement("img");image.src=activeFriend.photoURL||activeFriend.profileImage||DEFAULT_AVATAR;const dot=document.createElement("i");dot.className=`presence-dot ${online?"online":""}`;avatarWrap.append(image,dot);const info=document.createElement("span"),name=document.createElement("strong"),status=document.createElement("small");name.textContent=resolveDisplayName(activeFriend);status.className=online?"presence":"";status.textContent=formatActivity(activeFriend);info.append(name,status);contact.append(avatarWrap,info);header.appendChild(contact);
    $("message-input").disabled=false;$("message-form").querySelectorAll("button").forEach(button=>button.disabled=false);
    stopMessages?.();stopConversation?.();const id=conversationId(me.uid,uid);await setDoc(doc(db,"conversations",id),{members:[me.uid,uid],updatedAt:serverTimestamp()},{merge:true});
    stopConversation=onSnapshot(doc(db,"conversations",id),snapshot=>{const typing=snapshot.data()?.typing?.[uid]===true,status=header.querySelector(".chat-contact small");if(typing){status.textContent="đang soạn tin nhắn...";status.className="typing-status"}else{status.textContent=formatActivity(activeFriend);status.className=online?"presence":""}});
    stopMessages=onSnapshot(query(collection(db,"conversations",id,"messages"),orderBy("createdAt","asc")),snapshot=>{const list=$("messages-list");list.replaceChildren();const unread=[];snapshot.forEach(item=>{const message=item.data(),bubble=document.createElement("div"),meta=document.createElement("div"),time=document.createElement("time");bubble.className=`message ${message.senderId===me.uid?"mine":""}`;if(message.content)bubble.append(document.createTextNode(message.content));if(message.mediaUrl){const media=message.mediaType==="video"?document.createElement("video"):document.createElement("img");media.src=message.mediaUrl;media.className="message-media";if(media.tagName==="VIDEO")media.controls=true;bubble.appendChild(media)}time.textContent=message.createdAt?.seconds?new Date(message.createdAt.seconds*1000).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}):"Đang gửi";meta.className="message-meta";meta.appendChild(time);if(message.senderId===me.uid){const receipt=document.createElement("span");receipt.className=`message-receipt ${message.readAt?"seen":""}`;receipt.innerHTML=message.readAt?'<i class="fa-solid fa-check-double"></i> Đã xem':'<i class="fa-solid fa-check"></i> Đã gửi';meta.appendChild(receipt)}else if(!message.readAt)unread.push(item.ref);bubble.appendChild(meta);list.appendChild(bubble)});if(unread.length)Promise.all(unread.map(ref=>updateDoc(ref,{readAt:serverTimestamp()}))).catch(console.warn);list.scrollTop=list.scrollHeight});
    markConversationRead(uid);
}

$("message-form").onsubmit=async event=>{event.preventDefault();const content=$("message-input").value.trim(),file=mediaInput.files[0];if((!content&&!file)||!activeFriend)return;const id=conversationId(me.uid,activeFriend.id),sendButton=$("message-form").querySelector(".send-message-button");sendButton.disabled=true;try{const media=file?await uploadMedia(file):null;$("message-input").value="";mediaInput.value="";await setTyping(false);await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:activeFriend.id,content,mediaUrl:media?.mediaUrl||null,mediaType:media?.mediaType||null,mediaPublicId:media?.mediaPublicId||null,createdAt:serverTimestamp(),readAt:null});await addDoc(collection(db,"messageNotifications"),{recipientId:activeFriend.id,senderId:me.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()})}finally{sendButton.disabled=false}};
$("message-input").addEventListener("input",()=>{if(!activeFriend)return;setTyping(true);clearTimeout(typingTimer);typingTimer=setTimeout(()=>setTyping(false),1800)});
async function setTyping(value){if(!me||!activeFriend)return;const id=conversationId(me.uid,activeFriend.id);await updateDoc(doc(db,"conversations",id),{[`typing.${me.uid}`]:value}).catch(console.warn)}
$("friend-filter").oninput=event=>{const term=event.target.value.trim().toLocaleLowerCase("vi-VN");renderFriends(friends.filter(friend=>resolveDisplayName(friend).toLocaleLowerCase("vi-VN").includes(term)))};
$("back-button").onclick=()=>location.href="../community-feed-page.html";

function markConversationRead(senderId){getDocs(collection(db,"messageNotifications")).then(snapshot=>snapshot.forEach(item=>{const notification=item.data();if(notification.recipientId===me.uid&&notification.senderId===senderId&&!notification.isRead)updateDoc(item.ref,{isRead:true})})).catch(console.warn)}
function formatActivity(user){if(user.showActivityStatus===false)return"Đã ẩn trạng thái hoạt động";if(isUserActive(user))return"Đang hoạt động";const seconds=user.lastActiveAt?.seconds;if(!seconds)return"Chưa có trạng thái hoạt động";const minutes=Math.max(1,Math.floor((Date.now()/1000-seconds)/60));if(minutes<60)return`Hoạt động ${minutes} phút trước`;const hours=Math.floor(minutes/60);if(hours<24)return`Hoạt động ${hours} giờ trước`;const days=Math.floor(hours/24);if(days<7)return`Hoạt động ${days} ngày trước`;return`Hoạt động ${new Date(seconds*1000).toLocaleDateString("vi-VN")}`}

$("message-emoji-button").onclick=()=>{const input=$("message-input"),emojis=["🙂","😂","❤️","👍","🎉","😮","😢","🔥"],picker=document.createElement("div");document.querySelector(".message-emoji-picker")?.remove();picker.className="message-emoji-picker";emojis.forEach(emoji=>{const button=document.createElement("button");button.type="button";button.textContent=emoji;button.onclick=()=>{input.value+=emoji;input.focus();picker.remove()};picker.appendChild(button)});$("message-form").appendChild(picker)};
