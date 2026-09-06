# PERFORMANCE AUDIT — VHHT Community

Ngày audit: 2026-09-06  
Phạm vi: toàn bộ repository hiện tại, phân tích tĩnh từ mã nguồn và tài nguyên.  
Nguyên tắc: chỉ audit; không refactor, không thay renderer/framework/FPS/gameplay/effect/service worker và không cài package.

## 1. Executive Summary

VHHT Community là ứng dụng web nhiều trang (MPA) viết bằng HTML/CSS/JavaScript ES modules thuần. Firebase Authentication và Cloud Firestore cung cấp đăng nhập, dữ liệu và realtime; Cloudinary dùng cho media. Không có React, TypeScript, bundler, production build hoặc một “main bundle” duy nhất. Mỗi trang nạp trực tiếp nhiều CSS/JS và Firebase SDK từ CDN.

Kết luận quan trọng nhất từ code:

1. Nghi phạm trực tiếp mạnh nhất của tình trạng nóng/giật ở Community Feed là `initializeFloatingMovement()` trong `community/realtime-feed-handler.js`: mỗi post tạo một vòng `requestAnimationFrame` độc lập, không lưu handle để hủy khi post bị xóa. Trên desktop, mỗi vòng còn duyệt `postCardsMap`, tạo chi phí gần O(N²) theo số card; trên mobile tránh phép quét va chạm nhưng vẫn có N scheduler loop tồn tại suốt đời trang.
2. Feed và nhiều danh sách realtime không có giới hạn/pagination/virtualization. Firestore snapshot có thể đưa toàn bộ post/message vào DOM. Số node, listener bình luận và vòng animation tăng theo dữ liệu/người dùng tương tác.
3. Gravity Tourist không chạy khi người dùng chưa vào route game. Game dùng Canvas2D, DPR mobile đã cap 1 và render cap 30 FPS. Tuy nhiên game vẫn cập nhật physics 60 Hz trên mobile, tạo trail object mỗi tick, `filter` mảng mỗi tick, tạo nhiều CanvasGradient/shadow/glow mỗi frame; HUD còn lọc/sắp xếp tối đa 500 bảng xếp hạng mỗi 100 ms.
4. CSS có mật độ hiệu ứng cao: toàn repo có khoảng 120 `backdrop-filter`, 268 `filter`, 649 `box-shadow`, 136 `animation` và 222 `transition` (đếm occurrence tĩnh). `community/messages/messages.css` đứng đầu với khoảng 40 backdrop filters, 71 filters, 185 shadows và 21 animations. Đây là rủi ro paint/composite lớn trên iPhone.
5. Service worker viết tay dùng stale-while-revalidate cho navigation, CSS/JS và media cùng origin. Shell được precache, game không được precache toàn bộ, nhưng runtime media cache không có giới hạn số lượng/tuổi nên có thể phình theo thời gian.
6. Asset game desktop khoảng 20 MB nén cho tám atlas/background chính; biến thể mobile khoảng 5.66 MB. Chúng được tải theo route game, bốn ảnh ngay khi renderer khởi tạo và bốn ảnh còn lại bị trì hoãn chỉ 180–820 ms, không chờ lúc thật sự cần.

Mức chắc chắn: các kết luận trên là **confirmed từ code** về hành vi; mức tác động thực tế lên FPS/nhiệt là **likely/high confidence**. Không có số profiling thiết bị thật, Lighthouse hay Chrome trace, nên báo cáo không bịa FCP/LCP/TBT/FPS/thermal.

## 2. Current Architecture

### Công nghệ

| Hạng mục | Hiện trạng | Bằng chứng |
|---|---|---|
| Frontend framework | Không có; Vanilla HTML/CSS/JavaScript | Các trang `.html` nạp ES modules trực tiếp |
| Version app | Không có semantic app version; cache version hiện là `vhht-shell-2026-09-06-26` | `service-worker.js:1` |
| TypeScript | Không | Không có `.ts/.tsx`, tsconfig |
| Bundler/build tool | Không | Không có Vite/Webpack/Rollup/Parcel config hoặc root build script |
| Package manager production | Không áp dụng | Không có root `package.json`; `.tmp/rules-tests/package.json` chỉ là test artifact |
| Routing | Multi-page, hard navigation giữa các HTML | `index.html`, `pwa-start.html`, các thư mục route |
| State management | Module globals, DOM state, local/sessionStorage, Firestore snapshots | Các logic route |
| Styling | CSS viết tay; Font Awesome CDN theo trang | Nhiều file CSS route-specific |
| Backend/realtime | Firebase Auth + Cloud Firestore SDK 10.12.2 | Imports từ `gstatic` và `onSnapshot` |
| Media | Cloudinary | `shared/cloudinary-media-service.js` |
| Renderer UI | DOM/CSS; nền/mascot/game có Canvas/CSS animation | Các file bên dưới |
| Game engine | Custom engine | `games/gravity-tourist/core`, `components`, `systems` |
| WebGL/WebGPU | Không dùng cho game hiện tại | Game gọi `getContext('2d')` |
| Three.js | Vendor có trong repo nhưng renderer NOVA hiện chọn `character`; Three chỉ dynamic import khi chọn 3D | `AI/js/config.js`, `AI/js/animations/Nova3DAnimation.js` |

### Sơ đồ thực tế

```text
PWA entry
├── index.html -> authentication/login-page.html
└── pwa-start.html -> Firebase auth gate
    ├── authentication/login-page.html
    └── community/community-feed-page.html
        ├── Feed + notifications + composer
        ├── Messages -> community/messages/messages.html
        ├── Profile -> community/profile-user/user-profile.html
        └── Games -> games/index.html
            └── Gravity Tourist -> games/gravity-tourist/index.html

Shared services
├── Firebase Auth / Firestore (CDN ES modules)
├── Cloudinary media
├── session/presence/performance/PWA helpers
├── NOVA AI mascot (route-loaded)
└── service-worker.js + manifest.webmanifest
```

