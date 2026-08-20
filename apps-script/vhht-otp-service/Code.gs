const CONFIG = Object.freeze({
  PROJECT_ID: 'mini-community-vhht',
  SENDER_NAME: 'VHHT',
  OTP_TTL_MS: 10 * 60 * 1000,
  RESET_TTL_MS: 10 * 60 * 1000,
  RESEND_COOLDOWN_MS: 60 * 1000,
  MAX_ATTEMPTS: 5,
  MAX_SENDS_PER_HOUR: 3,
  LOGO_URL: 'https://vuhohaitrieu.github.io/mini-community-VHHT/shared/assets/brand/vhht-logo-horizontal.png'
});

function doPost(event) {
  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    if (payload.action === 'requestOtp') return requestOtp_(payload);
    if (payload.action === 'verifyOtp') return verifyOtp_(payload);
    if (payload.action === 'resetPassword') return resetPassword_(payload);
    return json_({ ok: false, code: 'INVALID_ACTION', message: 'Yêu cầu không hợp lệ.' });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, code: 'SERVER_ERROR', message: 'Dịch vụ OTP đang bận. Vui lòng thử lại.' });
  }
}

function doGet() {
  return json_({ ok: true, service: 'VHHT OTP Service', status: 'online' });
}

function authorizeService() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const result = lookupAccount_('trieuhaimoi0305@gmail.com');
  console.log(result ? 'Đã kết nối Firebase Authentication.' : 'Đã có quyền nhưng không tìm thấy email kiểm tra trong Firebase Authentication.');
}

