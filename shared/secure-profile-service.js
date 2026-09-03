import { firebaseDatabase } from "./firebase-connection.js";
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PUBLIC_FIELDS = new Set([
    "displayName", "fullName", "name", "avatar", "username", "usernameNormalized", "usernameConfigured",
    "profileImage", "photoURL", "photoPublicId", "coverURL", "coverPublicId",
    "biography", "location", "work", "education", "relationshipStatus",
    "createdAt", "role", "accountStatus",
    "profileArchivedByAdmin", "showActivityStatus", "lastActiveAt",
    "accountVisibility", "friendsVisibility", "updatedAt",
    "photoOriginalURL", "photoOriginalPublicId", "avatarPositionX", "avatarPositionY",
    "avatarCropX", "avatarCropY", "avatarZoom", "coverOriginalURL",
    "coverOriginalPublicId", "coverPositionX", "coverPositionY", "coverCropX",
    "coverCropY", "coverZoom"
]);

export function splitUserProfile(profile = {}) {
    const publicProfile = {};
    const privateProfile = {};
    for (const [key, value] of Object.entries(profile)) {
        if (PUBLIC_FIELDS.has(key)) publicProfile[key] = value;
        else privateProfile[key] = value;
    }
    return { publicProfile, privateProfile };
}

export function legacyPublicProfile(profile = {}) {
    const { publicProfile } = splitUserProfile(profile);
    for (const field of ["friends", "friendRequests", "followers", "following"]) {
        if (Array.isArray(profile[field])) publicProfile[field] = profile[field];
    }
    return publicProfile;
}

export async function writeSecureProfile(userId, profile, { merge = true } = {}) {
    if (!userId) throw new Error("Thiếu mã người dùng khi lưu hồ sơ.");
    const { publicProfile, privateProfile } = splitUserProfile(profile);
    const writes = [];
    if (Object.keys(publicProfile).length) {
        writes.push(setDoc(doc(firebaseDatabase, "usersPublic", userId), publicProfile, { merge }));
    }
    if (Object.keys(privateProfile).length) {
        writes.push(setDoc(doc(firebaseDatabase, "usersPrivate", userId), privateProfile, { merge }));
    }
    await Promise.all(writes);
}

export async function writePublicProfile(userId, profile) {
    const { publicProfile } = splitUserProfile(profile);
    await Promise.all([
        setDoc(doc(firebaseDatabase, "users", userId), publicProfile, { merge: true }),
        setDoc(doc(firebaseDatabase, "usersPublic", userId), publicProfile, { merge: true })
    ]);
}

export async function readSecureProfile(userId, { includePrivate = false, legacyFallback = true } = {}) {
    const requests = [getDoc(doc(firebaseDatabase, "usersPublic", userId))];
    if (includePrivate) requests.push(getDoc(doc(firebaseDatabase, "usersPrivate", userId)));
    const snapshots = await Promise.all(requests);
    let data = Object.assign({}, ...snapshots.filter(item => item.exists()).map(item => item.data()));
    if (legacyFallback && !snapshots[0].exists()) {
        const legacy = await getDoc(doc(firebaseDatabase, "users", userId));
        if (legacy.exists()) data = legacy.data();
    }
    return data;
}

export async function listPublicProfiles() {
    const snapshot = await getDocs(collection(firebaseDatabase, "usersPublic"));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function markSecureProfileUpdated(userId) {
    await setDoc(doc(firebaseDatabase, "usersPrivate", userId), {
        secureProfileUpdatedAt: serverTimestamp()
    }, { merge: true });
}
