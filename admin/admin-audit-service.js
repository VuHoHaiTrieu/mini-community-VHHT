import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function recordAdminAudit(action, targetType, targetId, details = {}) {
    const admin = firebaseAuthentication.currentUser;
    if (!admin) return;
    try {
        await addDoc(collection(firebaseDatabase, "adminAuditLogs"), {
            action, targetType, targetId, details, adminId: admin.uid,
            adminEmail: admin.email || "", createdAt: serverTimestamp()
        });
    } catch (error) { console.warn("Không thể ghi nhật ký quản trị", error); }
}
