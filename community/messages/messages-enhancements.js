import { firebaseAuthentication as auth, firebaseDatabase as db } from "../../shared/firebase-connection.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { playUiSound } from "../../shared/audio/sound-manager.js";

const $ = id => document.getElementById(id);
let notificationRenderSerial = 0;
const mutedFriends = new Map();
const mutedWithNewMessage = new Set();
let currentUserId = "";
let receivedInitialNotificationSnapshot = false;

function decorateMutedRows() {
    document.querySelectorAll(".friend-row").forEach(row => {
        const muted = mutedFriends.get(row.dataset.id) === true;
        const hasNew = mutedWithNewMessage.has(row.dataset.id);
        let marker = row.querySelector(".friend-mute-indicator");
        if (muted && !marker) {
            marker = document.createElement("span");
            marker.className = "friend-mute-indicator";
            marker.innerHTML = '<i class="fa-solid fa-bell-slash" aria-hidden="true"></i><small></small>';
            row.appendChild(marker);
        }
        if (marker) {
            marker.hidden = !muted;
            marker.querySelector("small").textContent = hasNew ? "Có tin nhắn mới" : "Đã tắt thông báo";
            marker.classList.toggle("has-new", hasNew);
            marker.title = hasNew ? "Có tin nhắn mới · thông báo đang tắt" : "Thông báo đoạn chat đang tắt";
            marker.setAttribute("aria-label", marker.title);
        }
    });
}

onAuthStateChanged(auth, user => {
    if (!user) return;
    currentUserId = user.uid;
    onSnapshot(collection(db, "messageNotifications"), async snapshot => {
        const isInitialSnapshot = !receivedInitialNotificationSnapshot;
        receivedInitialNotificationSnapshot = true;
        const newlyAddedIds = new Set(isInitialSnapshot ? [] : snapshot.docChanges()
            .filter(change => change.type === "added")
            .map(change => change.doc.id));
        let shouldPlayNewMessageSound = false;
        const serial = ++notificationRenderSerial;
        const notifications = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .filter(item => item.recipientId === user.uid && !item.isRead);
        mutedWithNewMessage.clear();
        const muteCache = new Map();
        const isMuted = async conversationId => {
            if (!conversationId) return false;
            if (!muteCache.has(conversationId)) {
                muteCache.set(conversationId, getDoc(doc(db, "conversations", conversationId, "memberSettings", user.uid))
                    .then(result => {
                        const value = result.data()?.mutedUntil;
                        const millis = typeof value?.toMillis === "function" ? value.toMillis() : value?.seconds ? value.seconds * 1000 : 0;
                        return millis > Date.now();
                    }).catch(() => false));
            }
            return muteCache.get(conversationId);
        };
        const unread = new Map();
        for (const notification of notifications) {
            const active = document.querySelector(`.friend-row.active[data-id="${CSS.escape(notification.senderId || "")}"]`);
            if (active) {
                updateDoc(doc(db, "messageNotifications", notification.id), { isRead: true }).catch(console.warn);
                continue;
            }
            if (await isMuted(notification.conversationId)) {
                mutedFriends.set(notification.senderId, true);
                mutedWithNewMessage.add(notification.senderId);
                continue;
            }
            if (newlyAddedIds.has(notification.id) && document.visibilityState === "visible") {
                shouldPlayNewMessageSound = true;
            }
            unread.set(notification.senderId, (unread.get(notification.senderId) || 0) + 1);
        }
        if (serial !== notificationRenderSerial) return;
        document.querySelectorAll(".friend-row").forEach(row => {
            let badge = row.querySelector(".friend-unread-badge");
            const count = unread.get(row.dataset.id) || 0;
            if (!badge) { badge = document.createElement("b"); badge.className = "friend-unread-badge"; row.appendChild(badge); }
            badge.textContent = count > 99 ? "99+" : String(count);
            badge.hidden = !count;
        });
        document.dispatchEvent(new CustomEvent("message-unread-updated", { detail: Object.fromEntries(unread) }));
        decorateMutedRows();
        if (shouldPlayNewMessageSound) playUiSound("receive-message");
    });
});

document.addEventListener("chat-mute-updated", event => {
    const { friendId, muted } = event.detail || {};
    if (!friendId) return;
    mutedFriends.set(friendId, Boolean(muted));
    if (!muted) mutedWithNewMessage.delete(friendId);
    decorateMutedRows();
});
document.addEventListener("friends-rendered", async () => {
    if (!currentUserId) return;
    const rows = [...document.querySelectorAll(".friend-row")];
    await Promise.all(rows.map(async row => {
        const id = [currentUserId, row.dataset.id].sort().join("_");
        try {
            const snapshot = await getDoc(doc(db, "conversations", id, "memberSettings", currentUserId));
            const value = snapshot.data()?.mutedUntil;
            const millis = typeof value?.toMillis === "function" ? value.toMillis() : value?.seconds ? value.seconds * 1000 : 0;
            mutedFriends.set(row.dataset.id, millis > Date.now());
            const key=`vhht-chat-prefs:${currentUserId}:${row.dataset.id}`,prefs=JSON.parse(localStorage.getItem(key)||"{}");prefs.mutedUntil=millis;localStorage.setItem(key,JSON.stringify(prefs));
            if(millis>Date.now()){const status=row.querySelector("span>small");if(status)status.textContent=`Tắt thông báo đến ${new Date(millis).toLocaleString("vi-VN",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"})}`}
        } catch (_) { mutedFriends.set(row.dataset.id, false); }
    }));
    decorateMutedRows();
});

$("message-input")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("message-form").requestSubmit(); }
});
document.addEventListener("click", event => {
    if (event.target.closest(".friend-row") && innerWidth <= 760) document.querySelector(".messenger-shell")?.classList.add("mobile-chat-open");
});
