# VHHT Complete UI Sound Pack

Gói gồm 27 hiệu ứng MP3 gốc, được tổng hợp riêng cho giao diện web.

## Cách dùng đúng

Không nên tạo một tiếng hoàn toàn khác cho từng nút. Hãy dùng cùng một âm cho cùng loại hành động để người dùng học được ngôn ngữ âm thanh của website.

- Điều hướng/menu: `click-neutral`
- Hành động chính: `click-primary`
- Tab: `tab-switch`
- Bật/tắt: `toggle-on`, `toggle-off`
- Mở/đóng panel: `open-panel`, `close-panel`
- Gửi/lưu/đăng: click lúc bấm; `success` chỉ sau khi request thành công
- Xóa: `warning` lúc mở xác nhận; `delete` sau khi xóa thành công
- Lỗi: `error` chỉ khi validation/request thật sự lỗi
- Tin nhắn mới: `receive-message`, bỏ qua initial Firestore snapshot

## Âm lượng gợi ý

- UI: 0.16–0.26
- Actions: 0.22–0.32
- Social: 0.22–0.34
- Feedback: 0.28–0.40

## Lưu ý

- Nút disabled không phát âm.
- Không phát success trước phản hồi Firebase/Cloudinary.
- Không gắn listener toàn document nếu handler hiện tại cũng phát âm.
- Thêm cooldown 50–100ms để tránh chồng âm.
- Dùng đường dẫn tương đối để tương thích GitHub Pages.