### Deploy và production

README và đường dẫn hiện tại thể hiện GitHub Pages. `firebase.json` cấu hình Firestore rules/indexes, không phải Firebase Hosting. Không có bước production build/minify/tree-shake/hash. Production là các source file tĩnh được deploy nguyên trạng.

## 3. PWA Architecture

- Service worker: `service-worker.js`, viết tay; đăng ký bởi `pwa-client.js`.
- Manifest: `manifest.webmanifest`; `start_url` là `./pwa-start.html`, `scope` là `./`, display `standalone`, có shortcut feed/messages/games.
- `pwa-start.html` là auth gateway. Lần mở đầu chuyển login; những lần sau đợi Firebase auth state rồi chuyển feed hoặc login, có timeout 8 giây.
- `SHELL_FILES` có 18 URL khai báo và được `cache.addAll()` trong install (`service-worker.js:5-26`). Vì `addAll` là all-or-nothing, một shell URL lỗi có thể làm install thất bại.
- Activate xóa các cache mang prefix `vhht-shell-` không phải version hiện tại và gọi `clients.claim()`.
- Navigation: nếu có cache thì trả cache ngay, đồng thời fetch/cập nhật nền — stale-while-revalidate; nếu thất bại dùng offline page.
- Style/script: stale-while-revalidate.
- Image/font/audio cùng origin: stale-while-revalidate.
- Firebase/Google APIs/Firestore/Cloudinary và cross-origin bị loại khỏi interception.
- Game asset/audio **không nằm toàn bộ trong precache**. Chúng vào runtime cache sau khi route yêu cầu.
- Runtime cache không có max entries, max age, quota handling hay tách cache namespace theo loại. Ảnh/audio đã xem có thể tích lũy.
- Cache cũ theo version được xóa, nhưng nhiều URL/query khác nhau trong cùng version là key khác nhau và tồn tại đến khi version đổi.
- Update: client phát hiện worker `waiting`, có đường gọi skip-waiting/reload. Việc cập nhật không tự biến một worker đang điều khiển thành code mới giữa phiên nếu activation/reload chưa hoàn tất.

**Rủi ro startup cache:** shell chứa cả trang/CSS/JS lớn và ảnh thương hiệu; `addAll` tạo burst request lần cài đầu. Không có bằng chứng game pack bị tải ngay ở install. Tổng byte chính xác của 18 shell URL: **UNKNOWN** trong phiên audit (không có network transfer measurement); raw asset đáng chú ý gồm logo ngang khoảng 836 KB và logo mark khoảng 497 KB.

**Duplicate cache:** không thấy namespace cache thứ hai cạnh tranh. Rủi ro là key trùng nội dung do query URL và cache không giới hạn, không phải hai service worker cache độc lập.

## 4. Startup Flow

```text
Installed PWA
  -> manifest start_url: pwa-start.html
  -> splash/auth gateway DOM
  -> Firebase Auth module + onAuthStateChanged
  -> authenticated: community/community-feed-page.html
     unauthenticated/first launch/logout: authentication/login-page.html
  -> route HTML eagerly loads its own CSS/modules
  -> session guard, feed snapshots, canvas background, delayed NOVA bootstrap
```

`/` hiện redirect sang login; nó không nạp game. Community nạp performance governor, session guard, tìm kiếm, feed realtime, composer, audio/gesture/PWA và delayed AI bootstrap. AI dùng `requestIdleCallback` hoặc fallback timer; config hiện chọn character renderer, nên Three/GLTF không được tải trong nhánh bình thường.

`/games` nạp Game Center và Canvas2D starfield. Nó dynamic-import leaderboard/record/settings services, nhưng không import `Gravity Tourist` engine/renderer.

`/games/gravity-tourist` mới nạp engine, physics, renderer, assets và game audio manager. Vì là hard navigation, rời route phá document; game không tiêu tốn CPU trong feed/Game Center. Bfcache behavior trên từng trình duyệt chưa được đo.

## 5. Bundle Analysis

Project không có bundle/chunk/build. Vì vậy:

```text
Initial JS: NOT APPLICABLE (nhiều source module trực tiếp; network transfer UNKNOWN)
Initial CSS: NOT APPLICABLE (nhiều stylesheet trực tiếp; network transfer UNKNOWN)
Largest chunk: NOT APPLICABLE
Largest dependency file trong repo: AI/js/vendor/three.module.js ~1.315 MB raw
Game chunk: NOT APPLICABLE; game là route riêng
```

Raw route entry references, chỉ tính local file trực tiếp trong HTML, không phải transfer trace và không bao gồm transitive imports/CDN:

| Route | Local references | Raw bytes xấp xỉ |
|---|---:|---:|
| Login | 17 | 1.55 MB |
| Community | 43 | 1.94 MB |
| Messages | 24 | 3.37 MB |
| Profile | 30 | 1.55 MB |
| Game Center | 23 | 1.51 MB |
| Gravity HTML direct refs | 21 | 0.13 MB + transitive JS/assets |

Các source lớn: `community/realtime-feed-handler.js` ~200 KB, `community/messages/messages.css` ~200 KB, `community/messages/messages-logic.js` ~185 KB, `community/profile-user/profile-page.css` ~112 KB, `GLTFLoader.js` ~110 KB. Three/GLTF không phải initial dependency trong config mascot hiện tại.

## 6. Route/Lazy Loading Analysis

| Route | Cách nạp | Game engine/assets? | Hoạt động chính |
|---|---|---|---|
| `/` | Redirect | Không | Redirect login |
| Login | Eager page assets | Không | Firebase auth, UI animation |
| Community Feed | Eager route scripts; NOVA delayed/dynamic | Không | Firestore snapshots, canvas universe, per-post RAF |
| Messages | Hard route | Không | Conversations/messages/notes snapshots, DOM chat |
| Profile | Hard route | Không | Profile/posts/saved/note snapshots, star canvas |
| `/games` | Hard route; một số dynamic imports | Không có Gravity engine | Starfield, settings/records/leaderboard data |
| Gravity Tourist | Hard route; ES module graph | Có | Engine/physics/render/audio/assets |

