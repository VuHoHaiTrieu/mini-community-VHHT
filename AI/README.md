# NOVA & LUNA Mascot System

NOVA là module ES độc lập dành cho website multipage hiện tại. Phase 1 dùng đúng character skin NOVA theo mẫu người dùng cung cấp, animation state, controller toàn cục, chat UI và dịch vụ AI giả lập. Dữ liệu chat chỉ được lưu trong `localStorage`; chưa gửi ra backend.

## Kiến trúc

```text
AI/
├── assets/
│   ├── models/nova.glb                 # NOVA 3D + 8 animation clips
│   ├── models/luna.glb                 # LUNA 3D + 8 animation clips
│   └── models/                         # nova.glb và luna.glb
├── components/
│   ├── NovaAnimation/NovaAnimation.js  # adapter character/Rive/fallback
│   ├── NovaAnimation/NovaCharacterMotion.js # skin NOVA và motion effects
│   ├── NovaChat/NovaChat.js            # chat UI và input events
│   ├── NovaMascot/NovaMascot.js        # mascot global
│   └── NovaMessage/NovaMessage.js      # message/loading renderer
├── config/nova.config.js               # asset, timing, page context
├── hooks/useNova.js                     # accessor không phụ thuộc framework
├── services/novaApi.js                  # mock API/backend transport
├── services/novaIntentEngine.js         # hiểu ý định tiếng Việt + synonym scoring
├── store/
│   ├── NOVAController.js                # orchestration và public API
│   └── novaStore.js                     # observable state + persistence
├── types/nova.types.js                  # JSDoc types/state validation
├── bootstrap.js                         # global mount entry
├── nova.css                             # UI + 8 state animations
└── README.md
```

Không thêm dependency npm hay bước build mới. Three.js và GLTFLoader được self-host trong `AI/vendor/` để mô hình vẫn chạy khi triển khai tĩnh và không phụ thuộc CDN lúc runtime. Dự án không dùng React/Vue/TypeScript nên hệ thống sử dụng class, ES Modules và JSDoc types để đồng bộ với code hiện tại.

## Public API

Sau sự kiện `nova:ready`, controller có sẵn tại `window.nova`:

```js
nova.setState('thinking');
nova.setState('happy', { duration: 1500 });
nova.say('Xin chào!');
nova.openChat();
nova.closeChat();
await nova.sendMessage('Cách đăng bài?');
nova.getContext();
nova.setCharacter('luna');
nova.setCharacter('nova');
nova.playAction('wave');
nova.playAction('dance', { duration: 5000 });
```

State/hành động hợp lệ: `idle`, `hello`, `thinking`, `searching`, `talking`, `happy`, `confused`, `sleeping`, `wave`, `reading`, `typing`, `celebrate`, `dance`, `create`.

NOVA chỉ được mount trên các trang ứng dụng: cộng đồng, tin nhắn, hồ sơ và quản trị; không xuất hiện tại đăng nhập/đăng ký. Mascot hỗ trợ kéo-thả bằng chuột hoặc cảm ứng. Vị trí được giới hạn trong viewport và lưu riêng theo từng khu vực trong `localStorage`. Chat tự chọn hướng mở dựa trên vị trí mascot.

Khung chat cũng có thể kéo bằng phần header. Panel được clamp trong safe area của viewport, tự điều chỉnh khi thay đổi kích thước cửa sổ và lưu vị trí riêng theo trang. Khi đóng chat, panel thu lại thành mascot tại góc gần vị trí panel vừa đứng.

## Context và action cục bộ

Phase 2 bổ sung context snapshot gồm trang hiện tại, phần tử đang focus, dialog đang mở, trạng thái composer/media, conversation được chọn và kích thước viewport. Action registry chỉ chứa thao tác giao diện an toàn: mở composer, focus tìm kiếm và điều hướng giữa cộng đồng/tin nhắn/hồ sơ. Không có thao tác xóa hoặc thay đổi dữ liệu.

Module khác có thể đăng ký action không phá hủy:

```js
const unregister = nova.registerAction('openHelp', {
  match: query => query.includes('trợ giúp'),
  execute: () => ({ available: true, text: 'Đã mở trợ giúp.' })
});
```

`NovaBehaviorBridge` cho NOVA phản ứng với tìm kiếm, mở composer, gửi bài/tin nhắn và lỗi runtime mà không phải sửa sâu các module nghiệp vụ hiện tại.

`NovaIntentEngine` chuẩn hóa tiếng Việt, so khớp cụm từ và chấm điểm token để hiểu nhiều cách diễn đạt cho cùng một ý định. Đây là lớp NLU cục bộ, không phải fine-tuning mô hình; nó hoạt động offline và không phát sinh chi phí API.

## Mascot theo ảnh gốc và đổi nhân vật

Renderer mặc định là `character`: sử dụng hai master skin trong suốt `nova-master-v3.png` và `luna-master-v3.png` để giữ đúng tạo hình minh họa, kết hợp lớp motion/effect cho các trạng thái. Hai GLB và renderer Three.js vẫn được giữ như một tùy chọn thử nghiệm, chưa dùng làm hình hiển thị chính.

Renderer tùy chọn `3d` tải model GLB bằng bản Three.js self-hosted, dùng `AnimationMixer` và chuyển clip bằng cross-fade. Lựa chọn NOVA/LUNA được lưu tại `vhht_ai_character` trong `localStorage`; khi đổi nhân vật, trạng thái hành động hiện tại được phát tiếp trên nhân vật mới.

Hai model dùng chung 14 clip: `idle`, `hello`, `thinking`, `searching`, `talking`, `happy`, `confused`, `sleeping`, `wave`, `reading`, `typing`, `celebrate`, `dance`, `create`. Manifest tương ứng nằm tại `assets/models/*.animations.json`.

Renderer bổ sung hạt sáng, vòng năng lượng, đổi màu theo nhân vật và phản ứng hướng nhìn theo con trỏ. Các hiệu ứng nặng tự dừng khi tab bị ẩn.

Nguồn dựng có thể tái chạy:

```powershell
blender --background --python AI/tools/build_mascot_glb.py
blender --background --python AI/tools/render_mascot_previews.py
```

Model hiện là phiên bản web-optimized nền tảng được dựng theo concept sheet, dùng rigid bone weights để nhẹ trên điện thoại. Có thể tiếp tục tinh chỉnh mesh/material/rig trong script mà không thay đổi API của website.

## Fallback chuyển động 2D

Renderer `character` dự phòng dùng PNG alpha được cấu hình theo từng nhân vật. Motion layer kết hợp movement, tracking và hiệu ứng theo tác vụ:

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
