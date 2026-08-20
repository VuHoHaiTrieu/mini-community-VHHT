import { firebaseAuthentication } from "../shared/firebase-connection.js";
import { confirmPasswordReset, verifyPasswordResetCode } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { OTP_SERVICE_URL } from "./otp-service.config.js?v=2";

const byId = id => document.getElementById(id);

const COMMON_EMAIL_DOMAIN_CORRECTIONS = Object.freeze({
    "gmil.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gmial.com": "gmail.com",
    "gmail.con": "gmail.com",
    "gmail.co": "gmail.com"
});

function getSuggestedEmail(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const separatorIndex = normalizedEmail.lastIndexOf("@");
    if (separatorIndex < 1) return "";
    const localPart = normalizedEmail.slice(0, separatorIndex);
    const domain = normalizedEmail.slice(separatorIndex + 1);
    const correctedDomain = COMMON_EMAIL_DOMAIN_CORRECTIONS[domain];
    return correctedDomain ? `${localPart}@${correctedDomain}` : "";
}

function showStatus(element, message, type = "loading") {
    if (!element) return;
    element.className = `authentication-status-message is-${type}`;
    const icons = { loading: "fa-spinner fa-spin", success: "fa-check", error: "fa-triangle-exclamation" };
    const titles = { loading: "Đang xử lý", success: "Đã gửi yêu cầu", error: "Không thể tiếp tục" };
    element.innerHTML = `<span class="authentication-status-icon"><i class="fa-solid ${icons[type] || icons.loading}"></i></span><span class="authentication-status-copy"><strong>${titles[type] || titles.loading}</strong><span></span></span>`;
    element.querySelector(".authentication-status-copy > span").textContent = message;
}

const requestForm = byId("password-recovery-request-form");
const otpForm = byId("password-recovery-otp-form");
const newPasswordForm = byId("password-recovery-new-password-form");
let recoveryEmail = "";
let resetToken = "";

async function callOtpService(payload) {
    if (!OTP_SERVICE_URL || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(OTP_SERVICE_URL)) {
        throw new Error("OTP_SERVICE_NOT_CONFIGURED");
    }
    const response = await fetch(OTP_SERVICE_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        redirect: "follow",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer"
    });
    if (!response.ok) throw new Error("OTP_SERVICE_UNAVAILABLE");
    const responseText = await response.text();
    try {
        return JSON.parse(responseText);
    } catch {
        const error = new Error("OTP_SERVICE_INVALID_RESPONSE");
        error.responsePreview = responseText.slice(0, 160);
        throw error;
    }
}

function setRecoveryStep(step) {
    requestForm.hidden = step !== "email";
    otpForm.hidden = step !== "otp";
    newPasswordForm.hidden = step !== "password";
    const order = ["email", "otp", "password"], activeIndex = order.indexOf(step);
    document.querySelectorAll("[data-recovery-progress]").forEach((element, index) => {
        element.classList.toggle("is-active", index === activeIndex);
        element.classList.toggle("is-complete", index < activeIndex);
    });
    const copy = {
        email: ["Bước 1/3 · Xác minh email", "Nhập email đăng ký"],
        otp: ["Bước 2/3 · Nhập mã OTP", "Kiểm tra mã xác thực"],
        password: ["Bước 3/3 · Bảo mật tài khoản", "Đặt mật khẩu mới"]
    }[step];
    byId("recovery-guide-label").textContent = copy[0];
    byId("recovery-title").textContent = copy[1];
}

async function requestOtp(email, statusElement, button) {
    button.disabled = true;
    showStatus(statusElement, "Đang tạo và gửi mã OTP bảo mật…");
    try {
        const result = await callOtpService({ action: "requestOtp", email });
        if (!result.ok) throw Object.assign(new Error(result.message), { serviceResult: result });
        if (result.delivered !== true) {
            throw Object.assign(new Error("OTP_NOT_DELIVERED"), { serviceResult: result });
        }
        recoveryEmail = email;
        byId("recovery-email-preview").textContent = email;
        setRecoveryStep("otp");
        byId("recovery-otp-input").focus();
        showStatus(byId("password-recovery-otp-status"), "Mã có hiệu lực trong 10 phút. Hãy kiểm tra Hộp thư đến, Quảng cáo và Thư rác.", "success");
    } catch (error) {
        const message = error.message === "OTP_SERVICE_NOT_CONFIGURED"
            ? "Dịch vụ OTP chưa được kết nối. Hãy triển khai Apps Script và cập nhật URL /exec."
            : error.message === "OTP_NOT_DELIVERED"
                ? "Dịch vụ chưa xác nhận đã gửi email. Vui lòng tải lại trang và thử lại."
                : error.message === "OTP_SERVICE_INVALID_RESPONSE"
                    ? "Dịch vụ OTP trả về phản hồi không hợp lệ. Hãy kiểm tra lại bản triển khai Apps Script."
                    : error.serviceResult?.message || "Chưa thể gửi mã OTP. Vui lòng thử lại.";
        showStatus(statusElement, message, "error");
    } finally {
        button.disabled = false;
    }
}

requestForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const emailInput = byId("recovery-email-input"), errorElement = byId("recovery-email-error");
    if (!emailInput.validity.valid) {
        errorElement.textContent = "Vui lòng nhập đúng email đã dùng khi đăng ký.";
        emailInput.focus();
        return;
    }
    const normalizedEmail = emailInput.value.trim().toLowerCase();
    const suggestedEmail = getSuggestedEmail(normalizedEmail);
    if (suggestedEmail) {
        errorElement.textContent = `Có thể bạn đã nhập sai tên miền. Bạn muốn nhập ${suggestedEmail}?`;
        emailInput.focus();
        emailInput.select();
        return;
    }
    errorElement.textContent = "";
    await requestOtp(normalizedEmail, byId("password-recovery-status"), byId("send-recovery-button"));
});

otpForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const input = byId("recovery-otp-input"), otp = input.value.replace(/\D/g, "");
    if (!/^\d{6}$/.test(otp)) {
        byId("recovery-otp-error").textContent = "Vui lòng nhập đủ 6 chữ số.";
        return;
    }
    byId("recovery-otp-error").textContent = "";
    const button = byId("verify-otp-button");
    button.disabled = true;
    showStatus(byId("password-recovery-otp-status"), "Đang xác minh mã OTP…");
    try {
        const result = await callOtpService({ action: "verifyOtp", email: recoveryEmail, otp });
        if (!result.ok || !result.resetToken) throw Object.assign(new Error(result.message), { serviceResult: result });
        resetToken = result.resetToken;
        setRecoveryStep("password");
        byId("recovery-new-password").focus();
    } catch (error) {
        showStatus(byId("password-recovery-otp-status"), error.serviceResult?.message || "Không thể xác minh mã OTP.", "error");
    } finally {
        button.disabled = false;
    }
});

newPasswordForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const password = byId("recovery-new-password").value, confirmation = byId("recovery-confirm-password").value;
    const validation = password.length < 8 ? "Mật khẩu cần tối thiểu 8 ký tự." : password !== confirmation ? "Hai mật khẩu chưa trùng khớp." : "";
    byId("recovery-password-error").textContent = validation;
    if (validation) return;
    const button = byId("save-recovery-password");
    button.disabled = true;
    showStatus(byId("password-recovery-final-status"), "Đang cập nhật mật khẩu Firebase…");
    try {
        const result = await callOtpService({ action: "resetPassword", resetToken, password });
        if (!result.ok) throw Object.assign(new Error(result.message), { serviceResult: result });
        newPasswordForm.querySelectorAll("input,button").forEach(element => { element.disabled = true; });
        showStatus(byId("password-recovery-final-status"), "Mật khẩu đã được đổi thành công. Bạn có thể quay lại đăng nhập.", "success");
    } catch (error) {
        showStatus(byId("password-recovery-final-status"), error.serviceResult?.message || "Chưa thể cập nhật mật khẩu.", "error");
        button.disabled = false;
    }
});

byId("recovery-otp-input")?.addEventListener("input", event => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6); });
byId("change-recovery-email")?.addEventListener("click", () => setRecoveryStep("email"));
byId("resend-recovery-otp")?.addEventListener("click", async event => requestOtp(recoveryEmail, byId("password-recovery-otp-status"), event.currentTarget));

const confirmForm = byId("password-reset-confirm-form");
if (confirmForm) initializePasswordReset();

async function initializePasswordReset() {
    const statusElement = byId("password-reset-confirm-status");
    const actionCode = new URLSearchParams(window.location.search).get("oobCode");
    if (!actionCode) {
        showStatus(statusElement, "Liên kết không có mã xác thực. Hãy yêu cầu một email khôi phục mới.", "error");
        return;
    }
    try {
        const email = await verifyPasswordResetCode(firebaseAuthentication, actionCode);
        byId("reset-account-label").textContent = `Đặt lại mật khẩu cho ${email}`;
        confirmForm.hidden = false;
        statusElement.className = "authentication-status-message";
        statusElement.replaceChildren();
        confirmForm.addEventListener("submit", event => completePasswordReset(event, actionCode));
    } catch {
        showStatus(statusElement, "Mã xác thực không hợp lệ hoặc đã hết hạn. Hãy yêu cầu một email khôi phục mới.", "error");
    }
}

async function completePasswordReset(event, actionCode) {
    event.preventDefault();
    const password = byId("new-password-input").value;
    const confirmation = byId("confirm-new-password-input").value;
    const errorElement = byId("reset-password-error");
    const statusElement = byId("password-reset-confirm-status");
    const button = byId("confirm-reset-button");
    const error = password.length < 6
        ? "Mật khẩu cần tối thiểu 6 ký tự."
        : password !== confirmation ? "Hai mật khẩu chưa trùng khớp." : "";
    errorElement.textContent = error;
    if (error) return;
    button.disabled = true;
    showStatus(statusElement, "Đang cập nhật mật khẩu…");
    try {
        await confirmPasswordReset(firebaseAuthentication, actionCode, password);
        confirmForm.hidden = true;
        showStatus(statusElement, "Mật khẩu đã được cập nhật. Bạn có thể quay lại đăng nhập ngay.", "success");
    } catch (error) {
        showStatus(statusElement, error.code === "auth/weak-password" ? "Mật khẩu chưa đủ mạnh." : "Mã xác thực đã hết hạn hoặc đã được sử dụng.", "error");
        button.disabled = false;
    }
}
