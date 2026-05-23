# mini-community-VHHT

Realtime mini community platform using Firebase + GitHub Pages.

Cấu trúc thư mục:
mini-community-VHHT/
│
├── authentication/
│   ├── login-page.html
│   ├── register-page.html
│   └── authentication-handler.js
│
├── community/
│   ├── community-feed-page.html
│   ├── create-post-handler.js
│   ├── realtime-feed-handler.js
│   └── community-feed-styles.css
│
├── shared/
│   ├── firebase-connection.js
│   ├── global-styles.css
│   ├── notification-handler.js
│   └── loading-screen-handler.js
│
├── assets/
│   ├── icons/
│   ├── images/
│   └── avatars/
│
├── configuration/
│   └── firebase-project-config.js
│
├── README.md
└── .gitignore

Tác dụng từng file:
| File                       | Chức năng                   |
| -------------------------- | --------------------------- |
| login-page.html            | giao diện đăng nhập         |
| register-page.html         | giao diện đăng ký           |
| authentication-handler.js  | xử lý login/register/logout |
| community-feed-page.html   | trang chính sau login       |
| create-post-handler.js     | xử lý đăng bài              |
| realtime-feed-handler.js   | realtime bài viết           |
| firebase-connection.js     | kết nối Firebase            |
| firebase-project-config.js | chứa firebaseConfig         |
| global-styles.css          | CSS dùng toàn web           |
| community-feed-styles.css  | CSS riêng trang feed        |
