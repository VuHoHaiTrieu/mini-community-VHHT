// Đã sửa đường dẫn nhảy 2 cấp (../../) để tìm đúng file connection của bạn
import { firebaseAuthentication, firebaseDatabase } from "../../shared/firebase-connection.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const backToStationBtn = document.getElementById("back-to-station-btn");
const userAvatarRender = document.getElementById("user-avatar-render");
const avatarFileSelector = document.getElementById("avatar-file-selector");
const displayNameInput = document.getElementById("profile-display-name-input");
const uidReadonly = document.getElementById("profile-uid-readonly");
const emailReadonly = document.getElementById("profile-email-readonly");
const saveProfileBtn = document.getElementById("save-profile-btn");
const cosmicToast = document.getElementById("cosmic-toast");

let authenticatedUser = null;
let base64AvatarString = null;

// 1. Kiểm tra đăng nhập và lấy dữ liệu hiển thị lên Form
onAuthStateChanged(firebaseAuthentication, async (user) => {
    if (!user) {
        // Nếu chưa đăng nhập, nhảy 2 cấp ra file index.html ở thư mục gốc
        window.location.href = "../../index.html"; 
        return;
    }
    
    authenticatedUser = user;
    uidReadonly.value = user.uid;
    emailReadonly.value = user.email || "Chưa liên kết Email";

    try {
        const userDocRef = doc(firebaseDatabase, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            displayNameInput.value = userData.displayName || "Phi hành gia";
            if (userData.photoURL) {
                userAvatarRender.src = userData.photoURL;
                base64AvatarString = userData.photoURL;
            }
        } else {
            displayNameInput.value = user.displayName || "Phi hành gia";
        }
    } catch (error) {
        triggerCosmicToast("Lỗi kết nối dữ liệu hồ sơ!");
        console.error(error);
    }
});

// 2. Xử lý chọn ảnh từ máy tính và chuyển sang Base64 để lưu vào Firestore
if (avatarFileSelector) {
    avatarFileSelector.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            triggerCosmicToast("Vui lòng chọn đúng file hình ảnh!");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            base64AvatarString = event.target.result;
            userAvatarRender.src = base64AvatarString; // Hiển thị ảnh vừa chọn lên màn hình
            triggerCosmicToast("Đã nhận ảnh mới. Hãy bấm Lưu Hệ Thống!");
        };
        reader.readAsDataURL(file);
    });
}

// 3. Thực hiện cập nhật Tên và Avatar lên Firestore khi bấm nút
if (saveProfileBtn) {
    saveProfileBtn.onclick = async () => {
        const freshName = displayNameInput.value.trim();
        if (!freshName) {
            triggerCosmicToast("Tên hiển thị không được bỏ trống!");
            return;
        }
        if (!authenticatedUser) return;

        saveProfileBtn.disabled = true;
        saveProfileBtn.innerHTML = `<i class="fa-solid fa-atom fa-spin"></i> Đang lưu...`;

        try {
            const userDocRef = doc(firebaseDatabase, "users", authenticatedUser.uid);
            await updateDoc(userDocRef, {
                displayName: freshName,
                photoURL: base64AvatarString || ""
            });
            
            triggerCosmicToast("Cập nhật hồ sơ thành công!");
        } catch (error) {
            triggerCosmicToast("Lỗi cập nhật dữ liệu cốt lõi!");
            console.error(error);
        } finally {
            saveProfileBtn.disabled = false;
            saveProfileBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Lưu Hệ Thống`;
        }
    };
}

// 4. SỬA LỖI BẤM RA KHÔNG ĐƯỢC: Đường dẫn quay lại trang feed
if (backToStationBtn) {
    backToStationBtn.onclick = () => {
        // Chỉ cần lùi 1 cấp (../) vì community-feed-page.html nằm ngay trong thư mục community
        window.location.href = "../community-feed-page.html";
    };
}

function triggerCosmicToast(msg) {
    cosmicToast.innerText = msg;
    cosmicToast.classList.add("visible");
    setTimeout(() => { cosmicToast.classList.remove("visible"); }, 3000);
}

// Canvas nền sao động nhẹ nhàng
const canvas = document.getElementById("cosmic-profile-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
let stars = [];

if (canvas && ctx) {
    function resize() {
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        stars = [];
        for (let i = 0; i < 40; i++) {
            stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.2, alpha: Math.random(), speed: 0.005 + Math.random() * 0.01 });
        }
    }
    window.addEventListener("resize", resize);
    function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.forEach(s => {
            s.alpha += s.speed; if (s.alpha > 1 || s.alpha < 0.1) s.speed = -s.speed;
            ctx.fillStyle = `rgba(56, 189, 248, ${s.alpha * 0.5})`;
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        });
        requestAnimationFrame(loop);
    }
    resize(); loop();
}