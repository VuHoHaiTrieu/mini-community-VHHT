# 🌐 [mini-community-VHHT](https://vuhohaitrieu.github.io/mini-community-VHHT/)

Một nền tảng mạng xã hội thu nhỏ hoạt động theo thời gian thực (Realtime mini community platform), được xây dựng bằng **Firebase** và triển khai trên **GitHub Pages**.

---

## 📁 Cấu trúc thư mục & Chức năng (Project Structure)

Dưới đây là sơ đồ kiến trúc hệ thống và vai trò chi tiết của từng tệp tin trong dự án:

```text
mini-community-VHHT/
├── 📁 admin/                           # PHÂN HỆ QUẢN TRỊ VIÊN (ADMIN)
│   ├── ⚙️ admin-authentication-guard.js # - Bảo vệ tuyến đường admin (Lớp bảo vệ quyền truy cập)
│   ├── 📄 admin-dashboard-page.html     # - Giao diện bảng điều khiển admin (Dashboard trung tâm)
│   ├── 🎨 admin-dashboard-styles.css    # - Định dạng giao diện admin (CSS trang quản trị)
│   ├── ⚙️ admin-post-management.js     # - Quản lý bài viết (Xử lý duyệt, xóa bài viết vi phạm)
│   ├── ⚙️ admin-statistics-handler.js   # - Thống kê số liệu hệ thống (Số user, bài viết, tương tác)
│   └── ⚙️ admin-user-management.js     # - Quản lý tài khoản người dùng (Tìm kiếm, khóa/mở tài khoản)
│
├── 📁 authentication/                  # PHÂN HỆ XÁC THỰC NGƯỜI DÙNG
│   ├── 📄 login-page.html               # - Giao diện đăng nhập (Màn hình điền tài khoản, mật khẩu)
│   ├── 📄 register-page.html            # - Giao diện đăng ký (Màn hình tạo tài khoản mới)
│   └── ⚙️ authentication-handler.js    # - Xử lý login/register/logout (Logic Firebase Auth)
│
├── 📁 community/                       # PHÂN HỆ MẠNG XÃ HỘI CỘNG ĐỒNG
│   ├── 📄 community-feed-page.html     # - Trang chính sau login (Giao diện bảng tin Newfeed)
│   ├── 🎨 community-feed-styles.css    # - CSS riêng trang feed (Định dạng khung bài viết, tương tác)
│   ├── ⚙️ create-post-handler.js        # - Xử lý đăng bài (Kiểm tra và đẩy bài viết mới lên Database)
│   └── ⚙️ realtime-feed-handler.js      # - Realtime bài viết (Tự động cập nhật bài mới không reload)
│
├── 📁 shared/                          # THÀNH PHẦN DÙNG CHUNG TOÀN HỆ THỐNG
│   ├── ⚙️ firebase-connection.js       # - Kết nối Firebase (Khởi tạo kết nối ứng dụng lõi)
│   ├── 🎨 global-styles.css            # - CSS dùng toàn web (Quy chuẩn màu sắc, font chữ chung)
│   ├── ⚙️ notification-handler.js       # - Xử lý thông báo (Hiển thị hộp thoại Toast/Alert nổi)
│   └── ⚙️ loading-screen-handler.js     # - Xử lý màn hình chờ (Bật/tắt hiệu ứng loading khi tải dữ liệu)
│
├── 📁 configuration/                   # CẤU HÌNH DỰ ÁN
│   └── ⚙️ firebase-project-config.js   # - Khóa cấu hình (Thông số bảo mật kết nối dự án Firebase)
│
├── 📄 .gitignore                       # Tệp cấu hình các file Git sẽ bỏ qua không đẩy lên repo
├── 📄 README.md                        # Tệp tài liệu hướng dẫn tổng quan dự án (File này)
└── 📄 index.html                       # Cổng vào chính (Tự động điều hướng tới trang đăng nhập)
```
---

## 🛠️ Công nghệ sử dụng

- **Frontend:** HTML5, CSS3, JavaScript (Vanilla JS)
- **Backend Service:** Firebase (Authentication, Firestore / Realtime Database)
- **Hosting:** GitHub Pages
