import { firebaseAuthentication, firebaseDatabase } from "../shared/firebase-connection.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { playUiSound } from "../shared/audio/sound-manager.js?v=6";

const byId = id => document.getElementById(id);

function getVietnameseAuthErrorMessage(errorCode) {
    switch (errorCode) {
        case "vhht/profile-sync-failed": return "Google đã xác thực thành công nhưng chưa thể thiết lập hồ sơ. Vui lòng kiểm tra kết nối và thử lại.";
        case "auth/email-already-in-use": return "Email này đã được sử dụng.";
        case "auth/invalid-email": return "Email không hợp lệ.";
        case "auth/weak-password": return "Mật khẩu chưa đủ mạnh. Vui lòng nhập tối thiểu 6 ký tự.";
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password": return "Email hoặc mật khẩu không chính xác.";
        case "auth/user-disabled": return "Tài khoản này hiện đang bị khóa.";
        case "auth/too-many-requests": return "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.";
        case "auth/network-request-failed": return "Không thể kết nối mạng. Vui lòng kiểm tra Internet và thử lại.";
        case "auth/popup-blocked": return "Trình duyệt đang chặn cửa sổ đăng nhập Google. Hãy cho phép cửa sổ bật lên rồi thử lại.";
        case "auth/web-storage-unsupported": return "Trình duyệt đang chặn dữ liệu cần thiết để đăng nhập. Hãy tắt chế độ duyệt riêng tư hoặc cho phép cookie rồi thử lại.";
        case "auth/internal-error": return "Google chưa thể hoàn tất phiên đăng nhập trên trình duyệt này. Hãy đóng cửa sổ đăng nhập và thử lại.";
        case "auth/operation-not-supported-in-this-environment": return "Trình duyệt hiện tại không hỗ trợ cửa sổ đăng nhập Google. Hãy mở trang bằng Chrome hoặc Safari thay vì trình duyệt bên trong ứng dụng khác.";
        case "auth/invalid-origin": return "Google không chấp nhận địa chỉ đang mở trang. Hãy mở trực tiếp liên kết GitHub Pages bằng Chrome hoặc Safari.";
        case "auth/timeout": return "Phiên xác nhận Google mất quá nhiều thời gian. Vui lòng kiểm tra mạng và thử lại.";
        case "auth/unauthorized-domain": return "Tên miền hiện tại chưa được cho phép đăng nhập Google.";
        case "auth/operation-not-allowed": return "Phương thức đăng nhập Google chưa được bật.";
        case "auth/account-exists-with-different-credential": return "Email này đã được đăng ký bằng một phương thức khác. Hãy đăng nhập bằng phương thức đã sử dụng trước đó.";
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
        loading: { icon: "fa-spinner fa-spin", title: title || "Đang xử lý" }
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

function setGoogleButtonLoading(button, loading) {
    if (!button) return;
    button.disabled = loading;
    button.setAttribute("aria-busy", String(loading));
    button.replaceChildren();
    if (loading) {
        const spinner = document.createElement("i");
        spinner.className = "fa-solid fa-circle-notch button-spinner";
        spinner.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = "Đang mở Google...";
        button.append(spinner, label);
        return;
    }
    button.innerHTML = `<svg class="google-auth-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M21.6 12.23c0-.72-.06-1.4-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.42l-3.24-2.51c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.9A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.9V7.51H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.49l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.51L6.39 10.1C7.18 7.73 9.39 5.97 12 5.97Z"/></svg><span>Tiếp tục với Google</span>`;
}

const googleAuthButton = byId("google-auth-button");
const googleStatusMessage = byId("login-status-message") || byId("authentication-status-message");
const googlePrimaryButton = byId("login-account-button") || byId("register-account-button");
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function setGoogleFlowLoading(loading) {
    setGoogleButtonLoading(googleAuthButton, loading);
    if (googlePrimaryButton) googlePrimaryButton.disabled = loading;
    document.querySelectorAll(".authentication-input,.toggle-password").forEach(control => { control.disabled = loading; });
}

function safeGoogleDisplayName(user) {
    const providedName = String(user?.displayName || "").trim();
    if (providedName) return providedName.slice(0, 60);
    const emailName = String(user?.email || "").split("@")[0].trim();
    return (emailName || "Thành viên").slice(0, 60);
}

async function ensureGoogleUserProfile(user) {
    const reference = doc(firebaseDatabase, "users", user.uid);
    const profile = {
        displayName: safeGoogleDisplayName(user),
        email: String(user.email || "").trim(),
        createdAt: serverTimestamp(),
        profileImage: user.photoURL || "",
        photoURL: user.photoURL || "",
        biography: "",
        friends: [],
        friendRequests: [],
        showActivityStatus: true,
        role: "user"
    };

    // A brand-new Auth account can need a brief moment before Firestore accepts
    // its refreshed token. This retry is idempotent: every attempt reads first,
    // so an acknowledged or partially acknowledged write is never overwritten.
    const retryDelays = [0, 350, 900];
    const retryableCodes = new Set([
        "permission-denied",
        "unavailable",
        "deadline-exceeded",
        "aborted",
        "internal",
        "unknown",
        "auth/network-request-failed"
    ]);
    let lastError;

    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
        if (retryDelays[attempt]) {
            await new Promise(resolve => window.setTimeout(resolve, retryDelays[attempt]));
        }
        try {
            await user.getIdToken(true);
            const snapshot = await getDoc(reference);
            if (snapshot.exists()) return { data: snapshot.data(), created: false };
            await setDoc(reference, profile);
            return { data: profile, created: true };
        } catch (error) {
            lastError = error;
            if (!retryableCodes.has(error?.code) || attempt === retryDelays.length - 1) break;
        }
    }

    const profileError = new Error("Google đã xác thực thành công nhưng chưa thể thiết lập hồ sơ. Vui lòng kiểm tra kết nối và thử lại.");
    profileError.code = "vhht/profile-sync-failed";
    profileError.cause = lastError;
    throw profileError;
}

async function finishGoogleAuthentication(result) {
    const authenticatedUser = result?.user;
    if (!authenticatedUser) throw new Error("Không nhận được thông tin tài khoản Google.");
    const { data: userData, created } = await ensureGoogleUserProfile(authenticatedUser);
    if (userData?.accountStatus === "suspended") {
        await signOut(firebaseAuthentication);
        const suspendedError = new Error("Tài khoản này hiện bị quản trị viên đình chỉ.");
        suspendedError.code = "vhht/account-suspended";
        throw suspendedError;
    }
    sessionStorage.removeItem("vhht_google_auth_pending");
    setStatus(googleStatusMessage, created ? "Tài khoản đã được tạo. Đang mở trang cộng đồng..." : "Đăng nhập thành công. Đang mở trang cộng đồng...", "success", created ? "Tài khoản đã sẵn sàng" : "Đăng nhập thành công");
    playUiSound("success");
    window.setTimeout(() => {
        window.location.href = userData?.role === "admin"
            ? "../admin/admin-dashboard-page.html"
            : "../community/community-feed-page.html";
    }, 700);
}

async function startGoogleAuthentication() {
    if (!googleAuthButton || googleAuthButton.disabled) return;
    const userBeforeGoogleFlow = firebaseAuthentication.currentUser?.uid || null;
    setStatus(googleStatusMessage, "Chọn tài khoản Google bạn muốn sử dụng.", "loading", "Đang mở Google");
    setGoogleFlowLoading(true);
    try {
        // Use the same user-initiated popup flow on every viewport. Choosing an
        // authentication method by screen width made phones use redirect auth,
        // which depends on cross-site storage and is unreliable on GitHub Pages
        // with mobile tracking prevention enabled.
        sessionStorage.removeItem("vhht_google_auth_pending");
        const result = await signInWithPopup(firebaseAuthentication, googleProvider);
        await finishGoogleAuthentication(result);
    } catch (error) {
        // On some mobile browsers the Google window completes authentication
        // but its popup result cannot be delivered back cleanly. Firebase has
        // already updated currentUser in that situation, so finish the verified
        // session instead of signing it out and reporting a false failure.
        if (firebaseAuthentication.currentUser && firebaseAuthentication.currentUser.uid !== userBeforeGoogleFlow) {
            try {
                await finishGoogleAuthentication({ user: firebaseAuthentication.currentUser });
                return;
            } catch (recoveryError) {
                error = recoveryError;
            }
        }
        if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error?.code)) {
            setStatus(googleStatusMessage);
        } else {
            if (error?.code !== "vhht/account-suspended" && firebaseAuthentication.currentUser) await signOut(firebaseAuthentication).catch(() => {});
            playUiSound("error");
            const knownMessage = getVietnameseAuthErrorMessage(error?.code);
            const diagnosticSuffix = knownMessage.startsWith("Đã xảy ra lỗi hệ thống") && error?.code
                ? ` (Mã: ${String(error.code).replace(/^auth\//, "")})`
                : "";
            setStatus(googleStatusMessage, error?.code === "vhht/account-suspended" ? error.message : `${knownMessage}${diagnosticSuffix}`, "error", error?.code === "vhht/account-suspended" ? "Quyền truy cập bị tạm dừng" : "Chưa thể tiếp tục với Google");
            console.error("Google authentication:", error);
        }
        sessionStorage.removeItem("vhht_google_auth_pending");
        setGoogleFlowLoading(false);
    }
}

