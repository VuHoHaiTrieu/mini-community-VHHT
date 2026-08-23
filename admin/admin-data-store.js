import { firebaseDatabase } from "../shared/firebase-connection.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const state = {
    users: [],
    posts: [],
    conversations: [], notifications: [], messageNotifications: [], messengerNotes: [], adminAuditLogs: [],
    loading: {}, errors: {}
};

const DATA_TYPES = ["users", "posts", "conversations", "notifications", "messageNotifications", "messengerNotes", "adminAuditLogs"];
DATA_TYPES.forEach(type => { state.loading[type] = true; state.errors[type] = null; });
const subscribers = Object.fromEntries(DATA_TYPES.map(type => [type, new Set()]));
const listeners = Object.fromEntries(DATA_TYPES.map(type => [type, null]));

function emit(type) {
    const payload = {
        data: state[type],
        loading: state.loading[type],
        error: state.errors[type]
    };
    subscribers[type].forEach(callback => callback(payload));
}

function connect(type) {
        listeners[type]?.();
        state.loading[type] = true;
        state.errors[type] = null;
        emit(type);
        listeners[type] = onSnapshot(
            collection(firebaseDatabase, type),
            snapshot => {
                state[type] = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
                state.loading[type] = false;
                state.errors[type] = null;
                emit(type);
            },
            error => {
                state.loading[type] = false;
                state.errors[type] = error;
                emit(type);
            }
        );
}

export function subscribeAdminData(type, callback) {
    if (!subscribers[type]) throw new Error(`Loại dữ liệu admin không hợp lệ: ${type}`);
    if (!listeners[type]) connect(type);
    subscribers[type].add(callback);
    callback({ data: state[type], loading: state.loading[type], error: state.errors[type] });
    return () => subscribers[type].delete(callback);
}

export function getAdminData(type) {
    return [...(state[type] || [])];
}

export function restartAdminData(type) {
    if (!listeners[type]) return;
    connect(type);
}

addEventListener("pagehide", () => Object.values(listeners).forEach(unsubscribe => unsubscribe?.()), { once: true });