function requestOtp_(payload) {
  const email = normalizeEmail_(payload.email);
  if (!validEmail_(email)) return json_({ ok: false, code: 'INVALID_EMAIL', message: 'Email không hợp lệ.' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const key = 'otp_' + digest_(email);
    const now = Date.now();
    const existing = parse_(properties.getProperty(key));
    if (existing && now - Number(existing.lastSent || 0) < CONFIG.RESEND_COOLDOWN_MS) {
      return json_({ ok: false, code: 'TOO_SOON', retryAfter: Math.ceil((CONFIG.RESEND_COOLDOWN_MS - (now - existing.lastSent)) / 1000), message: 'Vui lòng chờ trước khi gửi lại mã.' });
    }
    const windowStartedAt = existing && now - Number(existing.windowStartedAt || 0) < 3600000 ? existing.windowStartedAt : now;
    const sendCount = existing && windowStartedAt === existing.windowStartedAt ? Number(existing.sendCount || 0) : 0;
    if (sendCount >= CONFIG.MAX_SENDS_PER_HOUR) return json_({ ok: false, code: 'RATE_LIMITED', message: 'Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau.' });

    const account = lookupAccount_(email);
    if (!account) {
      console.warn('[OTP] Không tìm thấy tài khoản Firebase cho email hash: ' + digest_(email).slice(0, 12));
      return json_({
        ok: false,
        delivered: false,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Email này chưa được liên kết với tài khoản nào.'
      });
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const salt = randomToken_();
    properties.setProperty(key, JSON.stringify({
      uid: account.localId,
      email: email,
      salt: salt,
      otpHash: digest_(salt + ':' + otp),
      expiresAt: now + CONFIG.OTP_TTL_MS,
      attempts: 0,
      lastSent: now,
      windowStartedAt: windowStartedAt,
      sendCount: sendCount + 1
    }));
    sendOtpEmail_(email, otp);
    console.log('[OTP] Đã gửi mã tới tài khoản Firebase uid: ' + account.localId);
    return json_({ ok: true, delivered: true, expiresIn: 600 });
  } finally {
    lock.releaseLock();
  }
}

function verifyOtp_(payload) {
  const email = normalizeEmail_(payload.email);
  const otp = String(payload.otp || '').replace(/\D/g, '');
  if (!validEmail_(email) || !/^\d{6}$/.test(otp)) return json_({ ok: false, code: 'INVALID_OTP', message: 'Mã xác thực không hợp lệ.' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const otpKey = 'otp_' + digest_(email);
    const record = parse_(properties.getProperty(otpKey));
    if (!record || Date.now() > Number(record.expiresAt || 0)) {
      properties.deleteProperty(otpKey);
      return json_({ ok: false, code: 'OTP_EXPIRED', message: 'Mã đã hết hạn. Vui lòng yêu cầu mã mới.' });
    }
    if (Number(record.attempts || 0) >= CONFIG.MAX_ATTEMPTS) {
      properties.deleteProperty(otpKey);
      return json_({ ok: false, code: 'OTP_LOCKED', message: 'Bạn đã nhập sai quá nhiều lần. Hãy yêu cầu mã mới.' });
    }
    if (!safeEqual_(record.otpHash, digest_(record.salt + ':' + otp))) {
      record.attempts = Number(record.attempts || 0) + 1;
      properties.setProperty(otpKey, JSON.stringify(record));
      return json_({ ok: false, code: 'INVALID_OTP', remainingAttempts: CONFIG.MAX_ATTEMPTS - record.attempts, message: 'Mã xác thực chưa chính xác.' });
    }
    const resetToken = randomToken_() + randomToken_();
    properties.setProperty('reset_' + digest_(resetToken), JSON.stringify({ uid: record.uid, email: email, expiresAt: Date.now() + CONFIG.RESET_TTL_MS }));
    properties.deleteProperty(otpKey);
    return json_({ ok: true, resetToken: resetToken, expiresIn: 600 });
  } finally {
    lock.releaseLock();
  }
}

function resetPassword_(payload) {
  const resetToken = String(payload.resetToken || '');
  const password = String(payload.password || '');
  if (resetToken.length < 40 || password.length < 8) return json_({ ok: false, code: 'INVALID_RESET', message: 'Yêu cầu đặt lại mật khẩu không hợp lệ.' });
  const properties = PropertiesService.getScriptProperties();
  const key = 'reset_' + digest_(resetToken);
  const record = parse_(properties.getProperty(key));
  if (!record || Date.now() > Number(record.expiresAt || 0)) {
    properties.deleteProperty(key);
    return json_({ ok: false, code: 'RESET_EXPIRED', message: 'Phiên đặt lại mật khẩu đã hết hạn.' });
  }
  updateFirebasePassword_(record.uid, password);
  properties.deleteProperty(key);
  return json_({ ok: true, message: 'Mật khẩu đã được cập nhật.' });
}

function lookupAccount_(email) {
  const result = firebaseRequest_('accounts:lookup', { email: [email] });
  return result.users && result.users.length ? result.users[0] : null;
}

function updateFirebasePassword_(uid, password) {
  firebaseRequest_('accounts:update', { localId: uid, password: password });
}

function firebaseRequest_(method, body) {
  const url = 'https://identitytoolkit.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID + '/' + method;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const result = parse_(response.getContentText()) || {};
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    console.error(response.getContentText());
    throw new Error((result.error && result.error.message) || 'Firebase Authentication API error');
  }
  return result;
}

function sendOtpEmail_(email, otp) {
  MailApp.sendEmail({
    to: email,
    name: CONFIG.SENDER_NAME,
    subject: otp + ' là mã xác thực VHHT của bạn',
    body: 'Mã xác thực VHHT của bạn là ' + otp + '. Mã hết hạn sau 10 phút. Không chia sẻ mã này với bất kỳ ai.',
    htmlBody: '<div style="background:#07111f;padding:32px;font-family:Arial,sans-serif;color:#eaf2ff"><div style="max-width:520px;margin:auto;background:#0d1b32;border:1px solid #244b82;border-radius:20px;padding:28px;text-align:center"><img src="' + CONFIG.LOGO_URL + '" alt="VHHT" style="max-width:210px;height:auto"><h2 style="margin:24px 0 8px">Xác thực đặt lại mật khẩu</h2><p style="color:#b9c8df">Nhập mã dưới đây trên website VHHT:</p><div style="font-size:38px;font-weight:800;letter-spacing:10px;color:#67e8f9;margin:24px 0">' + otp + '</div><p style="color:#b9c8df">Mã có hiệu lực trong 10 phút và chỉ dùng được một lần.</p><p style="font-size:12px;color:#7890ad;margin-top:24px">Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.</p></div></div>'
  });
}

function normalizeEmail_(value) { return String(value || '').trim().toLowerCase(); }
function validEmail_(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function parse_(value) { try { return JSON.parse(value || ''); } catch (error) { return null; } }
function randomToken_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function digest_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8).map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join(''); }
function safeEqual_(left, right) { if (!left || !right || left.length !== right.length) return false; var result = 0; for (var i = 0; i < left.length; i++) result |= left.charCodeAt(i) ^ right.charCodeAt(i); return result === 0; }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
