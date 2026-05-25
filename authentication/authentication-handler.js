import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function getVietnameseAuthErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/email-already-in-use': return 'Email này đã được sử dụng bởi một tài khoản khác.';
        case 'auth/invalid-email': return 'Định dạng địa chỉ email không hợp lệ.';
        case 'auth/weak-password': return 'Mật khẩu quá yếu. Vui lòng nhập tối thiểu 6 ký tự.';
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password': return 'Email hoặc mật khẩu không chính xác.';
        case 'auth/user-disabled': return 'Tài khoản này hiện đang bị khóa.';
        case 'auth/too-many-requests': return 'Thử lại quá nhiều lần thất bại. Vui lòng đợi trong giây lát.';
        default: return 'Đã xảy ra lỗi hệ thống bất ngờ. Vui lòng thử lại sau.';
    }
}

function setupPasswordToggle(inputId, toggleId) {
    const passwordInput = document.getElementById(inputId);
    const toggleIcon = document.getElementById(toggleId);
    if (passwordInput && toggleIcon) {
        toggleIcon.addEventListener("click", () => {
            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                toggleIcon.classList.remove("fa-eye-slash");
                toggleIcon.classList.add("fa-eye");
            } else {
                passwordInput.type = "password";
                toggleIcon.classList.remove("fa-eye");
                toggleIcon.classList.add("fa-eye-slash");
            }
        });
    }
}

setupPasswordToggle("login-password-input", "toggle-login-password");
setupPasswordToggle("password-input", "toggle-password");
setupPasswordToggle("confirm-password-input", "toggle-confirm-password");

const registerAccountButton = document.getElementById("register-account-button");
if (registerAccountButton) {
    registerAccountButton.addEventListener("click", registerNewUserAccount);
}

async function registerNewUserAccount() {
    const displayNameInput = document.getElementById("display-name-input").value.trim();
    const emailInput = document.getElementById("email-input").value.trim();
    const passwordInput = document.getElementById("password-input").value;
    const confirmPasswordInput = document.getElementById("confirm-password-input").value;
    const authenticationStatusMessage = document.getElementById("authentication-status-message");

    authenticationStatusMessage.style.color = "#ef4444"; 
    if (!displayNameInput || !emailInput || !passwordInput || !confirmPasswordInput) {
        authenticationStatusMessage.innerText = "Vui lòng nhập đầy đủ tất cả thông tin";
        return;
    }
    if (passwordInput !== confirmPasswordInput) {
        authenticationStatusMessage.innerText = "Mật khẩu xác nhận không trùng khớp";
        return;
    }

    registerAccountButton.disabled = true;
    registerAccountButton.innerText = "Đang tạo tài khoản...";

    try {
        const userCredential = await createUserWithEmailAndPassword(firebaseAuthentication, emailInput, passwordInput);
        const authenticatedUser = userCredential.user;

        await setDoc(doc(firebaseDatabase, "users", authenticatedUser.uid), {
            displayName: displayNameInput,
            email: emailInput,
            createdAt: serverTimestamp(),
            profileImage: "",
            biography: "",
            role: "user"
        });

        authenticationStatusMessage.style.color = "#22c55e"; 
        authenticationStatusMessage.innerText = "Đăng ký tài khoản thành công! Đang chuyển hướng...";
        setTimeout(() => { window.location.href = "./login-page.html"; }, 1500);
    } catch (error) {
        authenticationStatusMessage.innerText = getVietnameseAuthErrorMessage(error.code);
        console.error(error);
        registerAccountButton.disabled = false;
        registerAccountButton.innerText = "Đăng ký";
    }
}

const loginAccountButton = document.getElementById("login-account-button");
if (loginAccountButton) {
    loginAccountButton.addEventListener("click", loginExistingUserAccount);
}

async function loginExistingUserAccount() {
    const loginEmailInput = document.getElementById("login-email-input").value.trim();
    const loginPasswordInput = document.getElementById("login-password-input").value;
    const loginStatusMessage = document.getElementById("login-status-message");

    loginStatusMessage.style.color = "#ef4444"; 
    if (!loginEmailInput || !loginPasswordInput) {
        loginStatusMessage.innerText = "Vui lòng nhập đầy đủ cả email và mật khẩu";
        return;
    }

    loginAccountButton.disabled = true;
    loginAccountButton.innerText = "Đang xác thực...";

    try {
        const userCredential = await signInWithEmailAndPassword(firebaseAuthentication, loginEmailInput, loginPasswordInput);
        const authenticatedUser = userCredential.user;

        const userDocumentReference = doc(firebaseDatabase, "users", authenticatedUser.uid);
        const userDocumentSnapshot = await getDoc(userDocumentReference);
        const userData = userDocumentSnapshot.data();

        loginStatusMessage.style.color = "#22c55e"; 
        loginStatusMessage.innerText = "Đăng nhập thành công! Đang chuẩn bị môi trường...";

        setTimeout(() => {
            if (userData && userData.role === "admin") {
                window.location.href = "../admin/admin-dashboard-page.html";
            } else {
                window.location.href = "../community/community-feed-page.html";
            }
        }, 1200);
    } catch (error) {
        loginStatusMessage.innerText = getVietnameseAuthErrorMessage(error.code);
        console.error(error);
        loginAccountButton.disabled = false;
        loginAccountButton.innerText = "Đăng nhập";
    }
}

onAuthStateChanged(firebaseAuthentication, (authenticatedUser) => {
    console.log("Trạng thái phiên hiện tại:", authenticatedUser ? "Đã đăng nhập" : "Chưa đăng nhập");
});

const logoutButton = document.getElementById("logout-button");
if (logoutButton) {
    logoutButton.addEventListener("click", logoutAuthenticatedUser);
}

async function logoutAuthenticatedUser() {
    try {
        await signOut(firebaseAuthentication);
        window.location.href = "../authentication/login-page.html";
    } catch (error) {
        console.error("Lỗi khi đăng xuất:", error);
    }
}