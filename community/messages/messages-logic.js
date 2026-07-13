import { firebaseAuthentication as auth, firebaseDatabase as db } from "../../shared/firebase-connection.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, collection, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { startPresenceTracking, isUserActive } from "../../shared/presence-handler.js";
import { resolveDisplayName } from "../../shared/user-identity.js";
import { repairFriendship } from "../../shared/friendship-service.js";
import { uploadMedia } from "../../shared/cloudinary-media-service.js";
import "./messages-enhancements.js";
import "./messages-responsive.js";
const realtimeStyles=document.createElement("link");realtimeStyles.rel="stylesheet";realtimeStyles.href="./messages-realtime.css?v=4";document.head.appendChild(realtimeStyles);
const mediaStyles=document.createElement("link");mediaStyles.rel="stylesheet";mediaStyles.href="./messages-media.css?v=1";document.head.appendChild(mediaStyles);

const $ = id => document.getElementById(id);
const DEFAULT_AVATAR = "../../shared/assets/default-avatar.svg";
const conversationId = (first, second) => [first, second].sort().join("_");

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
let ownProfile = null, activeConversationFilter = "all", unreadCounts = new Map(), selectedNoteFriend = null;
const notesByUser = new Map(), stopNoteListeners = [];
let notesExpiryTimer = null;
let activeUnreadBoundaryId = null;
let noteAudienceIds = [];
const viewedUnreadConversations = new Set();
let stopOwnProfile = null;

function resolveProfileAvatar(profile, isOwn = false) {
    const storedAvatar = profile?.photoURL || profile?.profileImage;
    if (storedAvatar) return storedAvatar;
    const hasPersistedAvatarState = profile
        && (Object.prototype.hasOwnProperty.call(profile, "photoURL")
            || Object.prototype.hasOwnProperty.call(profile, "profileImage"));
    if (isOwn && !hasPersistedAvatarState && me?.photoURL) return me.photoURL;
    return DEFAULT_AVATAR;
}

startPresenceTracking();
const mediaInput=document.createElement("input");mediaInput.type="file";mediaInput.accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";mediaInput.hidden=true;mediaInput.id="message-media-input";const mediaButton=document.createElement("button");mediaButton.type="button";mediaButton.className="message-tool message-media-button";mediaButton.innerHTML='<i class="fa-solid fa-photo-film"></i>';mediaButton.title="Gửi ảnh hoặc video";mediaButton.onclick=()=>mediaInput.click();$("message-form").insertBefore(mediaButton,$("message-input"));$("message-form").appendChild(mediaInput);
mediaInput.onchange=()=>{mediaButton.classList.toggle("has-media",!!mediaInput.files[0]);mediaButton.title=mediaInput.files[0]?`Đã chọn: ${mediaInput.files[0].name}`:"Gửi ảnh hoặc video"};

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

