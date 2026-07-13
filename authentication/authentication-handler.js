import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const byId = id => document.getElementById(id);

function getVietnameseAuthErrorMessage(errorCode) {
    switch (errorCode) {
        case "auth/email-already-in-use": return "Email này đã được sử dụng.";
        case "auth/invalid-email": return "Email không hợp lệ.";
        case "auth/weak-password": return "Mật khẩu chưa đủ mạnh. Vui lòng nhập tối thiểu 6 ký tự.";
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password": return "Email hoặc mật khẩu không chính xác.";
        case "auth/user-disabled": return "Tài khoản này hiện đang bị khóa.";
        case "auth/too-many-requests": return "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.";
        case "auth/network-request-failed": return "Không thể kết nối mạng. Vui lòng kiểm tra Internet và thử lại.";
        default: return "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.";
    }
}

function setStatus(element, message = "", type = "", title = "") {
    if (!element) return;
    element.replaceChildren();
    element.classList.remove("is-error", "is-success", "is-loading");
    if (!message) {
        element.setAttribute("role", "status");
        return;
    }

    const statusConfig = {
        error: { icon: "fa-triangle-exclamation", title: title || "Không thể tiếp tục" },
        success: { icon: "fa-circle-check", title: title || "Hoàn tất" },
        loading: { icon: "fa-satellite-dish", title: title || "Đang xử lý" }
    };
    const config = statusConfig[type] || statusConfig.error;
    const iconWrap = document.createElement("span");
    const icon = document.createElement("i");
    const copy = document.createElement("span");
    const heading = document.createElement("strong");
    const description = document.createElement("span");

    iconWrap.className = "authentication-status-icon";
    icon.className = `fa-solid ${config.icon}`;
    icon.setAttribute("aria-hidden", "true");
    copy.className = "authentication-status-copy";
    heading.textContent = config.title;
    description.textContent = message;
    iconWrap.appendChild(icon);
    copy.append(heading, description);
    element.append(iconWrap, copy);
    element.classList.add(`is-${type}`);
    element.setAttribute("role", type === "error" ? "alert" : "status");
    element.setAttribute("aria-atomic", "true");
}

function setButtonLoading(button, loading, defaultLabel, loadingLabel) {
    if (!button) return;
    button.disabled = loading;
    button.setAttribute("aria-busy", String(loading));
    button.replaceChildren();
    if (loading) {
        const spinner = document.createElement("i");
        spinner.className = "fa-solid fa-circle-notch button-spinner";
        spinner.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "button-label";
        label.textContent = loadingLabel;
        button.append(spinner, label);
        return;
    }
    const label = document.createElement("span");
    label.className = "button-label";
    label.textContent = defaultLabel;
    const arrow = document.createElement("i");
    arrow.className = "fa-solid fa-arrow-right button-arrow";
    arrow.setAttribute("aria-hidden", "true");
    button.append(label, arrow);
}

function setFieldError(inputId, messageId, message = "") {
    const input = byId(inputId), output = byId(messageId);
    if (!input) return false;
    input.setAttribute("aria-invalid", String(Boolean(message)));
    input.closest(".authentication-field")?.classList.toggle("is-invalid", Boolean(message));
    if (output) output.textContent = message;
    return Boolean(message);
}

function clearFieldErrorOnInput(inputId, messageId) {
    const input = byId(inputId);
    input?.addEventListener("input", () => setFieldError(inputId, messageId));
}

function setupPasswordToggle(inputId, toggleId, subject = "mật khẩu") {
    const passwordInput = byId(inputId), toggleButton = byId(toggleId);
    if (!passwordInput || !toggleButton) return;
    toggleButton.addEventListener("click", () => {
        const willShow = passwordInput.type === "password";
        passwordInput.type = willShow ? "text" : "password";
        toggleButton.setAttribute("aria-pressed", String(willShow));
        toggleButton.setAttribute("aria-label", `${willShow ? "Ẩn" : "Hiện"} ${subject}`);
        const icon = toggleButton.querySelector("i") || toggleButton;
        icon.classList.toggle("fa-eye", willShow);
        icon.classList.toggle("fa-eye-slash", !willShow);
        passwordInput.focus({ preventScroll: true });
    });
}