Kết luận: **Game lazy-loaded: YES theo route isolation**, không phải code-split chunk của bundler. Feed/chat/profile cũng tách bằng tài liệu HTML, không cùng chạy sau hard navigation.

## 7. Main Thread Analysis

Không có Chrome performance trace trong môi trường audit, nên long task >50 ms, scripting/paint/composite time là **UNKNOWN**. Các điểm code có khả năng tạo spike:

- Mỗi Firestore feed snapshot merge tất cả nguồn, duyệt toàn bộ post để create/update rồi duyệt toàn bộ card để remove; query không limit.
- N vòng RAF của N feed card; desktop mỗi vòng duyệt `postCardsMap`.
- Message snapshot render lịch sử không có virtualization; nội dung HTML lớn và enhancement hậu render.
- Gravity renderer tạo nhiều gradients, shadow blur, paths và chuỗi màu mỗi frame.
- `updateChaseHud()` lọc/sort tối đa 500 entry mỗi 100 ms khi đang chơi.
- Ảnh lớn decode gần nhau trong 0.82 giây đầu route game.

Forced layout có thể xuất hiện ở các đoạn đọc `getBoundingClientRect` rồi ghi style. Game renderer chỉ đọc rect trong `resize()`, không mỗi frame. Feed movement sử dụng vị trí/state riêng phần lớn, nhưng các placement/menu/resize flows có đọc geometry. Không đủ runtime trace để xác nhận layout thrashing cụ thể.

## 8. RAF / Timer / Event Listener / Observer Audit

### RAF quan trọng

| File/function | Mục đích | Bắt đầu | Dừng | Cleanup OK? |
|---|---|---|---|---|
| `community/realtime-feed-handler.js:1367` `initializeFloatingMovement` | Di chuyển từng card | Mỗi card được tạo | Không có stop flag/handle khi card remove | **NO — critical** |
| `community/realtime-feed-handler.js:928` universe | Nền sao | Init feed | Vẫn request RAF; hidden branch bỏ render nhưng scheduling/browsers throttle | Partial |
| Cùng file `scheduleShootingStars` | Sao băng recursive timeout | Desktop/full motion | Không có explicit lifetime cancel | Partial |
| `games/_game-center/scripts/game-center.js:58` | Starfield | Init games route | cancel khi hidden, restart visible | Yes for visibility; no explicit unload remove needed in MPA |
| `games/gravity-tourist/core/GameLoop.js` | Game loop | Intro/play | pause/menu/gameover/hidden | Yes trong page lifecycle |
| `games/gravity-tourist/services/GameAudio.js` | Music fades | Đổi/dừng nhạc | Tự kết thúc | Mostly; overlapping fade possible |
| `community/profile-user/user-profile-logic.js:545` | Profile stars | Init nếu không low-power | cancel hidden | Yes for visibility |
| `community/messages/messages-logic.js:1889` | Voice waveform | Recording | Stop recording | Yes |
| `shared/mobile-keyboard-controller.js` | Coalesce viewport writes | resize/viewport event | frame coalesced | Yes enough for singleton page |
| `AI/...Nova3DAnimation.js` | 3D render | Chỉ nếu 3D renderer được chọn | destroy path có cancel | Inactive under current config |

Mobile feed hidden/list/filtered card dùng recursive `setTimeout(() => requestAnimationFrame(...))`; đây không phải cleanup mà chỉ polling chậm hơn. Card đã remove vẫn bị closure giữ và tiếp tục schedule.

### Timer dài hạn

| Timer | Chu kỳ/phạm vi | Cleanup |
|---|---|---|
| Feed presence heartbeat | 45 s, feed auth session | Có biến timer và auth cleanup |
| Single-session heartbeat | định kỳ, các route dùng guard | Có cleanup khi auth state đổi |
| Shared presence heartbeat | 45 s ở route dùng module | Có return cleanup trong service |
| NOVA behavior ambient | interval ~8.5 s sau delay ~2.2 s | `destroy()` có clear; root thường tồn tại hết page |
| Feed shooting stars | recursive timeout desktop | Không có explicit cancellation token |
| Profile locate post | 120 ms, tối đa 20 lần | Tự clear |
| Messages voice duration | 1 s khi recording | Clear khi stop |
| Gravity deferred images | 180/420/650/820 ms | Một lần; không cancel khi renderer không còn cần trong cùng page |

Không thấy SPA mount/unmount nên nhiều page-singleton listener tự biến mất khi hard navigation. Tuy vậy, các đối tượng bị remove trong cùng feed page là ngoại lệ và loop card thực sự không được giải phóng.

### Event listeners

Occurrence tĩnh nổi bật: feed ~107 `addEventListener`, messages logic ~51, profile workspace ~41, profile posts ~37, game entry ~33. Số `removeEventListener` thấp hơn nhiều nhưng occurrence không đồng nghĩa leak: phần lớn module khởi tạo đúng một lần cho vòng đời document. Rủi ro cụ thể:

- `resize`, `pointermove`, `touchmove`, `scroll` xuất hiện rộng; nhiều đoạn đã dùng RAF/debounce/passive.
- Game renderer gắn window resize, Game Center gắn resize; không có destroy nhưng route là MPA.
- Feed per-card handlers biến mất cùng DOM node, nhưng per-card RAF closure không biến mất.
- Không thấy WebSocket/EventSource custom.

### Observers

| Observer | Nơi dùng | Nhận xét cleanup |
|---|---|---|
| IntersectionObserver | Messages effect visibility (khoảng 1–2 instance theo flow) | Có unobserve/điều khiển animation; tốt hơn chạy mọi effect |
| ResizeObserver | Feed placement/canvas-related và NOVA 3D | Một số có disconnect path; lifetime thường là page |
| MutationObserver | Feed, messages responsive, profile settings/posts/workspace/friend suggestions, admin | Nhiều observer theo dõi subtree rộng; nhiều cái không disconnect trước unload |
| PerformanceObserver | Không thấy | Không có telemetry long-task/CWV nội bộ |