function openChat(uid) {
    const selectedFriend = friends.find(friend => friend.id === uid);
    if (!selectedFriend || !me) return;

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
    activeUnreadBoundaryId = null;

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
    status.textContent = formatActivity(selectedFriend);
    info.append(name, status);
    contact.append(avatarWrap, info);
    header.appendChild(contact);

    list.innerHTML = '<div class="conversation-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải tin nhắn…</div>';
    $("message-input").disabled = false;
    $("message-form").querySelectorAll("button").forEach(button => button.disabled = false);

    // Subscribe first so the initial tap always renders existing messages immediately.
    stopConversation = onSnapshot(doc(db, "conversations", id), snapshot => {
        if (serial !== openedConversationSerial) return;
        const currentStatus = header.querySelector(".chat-contact small");
        if (!currentStatus) return;
        const typing = snapshot.data()?.typing?.[uid] === true;
        if (typing) {
            currentStatus.textContent = "Đang soạn";
            currentStatus.className = "typing-status";
        } else {
            currentStatus.textContent = formatActivity(selectedFriend);
            currentStatus.className = online ? "presence" : "";
        }
    });

    stopMessages = onSnapshot(
        query(collection(db, "conversations", id, "messages"), orderBy("createdAt", "asc")),
        snapshot => {
            if (serial !== openedConversationSerial) return;
            const fragment = document.createDocumentFragment();
            const nextIds = new Set();
            const unread = [];
            const isInitialSnapshot = !receivedFirstMessageSnapshot;
            if (isInitialSnapshot && !viewedUnreadConversations.has(id)) {
                const firstUnread = snapshot.docs.find(item => {
                    const message = item.data();
                    return message.recipientId === me.uid && !message.readAt;
                });
                activeUnreadBoundaryId = firstUnread?.id || null;
                if (activeUnreadBoundaryId) viewedUnreadConversations.add(id);
            }
            const lastOwnMessage = [...snapshot.docs].reverse().find(item => item.data().senderId === me.uid);
            snapshot.forEach(item => {
                nextIds.add(item.id);
                const message = item.data();
                const bubble = document.createElement("div");
                const meta = document.createElement("div");
                const time = document.createElement("time");
                bubble.className = `message ${message.senderId === me.uid ? "mine" : ""}`;
                bubble.dataset.messageId = item.id;
                if (receivedFirstMessageSnapshot && !renderedMessageIds.has(item.id)) bubble.classList.add("is-new");
                if (message.content) bubble.append(document.createTextNode(message.content));
                if (message.mediaUrl) {
                    const media = message.mediaType === "video" ? document.createElement("video") : document.createElement("img");
                    media.src = message.mediaUrl;
                    media.className = "message-media";
                    if (media.tagName === "VIDEO") media.controls = true;
                    bubble.appendChild(media);
                }
                time.textContent = message.createdAt?.seconds
                    ? new Date(message.createdAt.seconds * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
                    : "Đang gửi";
                meta.className = "message-meta";
                meta.appendChild(time);
                if (message.senderId === me.uid && item.id === lastOwnMessage?.id) {
                    const receipt = document.createElement("span");
                    receipt.className = `message-receipt ${message.readAt ? "seen" : ""}`;
                    receipt.innerHTML = message.readAt
                        ? '<i class="fa-solid fa-check-double"></i> Đã xem'
                        : '<i class="fa-solid fa-check"></i> Đã gửi';
                    meta.appendChild(receipt);
                } else if (!message.readAt) unread.push(item.ref);
                bubble.appendChild(meta);
                if (item.id === activeUnreadBoundaryId) {
                    const divider = document.createElement("div");
                    divider.className = "unread-message-divider";
                    divider.innerHTML = '<span>Tin nhắn mới</span>';
                    fragment.appendChild(divider);
                }
                fragment.appendChild(bubble);
            });
            list.replaceChildren(fragment);
            renderedMessageIds = nextIds;
            receivedFirstMessageSnapshot = true;
            if (unread.length) Promise.all(unread.map(reference => updateDoc(reference, { readAt: serverTimestamp() }))).catch(console.warn);
            list.scrollTop = list.scrollHeight;
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

$("message-form").onsubmit=async event=>{event.preventDefault();const content=$("message-input").value.trim(),file=mediaInput.files[0];if((!content&&!file)||!activeFriend)return;const id=conversationId(me.uid,activeFriend.id),sendButton=$("message-form").querySelector(".send-message-button");sendButton.disabled=true;try{const media=file?await uploadMedia(file):null;$("message-input").value="";resizeMessageInput();mediaInput.value="";mediaButton.classList.remove("has-media");await setTyping(false);await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:activeFriend.id,content,mediaUrl:media?.mediaUrl||null,mediaType:media?.mediaType||null,mediaPublicId:media?.mediaPublicId||null,createdAt:serverTimestamp(),readAt:null});await addDoc(collection(db,"messageNotifications"),{recipientId:activeFriend.id,senderId:me.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()})}finally{sendButton.disabled=false}};
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
    if (!event.target.closest(".conversation-more-wrap")) {
        $("conversation-more-menu").hidden = true;
        $("conversation-more-trigger").setAttribute("aria-expanded", "false");
    }
});
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
$("note-message-button").onclick = () => {
    if (!selectedNoteFriend) return;
    const friendId = selectedNoteFriend.id;
    closeNoteDialog();
    openChat(friendId);
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
