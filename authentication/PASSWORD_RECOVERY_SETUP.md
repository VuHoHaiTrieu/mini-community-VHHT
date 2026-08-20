# Cấu hình khôi phục mật khẩu VHHT

## 1. Firebase Authentication

Mở **Firebase Console → Authentication → Templates → Password reset** rồi cấu hình:

- Ngôn ngữ/template: tiếng Việt.
- Sender name: `VHHT`.
- Subject: `Đặt lại mật khẩu tài khoản VHHT`.
- Action URL cho bản GitHub Pages:
  `https://vuhohaitrieu.github.io/mini-community-VHHT/authentication/reset-password-page.html`

Khi chạy local, Firebase vẫn gửi email nhưng liên kết trong template sẽ dùng Action URL đã cấu hình. Có thể lấy `oobCode` từ liên kết và mở trang local để kiểm thử giao diện.

## 2. Firestore Rules

Publish `firestore.rules` trước khi kiểm thử đăng nhập bằng username. Collection `usernames` cần quyền đọc chính xác một document trước khi người dùng đăng nhập.

## 3. Lưu ý về Gmail admin

Không đặt mật khẩu hoặc App Password của Gmail admin trong JavaScript frontend. Mọi người đều có thể xem mã nguồn và chiếm hộp thư nếu làm vậy.

Firebase Authentication bản hiện tại gửi liên kết có mã dùng một lần (`oobCode`). Việc gửi mã số riêng từ `trieuhaimoi0305@gmail.com` và tự đổi mật khẩu Firebase cần một backend tin cậy hoặc SMTP tùy chỉnh; không thể thực hiện an toàn chỉ bằng GitHub Pages/frontend.
