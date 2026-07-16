import { firebaseDatabase } from "../shared/firebase-connection.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const state = {
    users: [],
    posts: [],
    loading: { users: true, posts: true },
    errors: { users: null, posts: null }
};

const subscribers = { users: new Set(), posts: new Set() };
const listeners = { users: null, posts: null };
let started = false;

function emit(type) {
    const payload = {
        data: state[type],
        loading: state.loading[type],
        error: state.errors[type]
    };
    subscribers[type].forEach(callback => callback(payload));
}

function start() {
    if (started) return;
    started = true;
    ["users", "posts"].forEach(connect);
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
    start();
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
