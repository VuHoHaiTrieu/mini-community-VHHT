import { firebaseDatabase } from "./firebase-connection.js";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const relationshipId = value => typeof value === "string" ? value : value?.uid || value?.id || value?.userId || value?.friendId || null;
const relationshipIds = values => new Set((Array.isArray(values) ? values : []).map(relationshipId).filter(Boolean));
const friendshipId = (first, second) => [first, second].sort().join("_");
const requestId = (senderId, recipientId) => `${senderId}_${recipientId}`;

async function usesSecurityModelV2() {
    const snapshot = await getDoc(doc(firebaseDatabase, "system", "securityMigration")).catch(() => null);
    const data = snapshot?.data?.() || {};
    return data.status === "complete" && data.schemaVersion === 2;
}

export async function sendFriendRequest(senderId, recipientId) {
    if (!senderId || !recipientId || senderId === recipientId) throw new Error("Lời mời kết bạn không hợp lệ.");
    if (!await usesSecurityModelV2()) {
        await setDoc(doc(firebaseDatabase, "users", recipientId), { friendRequests: arrayUnion(senderId) }, { merge: true });
        return;
    }
    await setDoc(doc(firebaseDatabase, "friendRequests", requestId(senderId, recipientId)), {
        senderId, recipientId, status: "pending", createdAt: serverTimestamp()
    });
}

export async function declineFriendRequest(recipientId, senderId) {
    if (!recipientId || !senderId || recipientId === senderId) throw new Error("Lời mời kết bạn không hợp lệ.");
    if (!await usesSecurityModelV2()) {
        await setDoc(doc(firebaseDatabase, "users", recipientId), { friendRequests: arrayRemove(senderId) }, { merge: true });
        return;
    }
    await updateDoc(doc(firebaseDatabase, "friendRequests", requestId(senderId, recipientId)), {
        status: "declined", resolvedAt: serverTimestamp()
    });
}

