<div align="center">

# mini-community-VHHT

### Mạng xã hội mini thời gian thực trong một không gian vũ trụ tương tác

[![Truy cập VHHT Community](https://img.shields.io/badge/_TRUY_CẬP_WEBSITE-VHHT_Community-2563eb?style=for-the-badge)](https://vuhohaitrieu.github.io/mini-community-VHHT/)

**Website:** [https://vuhohaitrieu.github.io/mini-community-VHHT/](https://vuhohaitrieu.github.io/mini-community-VHHT/)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=111827)
![Firebase](https://img.shields.io/badge/Firebase-Authentication_%26_Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=111827)
![Cloudinary](https://img.shields.io/badge/Cloudinary-Media-3448C5?style=flat-square&logo=cloudinary&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-Deployment-222222?style=flat-square&logo=github&logoColor=white)

</div>

---

## Giới thiệu

**mini-community-VHHT** là một mạng xã hội mini được xây dựng theo chủ đề không gian. Thay vì hiển thị bảng tin theo danh sách truyền thống, các bài viết xuất hiện như những **tín hiệu/thiên thạch trôi trong vũ trụ**, có quỹ đạo riêng, hình dạng khác nhau và đôi lúc va chạm rồi nảy ra khỏi nhau.

Dự án được viết bằng HTML, CSS và JavaScript ES Modules, không phụ thuộc framework giao diện. Firebase chịu trách nhiệm xác thực và đồng bộ dữ liệu thời gian thực; Cloudinary lưu trữ hình ảnh, video; GitHub Pages cung cấp website tĩnh.

## Điểm nổi bật

- Giao diện vũ trụ riêng biệt với sao, quỹ đạo, hiệu ứng phát tín hiệu và bài viết trôi nổi.
- Responsive cho máy tính, máy tính bảng, điện thoại và màn hình ngang.
- Đăng ký, đăng nhập, kiểm tra dữ liệu nhập và thông báo trạng thái chuyên nghiệp.
- Đồng bộ bài viết, bình luận, thông báo, tin nhắn và trạng thái hoạt động theo thời gian thực.
- Đăng nội dung chữ, ảnh hoặc video với ba mức quyền riêng tư.
- Tương tác cảm xúc, bình luận, trả lời bình luận và đính kèm media.
- Hồ sơ cá nhân có ảnh đại diện, ảnh bìa, tiểu sử, thông tin giới thiệu và quyền riêng tư.
- Căn chỉnh vị trí, kéo và thu phóng ảnh đại diện/ảnh bìa trước khi lưu.
- Kết bạn hai chiều, danh sách bạn bè, gợi ý bạn chung, tìm kiếm và hủy kết bạn.
- Trạm liên lạc dành cho bạn bè với tin nhắn, media, trạng thái đang soạn và đã xem.
- Ghi chú 24 giờ dành cho bạn bè theo phong cách Messenger.
- Trung tâm thông báo cho lời mời kết bạn, cảm xúc, bình luận và hoạt động liên quan.
- Khu quản trị riêng để theo dõi thống kê, người dùng và nội dung hệ thống.

## Mục lục

- [Kiến trúc tổng quan](#kiến-trúc-tổng-quan)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Các phân hệ chức năng](#các-phân-hệ-chức-năng)
- [Mô hình dữ liệu Firestore](#mô-hình-dữ-liệu-firestore)
- [Quy ước lưu trữ media](#quy-ước-lưu-trữ-media)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Cài đặt và chạy cục bộ](#cài-đặt-và-chạy-cục-bộ)
- [Cấu hình Firebase](#cấu-hình-firebase)
- [Cấu hình Cloudinary](#cấu-hình-cloudinary)
- [Triển khai](#triển-khai)
- [Kiểm tra trước khi phát hành](#kiểm-tra-trước-khi-phát-hành)
- [Bảo mật và lưu ý vận hành](#bảo-mật-và-lưu-ý-vận-hành)

## Kiến trúc tổng quan

```text
Trình duyệt người dùng
        │
        ├── HTML/CSS/JavaScript ES Modules
        │       ├── Authentication
        │       ├── Community Feed
        │       ├── User Profile
        │       ├── Messages
        │       └── Admin Dashboard
        │
        ├── Firebase Authentication ── xác thực và phiên đăng nhập
        ├── Cloud Firestore ────────── dữ liệu và cập nhật thời gian thực
        └── Cloudinary ─────────────── ảnh/video và metadata media
```

Ứng dụng là một **frontend tĩnh**. Trình duyệt kết nối trực tiếp đến Firebase và Cloudinary thông qua cấu hình công khai. Quyền truy cập dữ liệu được bảo vệ bởi Firebase Authentication và `firestore.rules`.

## Công nghệ sử dụng

| Nhóm | Công nghệ | Vai trò |
|---|---|---|
| Giao diện | HTML5, CSS3 | Cấu trúc trang, hiệu ứng, responsive và accessibility cơ bản |
| Logic | JavaScript ES Modules | Xử lý nghiệp vụ và tổ chức module phía trình duyệt |
| Xác thực | Firebase Authentication | Đăng ký, đăng nhập, đăng xuất và quản lý phiên |
| Cơ sở dữ liệu | Cloud Firestore | Người dùng, bài viết, bình luận, quan hệ bạn bè, thông báo và tin nhắn realtime |
| Media | Cloudinary unsigned upload | Lưu ảnh đại diện, ảnh bìa, ảnh/video bài viết, bình luận và tin nhắn |
| Icon | Font Awesome | Hệ thống biểu tượng giao diện |
| Phông chữ | Google Fonts | Poppins và Plus Jakarta Sans |
| Hosting | GitHub Pages | Triển khai website tĩnh công khai |

## Các phân hệ chức năng

### 1. Xác thực

- Đăng ký bằng tên hiển thị, email và mật khẩu.
- Đăng nhập và điều hướng theo vai trò `user` hoặc `admin`.
- Kiểm tra hợp lệ từng trường, độ mạnh mật khẩu và xác nhận mật khẩu.
- Hiện/ẩn mật khẩu, trạng thái đang xử lý, thông báo thành công hoặc thất bại.
- Giao diện vũ trụ có sao, phi hành gia, card tương tác và tối ưu bàn phím điện thoại.

### 2. Không gian cộng đồng

- Bài viết trôi nổi với vị trí, tốc độ, quỹ đạo và hình dạng ngẫu nhiên.
- Thỉnh thoảng kích hoạt va chạm vật lý và hiệu ứng nảy giữa các bài viết.
- Kéo không gian để khám phá bài viết trên máy tính và thiết bị cảm ứng.
- Tìm thành viên theo tên hiển thị hoặc ID được phép công khai.
- Đăng nhanh nội dung, ảnh/video và chọn `Công khai`, `Bạn bè` hoặc `Chỉ mình tôi`.
- Xem chi tiết bài viết, media, cảm xúc, bình luận và luồng trả lời.
- Trung tâm thông báo và huy hiệu tin nhắn chưa đọc.

### 3. Hồ sơ cá nhân

- Phân biệt rõ hồ sơ của bản thân và hồ sơ người khác.
- Chỉnh sửa tên hiển thị, tiểu sử, ngày sinh, giới tính, nơi sống và công việc/học vấn.
- Đổi, căn chỉnh, thu phóng hoặc xóa ảnh đại diện và ảnh bìa.
- Thiết lập quyền xem trạng thái hoạt động, danh sách bạn bè và thông tin tài khoản.
- Đăng, sửa, xóa, đổi quyền riêng tư và tương tác bài viết ngay trên hồ sơ.
- Danh sách bạn bè, gợi ý bạn chung, nhắn tin và hủy kết bạn.

### 4. Trạm liên lạc

- Chỉ hiển thị người có quan hệ bạn bè hợp lệ.
- Tin nhắn thời gian thực, số lượng chưa đọc, mốc tin mới và trạng thái đã xem.
- Hiển thị trạng thái đang soạn và hoạt động gần nhất.
- Gửi nội dung chữ, hình ảnh hoặc video.
- Ghi chú tồn tại 24 giờ và chỉ bạn bè được phép xem.
- Danh sách hội thoại được sắp xếp theo hoạt động và trạng thái online.

### 5. Quản trị hệ thống

- Chặn truy cập dashboard nếu tài khoản không có vai trò `admin`.
- Thống kê tổng người dùng, người hoạt động, bài viết và nội dung bị ẩn.
- Tìm kiếm, xem, đình chỉ, khôi phục, phân quyền và quản lý người dùng.
- Tìm kiếm, ẩn, khôi phục hoặc xóa vĩnh viễn bài viết.
- Truy cập hồ sơ admin hoặc tham gia cộng đồng với dấu hiệu `ADMIN`.
- Sidebar responsive và điều hướng nhanh giữa các khu vực quản trị.

## Mô hình dữ liệu Firestore

| Collection/document | Nội dung chính |
|---|---|
| `users/{userId}` | Hồ sơ, vai trò, quyền riêng tư, bạn bè, lời mời kết bạn và trạng thái hoạt động |
| `posts/{postId}` | Nội dung bài viết, tác giả, quyền riêng tư, media, cảm xúc và số bình luận |
| `posts/{postId}/comments/{commentId}` | Bình luận, trả lời, media và cảm xúc của bình luận |
| `notifications/{notificationId}` | Thông báo kết bạn, bài viết, cảm xúc, bình luận và trạng thái đã đọc |
| `messageNotifications/{notificationId}` | Thông báo tin nhắn mới theo người gửi/người nhận |
| `messengerNotes/{userId}` | Một ghi chú đang hoạt động của người dùng, danh sách được xem và thời điểm hết hạn |
| `conversations/{conversationId}` | Thành viên hội thoại, trạng thái đang soạn và metadata hội thoại |
| `conversations/{conversationId}/messages/{messageId}` | Tin nhắn chữ/media, người gửi, người nhận, thời gian gửi và thời gian đã xem |

Các listener `onSnapshot()` giúp giao diện cập nhật ngay khi Firestore thay đổi mà không cần tải lại trang.

## Quy ước lưu trữ media

> Dự án hiện **không sử dụng Firebase Storage**. Toàn bộ ảnh và video do người dùng tải lên được lưu tại Cloudinary.

- Không lưu Base64, Data URL, Blob hoặc dữ liệu nhị phân trong Firestore.
- Firestore chỉ lưu URL Cloudinary, public ID và metadata cần thiết.
- Các trường tương thích dữ liệu cũ như `photoURL`, `coverURL` và `attachedImage` vẫn được duy trì.
- Metadata chuẩn gồm `mediaUrl`, `mediaPublicId`, `mediaFormat`, `mediaBytes`, `mediaWidth`, `mediaHeight` và `mediaDuration`.
- API Secret của Cloudinary tuyệt đối không được đặt trong frontend hoặc commit lên repository.

## Cấu trúc dự án

> Cây dưới đây liệt kê toàn bộ file hiện có trong dự án và nhiệm vụ chính của từng file.

```text
mini-community-VHHT/
│
├── index.html
│   └── Điểm vào của website; chuyển người dùng tới trang đăng nhập.
│
├── admin/
│   ├── admin-dashboard-page.html
│   │   └── Cấu trúc dashboard, sidebar, thống kê, bảng người dùng và bài viết.
│   ├── admin-authentication-guard.js
│   │   └── Kiểm tra quyền admin, khôi phục/hiển thị danh tính và xử lý đăng xuất.
│   ├── admin-navigation-handler.js
│   │   └── Chuyển trang con Dashboard, Người dùng và Bài viết trong giao diện quản trị.
│   ├── admin-statistics-handler.js
│   │   └── Đọc Firestore và tổng hợp các chỉ số quản trị.
│   ├── admin-user-management.js
│   │   └── Theo dõi, tìm kiếm, đình chỉ, khôi phục, xóa mềm và thay đổi vai trò người dùng.
│   ├── admin-post-management.js
│   │   └── Theo dõi, tìm kiếm, xem, ẩn, khôi phục và xóa bài viết.
│   ├── admin-responsive.js
│   │   └── Menu mobile, overlay, nhãn accessibility và bảng responsive.
│   ├── admin-dashboard-styles.css
│   │   └── Bộ style nền tảng của dashboard.
│   ├── admin-professional.css
│   │   └── Lớp hoàn thiện giao diện, card, bảng và trạng thái quản trị.
│   ├── admin-v2.css
│   │   └── Chủ đề dashboard thế hệ mới và các override bố cục.
│   ├── admin-command-center.css
│   │   └── Phong cách trung tâm chỉ huy, hiệu ứng và nhận diện quản trị.
│   └── admin-responsive.css
│       └── Breakpoint và bố cục riêng cho tablet/điện thoại.
│
├── authentication/
│   ├── login-page.html
│   │   └── Trang đăng nhập và liên kết tới đăng ký.
│   ├── register-page.html
│   │   └── Trang tạo tài khoản và liên kết trở lại đăng nhập.
│   ├── authentication-handler.js
│   │   └── Firebase Auth, validation, thông báo, tạo hồ sơ Firestore và điều hướng theo vai trò.
│   ├── authentication-pages-styles.css
│   │   └── Hệ thống style chính dùng chung cho đăng nhập và đăng ký.
│   ├── authentication-enhancements.css
│   │   └── Hoàn thiện card, trường nhập, trạng thái và hiệu ứng tương tác.
│   ├── authentication-page-effects.css
│   │   └── Style sao, phi hành gia, loader và hiệu ứng giao tiếp của card.
│   ├── authentication-page-effects.js
│   │   └── Sinh nền sao/phi hành gia, điều khiển loader, card glow và hỗ trợ bàn phím mobile.
│   └── authentication-responsive.css
│       └── Responsive chuyên biệt cho hai trang authentication.
│
├── community/
│   ├── community-feed-page.html
│   │   └── Trang cộng đồng chính, toolbar, feed, composer, thông báo và modal bài viết.
│   ├── realtime-feed-handler.js
│   │   └── Feed realtime, thiên thạch, va chạm, tìm kiếm, thông báo, chi tiết bài và bình luận.
│   ├── create-post-handler.js
│   │   └── Chọn media, preview, upload Cloudinary, quyền riêng tư và tạo bài viết.
│   ├── community-feed-styles.css
│   │   └── Style cốt lõi của không gian, bài viết, modal, bình luận và toolbar.
│   ├── community-layout-fixes.css
│   │   └── Các override ổn định bố cục desktop/mobile và modal chi tiết.
│   ├── community-responsive.css
│   │   └── Responsive toàn trang, feed mobile, notification panel và chi tiết bài theo tab.
│   ├── community-toolbar.css
│   │   └── Thanh công cụ, logo, tìm kiếm, profile, thông báo và nút quản trị.
│   ├── admin-mode-position.css
│   │   └── Vị trí và hiển thị công cụ quản trị khi admin vào cộng đồng.
│   ├── post-detail-fixes.css
│   │   └── Cấu trúc ổn định cho bài viết, cây bình luận và ô nhập cố định.
│   ├── reaction-usability.css
│   │   └── Vùng tương tác và bộ chọn cảm xúc dễ sử dụng hơn.
│   │
│   ├── messages/
│   │   ├── messages-page.html
│   │   │   └── Cấu trúc Trạm liên lạc, danh sách hội thoại, ghi chú và khung chat.
│   │   ├── messages-logic.js
│   │   │   └── Bạn bè, hội thoại, tin nhắn, media, ghi chú 24 giờ, typing và seen realtime.
│   │   ├── messages-enhancements.js
│   │   │   └── Badge chưa đọc, gửi bằng Enter và chuyển chế độ chat trên mobile.
│   │   ├── messages-responsive.js
│   │   │   └── Nút quay lại và trạng thái sidebar/chat dành cho điện thoại.
│   │   ├── messages-styles.css
│   │   │   └── Style nền tảng cho sidebar, danh sách bạn bè, hội thoại và composer.
│   │   ├── messages-notes.css
│   │   │   └── Bong bóng ghi chú, modal tạo/xem và dải bạn bè hoạt động.
│   │   ├── messages-media.css
│   │   │   └── Preview, hiển thị và thao tác ảnh/video trong tin nhắn.
│   │   ├── messages-realtime.css
│   │   │   └── Trạng thái chưa đọc, đang soạn, đã gửi và đã xem.
│   │   └── messages-responsive.css
│   │       └── Bố cục Trạm liên lạc trên desktop, tablet và điện thoại.
│   │
│   └── profile-user/
│       ├── user-profile.html
│       │   └── Cấu trúc hồ sơ, giới thiệu, tài khoản, bạn bè, composer và timeline.
│       ├── user-profile-logic.js
│       │   └── Tải/lưu hồ sơ realtime, quyền xem, điều hướng, trạng thái và quan hệ bạn bè.
│       ├── profile-enhancements.js
│       │   └── Upload/căn chỉnh ảnh, lightbox, quyền riêng tư và modal danh sách bạn bè.
│       ├── profile-posts-logic.js
│       │   └── Bài viết hồ sơ realtime, media, cảm xúc, bình luận, sửa/xóa và quyền riêng tư.
│       ├── friend-suggestions.js
│       │   └── Gợi ý kết bạn theo bạn chung và gửi lời mời.
│       ├── profile-responsive.js
│       │   └── Accordion thông tin và hành vi lớp phủ trên mobile.
│       ├── user-profile-style.css
│       │   └── Style nền tảng của hồ sơ cá nhân.
│       ├── profile-social.css
│       │   └── Timeline, composer, bài viết, bình luận và các import CSS chức năng.
│       ├── profile-responsive.css
│       │   └── Responsive tổng thể cho hồ sơ và các thành phần tương tác.
│       ├── profile-enhancements.css
│       │   └── Lightbox, căn ảnh, danh sách bạn bè và các nút nâng cao.
│       ├── profile-interaction-fixes.css
│       │   └── Hiệu ứng cảm xúc, bình luận và trạng thái tương tác.
│       ├── profile-experience.css
│       │   └── Thu phóng media, trải nghiệm select và cầu nối reaction picker.
│       ├── profile-readonly.css
│       │   └── Chế độ chỉ xem khi mở hồ sơ người khác.
│       ├── profile-comment-media.css
│       │   └── Đính kèm và hiển thị media trong bình luận hồ sơ.
│       ├── profile-simple-selects.css
│       │   └── Select tùy chỉnh cho thông tin giới thiệu.
│       ├── profile-main-privacy.css
│       │   └── Điều khiển quyền riêng tư thông tin hồ sơ.
│       ├── profile-composer-privacy.css
│       │   └── Menu quyền riêng tư trong composer hồ sơ.
│       ├── profile-exact-post-privacy.css
│       │   └── Đồng bộ giao diện chọn quyền bài viết với feed cộng đồng.
│       └── cancel-compose-danger.css
│           └── Trạng thái cảnh báo khi hủy nội dung đang soạn.
│
├── shared/
│   ├── firebase-connection.js
│   │   └── Khởi tạo và export Firebase App, Authentication và Firestore.
│   ├── cloudinary-media-service.js
│   │   └── Validate, upload ảnh/video, theo dõi tiến trình và chuẩn hóa metadata Cloudinary.
│   ├── friendship-service.js
│   │   └── Đọc, chấp nhận, sửa chữa, xác minh và xóa quan hệ bạn bè hai chiều.
│   ├── presence-handler.js
│   │   └── Ghi nhận hoạt động và xác định người dùng đang online.
│   ├── user-identity.js
│   │   └── Chuẩn hóa tên hiển thị, avatar và phát hiện tên hệ thống tạm thời.
│   ├── authored-post-cache.js
│   │   └── Ghi nhớ ID bài viết do người dùng tạo để hỗ trợ phục hồi/tương thích dữ liệu.
│   ├── global-styles.css
│   │   └── Các style dùng chung toàn dự án.
│   ├── responsive-foundation.css
│   │   └── Nền tảng responsive, safe area, touch target và accessibility.
│   ├── cloudinary-upload.css
│   │   └── Thanh tiến trình và trạng thái upload media.
│   ├── destructive-actions.css
│   │   └── Style thống nhất cho thao tác xóa/hủy nguy hiểm.
│   └── assets/
│       └── default-avatar.png
│           └── Ảnh đại diện mặc định khi người dùng chưa đặt avatar.
│
├── configuration/
│   ├── firebase-project-config.js
│   │   └── Cấu hình Firebase Web App công khai của dự án.
│   └── cloudinary-config.js
│       └── Cloud name, unsigned upload preset, endpoint và asset folder Cloudinary.
│
├── firestore.rules
│   └── Quy tắc bảo mật Firestore cho user, post, comment, notification, note và conversation.
├── firebase.json
│   └── Khai báo file rules dùng khi triển khai bằng Firebase CLI.
├── .firebaserc
│   └── Liên kết Firebase CLI với project `mini-community-vhht`.
├── .gitignore
│   └── Loại trừ `node_modules/` và `.env` khỏi Git.
└── README.md
    └── Tài liệu giới thiệu, cấu hình, vận hành và cấu trúc dự án.
```

## Cài đặt và chạy cục bộ

### Yêu cầu

- Trình duyệt hiện đại hỗ trợ ES Modules.
- Một HTTP server cục bộ, ví dụ VS Code Live Server.
- Firebase project đã bật Email/Password Authentication và Cloud Firestore.
- Cloudinary account có unsigned upload presets tương ứng.
- Firebase CLI chỉ cần thiết khi muốn triển khai Firestore Rules.

### Các bước

```bash
git clone https://github.com/VuHoHaiTrieu/mini-community-VHHT.git
cd mini-community-VHHT
```

1. Kiểm tra cấu hình Firebase tại `configuration/firebase-project-config.js`.
2. Kiểm tra Cloudinary tại `configuration/cloudinary-config.js`.
3. Mở thư mục dự án bằng VS Code.
4. Khởi chạy `index.html` bằng Live Server.
5. Truy cập địa chỉ do Live Server cung cấp, thường là `http://127.0.0.1:5500/`.

Không mở trực tiếp bằng `file://`, vì các JavaScript ES Modules và request tới dịch vụ ngoài cần chạy qua HTTP/HTTPS.

## Cấu hình Firebase

### Authentication

Trong Firebase Console:

1. Mở **Authentication → Sign-in method**.
2. Bật nhà cung cấp **Email/Password**.
3. Thêm domain triển khai vào **Authorized domains** nếu cần.

### Firestore

Tạo Cloud Firestore và triển khai rules trong repository:

```bash
firebase login
firebase use mini-community-vhht
firebase deploy --only firestore:rules
```

Hoặc sao chép nội dung `firestore.rules` vào **Firebase Console → Firestore Database → Rules** và chọn **Publish**.

> Cập nhật file rules trên máy không tự thay đổi rules đang hoạt động trên Firebase. Sau mỗi lần sửa quyền dữ liệu, cần deploy hoặc Publish lại.

## Cấu hình Cloudinary

Cấu hình frontend nằm tại `configuration/cloudinary-config.js`.

Các unsigned upload preset mặc định:

| Loại | Preset | Asset folder |
|---|---|---|
| Ảnh | `vhht_images` | `mini-community-vhht/images` |
| Video | `vhht_videos` | `mini-community-vhht/videos` |

Trong Cloudinary Console, hai preset phải tồn tại và cho phép **Unsigned upload**. Chỉ đặt cloud name, preset và endpoint công khai trong frontend; không để API Secret trong mã nguồn.

## Triển khai

### GitHub Pages

1. Đẩy mã nguồn lên nhánh dùng để phát hành.
2. Mở **Repository Settings → Pages**.
3. Chọn triển khai từ branch và thư mục gốc `/`.
4. Chờ GitHub Pages hoàn tất build.

Website hiện tại:

**[https://vuhohaitrieu.github.io/mini-community-VHHT/](https://vuhohaitrieu.github.io/mini-community-VHHT/)**

### Firestore Rules

GitHub Pages chỉ triển khai frontend. Firestore Rules phải được triển khai riêng bằng Firebase CLI hoặc Firebase Console.

## Kiểm tra trước khi phát hành

- [ ] Đăng ký tài khoản mới và kiểm tra tên hiển thị được lưu đúng.
- [ ] Đăng nhập tài khoản user và admin; kiểm tra đúng trang đích.
- [ ] Đổi avatar/ảnh bìa, tải lại trang và xác nhận dữ liệu không mất.
- [ ] Đăng bài chữ, ảnh và video với đủ ba quyền riêng tư.
- [ ] Kiểm tra bài viết trên feed, hồ sơ và modal chi tiết.
- [ ] Thử cảm xúc, bình luận, trả lời và media bình luận.
- [ ] Gửi, chấp nhận, từ chối và hủy kết bạn từ hai tài khoản.
- [ ] Kiểm tra danh sách bạn bè của cả hai phía luôn đối xứng.
- [ ] Gửi tin nhắn hai chiều, typing, seen, media và badge chưa đọc.
- [ ] Tạo/xóa ghi chú 24 giờ và kiểm tra tài khoản bạn bè nhận realtime.
- [ ] Kiểm tra trung tâm thông báo và điều hướng tới đúng nội dung.
- [ ] Kiểm tra quyền quản trị, ẩn/khôi phục bài và trạng thái tài khoản.
- [ ] Kiểm tra ở 320 px, điện thoại phổ biến, tablet và desktop.
- [ ] Kiểm tra Console không có lỗi import, permission hoặc upload.
- [ ] Kiểm tra `git diff` để không đưa secret hoặc dữ liệu cá nhân vào commit.

## Bảo mật và lưu ý vận hành

- Firebase Web config trong frontend là thông tin định danh công khai, không phải khóa quản trị. Bảo mật thực tế dựa vào Authentication và Firestore Rules.
- Không commit Cloudinary API Secret, Firebase service-account key, mật khẩu hoặc token.
- Dùng unsigned preset có giới hạn định dạng, kích thước và folder phù hợp.
- Mọi thao tác admin phải được kiểm tra lại ở Firestore Rules, không chỉ ẩn nút trên giao diện.
- Dữ liệu quan hệ bạn bè cần được cập nhật hai chiều; `shared/friendship-service.js` là nguồn logic dùng chung.
- Khi thay đổi schema Firestore, cần giữ trường tương thích hoặc chuẩn bị bước migration dữ liệu cũ.
- Khi thay đổi đường dẫn file, phải cập nhật import tương đối và đường dẫn GitHub Pages tương ứng.

## Định hướng phát triển

- Hoàn thiện chat nhóm và quản lý thành viên nhóm.
- Bổ sung thông báo đẩy trên trình duyệt.
- Tối ưu truy vấn bằng index và pagination khi lượng dữ liệu tăng.
- Thêm kiểm thử tự động cho xác thực, quyền riêng tư và quan hệ bạn bè.
- Bổ sung backend tin cậy cho thao tác quản trị và xóa media Cloudinary.
- Cải thiện accessibility theo WCAG và điều hướng hoàn toàn bằng bàn phím.

---

<div align="center">

Được phát triển cho **VHHT Cosmic Community** — nơi mỗi bài viết là một tín hiệu đang bay trên quỹ đạo riêng.

[🚀 Mở website](https://vuhohaitrieu.github.io/mini-community-VHHT/) · [⬆ Về đầu trang](#mini-community-vhht)

</div>
