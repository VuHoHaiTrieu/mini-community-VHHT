import { firebaseAuthentication, firebaseDatabase } from "./firebase-connection.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SESSION_PREFIX = "vhht_active_session_";
const BROWSER_KEY = "vhht_browser_id";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const HEARTBEAT_MS = 5 * 60 * 1000;

function randomId() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function browserId() {
    let value = localStorage.getItem(BROWSER_KEY);
    if (!value) {
        value = randomId();
        localStorage.setItem(BROWSER_KEY, value);
    }
    return value;
}

function sessionStorageKey(uid) {
    return `${SESSION_PREFIX}${uid}`;
}

function clientLabel() {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    return `${mobile ? "Thiết bị di động" : "Máy tính"} · ${navigator.platform || "Trình duyệt"}`.slice(0, 120);
}

export async function claimSingleSession(user) {
    if (!user?.uid) throw new Error("Không thể tạo phiên khi chưa xác thực.");
    const sessionId = randomId();
    await setDoc(doc(firebaseDatabase, "activeSessions", user.uid), {
        uid: user.uid,
        sessionId,
        browserId: browserId(),
        clientLabel: clientLabel(),
        claimedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + SESSION_LIFETIME_MS)
    });
    // Chỉ đánh dấu phiên cục bộ sau khi Firestore đã xác nhận. Nếu Rules cũ
    // từ chối ghi, trang được phép chạy ở chế độ tương thích và không tự đá ra.
    localStorage.setItem(sessionStorageKey(user.uid), sessionId);
    return sessionId;
}

export function startSingleSessionGuard({ redirect = null } = {}) {
    let stopSession = null;
    let heartbeat = null;
    let ending = false;

    const stop = () => {
        stopSession?.();
        stopSession = null;
        if (heartbeat) window.clearInterval(heartbeat);
        heartbeat = null;
    };

    const endDisplacedSession = async uid => {
        if (ending) return;
        ending = true;
        stop();
        localStorage.removeItem(sessionStorageKey(uid));
        await signOut(firebaseAuthentication).catch(() => {});
        const loginUrl = new URL(redirect || "../authentication/login-page.html", location.href);
        loginUrl.searchParams.set("reason", "session-replaced");
        location.replace(loginUrl.href);
    };

    const stopAuth = onAuthStateChanged(firebaseAuthentication, async user => {
        stop();
        if (!user || ending) return;
        const reference = doc(firebaseDatabase, "activeSessions", user.uid);
        let localSessionId = localStorage.getItem(sessionStorageKey(user.uid));

        if (!localSessionId) {
            const current = await getDoc(reference).catch(() => null);
            if (current?.exists()) {
                await endDisplacedSession(user.uid);
                return;
            }
            localSessionId = await claimSingleSession(user).catch(() => null);
            if (!localSessionId) return;
        }

        stopSession = onSnapshot(reference, snapshot => {
            const active = snapshot.data();
            if (!snapshot.exists() || active?.sessionId !== localSessionId || active?.browserId !== browserId()) {
                endDisplacedSession(user.uid);
            }
        }, error => console.warn("Không thể theo dõi phiên đăng nhập", error));

        heartbeat = window.setInterval(async () => {
            try {
                const snapshot = await getDoc(reference);
                if (!snapshot.exists() || snapshot.data()?.sessionId !== localSessionId) {
                    await endDisplacedSession(user.uid);
                    return;
                }
                await updateDoc(reference, {
                    lastSeenAt: serverTimestamp(),
                    expiresAt: Timestamp.fromMillis(Date.now() + SESSION_LIFETIME_MS)
                });
            } catch (error) {
                console.warn("Không thể cập nhật trạng thái phiên", error);
            }
        }, HEARTBEAT_MS);
    });

    return () => { stop(); stopAuth(); };
}

if (document.documentElement.dataset.singleSessionGuard === "enabled") {
    startSingleSessionGuard({ redirect: document.documentElement.dataset.loginUrl || null });
}
