import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { legacyPublicProfile, splitUserProfile } from "../shared/secure-profile-service.js";
import { addDoc, collection, doc, getDocs, serverTimestamp, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const relationId = value => typeof value === "string" ? value : value?.uid || value?.id || value?.userId || value?.friendId || "";
const relationIds = value => [...new Set((Array.isArray(value) ? value : []).map(relationId).filter(Boolean))];
const pairId = (first, second) => [first, second].sort().join("_");

async function commitOperations(operations, size = 400) {
    for (let offset = 0; offset < operations.length; offset += size) {
        const batch = writeBatch(firebaseDatabase);
        operations.slice(offset, offset + size).forEach(operation => operation(batch));
        await batch.commit();
    }
}

async function migrateSecurityModel(adminUser) {
    const [usersSnapshot, postsSnapshot, usernamesSnapshot] = await Promise.all([
        getDocs(collection(firebaseDatabase, "users")),
        getDocs(collection(firebaseDatabase, "posts")),
        getDocs(collection(firebaseDatabase, "usernames"))
    ]);
    const users = new Map(usersSnapshot.docs.map(item => [item.id, item.data()]));
    const operations = [];
    const friendshipIds = new Set();

    users.forEach((profile, userId) => {
        const { publicProfile, privateProfile } = splitUserProfile(profile);
        operations.push(batch => batch.set(doc(firebaseDatabase, "usersPublic", userId), publicProfile, { merge: true }));
        if (Object.keys(privateProfile).length) operations.push(batch => batch.set(doc(firebaseDatabase, "usersPrivate", userId), privateProfile, { merge: true }));
        operations.push(batch => batch.set(doc(firebaseDatabase, "users", userId), legacyPublicProfile(profile)));
        if (profile.memberId) operations.push(batch => batch.set(doc(firebaseDatabase, "memberIds", String(profile.memberId)), {
            uid: userId, migratedFromLegacy: true, createdAt: profile.memberIdCreatedAt || serverTimestamp()
        }, { merge: true }));

        relationIds(profile.friends).forEach(friendId => {
            if (!users.has(friendId) || !relationIds(users.get(friendId).friends).includes(userId)) return;
            const id = pairId(userId, friendId);
            if (friendshipIds.has(id)) return;
            friendshipIds.add(id);
            operations.push(batch => batch.set(doc(firebaseDatabase, "friendships", id), {
                members: [userId, friendId].sort(), migratedFromLegacy: true,
                migratedBy: adminUser.uid, createdAt: serverTimestamp()
            }, { merge: true }));
        });

        relationIds(profile.friendRequests).forEach(senderId => {
            if (!users.has(senderId) || senderId === userId) return;
            operations.push(batch => batch.set(doc(firebaseDatabase, "friendRequests", `${senderId}_${userId}`), {
                senderId, recipientId: userId, status: "pending",
                migratedFromLegacy: true, createdAt: serverTimestamp()
            }, { merge: true }));
        });
        relationIds(profile.following).forEach(targetId => {
            if (!users.has(targetId) || targetId === userId) return;
            operations.push(batch => batch.set(doc(firebaseDatabase, "follows", `${userId}_${targetId}`), {
                followerId: userId, targetId, migratedFromLegacy: true, createdAt: serverTimestamp()
            }, { merge: true }));
        });
    });

    postsSnapshot.docs.forEach(item => {
        const post = item.data();
        const privacy = post.privacy || "public";
        const friendIds = relationIds(users.get(post.authorId)?.friends);
        const audienceIds = privacy === "public" ? [] : privacy === "private" ? [post.authorId] : [...new Set([post.authorId, ...friendIds])];
        operations.push(batch => batch.update(item.ref, {
            privacy, audienceIds,
            moderationStatus: post.moderationStatus || null,
            deletedByAdmin: post.deletedByAdmin === true,
            securityMigratedAt: serverTimestamp()
        }));
    });

    usernamesSnapshot.docs.forEach(item => {
        operations.push(batch => batch.set(item.ref, {
            uid: item.data().uid, createdAt: item.data().createdAt || serverTimestamp()
        }));
    });

    await commitOperations(operations);
    await addDoc(collection(firebaseDatabase, "adminAuditLogs"), {
        action: "security_model_migration", actorId: adminUser.uid,
        users: usersSnapshot.size, posts: postsSnapshot.size,
        friendships: friendshipIds.size, createdAt: serverTimestamp()
    });
    await setDoc(doc(firebaseDatabase, "system", "securityMigration"), {
        status: "complete", schemaVersion: 2, completedAt: serverTimestamp(), completedBy: adminUser.uid,
        users: usersSnapshot.size, posts: postsSnapshot.size, friendships: friendshipIds.size
    });
    return { users: usersSnapshot.size, posts: postsSnapshot.size, friendships: friendshipIds.size };
}

function installMigrationControl(user) {
    const host = document.querySelector("#audit-page-section .admin-audit-callout");
    if (!host || host.querySelector("[data-security-migration]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.securityMigration = "";
    button.className = "admin-refresh-btn";
    button.textContent = "Chuyển đổi dữ liệu bảo mật";
    button.onclick = async () => {
        if (!confirm("Chạy chuyển đổi dữ liệu bảo mật? Thao tác này có thể chạy lại an toàn nhưng không được đóng trang giữa chừng.")) return;
        button.disabled = true;
        button.textContent = "Đang chuyển đổi…";
        try {
            const result = await migrateSecurityModel(user);
            button.textContent = `Hoàn tất: ${result.users} người dùng, ${result.posts} bài viết`;
        } catch (error) {
            console.error(error);
            button.disabled = false;
            button.textContent = "Thử chuyển đổi lại";
            alert(`Chuyển đổi chưa hoàn tất: ${error.message}`);
        }
    };
    host.appendChild(button);
}

onAuthStateChanged(firebaseAuthentication, user => {
    if (user) installMigrationControl(user);
});
