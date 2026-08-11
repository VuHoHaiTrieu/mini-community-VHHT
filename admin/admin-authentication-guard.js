import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { resolveDisplayName, isGeneratedDisplayName } from "../shared/user-identity.js";
import { confirmAction, showToast, setButtonBusy } from "./admin-ui.js";

const DEFAULT_AVATAR = "../shared/assets/default-avatar.png?v=3";

onAuthStateChanged(firebaseAuthentication, async authenticatedUser => {
    if (!authenticatedUser) {
        location.replace("../authentication/login-page.html");
        return;
    }

    try {
        const snapshot = await getDoc(doc(firebaseDatabase, "users", authenticatedUser.uid));
        if (!snapshot.exists() || snapshot.data()?.role !== "admin") {
            document.body.classList.add("admin-ready");
            showToast("Tài khoản hiện tại không có quyền truy cập khu vực quản trị.", { type: "error", title: "Quyền truy cập bị từ chối", duration: 2400 });
            setTimeout(() => location.replace("../community/community-feed-page.html"), 900);
            return;
        }

        const userData = await recoverAdminIdentity(snapshot.data(), authenticatedUser);
        renderAdminIdentity(userData, authenticatedUser);
        setupAdminLogout();
        document.body.classList.add("admin-ready");
    } catch (error) {
        console.error("Không thể xác thực phiên quản trị", error);
        document.body.classList.add("admin-ready");
        showToast("Không thể kiểm tra quyền quản trị. Hãy kiểm tra kết nối và thử lại.", { type: "error", title: "Lỗi xác thực" });
    }
});

async function recoverAdminIdentity(data, user) {
    let displayName = resolveDisplayName(data, user);
    if (isGeneratedDisplayName(displayName, data?.email || user.email)) {
        try {
            const posts = await getDocs(query(collection(firebaseDatabase, "posts"), where("authorId", "==", user.uid)));
            const historicalName = posts.docs.map(item => item.data().authorDisplayName).find(name => !isGeneratedDisplayName(name, data?.email || user.email));
            if (historicalName) displayName = historicalName;
        } catch (error) {
            console.warn("Không thể phục hồi tên admin từ bài viết", error);
        }
    }
    if (!isGeneratedDisplayName(displayName, data?.email || user.email) && data?.displayName !== displayName) {
        await setDoc(doc(firebaseDatabase, "users", user.uid), { displayName }, { merge: true });
        await updateProfile(user, { displayName }).catch(error => console.warn("Không thể đồng bộ tên Firebase Auth", error));
    }
    return { ...data, displayName };
}

function renderAdminIdentity(data, user) {
    const slot = document.querySelector(".admin-account-slot") || document.querySelector(".admin-main-topbar");
    if (!slot) return;
    slot.innerHTML = `
        <button class="admin-identity-chip" type="button" aria-label="Mở menu tài khoản quản trị" aria-expanded="false" aria-controls="admin-account-menu">
            <img alt="Ảnh đại diện quản trị viên"><span><strong></strong><small>ADMIN</small></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div id="admin-account-menu" class="admin-account-menu" role="menu">
            <div class="admin-account-menu-heading" aria-hidden="true">
                <strong></strong><small>Quản trị viên</small>
            </div>
            <a href="../community/profile-user/user-profile.html?from=dashboard" role="menuitem"><i class="fa-regular fa-id-badge" aria-hidden="true"></i><span>Hồ sơ và đăng bài</span></a>
            <button type="button" data-account-posts role="menuitem"><i class="fa-regular fa-newspaper" aria-hidden="true"></i><span>Quản lý bài viết</span></button>
            <a href="../community/community-feed-page.html?from=admin" role="menuitem"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span>Đi tới cộng đồng</span></a>
            <div class="admin-account-menu-separator" role="separator"></div>
            <button class="admin-account-menu-logout" type="button" data-account-logout role="menuitem"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Đăng xuất</span></button>
        </div>`;
    const button = slot.querySelector(".admin-identity-chip");
    const menu = slot.querySelector(".admin-account-menu");
    button.querySelector("img").src = data.photoURL || data.profileImage || DEFAULT_AVATAR;
    button.querySelector("strong").textContent = resolveDisplayName(data, user);
    menu.querySelector(".admin-account-menu-heading strong").textContent = resolveDisplayName(data, user);
    const setMenuOpen = open => {
        menu.classList.toggle("open", open);
        button.setAttribute("aria-expanded", String(open));
    };
    button.addEventListener("click", () => setMenuOpen(!menu.classList.contains("open")));
    menu.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
        if (link.href.includes("user-profile")) sessionStorage.setItem("vhht_profile_return_source", "dashboard");
        if (link.href.includes("community-feed")) sessionStorage.setItem("vhht_community_admin_mode", "1");
    }));
    menu.querySelector("[data-account-posts]").addEventListener("click", () => {
        setMenuOpen(false);
        document.querySelector('.admin-navigation-button[data-page="posts-page-section"]')?.click();
    });
    menu.querySelector("[data-account-logout]").addEventListener("click", event => requestLogout(event.currentTarget));
    document.addEventListener("click", event => { if (!slot.contains(event.target)) setMenuOpen(false); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") setMenuOpen(false); });
}

function setupAdminLogout() {
    const button = document.getElementById("logout-button");
    if (!button || button.dataset.ready) return;
    button.dataset.ready = "true";
    button.addEventListener("click", () => requestLogout(button));
}

async function requestLogout(button) {
    const accepted = await confirmAction({
        title: "Kết thúc phiên quản trị?",
        description: "Bạn sẽ đăng xuất khỏi Trung tâm quản trị và cần xác thực lại để tiếp tục.",
        context: "Mọi dữ liệu đã lưu trên Firestore vẫn được giữ nguyên.",
        confirmLabel: "Đăng xuất",
        tone: "danger",
        icon: "fa-power-off"
    });
    if (!accepted) return;
    setButtonBusy(button, true, "Đang đăng xuất");
    try {
        await signOut(firebaseAuthentication);
        location.replace("../authentication/login-page.html");
    } catch (error) {
        setButtonBusy(button, false);
        showToast("Không thể đăng xuất lúc này. Vui lòng thử lại.", { type: "error" });
    }
}

document.getElementById("admin-profile-entry")?.addEventListener("click", () => sessionStorage.setItem("vhht_profile_return_source", "dashboard"));
document.getElementById("admin-community-entry")?.addEventListener("click", () => sessionStorage.setItem("vhht_community_admin_mode", "1"));
