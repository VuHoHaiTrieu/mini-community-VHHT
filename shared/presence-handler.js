import { firebaseAuthentication, firebaseDatabase } from "./firebase-connection.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { writePublicProfile } from "./secure-profile-service.js";

export function isUserActive(userData, thresholdSeconds = 120) {
    if (!userData || userData.showActivityStatus === false) return false;
    return (userData.lastActiveAt?.seconds || 0) > Date.now() / 1000 - thresholdSeconds;
}

let started = false;
let stopAuthenticationObserver = null;
let stopActiveSession = null;

function stopPresenceSession() {
    stopActiveSession?.();
    stopActiveSession = null;
}

export function startPresenceTracking() {
    if (started) return stopPresenceTracking;
    started = true;
    stopAuthenticationObserver = onAuthStateChanged(firebaseAuthentication, user => {
        stopPresenceSession();
        if (!user) return;
        const heartbeat = () => {
            if (document.visibilityState === "visible") writePublicProfile(user.uid,{lastActiveAt:serverTimestamp()}).catch(console.warn);
        };
        heartbeat();
        const heartbeatTimer = window.setInterval(heartbeat, 45000);
        document.addEventListener("visibilitychange", heartbeat);
        window.addEventListener("focus", heartbeat);
        stopActiveSession = () => {
            window.clearInterval(heartbeatTimer);
            document.removeEventListener("visibilitychange", heartbeat);
            window.removeEventListener("focus", heartbeat);
        };
    });
    return stopPresenceTracking;
}

export function stopPresenceTracking() {
    stopPresenceSession();
    stopAuthenticationObserver?.();
    stopAuthenticationObserver = null;
    started = false;
}