setupPasswordToggle("login-password-input", "toggle-login-password");
setupPasswordToggle("password-input", "toggle-password");
setupPasswordToggle("confirm-password-input", "toggle-confirm-password", "mật khẩu xác nhận");

function validateLoginForm() {
    const email = byId("login-email-input"), password = byId("login-password-input");
    const emailMessage = !email.value.trim() ? "Vui lòng nhập email."
        : !email.validity.valid ? "Email không hợp lệ." : "";
    const passwordMessage = !password.value ? "Vui lòng nhập mật khẩu." : "";
    const invalid = [
        setFieldError("login-email-input", "login-email-error", emailMessage),
        setFieldError("login-password-input", "login-password-error", passwordMessage)
    ];
    if (invalid.some(Boolean)) document.querySelector(".authentication-field.is-invalid input")?.focus();
    return !invalid.some(Boolean);
}

const loginForm = byId("login-form"), loginAccountButton = byId("login-account-button");
if (loginForm && loginAccountButton) loginForm.addEventListener("submit", loginExistingUserAccount);
clearFieldErrorOnInput("login-email-input", "login-email-error");
clearFieldErrorOnInput("login-password-input", "login-password-error");

async function loginExistingUserAccount(event) {
    event?.preventDefault();
    if (loginAccountButton.disabled) return;
    const loginStatusMessage = byId("login-status-message");
    setStatus(loginStatusMessage);
    if (!validateLoginForm()) {
        setStatus(loginStatusMessage, "Vui lòng sửa các trường được đánh dấu rồi thử lại.", "error", "Thông tin chưa hợp lệ");
        return;
    }

    const loginEmailInput = byId("login-email-input").value.trim();
    const loginPasswordInput = byId("login-password-input").value;
    setButtonLoading(loginAccountButton, true, "Đăng nhập", "Đang xác thực...");
    setStatus(loginStatusMessage, "Hệ thống đang kiểm tra tài khoản và thiết lập phiên an toàn.", "loading", "Đang kết nối");

    try {
        const userCredential = await signInWithEmailAndPassword(firebaseAuthentication, loginEmailInput, loginPasswordInput);
        const authenticatedUser = userCredential.user;
        const userDocumentSnapshot = await getDoc(doc(firebaseDatabase, "users", authenticatedUser.uid));
        const userData = userDocumentSnapshot.data();

        if (userData?.accountStatus === "suspended") {
            await signOut(firebaseAuthentication);
            setStatus(loginStatusMessage, "Tài khoản này hiện bị quản trị viên đình chỉ.", "error", "Quyền truy cập bị tạm dừng");
            setButtonLoading(loginAccountButton, false, "Đăng nhập", "Đang xác thực...");
            return;
        }

        setStatus(loginStatusMessage, "Đăng nhập thành công. Đang chuẩn bị không gian của bạn...", "success", "Kết nối thành công");
        setTimeout(() => {
            window.location.href = userData?.role === "admin"
                ? "../admin/admin-dashboard-page.html"
                : "../community/community-feed-page.html";
        }, 1200);
    } catch (error) {
        setStatus(loginStatusMessage, getVietnameseAuthErrorMessage(error.code), "error", "Đăng nhập chưa thành công");
        console.error(error);
        setButtonLoading(loginAccountButton, false, "Đăng nhập", "Đang xác thực...");
    }
}

function updatePasswordStrength() {
    const password = byId("password-input"), indicator = byId("password-strength");
    if (!password || !indicator) return;
    const value = password.value;
    let level = "empty", label = "Nhập ít nhất 6 ký tự";
    if (value) {
        const variety = [/[a-z]/i, /\d/, /[^a-z0-9]/i].filter(rule => rule.test(value)).length;
        if (value.length >= 10 && variety >= 2) { level = "strong"; label = "Mật khẩu mạnh"; }
        else if (value.length >= 6) { level = "medium"; label = "Mật khẩu trung bình"; }
        else { level = "weak"; label = "Mật khẩu yếu"; }
    }
    indicator.dataset.level = level;
    indicator.querySelector("small").textContent = label;
}

function validatePasswordConfirmation(showEmptyMessage = true) {
    const password = byId("password-input"), confirmation = byId("confirm-password-input");
    if (!password || !confirmation) return true;
    let message = "";
    if (!confirmation.value && showEmptyMessage) message = "Vui lòng xác nhận mật khẩu.";
    else if (confirmation.value && password.value !== confirmation.value) message = "Mật khẩu xác nhận không trùng khớp.";
    setFieldError("confirm-password-input", "confirm-password-message", message);
    return !message;
}

