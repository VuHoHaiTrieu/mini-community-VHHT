const keyFor = uid => `vhht_authored_post_ids_${uid}`;

export function rememberAuthoredPost(uid, postId) {
    if (!uid || !postId) return;
    const ids = readAuthoredPostIds(uid).filter(id => id !== postId);
    ids.unshift(postId);
    localStorage.setItem(keyFor(uid), JSON.stringify(ids.slice(0, 200)));
}

export function forgetAuthoredPost(uid, postId) {
    localStorage.setItem(keyFor(uid), JSON.stringify(readAuthoredPostIds(uid).filter(id => id !== postId)));
}

export function readAuthoredPostIds(uid) {
    try {
        const ids = JSON.parse(localStorage.getItem(keyFor(uid)) || "[]");
        return Array.isArray(ids) ? ids.filter(id => typeof id === "string") : [];
    } catch { return []; }
}