Exact active instance count phụ thuộc DOM và route, nên runtime count là **UNKNOWN**.

## 9. Firebase / Realtime Audit

| Listener | File | Scope | Subscribe/unsubscribe | Active khi không cần? |
|---|---|---|---|---|
| Session doc | `shared/single-session-guard.js` | Route/global page | Có stop khi auth đổi | Route page only |
| Saved posts | feed handler | Feed | Có `stopSavedPosts` | Feed only |
| Message notification query | feed handler `:786` | Feed | Có stop | Có thể trùng dữ liệu với activity query |
| Activity notification query | feed handler `:1525` | Feed | Có stop | **Duplicate-query risk** |
| Posts public/audience | feed handler `:1594-1646` | Feed | 2 snapshot ở secure mode, 1 legacy fallback | Cần cho feed nhưng không limit |
| Inline comments | feed `:1712` | Per card đã mở | Stop khi card remove; collapse không stop | **Yes** |
| Modal comments | feed `:2197` | Modal | Stop khi close | No |
| Own profile | messages `:836` | Messages | Có stop variable | Route only |
| Conversation list | messages `:983` | Messages | Có stop | Không limit |
| Notes | messages `:1165,1182` | Per visible user + query | Array stop cleanup tồn tại | Có thể thành N+1 listeners |
| Conversation doc | messages `:1561` | Open conversation | Stop khi đổi | No |
| Messages subcollection | messages `:1584` | Open conversation | Stop khi đổi | Không thấy pagination/virtualization |
| Notification enhancements | messages enhancements `:42` | Messages | Stop variable | Route only |
| Member settings | chat settings `:541` | Open settings/conversation | Stop variable | Context dependent |
| Profile/note/profile posts/saved | profile logic/posts | Profile | Phần lớn có stop variables | Secure posts có 2 query; possible duplicated user doc |
| Game settings | `games/_shared/GameSettingsService.js` | Game Center/Gravity | Return unsubscribe | Route only |

Feed startup sau auth theo secure mode có khoảng **6 snapshot streams code-derived**: session (1), saved (1), notifications (2), posts (2). Legacy post fallback giảm còn khoảng 5. Con số thực có thể thay đổi theo auth/index/fallback và interaction; runtime exact = **UNKNOWN**.

Firestore Web SDK tự quản lý network/background. Code không chủ động unsubscribe toàn bộ listeners chỉ vì `document.hidden`; do đó snapshots có thể vẫn tồn tại khi PWA background, tùy chính sách iOS/browser. Feed/chat/profile không chạy đồng thời sau hard navigation.

## 10. React Re-render Audit

Không áp dụng: project không dùng React. Không có context/provider/hook/setState mỗi frame. Game logic không đi qua React render loop. Tương đương rủi ro UI update là DOM mutation thủ công từ snapshots, RAF, timers và HUD update.

## 11. DOM / Virtualization

- Feed: không virtualization và query post không limit. Space/list mode đổi cách hiển thị nhưng card vẫn tồn tại; filtered/hidden card loop chuyển sang polling thay vì bị unmount.
- Chat: không thấy windowing/virtualization/pagination lịch sử; message snapshot có thể render toàn bộ collection query.
- Notifications: render danh sách trong panel/modal; không virtualization.
- Profile posts/comments: không virtualization; secure queries merge nhiều nguồn.
- Gravity: DOM HUD nhỏ, phần game ở canvas; không phải rủi ro DOM chính.
- Modal/panel thường dùng `hidden`, class hoặc overlay tồn tại trong DOM; đây là lựa chọn hợp lệ nhưng CSS/listener vẫn cần quản lý.

Không thể ước lượng node count chính xác nếu không có dữ liệu Firestore runtime. Công thức tăng trưởng: feed O(posts + comments đã render), chat O(messages + conversation rows + note rows), notifications O(notifications).

## 12. CSS / GPU Audit

Occurrence tĩnh toàn repo: khoảng 120 backdrop-filter, 268 filter, 649 box-shadow, 10 will-change, 136 animation, 222 transition. Đây là số dòng/khai báo match, không phải số layer runtime.

### HIGH GPU COST

- `community/messages/messages.css`: nhiều panel lớn với backdrop-filter/glow/shadow và 21 animation; background chat có ảnh tùy chỉnh và overlay. Kết hợp fixed composer + keyboard resize tăng paint/composite risk.
- `AI/css/nova-ai-assistant.css`: nhiều filter/drop-shadow/glow và ~42 animation; mascot fixed có thể chồng nội dung và luôn composite.
- `community/community-feed-styles.css`, `community/community-feed-live.css`: space background, card glow, large panels, animations; cùng lúc còn Canvas2D background và per-card transform.
- Gravity Canvas: gradients + `shadowBlur` + `globalCompositeOperation='screen'` nhiều lần mỗi frame.

### MEDIUM

- `community/profile-user/profile-page.css`: nhiều glass panel/shadow, star canvas.
- Auth CSS: continuous decorative animation và glow lúc startup/login.
- Game Center: canvas starfield + card glows, nhưng mobile throttle ~84 ms và DPR 1.

### LOW / controlled

- Hover-only transitions trên desktop.
- `transform`/`opacity` nhỏ, ngắn và không phủ toàn viewport.
- Performance governor loại một số backdrop filter và pause CSS animations khi hidden/mobile; không bao phủ mọi selector và không dừng JS loops.

`will-change` chỉ khoảng 10 occurrence nên không phải dấu hiệu lạm dụng toàn cục. `backdrop-filter` trên panel lớn và nhiều shadow lồng nhau đáng lo hơn.

## 13. Canvas / Game Renderer Audit

### Canvas inventory theo route

