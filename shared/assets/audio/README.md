# VHHT Original Audio Pack

Bộ âm thanh này được tạo mới bằng tổng hợp âm thanh theo thủ tục, dành cho dự án `mini-community-VHHT`.

## File

- `click-soft.mp3` — điều hướng, mở menu, chọn mục.
- `click-primary.mp3` — đăng nhập, đăng bài, gửi tin nhắn, lưu thay đổi.
- `success.mp3` — thao tác hoàn thành thành công.
- `error.mp3` — thao tác thất bại hoặc validation lỗi.
- `notification.mp3` — tin nhắn hoặc thông báo mới.
- `community-space-loop.mp3` — nhạc nền ambient không lời, dài 48 giây, thiết kế để lặp.

## Thư mục đề xuất

```text
shared/assets/audio/
├── ui/
│   ├── click-soft.mp3
│   └── click-primary.mp3
├── feedback/
│   ├── success.mp3
│   ├── error.mp3
│   └── notification.mp3
└── music/
    └── community-space-loop.mp3
```

## Âm lượng khuyến nghị

- Hiệu ứng click: 0.18–0.32
- Success/error/notification: 0.28–0.45
- Nhạc nền: 0.08–0.18

## Quyền sử dụng

Các file trong gói này được tạo riêng theo yêu cầu của người dùng bằng kỹ thuật tổng hợp âm thanh, không lấy mẫu từ bài hát hay thư viện âm thanh bên ngoài. Bạn có thể sử dụng, chỉnh sửa và phân phối chúng trong dự án VHHT của mình.

## Lưu ý trình duyệt

Nhạc nền chỉ nên phát sau thao tác đầu tiên của người dùng do chính sách autoplay của trình duyệt. Luôn cung cấp nút bật/tắt và lưu lựa chọn âm lượng.

## Thay âm thanh trong dự án

`shared/audio/sound-manager.js` tự tải các đường dẫn bên trên. Để thay chất âm,
chỉ cần ghi đè file MP3 tương ứng và giữ nguyên tên file:

- `ui/click-soft.mp3`: mở/đóng, chọn mục, toggle và thao tác nhẹ.
- `ui/click-primary.mp3`: gửi tin nhắn, đăng bài và thao tác chính.
- `feedback/success.mp3`: thao tác hoàn tất thành công.
- `feedback/error.mp3`: lỗi, cảnh báo và thao tác nguy hiểm.
- `feedback/notification.mp3`: tin nhắn hoặc thông báo thực sự mới.
- `music/community-space-loop.mp3`: không gian nền riêng của bảng tin cộng đồng.

Sau khi thay file, nên làm mới mạnh trình duyệt (`Ctrl + F5`) vì các MP3 được cache để
giảm thời gian tải. Nếu một file thiếu hoặc không giải mã được, SoundManager tự chuyển
sang âm tổng hợp dự phòng thay vì làm hỏng thao tác của trang.