export async function listIncomingFriendRequests(userId) {
    const snapshot = await getDocs(query(collection(firebaseDatabase, "friendRequests"), where("recipientId", "==", userId), where("status", "==", "pending")));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function listFriendIds(userId) {
    const snapshot = await getDocs(query(collection(firebaseDatabase, "friendships"), where("members", "array-contains", userId)));
    return [...new Set(snapshot.docs.flatMap(item => item.data().members || []).filter(id => id && id !== userId))];
}

export async function getFriendshipState(firstUserId, secondUserId) {
    const [friendship, request, reverseRequest] = await Promise.all([
        getDoc(doc(firebaseDatabase, "friendships", friendshipId(firstUserId, secondUserId))),
        getDoc(doc(firebaseDatabase, "friendRequests", requestId(firstUserId, secondUserId))),
        getDoc(doc(firebaseDatabase, "friendRequests", requestId(secondUserId, firstUserId)))
    ]);
    if (friendship.exists() || request.exists() || reverseRequest.exists()) return {
        firstData: {}, secondData: {}, firstHasSecond: friendship.exists(), secondHasFirst: friendship.exists(),
        requestPending: request.data()?.status === "pending", reverseRequestPending: reverseRequest.data()?.status === "pending"
    };
    const [firstSnapshot, secondSnapshot] = await Promise.all([
        getDoc(doc(firebaseDatabase, "users", firstUserId)), getDoc(doc(firebaseDatabase, "users", secondUserId))
    ]);
    const firstData = firstSnapshot.data() || {}, secondData = secondSnapshot.data() || {};
    return {
        firstData, secondData,
        firstHasSecond: relationshipIds(firstData.friends).has(secondUserId),
        secondHasFirst: relationshipIds(secondData.friends).has(firstUserId),
        requestPending: relationshipIds(secondData.friendRequests).has(firstUserId),
        reverseRequestPending: relationshipIds(firstData.friendRequests).has(secondUserId)
    };
}

export async function acceptFriendship(currentUserId, requesterId) {
    if (!currentUserId || !requesterId || currentUserId === requesterId) throw new Error("Quan hệ bạn bè không hợp lệ.");
    if (!await usesSecurityModelV2()) {
        const batch = writeBatch(firebaseDatabase);
        batch.set(doc(firebaseDatabase, "users", currentUserId), {
            friends: arrayUnion(requesterId), friendRequests: arrayRemove(requesterId)
        }, { merge: true });
        batch.set(doc(firebaseDatabase, "users", requesterId), {
            friends: arrayUnion(currentUserId), friendRequests: arrayRemove(currentUserId)
        }, { merge: true });
        await batch.commit();
        return true;
    }
    const pendingRequest = doc(firebaseDatabase, "friendRequests", requestId(requesterId, currentUserId));
    const requestSnapshot = await getDoc(pendingRequest);
    if (!requestSnapshot.exists() || requestSnapshot.data().status !== "pending") throw new Error("Lời mời kết bạn không còn hiệu lực.");
    const batch = writeBatch(firebaseDatabase);
    batch.update(pendingRequest, { status: "accepted", resolvedAt: serverTimestamp() });
    batch.set(doc(firebaseDatabase, "friendships", friendshipId(currentUserId, requesterId)), {
        members: [currentUserId, requesterId].sort(), createdFromRequest: pendingRequest.id, createdAt: serverTimestamp()
    });
    batch.set(doc(firebaseDatabase, "users", currentUserId), { friends: arrayUnion(requesterId) }, { merge: true });
    batch.set(doc(firebaseDatabase, "users", requesterId), { friends: arrayUnion(currentUserId) }, { merge: true });
    await batch.commit();
    return true;
}

export async function repairFriendship(firstUserId, secondUserId) {
    const state = await getFriendshipState(firstUserId, secondUserId);
    if (state.firstHasSecond && state.secondHasFirst) return true;
    if (!state.firstHasSecond && !state.secondHasFirst) return false;
    if (!await usesSecurityModelV2()) {
        const batch = writeBatch(firebaseDatabase);
        batch.set(doc(firebaseDatabase, "users", firstUserId), { friends: arrayUnion(secondUserId) }, { merge: true });
        batch.set(doc(firebaseDatabase, "users", secondUserId), { friends: arrayUnion(firstUserId) }, { merge: true });
        await batch.commit();
        return true;
    }
    throw new Error("Quan hệ cũ cần được chuyển đổi bởi công cụ quản trị.");
}

export async function removeFriendship(firstUserId, secondUserId) {
    if (!firstUserId || !secondUserId || firstUserId === secondUserId) throw new Error("Quan hệ bạn bè không hợp lệ.");
    const batch = writeBatch(firebaseDatabase);
    if (await usesSecurityModelV2()) batch.delete(doc(firebaseDatabase, "friendships", friendshipId(firstUserId, secondUserId)));
    batch.set(doc(firebaseDatabase, "users", firstUserId), { friends: arrayRemove(secondUserId), friendRequests: arrayRemove(secondUserId) }, { merge: true });
    batch.set(doc(firebaseDatabase, "users", secondUserId), { friends: arrayRemove(firstUserId), friendRequests: arrayRemove(firstUserId) }, { merge: true });
    await batch.commit();
    return true;
}

export async function verifySymmetricFriendship(firstUserId, secondUserId) {
    if (!await usesSecurityModelV2()) {
        const state = await getFriendshipState(firstUserId, secondUserId);
        if (!state.firstHasSecond || !state.secondHasFirst) throw new Error("Không thể đồng bộ quan hệ bạn bè.");
        return true;
    }
    const snapshot = await getDoc(doc(firebaseDatabase, "friendships", friendshipId(firstUserId, secondUserId)));
    if (!snapshot.exists()) throw new Error("Không thể xác minh quan hệ bạn bè.");
    return true;
}

export async function followUser(followerId, targetId) {
    if (!followerId || !targetId || followerId === targetId) throw new Error("Quan hệ theo dõi không hợp lệ.");
    const batch = writeBatch(firebaseDatabase);
    if (await usesSecurityModelV2()) batch.set(doc(firebaseDatabase, "follows", `${followerId}_${targetId}`), { followerId, targetId, createdAt: serverTimestamp() });
    batch.set(doc(firebaseDatabase, "users", followerId), { following: arrayUnion(targetId) }, { merge: true });
    batch.set(doc(firebaseDatabase, "users", targetId), { followers: arrayUnion(followerId) }, { merge: true });
    await batch.commit();
}

export async function unfollowUser(followerId, targetId) {
    if (!followerId || !targetId || followerId === targetId) throw new Error("Quan hệ theo dõi không hợp lệ.");
    const batch = writeBatch(firebaseDatabase);
    if (await usesSecurityModelV2()) batch.delete(doc(firebaseDatabase, "follows", `${followerId}_${targetId}`));
    batch.set(doc(firebaseDatabase, "users", followerId), { following: arrayRemove(targetId) }, { merge: true });
    batch.set(doc(firebaseDatabase, "users", targetId), { followers: arrayRemove(followerId) }, { merge: true });
    await batch.commit();
}

export async function isFollowing(followerId, targetId) {
    if (!followerId || !targetId) return false;
    if (!await usesSecurityModelV2()) {
        const snapshot = await getDoc(doc(firebaseDatabase, "users", followerId));
        return relationshipIds(snapshot.data()?.following).has(targetId);
    }
    return (await getDoc(doc(firebaseDatabase, "follows", `${followerId}_${targetId}`))).exists();
}