- Feed: một universe/background canvas.
- Game Center: một starfield canvas.
- Profile: một star canvas khi không low-power.
- Gravity: một gameplay canvas; thêm canvas tạm 1200×630 chỉ khi tạo result share.
- NOVA 3D có canvas/WebGL nếu chọn renderer 3D, nhưng config hiện tại không chọn.

### Gravity canvas

- Renderer: custom Canvas2D (`GameRenderer.js:5`).
- Context: `{ alpha: false }`; opaque, tốt cho compositing.
- Antialias: không có option Canvas2D tương đương WebGL antialias; browser quyết định.
- `preserveDrawingBuffer`: không áp dụng Canvas2D.
- DPR: `Math.min(devicePixelRatio, compactDevice ? 1 : 1.75)` (`GameRenderer.js:30`). Mobile/pointer coarse cap 1.
- Buffer resize chỉ trong resize handler, không mỗi frame; resize tạo lại backing buffer/cache.
- CSS size thực tế phụ thuộc viewport/layout. Ví dụ giả định được yêu cầu, nếu canvas CSS 390×844 và cap DPR 1: render buffer 390×844 = 329,160 pixel/frame, khoảng 1.26 MiB RGBA color buffer; 30 FPS tương đương 9.87 triệu pixel raster cơ sở/giây, chưa tính overdraw/shadows. Đây là **phép tính minh họa**, không phải measurement của thiết bị.
- Desktop cap 1.75 có thể tăng pixel count 3.0625 lần so với CSS pixels.
- Background cache canvas có chiều rộng view và chiều cao 960; giúp tránh dựng lại background phức tạp mỗi frame nhưng dùng thêm RAM.

Feed cap DPR 1 trên compact, 1.35 desktop (`realtime-feed-handler.js:826`). Game Center cap 1 mobile, 1.5 desktop. Profile cap 1 low-power, 1.5 khác.

## 14. Gravity Tourist Architecture

```text
Pointer/keyboard/touch input
        ↓
entry.js state machine (MENU/INTRO/PLAYING/PAUSED/GAME_OVER)
        ↓
core/GameLoop.js (RAF + fixed-step accumulator)
        ↓
GameEngine.update(step)
├── input/UFO motion
├── systems/gravity/orbit/trajectory
├── collision with bodies/debris/projectiles
├── spawn/difficulty/progress
├── trail/effects/cleanup
└── score/run state + tick CustomEvent
        ↓
components/GameRenderer.js (Canvas2D)
        ↓
DOM HUD, leaderboard chase, audio, result share
```

Engine/renderer không phụ thuộc React. Entity là object JavaScript trong arrays. Spawn theo tiến độ; object cũ được filter/despawn khi ra sau camera, nên không thấy tăng vô hạn rõ ràng. Không có spatial partition hoặc object pool.

Audio qua `HTMLAudioElement`, không dùng Web Audio/AudioContext/library. Score/difficulty nằm trong engine/run state. Result share tạo canvas/file/upload chỉ ở game over/user action.

## 15. FPS / Physics Analysis

`GameLoop` dùng RAF liên tục và chỉ render khi đủ `renderInterval`. Mobile/standalone/coarse target 30 FPS; desktop 60. Loop dùng accumulator fixed timestep:

- Config mặc định: `GAME_CONFIG.fixedStep = 1/120`.
- Entry override mobile physics step thành `1/60`; desktop dùng 1/120 (`entry.js:49`).
- Ở 30 FPS mobile, trung bình có 2 physics update 1/60 mỗi render.
- Ở 60 FPS desktop, trung bình có 2 physics update 1/120 mỗi render.
- `maxFrameTime` chặn frame delta lớn.
- RAF callback vẫn được browser gọi theo display refresh và tự skip render. Giảm target FPS giảm công việc render nhưng không loại RAF scheduling; physics vẫn 60 Hz mobile.
- Adaptive thermal logic chỉ hạ khi `targetFps > 30`. Mobile bắt đầu 30 nên không thể tự hạ dưới 30 khi thiết bị tiếp tục chậm/nóng.

Kết luận: FPS limiter có tác dụng thật với renderer, nhưng không giảm tương ứng physics/HUD/scheduler. Đây là optimization **partial**, không phải vô hiệu hoàn toàn.

## 16. Collision / Entity Complexity

- Gravity: duyệt các celestial bodies mỗi physics tick — O(B).
- Collision UFO-body và UFO-debris: các loop tuyến tính — O(B + D), không thấy pairwise all-vs-all O(N²).
- Reachable orbit dùng `.some()` — O(B).
- Renderer culls object ngoài view theo x; chỉ draw entity nhìn thấy.
- Physics vẫn update các entity còn trong arrays dù ngoài viewport nhưng chưa tới ngưỡng despawn.
- Không có quadtree/grid/spatial partition.
- Số object tối đa hard-coded chính xác: **UNKNOWN**; code spawn theo segment/progress và prune object cũ, nên dữ liệu có xu hướng bounded theo cửa sổ thế giới, không tăng mãi.
- Trail cap khoảng 42 điểm bằng push/shift.
- Không object pooling cho particles/debris/projectiles/effects/score popup.

## 17. Memory / Allocation Analysis

Allocation nóng xác nhận từ code:

- Mỗi physics tick tạo difficulty object bằng spread `{...baseDifficulty}`.
- Trail `push({x,y})` mỗi tick và `shift()` khi >42; gây object garbage + dịch mảng.
- Debris/projectiles/entities cleanup dùng `.filter()`, tạo array mới mỗi tick/chu kỳ update.
- Renderer tạo nhiều `CanvasGradient`, path, màu `rgba(...)` và chuỗi mỗi frame.
- `CustomEvent('tick')` mới mỗi physics tick.
- HUD chase dùng `filter` + `sort` arrays mỗi 100 ms.
- Feed snapshot tạo Map/arrays/card updates theo toàn bộ dữ liệu; movement closures giữ `cardObj` sau remove.