googleAuthButton?.addEventListener("click", startGoogleAuthentication);
// Remove state left by older redirect-based builds so it cannot produce a
// misleading error after this version is deployed.
sessionStorage.removeItem("vhht_google_auth_pending");

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
        playUiSound("warning");
        setStatus(loginStatusMessage, "Vui lòng sửa các trường được đánh dấu rồi thử lại.", "error", "Thông tin chưa hợp lệ");
        return;
    }

    const loginEmailInput = byId("login-email-input").value.trim();
    const loginPasswordInput = byId("login-password-input").value;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (window.innerWidth <= 800) window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 40);
    setButtonLoading(loginAccountButton, true, "Đăng nhập", "Đang xác thực...");
    setStatus(loginStatusMessage, "Hệ thống đang kiểm tra tài khoản và thiết lập phiên an toàn.", "loading", "Đang kết nối");

    try {
        const userCredential = await signInWithEmailAndPassword(firebaseAuthentication, loginEmailInput, loginPasswordInput);
        const authenticatedUser = userCredential.user;
        const userDocumentSnapshot = await getDoc(doc(firebaseDatabase, "users", authenticatedUser.uid));
        const userData = userDocumentSnapshot.data();

        if (userData?.accountStatus === "suspended") {
            playUiSound("error");
            await signOut(firebaseAuthentication);
            setStatus(loginStatusMessage, "Tài khoản này hiện bị quản trị viên đình chỉ.", "error", "Quyền truy cập bị tạm dừng");
            setButtonLoading(loginAccountButton, false, "Đăng nhập", "Đang xác thực...");
            return;
        }

        setStatus(loginStatusMessage, "Đăng nhập thành công. Đang mở trang cộng đồng...", "success", "Đăng nhập thành công");
        playUiSound("success");
        setTimeout(() => {
            window.location.href = userData?.role === "admin"
                ? "../admin/admin-dashboard-page.html"
                : "../community/community-feed-page.html";
        }, 1200);
    } catch (error) {
        playUiSound("error");
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
        playUiSound("warning");
        setStatus(authenticationStatusMessage, "Vui lòng sửa các trường được đánh dấu rồi thử lại.", "error", "Thông tin chưa hợp lệ");
        return;
    }

    const displayNameInput = byId("display-name-input").value.trim();
    const emailInput = byId("email-input").value.trim();
    const passwordInput = byId("password-input").value;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (window.innerWidth <= 800) window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 40);
    setButtonLoading(registerAccountButton, true, "Đăng ký", "Đang tạo tài khoản...");
    setStatus(authenticationStatusMessage, "Đang tạo tài khoản và thiết lập hồ sơ của bạn.", "loading", "Đang tạo tài khoản");

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
        playUiSound("success");
        setTimeout(() => { window.location.href = "./login-page.html"; }, 1500);
    } catch (error) {
        playUiSound("error");
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
