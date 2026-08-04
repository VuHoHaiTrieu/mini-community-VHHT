import { firebaseDatabase } from "./firebase-connection.js";
import { doc, getDoc, writeBatch, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const relationshipId = value => typeof value === "string"
    ? value
    : value?.uid || value?.id || value?.userId || value?.friendId || null;
const relationshipIds = values => new Set((Array.isArray(values) ? values : []).map(relationshipId).filter(Boolean));

export async function getFriendshipState(firstUserId, secondUserId) {
    const [firstSnapshot, secondSnapshot] = await Promise.all([
        getDoc(doc(firebaseDatabase, "users", firstUserId)),
        getDoc(doc(firebaseDatabase, "users", secondUserId))
    ]);
    const firstData = firstSnapshot.data() || {}, secondData = secondSnapshot.data() || {};
    return {
        firstData,
        secondData,
        firstHasSecond: relationshipIds(firstData.friends).has(secondUserId),
        secondHasFirst: relationshipIds(secondData.friends).has(firstUserId),
        requestPending: relationshipIds(secondData.friendRequests).has(firstUserId)
    };
}

export async function acceptFriendship(currentUserId, requesterId) {
    if (!currentUserId || !requesterId || currentUserId === requesterId) throw new Error("Quan hệ bạn bè không hợp lệ.");
    const batch = writeBatch(firebaseDatabase);
    batch.set(doc(firebaseDatabase, "users", currentUserId), {
        friends: arrayUnion(requesterId),
        friendRequests: arrayRemove(requesterId)
    }, { merge: true });
    batch.set(doc(firebaseDatabase, "users", requesterId), {
        friends: arrayUnion(currentUserId),
        friendRequests: arrayRemove(currentUserId)
    }, { merge: true });
    await batch.commit();
    return verifySymmetricFriendship(currentUserId, requesterId);
}

export async function repairFriendship(firstUserId, secondUserId) {
    const state = await getFriendshipState(firstUserId, secondUserId);
    if (!state.firstHasSecond && !state.secondHasFirst) return false;
    if (state.firstHasSecond && state.secondHasFirst) return true;
    const batch = writeBatch(firebaseDatabase);
    batch.set(doc(firebaseDatabase, "users", firstUserId), { friends: arrayUnion(secondUserId) }, { merge: true });
    batch.set(doc(firebaseDatabase, "users", secondUserId), { friends: arrayUnion(firstUserId) }, { merge: true });
    await batch.commit();
    return verifySymmetricFriendship(firstUserId, secondUserId);
}

export async function removeFriendship(firstUserId, secondUserId) {
    if (!firstUserId || !secondUserId || firstUserId === secondUserId) throw new Error("Quan hệ bạn bè không hợp lệ.");
    const batch = writeBatch(firebaseDatabase);
    batch.set(doc(firebaseDatabase, "users", firstUserId), { friends: arrayRemove(secondUserId), friendRequests: arrayRemove(secondUserId) }, { merge: true });
    batch.set(doc(firebaseDatabase, "users", secondUserId), { friends: arrayRemove(firstUserId), friendRequests: arrayRemove(firstUserId) }, { merge: true });
    await batch.commit();
    const state = await getFriendshipState(firstUserId, secondUserId);
    if (state.firstHasSecond || state.secondHasFirst) throw new Error("Không thể xóa quan hệ bạn bè ở cả hai tài khoản.");
    return true;
}

export async function verifySymmetricFriendship(firstUserId, secondUserId) {
    const state = await getFriendshipState(firstUserId, secondUserId);
    if (!state.firstHasSecond || !state.secondHasFirst) throw new Error("Không thể đồng bộ quan hệ bạn bè ở cả hai tài khoản.");
    return true;
}