### Lifecycle game

`Open -> Play -> Exit -> Open again` là hard navigation, document cũ thường được trình duyệt thu hồi, nên listener/canvas/audio của route không tích lũy qua các document bình thường. Trong cùng game page, loop stop ở menu/pause/gameover/hidden; active audio set xóa item khi ended/failed và stop functions pause/reset. Khả năng RAM tăng vĩnh viễn sau mỗi hard reopen là **unlikely từ code**, nhưng iOS bfcache/process retention chưa được profile nên không thể khẳng định zero leak.

Ngược lại, ở feed cùng một page session, card remove/recreate có khả năng tăng closure/RAF thật sự vì thiếu cancellation.

## 18. Audio Analysis

- Không có audio library/AudioContext; dùng `new Audio()`.
- Gravity có 77 MP3 (~3.87 MB) và 77 OGG (~3.19 MB) trong pack. Browser chọn một format qua `canPlayType`; không preload cả hai format.
- Cue không được tạo/decode toàn bộ khi app start. Mỗi lần play tạo Audio và `preload='auto'`; music loop tạo khi được chọn.
- Game Center có khoảng 6 MP3 (~0.57 MB) + 6 OGG (~0.50 MB), cũng chọn format; audio khởi tạo sau first pointer gesture.
- Community loop asset khoảng 0.73 MB.
- Service worker không precache toàn audio pack, nhưng audio same-origin đã phát có thể vào runtime cache.
- `active` effect audio được remove khi ended/failed; visibility/pagehide có pause paths. Music crossfade RAF tự kết thúc. Nhiều effect đồng thời vẫn có thể tạo nhiều Audio instance ngắn hạn.
- Crossfade cũ không có cancellation token rõ ràng khi đổi track dồn dập; rủi ro overlap tạm thời, không phải bằng chứng leak dài hạn.
- Stream vs full download phụ thuộc browser/server/range behavior: **UNKNOWN**.

## 19. Asset Analysis

Các raster lớn nhất được tìm thấy:

| Asset | Raw size | Pixel | Decoded RGBA estimate |
|---|---:|---:|---:|
| `celestial-atlas-v3.png` | ~3.18 MB | 1774×887 | ~6.0 MiB |
| `celestial-atlas-v1.png` | ~2.71 MB | 1536×1024 | ~6.0 MiB |
| `alien-reactions-v2.png` | ~2.57 MB | 1536×1024 | ~6.0 MiB |
| `hazard-atlas-v1.png` | ~2.53 MB | 1536×1024 | ~6.0 MiB |
| `alien-reactions-v1.png` | ~2.49 MB | 1536×1024 | ~6.0 MiB |
| `celestial-atlas-v2.png` | ~2.33 MB | 1774×887 | ~6.0 MiB |
| `deep-space-background-v1.png` | ~2.30 MB | 1672×941 | ~6.0 MiB |
| `tourist-ufo-v2.png` | ~1.96 MB | 1536×1024 | ~6.0 MiB |

Desktop set chính khoảng 20 MB raw compressed/~48 MiB decoded. Mobile variants khoảng 0.52–1.01 MB mỗi file, tổng ~5.66 MB compressed và khoảng ~12 MiB decoded. Không có ảnh 4K/8K trong nhóm lớn này, nhưng PNG atlas 1.5K vẫn nặng cho mobile.

Game có responsive asset suffix mobile. Bốn ảnh mobile base được request ngay khi renderer constructor chạy; bốn ảnh còn lại ở 180/420/650/820 ms. Đây là route-level lazy-load nhưng không phải demand-level lazy-load sâu.

NOVA PNG khoảng 1.23–1.30 MB và decoded khoảng 6 MiB mỗi ảnh; config character có thể tải một ảnh mascot. Brand horizontal ~836 KB, mark ~497 KB.

Video upload/render có trong sản phẩm nhưng inventory/runtime transfer phụ thuộc dữ liệu Cloudinary: **UNKNOWN**.

## 20. Font Analysis

Không tìm thấy local `@font-face`, `.woff/.woff2` hay Google Fonts stylesheet trong scan hiện tại. UI dựa vào font-family fallback/hệ thống và Font Awesome icon CDN theo trang. Số request/byte Font Awesome thực tế phụ thuộc cache/CDN: **UNKNOWN**. Không có bằng chứng custom font lớn chặn first paint.

## 21. Network Analysis

Không chạy được authenticated production trace trong audit này; request count, transferred size, cache hit/miss, Firebase wire bytes cho first/second visit là **UNKNOWN**.

Phân tích tĩnh cho thấy:

- First PWA install: 18 shell fetch theo `cache.addAll`.
- First feed: nhiều local CSS/JS, Firebase SDK CDN, Auth/Firestore requests, brand/NOVA/media theo dữ liệu.
- Second visit: same-origin shell/assets có thể cache hit + background revalidate; Firebase/Cloudinary bị SW bypass và tuân cache/network riêng.
- Gravity first route: 8 image variants được request trong <1 s và audio theo hành động/state; second route có thể dùng SW/browser cache.
- Không bundle/minification/tree-shaking; nhiều HTTP request và raw source parse riêng.

## 22. Service Worker / Cache Analysis

Service worker giúp repeat navigation nhưng có bốn trade-off:

1. Navigation stale-while-revalidate có thể hiển thị HTML cũ một nhịp rồi chỉ dùng bản mới ở reload/activation sau.
2. Shell all-or-nothing làm install nhạy với một resource lỗi.
3. Runtime media cache chung không bounded, có thể tăng storage/index overhead và quota eviction.
4. Không có manifest generated từ build/hash nên việc version hóa phụ thuộc sửa tay `VERSION` và danh sách shell.

Game/audio không làm chậm lần cài vì không precache toàn pack; chúng có thể làm cache lớn sau khi chơi. Cache cũ được xóa đúng theo prefix/version.

## 23. Mobile Performance & Thermal Risks

### CRITICAL

