# mini-community-VHHT

Mạng xã hội mini theo chủ đề không gian, viết bằng HTML, CSS và JavaScript modules; triển khai trên GitHub Pages.

## Công nghệ

- Firebase Authentication: đăng ký và đăng nhập.
- Cloud Firestore: người dùng, bài viết, bình luận, thông báo và tin nhắn realtime.
- Cloudinary unsigned upload: avatar, ảnh bìa, ảnh và video bài viết.
- GitHub Pages: static hosting.

## Cấu trúc dự án

```text
mini-community-VHHT/
├── admin/                  Trang và logic quản trị hệ thống
├── authentication/         Đăng nhập, đăng ký và Firebase Auth
├── community/
│   ├── messages/           Nhắn tin giữa bạn bè
│   ├── profile-user/       Hồ sơ, bài viết cá nhân và bạn bè
│   ├── community-feed-page.html
│   ├── create-post-handler.js
│   └── realtime-feed-handler.js
├── configuration/
│   ├── firebase-project-config.js
│   └── cloudinary-config.js
├── shared/
│   ├── firebase-connection.js
│   ├── cloudinary-media-service.js
│   ├── authored-post-cache.js
│   └── presence-handler.js
├── firestore.rules
├── firebase.json
└── index.html
```

## Quy ước dữ liệu media

- Không sử dụng Firebase Storage.
- Không lưu Base64, Data URL, Blob hoặc binary trong Firestore.
- Firestore chỉ lưu URL Cloudinary, public ID và metadata.
- Giữ `photoURL`, `coverURL`, `attachedImage` để tương thích dữ liệu cũ.
- Metadata mới: `mediaUrl`, `mediaPublicId`, `mediaFormat`, `mediaBytes`, `mediaWidth`, `mediaHeight`, `mediaDuration`.

## Cloudinary

Cấu hình public nằm trong `configuration/cloudinary-config.js`. Frontend chỉ sử dụng unsigned upload preset; tuyệt đối không đặt API Secret trong repository.

Preset cần tồn tại:

- Ảnh: `vhht_images`
- Video: `vhht_videos`

## Chạy cục bộ

Dự án dùng JavaScript modules nên cần chạy qua HTTP server, không mở trực tiếp bằng `file://`.

Ví dụ với VS Code Live Server, mở `index.html` hoặc `authentication/login-page.html`.

## Kiểm tra trước khi đưa lên GitHub Pages

1. Đăng nhập và tải lại trang.
2. Đổi avatar và ảnh bìa, sau đó F5.
3. Đăng bài text, ảnh và video.
4. Kiểm tra trang hồ sơ và chi tiết bài viết.
5. Kiểm tra console trình duyệt không có lỗi import hoặc Firestore permission.
6. Không commit API Secret, token hoặc thông tin đăng nhập.
