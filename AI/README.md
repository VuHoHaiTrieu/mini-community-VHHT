# NOVA Mascot System — Phase 1

NOVA là module ES độc lập dành cho website multipage hiện tại. Phase 1 dùng đúng character skin NOVA theo mẫu người dùng cung cấp, animation state, controller toàn cục, chat UI và dịch vụ AI giả lập. Dữ liệu chat chỉ được lưu trong `localStorage`; chưa gửi ra backend.

## Kiến trúc

```text
AI/
├── assets/
│   └── nova-character-master.png       # NOVA theo character sheet gốc
├── components/
│   ├── NovaAnimation/NovaAnimation.js  # adapter character/Rive/fallback
│   ├── NovaAnimation/NovaCharacterMotion.js # skin NOVA và motion effects
│   ├── NovaChat/NovaChat.js            # chat UI và input events
│   ├── NovaMascot/NovaMascot.js        # mascot global
│   └── NovaMessage/NovaMessage.js      # message/loading renderer
├── config/nova.config.js               # asset, timing, page context
├── hooks/useNova.js                     # accessor không phụ thuộc framework
├── services/novaApi.js                  # mock API/backend transport
├── store/
│   ├── NOVAController.js                # orchestration và public API
│   └── novaStore.js                     # observable state + persistence
├── types/nova.types.js                  # JSDoc types/state validation
├── bootstrap.js                         # global mount entry
├── nova.css                             # UI + 8 state animations
└── README.md
```

Không cài dependency mới. Dự án không dùng React/Vue/TypeScript nên Phase 1 sử dụng class, ES Modules và JSDoc types để đồng bộ với code hiện tại.

## Public API

Sau sự kiện `nova:ready`, controller có sẵn tại `window.nova`:

```js
nova.setState('thinking');
nova.setState('happy', { duration: 1500 });
nova.say('Xin chào!');
nova.openChat();
nova.closeChat();
await nova.sendMessage('Cách đăng bài?');
```

State hợp lệ: `idle`, `hello`, `thinking`, `searching`, `talking`, `happy`, `confused`, `sleeping`.

NOVA chỉ được mount trên các trang ứng dụng: cộng đồng, tin nhắn, hồ sơ và quản trị; không xuất hiện tại đăng nhập/đăng ký. Mascot hỗ trợ kéo-thả bằng chuột hoặc cảm ứng. Vị trí được giới hạn trong viewport và lưu riêng theo từng khu vực trong `localStorage`. Chat tự chọn hướng mở dựa trên vị trí mascot.

## Mô hình chuyển động mặc định

Renderer `character` dùng `assets/nova-character-master.png`, được dựng trực tiếp theo character sheet NOVA. Không sử dụng nhân vật procedural khác hình. Motion layer kết hợp movement, tracking và hiệu ứng theo tác vụ:

- `idle`: bay nhẹ và hướng nhân vật theo con trỏ.
- `hello`: nảy lên và vẫy/chào bằng chuyển động nghiêng.
- `thinking`: nghiêng suy nghĩ với nhịp dấu chấm.
- `searching`: bay quét ngang và xoay vòng tìm kiếm.
- `talking`: chuyển động theo nhịp trả lời.
- `happy`: nhảy lên và phát sáng lấp lánh.
- `confused`: nghiêng đầu qua lại.
- `sleeping`: thở chậm, giảm ánh sáng và hiện ký hiệu Z.

Component/module khác nên import accessor khi có thể:

```js
import { useNova } from '../AI/hooks/useNova.js';
const nova = useNova();
nova.setState('happy', { duration: 1200 });
```

## Luồng message Phase 1

```text
sendMessage → thinking → searching (nếu cần tra cứu)
            → novaApi → talking → idle
            ↘ error → confused → idle
```

Mock logic nằm hoàn toàn trong `services/novaApi.js`, không nằm trong component UI. Khi có backend, truyền `endpoint` vào `NovaApiService` hoặc đổi singleton export tại cuối file.

## Thay bằng Rive

1. Đặt file thật tại `AI/assets/nova.riv`.
2. Nạp Rive Web runtime trước `bootstrap.js` trên các trang. Có thể dùng package self-hosted hoặc script chính thức phù hợp chính sách deploy.
3. Trong `config/nova.config.js`, đặt `rive.enabled: true` và cập nhật:
   - `stateMachineName`
   - `stateInputName`
4. State machine nên có một number input tên `state` với mapping:
   - 0 idle
   - 1 hello
   - 2 thinking
   - 3 searching
   - 4 talking
   - 5 happy
   - 6 confused
   - 7 sleeping

`NovaAnimation` tự chuyển từ character adapter sang Rive adapter. Nếu runtime hoặc `.riv` lỗi, module tiếp tục dùng đúng PNG NOVA làm fallback, không hiển thị nhân vật khác.

## Chạy và kiểm thử

Website cần HTTP/HTTPS vì dùng ES Modules:

```powershell
npx serve .
```

Mở lần lượt trang đăng nhập, cộng đồng, hồ sơ, tin nhắn và admin. Kiểm tra:

1. NOVA xuất hiện ở góc dưới bên phải.
2. Click mascot mở chat và chạy `hello`.
3. Gửi câu thường thấy `thinking → talking → idle`.
4. Gửi “Tìm bài viết” thấy thêm `searching`.
5. Gửi “thử lỗi” thấy error UI và `confused`.
6. Test Console: `nova.setState('happy', { duration: 2000 })`.
7. Thu nhỏ cửa sổ xuống 320 px để kiểm tra layout mobile.

## Hướng mở rộng

- Speech-to-text/text-to-speech đặt trong service riêng và gọi qua controller.
- Mouse tracking/fly-to-element thuộc `NovaAnimation`, không đặt trong chat.
- Context hiện lấy route/title tại `detectNovaPageContext`; có thể bổ sung DOM/user context có kiểm soát.
- Function calling nên chạy qua backend và một registry action có phân quyền/xác nhận, không cho model thao tác DOM tùy ý.
- Không đặt API key hoặc secret trong frontend.