- Feed per-post perpetual RAF, không cleanup; N loop và desktop O(N²). `community/realtime-feed-handler.js:1367-1461`.
- Feed unbounded realtime query + no virtualization; DOM/loop tăng theo số post. `listenToPostsFeed():1594-1646`.

### HIGH

- Messages/profile/feed CSS glass/glow/filter/shadow trên vùng lớn; đặc biệt `messages.css`.
- Gravity gradients/shadowBlur/compositing + 60 Hz physics dù render 30 FPS.
- Gravity HUD filter/sort tới 500 entries mỗi 100 ms. `entry.js:58,67`.
- Messages history/conversation/note listeners không pagination/virtualization; note N+1 listener pattern.
- Runtime media cache unbounded và asset image decode burst trong game.

### MEDIUM

- Duplicate notifications snapshot trên feed.
- Closed inline comments listener tiếp tục active.
- Many MutationObservers/subtree observers trên profile.
- NOVA CSS animation/filter và 1.2 MB image; delayed nhưng vẫn chạy trên nhiều routes.
- Game per-tick allocations and no pooling.

### LOW / unlikely primary

- Three.js vendor size: file lớn nhưng không tải ở current character renderer.
- Gravity DPR: mobile đã cap 1, nên không phải “fullscreen DPR 3”.
- Game running outside route: không xảy ra theo MPA architecture.
- React rerender: không có React.

Khi background: game loop và một số canvas/audio có visibility handling; performance governor pause CSS animation. Firestore listeners và nhiều timers không chủ động unsubscribe; per-card feed loop tiếp tục reschedule chậm. Trình duyệt iOS có thể throttle/suspend thêm, nhưng đó không thay thế cleanup của app.

## 24. Existing Optimizations

Đã có thật:

- Mobile/economy classification dùng viewport/pointer, `hardwareConcurrency <= 4`, `deviceMemory <= 4`, Save-Data và reduced-motion.
- Canvas DPR caps: feed 1 mobile, Game Center 1 mobile, Gravity 1 mobile, profile 1 low-power.
- Gravity mobile renderer 30 FPS; Game Center phone starfield khoảng 12 FPS.
- Game fixed timestep, max delta, render culling, entity pruning, bounded trail.
- Gravity mobile-specific smaller/compressed images.
- Background canvas cache trong renderer.
- Route isolation: game engine không ở initial app/feed.
- Deferred/idle AI bootstrap; Three dynamic import only if 3D chosen.
- Deferred game secondary image loads.
- Visibility pause/cancel cho game, Game Center/profile canvas và audio; global CSS pause hidden.
- Passive/throttled/debounced/RAF-coalesced handlers ở nhiều mobile paths.
- IntersectionObserver cho effect message.
- Service worker shell/runtime cache.
- `content-visibility` trên một số feed list mobile.

Chưa có:

- Feed/chat/notification virtualization và robust pagination.
- Single centralized feed animation loop/cancellation.
- Runtime cache expiration/count quota.
- Production bundling/minification/tree-shaking.
- Object pooling trong game.
- PerformanceObserver/field telemetry.
- Adaptive mobile FPS thấp hơn 30 hoặc dynamic quality based on measured frame budget.

## 25. Optimizations That May Be Ineffective or Counterproductive

- Feed “hidden/list/filtered” dùng timeout + RAF polling thay vì stop; giảm tần suất nhưng giữ closure/timer mãi.
- Gravity cap 30 FPS chỉ skip render; physics vẫn 60 Hz và RAF callback vẫn theo refresh display.
- Adaptive GameLoop không thể hạ mobile dưới 30.
- Secondary textures gọi “deferred” nhưng tất cả vẫn request trong 820 ms, có thể cạnh tranh decode/network lúc vừa vào game.
- `content-visibility` giảm paint list mode nhưng không giảm Firestore subscriptions, DOM creation hay per-card scheduler.
- Performance governor tắt một số CSS filter nhưng không tắt toàn bộ heavy CSS/canvas/Firestore/timer.
- Hiding inline comments không unsubscribe listener.
- Stale-while-revalidate nhanh repeat load nhưng runtime cache không bounded.

## 26. P0 / P1 / P2 / P3 Problems

| Priority | Problem | Evidence | Impact | Files |
|---|---|---|---|---|
| P0 | Một RAF loop cho mỗi feed post, không hủy khi remove | Recursive scheduling `:1367-1461`, remove path không cancel | CPU/battery/leak-like growth; desktop O(N²) | `community/realtime-feed-handler.js` |
| P0 | Feed query/render không giới hạn và không virtualization | 1–2 `onSnapshot` merge toàn bộ, card per doc | DOM/RAM/CPU tăng theo dữ liệu | cùng file |
| P0 | Gravity chase HUD sort tối đa 500 records 10 lần/s | `loadLeaderboard(500)`, HUD mỗi 100ms, `updateChaseHud` | Main-thread spike trong gameplay | `games/gravity-tourist/entry.js` |
| P1 | Heavy full-screen CSS effects | Static counts và selectors | Paint/composite/jank/thermal | `messages.css`, feed/profile/NOVA CSS |
| P1 | Chat history/list/notes không virtualization; N+1 notes listener | snapshot/listener code | DOM, realtime CPU/network tăng | `messages-logic.js` |
| P1 | Physics 60 Hz + per-tick allocations trong mobile game | Entry timestep + engine spread/filter/trail/events | CPU/GC nhiệt dù render 30 | GameLoop/GameEngine/entry |
| P1 | Game loads all 8 mobile textures within 820 ms | renderer constructor/deferred calls | Startup decode/network/RAM burst | `GameRenderer.js` |
| P1 | Runtime media cache không bounded | same cache `cache.put`, no eviction | Storage growth/quota/update overhead | `service-worker.js` |
| P2 | Duplicate notification snapshots on feed | same ownNotifications query paths | Extra reads/callback work | feed handler |
| P2 | Collapsed comments stay subscribed | return on hidden, unsubscribe only remove | Background updates/read/DOM work | feed/profile posts logic |
| P2 | Profile MutationObservers/subtree watchers | multiple constructors/no route-local disconnect | Mutation callback overhead | profile JS files |
| P2 | No build/minify/tree-shake | direct source deploy | Parse/request/startup cost | architecture-wide |
| P3 | Page-lifetime listeners lack explicit destroy | MPA teardown normally reclaims | Mostly maintainability/bfcache risk | several route modules |
| P3 | No internal performance telemetry | no PerformanceObserver | Harder diagnosis, not direct lag cause | project-wide |

