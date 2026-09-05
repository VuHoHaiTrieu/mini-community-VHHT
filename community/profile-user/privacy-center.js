import { firebaseAuthentication as auth, firebaseDatabase as db } from "../../shared/firebase-connection.js";
import { removeFriendship } from "../../shared/friendship-service.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const timeValue = value => value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : null);
const formatTime = value => timeValue(value)?.toLocaleString("vi-VN") || "Chưa xác định";
let viewer = null;
let deleteConfirmationExpires = 0;

function row(primary, secondary, className = "privacy-device-row") {
  const element = document.createElement("div");
  element.className = className;
  const copy = document.createElement("span");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = primary;
  small.textContent = secondary;
  copy.append(strong, small);
  element.append(copy);
  return element;
}

async function renderSession() {
  const target = $("privacy-active-session");
  if (!target || !viewer) return;
  const snapshot = await getDoc(doc(db, "activeSessions", viewer.uid));
  target.replaceChildren();
  if (!snapshot.exists()) { target.textContent = "Không có phiên hoạt động được ghi nhận."; return; }
  const data = snapshot.data();
  const item = row(data.clientLabel || "Trình duyệt hiện tại", `Hoạt động gần nhất: ${formatTime(data.lastSeenAt)}`);
  const badge = document.createElement("small");
  badge.textContent = "Phiên hiện tại";
  item.append(badge);
  target.append(item);
}

async function renderLoginHistory() {
  const target = $("privacy-login-history");
  if (!target || !viewer) return;
  const snapshot = await getDocs(query(collection(db, "loginHistory", viewer.uid, "events"), orderBy("signedInAt", "desc"), limit(8)));
  target.replaceChildren();
  if (snapshot.empty) { target.textContent = "Lịch sử sẽ xuất hiện từ lần đăng nhập tiếp theo."; return; }
  snapshot.forEach(item => target.append(row(item.data().clientLabel || "Trình duyệt", formatTime(item.data().signedInAt))));
}

async function renderBlockedUsers() {
  const target = $("privacy-blocked-users");
  if (!target || !viewer) return;
  const snapshot = await getDocs(query(collection(db, "userBlocks"), where("blockerId", "==", viewer.uid)));
  target.replaceChildren();
  if (snapshot.empty) { target.textContent = "Bạn chưa chặn người dùng nào."; return; }
  await Promise.all(snapshot.docs.map(async block => {
    const uid = block.data().blockedId;
    const profileSnapshot = await getDoc(doc(db, "users", uid)).catch(() => null);
    const profile = profileSnapshot?.data?.() || {};
    const item = row(profile.displayName || profile.username || "Thành viên VHHT", profile.username ? `@${String(profile.username).replace(/^@/, "")}` : "Tài khoản đã chặn", "privacy-blocked-row");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Bỏ chặn";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await deleteDoc(block.ref); await renderBlockedUsers(); }
      catch (error) { console.error(error); button.disabled = false; button.textContent = "Thử lại"; }
    });
    item.append(button);
    target.append(item);
  }));
}

async function blockUsername(event) {
  event.preventDefault();
  const input = $("privacy-block-username");
  const button = event.currentTarget.querySelector("button");
  const username = String(input?.value || "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{4,24}$/.test(username)) { input?.setCustomValidity("Username phải có 4–24 ký tự hợp lệ."); input?.reportValidity(); return; }
  input.setCustomValidity("");
  button.disabled = true;
  try {
    const alias = await getDoc(doc(db, "usernames", username));
    const blockedId = alias.data()?.uid;
    if (!blockedId) throw new Error("Không tìm thấy tài khoản này.");
    if (blockedId === viewer.uid) throw new Error("Bạn không thể tự chặn chính mình.");
    await setDoc(doc(db, "userBlocks", `${viewer.uid}_${blockedId}`), { blockerId: viewer.uid, blockedId, createdAt: serverTimestamp() });
    await removeFriendship(viewer.uid, blockedId).catch(() => {});
    input.value = "";
    await renderBlockedUsers();
  } catch (error) {
    input.setCustomValidity(error.message || "Không thể chặn tài khoản.");
    input.reportValidity();
  } finally { button.disabled = false; }
}

async function exportData() {
  const button = $("privacy-export-data");
  if (!viewer || !button) return;
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang chuẩn bị';
  try {
    const sources = await Promise.all([
      getDoc(doc(db, "users", viewer.uid)),
      getDoc(doc(db, "usersPrivate", viewer.uid)),
      getDocs(query(collection(db, "posts"), where("authorId", "==", viewer.uid))),
      getDocs(query(collection(db, "savedPosts"), where("userId", "==", viewer.uid))),
      getDocs(query(collection(db, "loginHistory", viewer.uid, "events"), orderBy("signedInAt", "desc"))),
      getDocs(query(collection(db, "userBlocks"), where("blockerId", "==", viewer.uid)))
    ]);
    const documentData = snapshot => snapshot.exists() ? snapshot.data() : null;
    const collectionData = snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    const payload = {
      exportedAt: new Date().toISOString(),
      accountUid: viewer.uid,
      profile: documentData(sources[0]),
      privateProfile: documentData(sources[1]),
      posts: collectionData(sources[2]),
      savedPosts: collectionData(sources[3]),
      loginHistory: collectionData(sources[4]),
      blockedUsers: collectionData(sources[5])
    };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `vhht-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (error) { console.error("Không thể xuất dữ liệu", error); button.textContent = "Xuất dữ liệu thất bại — thử lại"; return; }
  finally { button.disabled = false; }
  button.innerHTML = '<i class="fa-solid fa-download"></i> Tải bản sao dữ liệu';
}

async function syncDeletionRequest() {
  const button = $("privacy-delete-request");
  const status = $("privacy-delete-status");
  if (!viewer || !button || !status) return;
  const snapshot = await getDoc(doc(db, "accountDeletionRequests", viewer.uid));
  const pending = snapshot.exists() && snapshot.data().status === "pending";
  button.dataset.pending = String(pending);
  button.textContent = pending ? "Hủy yêu cầu xóa" : "Gửi yêu cầu xóa";
  status.textContent = pending ? `Đã gửi lúc ${formatTime(snapshot.data().requestedAt)}. Tài khoản chưa bị xóa trong khi chờ xác minh.` : "";
}

async function toggleDeletionRequest() {
  if (!viewer) return;
  const button = $("privacy-delete-request");
  const reference = doc(db, "accountDeletionRequests", viewer.uid);
  if (button.dataset.pending === "true") {
    await deleteDoc(reference);
    await syncDeletionRequest();
    return;
  }
  if (Date.now() > deleteConfirmationExpires) {
    deleteConfirmationExpires = Date.now() + 6000;
    button.textContent = "Bấm lần nữa để xác nhận";
    return;
  }
  button.disabled = true;
  try {
    await setDoc(reference, { userId: viewer.uid, status: "pending", requestedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await syncDeletionRequest();
  } finally { button.disabled = false; deleteConfirmationExpires = 0; }
}

onAuthStateChanged(auth, async user => {
  viewer = user;
  if (!user) return;
  $("privacy-block-form")?.addEventListener("submit", blockUsername);
  $("privacy-export-data")?.addEventListener("click", exportData);
  $("privacy-delete-request")?.addEventListener("click", toggleDeletionRequest);
  await Promise.allSettled([renderSession(), renderLoginHistory(), renderBlockedUsers(), syncDeletionRequest()]);
});