function validateRegisterForm() {
    const displayName = byId("display-name-input"), email = byId("email-input"), password = byId("password-input");
    const invalid = [
        setFieldError("display-name-input", "display-name-error", displayName.value.trim() ? "" : "Vui lòng nhập tên hiển thị."),
        setFieldError("email-input", "register-email-error", !email.value.trim() ? "Vui lòng nhập email." : !email.validity.valid ? "Email không hợp lệ." : ""),
        setFieldError("password-input", "password-error", !password.value ? "Vui lòng nhập mật khẩu." : password.value.length < 6 ? "Mật khẩu cần tối thiểu 6 ký tự." : ""),
        !validatePasswordConfirmation(true)
    ];
    if (invalid.some(Boolean)) document.querySelector(".authentication-field.is-invalid input")?.focus();
    return !invalid.some(Boolean);
}

const registerForm = byId("register-form"), registerAccountButton = byId("register-account-button");
if (registerForm && registerAccountButton) registerForm.addEventListener("submit", registerNewUserAccount);
clearFieldErrorOnInput("display-name-input", "display-name-error");
clearFieldErrorOnInput("email-input", "register-email-error");
clearFieldErrorOnInput("password-input", "password-error");
byId("password-input")?.addEventListener("input", () => {
    updatePasswordStrength();
    if (byId("confirm-password-input")?.value) validatePasswordConfirmation(false);
});
byId("confirm-password-input")?.addEventListener("input", () => validatePasswordConfirmation(false));
updatePasswordStrength();

async function registerNewUserAccount(event) {
    event?.preventDefault();
    if (registerAccountButton.disabled) return;
    const authenticationStatusMessage = byId("authentication-status-message");
    setStatus(authenticationStatusMessage);
    if (!validateRegisterForm()) {
        setStatus(authenticationStatusMessage, "Vui lòng sửa các trường được đánh dấu rồi thử lại.", "error", "Thông tin chưa hợp lệ");
        return;
    }

    const displayNameInput = byId("display-name-input").value.trim();
    const emailInput = byId("email-input").value.trim();
    const passwordInput = byId("password-input").value;
    setButtonLoading(registerAccountButton, true, "Đăng ký", "Đang tạo tài khoản...");
    setStatus(authenticationStatusMessage, "Đang tạo danh tính và thiết lập không gian cá nhân của bạn.", "loading", "Đang khởi tạo tài khoản");

    try {
        const userCredential = await createUserWithEmailAndPassword(firebaseAuthentication, emailInput, passwordInput);
        const authenticatedUser = userCredential.user;
        await updateProfile(authenticatedUser, { displayName: displayNameInput });

        await setDoc(doc(firebaseDatabase, "users", authenticatedUser.uid), {
            displayName: displayNameInput,
            email: emailInput,
            createdAt: serverTimestamp(),
            profileImage: "",
            photoURL: "",
            biography: "",
            friends: [],
            friendRequests: [],
            showActivityStatus: true,
            role: "user"
        });

        setStatus(authenticationStatusMessage, "Tài khoản đã sẵn sàng. Bạn sẽ được chuyển tới trang đăng nhập.", "success", "Tạo tài khoản thành công");
        setTimeout(() => { window.location.href = "./login-page.html"; }, 1500);
    } catch (error) {
        setStatus(authenticationStatusMessage, getVietnameseAuthErrorMessage(error.code), "error", "Chưa thể tạo tài khoản");
        console.error(error);
        setButtonLoading(registerAccountButton, false, "Đăng ký", "Đang tạo tài khoản...");
    }
}

onAuthStateChanged(firebaseAuthentication, authenticatedUser => {
    console.log("Trạng thái phiên hiện tại:", authenticatedUser ? "Đã đăng nhập" : "Chưa đăng nhập");
});

const logoutButton = byId("logout-button");
if (logoutButton) logoutButton.addEventListener("click", logoutAuthenticatedUser);

async function logoutAuthenticatedUser() {
    try {
        await signOut(firebaseAuthentication);
        window.location.href = "../authentication/login-page.html";
    } catch (error) {
        console.error("Lỗi khi đăng xuất:", error);
    }
}