## 27. Top 10 Root Cause Candidates

1. **Per-post RAF architecture — Confidence HIGH.** Confirmed independent recursive loop, missing cancellation, desktop map scan per loop. CPU scales poorly; removed cards can remain reachable.
2. **Unbounded feed realtime + DOM — HIGH.** No limit/virtualization; every doc can create DOM, handlers and movement loop.
3. **Gravity leaderboard sort in HUD — HIGH.** Up to 500 entries filtered/sorted at 10 Hz during play; unnecessary allocations/comparisons on main thread.
4. **CSS filter/backdrop/shadow density — HIGH.** Hundreds of declarations, large fixed panels and animations; costly GPU composition/mobile fill rate.
5. **Chat unbounded history and realtime fan-out — HIGH.** Conversation/messages/notes snapshots plus all-message DOM; note listeners can scale per user.
6. **Gravity render + physics split — HIGH.** 30 render FPS but 60 physics Hz, RAF still display-rate; gradients/shadows plus updates keep CPU/GPU active.
7. **Game allocation/GC churn — MEDIUM-HIGH.** Trail objects, spread, filter arrays, CustomEvent and gradients are created continuously.
8. **Game asset burst — MEDIUM-HIGH.** ~5.66 MB mobile texture set requested within 820 ms and ~12 MiB decoded, alongside page/game initialization.
9. **NOVA mascot effects — MEDIUM.** Large PNG + continuous CSS animation/filter on many pages; delayed load helps but fixed animated overlay still composites.
10. **Unbounded SW media cache + no build pipeline — MEDIUM.** Repeat storage growth plus many raw requests/parse work; more relevant to startup/storage than steady game FPS.

### Những thứ không phải nguyên nhân chính theo code

| Phán loại | Nhận định |
|---|---|
| Confirmed | Game engine không active ngoài Gravity route; route là hard navigation. |
| Confirmed | Gravity mobile DPR cap 1; không render 3× native DPR. |
| Confirmed | React re-render không tồn tại. |
| Likely not primary | Three.js/GLTF lớn nằm trong repo nhưng current NOVA character path không dynamic-import chúng. |
| Possible | Firebase background activity góp phần pin/network, nhưng chưa có wire/profile data để gọi là thủ phạm lớn nhất. |
| Possible | PWA cache lớn làm startup/storage chậm sau thời gian dài; cache size thiết bị thật chưa đo. |
| Unlikely | Audio pack bị preload toàn bộ lúc mở app: code chọn format và tạo cue theo nhu cầu; SW cũng không precache pack. |

## 28. Recommended Investigation Order

Đây là thứ tự đo/kiểm chứng cho vòng tối ưu tiếp theo, chưa phải thay đổi code trong audit này:

1. Profile Community với 10/50/100 card: Chrome Performance + RAF callback count; remove/re-add card để xác nhận loop không giảm.
2. Instrument active card loops, DOM nodes, Firestore listeners và callback rate; xác định tăng trưởng theo thời gian.
3. Profile Gravity riêng: tắt lần lượt HUD chase, renderer, physics trong bản thử nghiệm để chia CPU; ghi long tasks/GC/frame time/thermal trên iPhone thật.
4. Trace `updateChaseHud` với 500 leaderboard rows và ghi duration/allocations.
5. Paint flashing/layer inspection cho Messages/Feed/NOVA; đo khi tắt thử backdrop/filter/shadow theo nhóm trong DevTools, không xóa production trước khi có số.
6. Network trace cold/warm PWA: shell, Firebase, Cloudinary, game eight textures, audio; ghi transferred/cache columns.
7. Heap snapshots trước/sau create/remove 100 feed cards và trước/sau 3 vòng open/play/exit game.
8. Đo chat với lịch sử dài và nhiều friend notes; đếm snapshot listeners và node count.
9. Kiểm tra Cache Storage dung lượng sau fresh install, duyệt feed media và chơi game; xác nhận quota/duplicate URL.
10. Chỉ sau các phép đo trên mới lập kế hoạch refactor theo P0/P1.

## 29. Lighthouse / Core Web Vitals / Profiling Status

Không có Lighthouse CLI hoặc production authenticated environment sẵn trong phiên audit; không cài package mới theo yêu cầu. Do đó:

```text
Performance: UNKNOWN
FCP: UNKNOWN
LCP: UNKNOWN
CLS: UNKNOWN
TBT: UNKNOWN
Speed Index: UNKNOWN
Long tasks >50ms: UNKNOWN
Desktop/mobile measured FPS: UNKNOWN
Thermal/device power: UNKNOWN
```

Các số byte trong báo cáo là raw filesystem sizes/ước lượng decoded `width × height × 4`, không phải network transferred bytes. Các số occurrence CSS/listener là static text counts, không phải số active runtime. Mọi ví dụ pixel/frame đều được gắn nhãn phép tính, không giả làm đo thiết bị.

## 30. Files to Inspect First

1. `community/realtime-feed-handler.js`
2. `games/gravity-tourist/entry.js`
3. `games/gravity-tourist/components/GameRenderer.js`
4. `community/messages/messages-logic.js`
5. `community/messages/messages.css`

Các file kế tiếp: `games/gravity-tourist/core/GameLoop.js`, GameEngine/system files, `service-worker.js`, `AI/css/nova-ai-assistant.css`, profile logic/posts CSS/JS.
