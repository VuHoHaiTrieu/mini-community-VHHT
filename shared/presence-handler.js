import { firebaseAuthentication, firebaseDatabase } from "./firebase-connection.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function isUserActive(userData, thresholdSeconds = 120) {
    if (!userData || userData.showActivityStatus === false) return false;
    return (userData.lastActiveAt?.seconds || 0) > Date.now() / 1000 - thresholdSeconds;
}

let started = false;
export function startPresenceTracking() {
    if (started) return;
    started = true;
    onAuthStateChanged(firebaseAuthentication, user => {
        if (!user) return;
        const heartbeat = () => {
            if (document.visibilityState === "visible") setDoc(doc(firebaseDatabase,"users",user.uid),{lastActiveAt:serverTimestamp()},{merge:true}).catch(console.warn);
        };
        heartbeat();
        setInterval(heartbeat, 45000);
        document.addEventListener("visibilitychange", heartbeat);
        window.addEventListener("focus", heartbeat);
    });
}
