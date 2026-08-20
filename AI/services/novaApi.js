import { NOVA_CONFIG } from '../config/nova.config.js';
import { novaIntent } from './novaIntentEngine.js?v=9';

const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
  const timeout = window.setTimeout(resolve, milliseconds);
  signal?.addEventListener('abort', () => {
    window.clearTimeout(timeout);
    reject(new DOMException('NOVA request đã bị hủy.', 'AbortError'));
  }, { once: true });
});

const normalize = value => String(value || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd');

function createMockAnswer(message, context) {
  const query = normalize(message);
  const detected = novaIntent.detect(message);
  if (detected.intent === 'contactSupport') return `Mình đã ghi nhận rằng bạn cần quản trị viên hỗ trợ. Bạn có thể nhắn trong Trạm liên lạc hoặc liên hệ ${NOVA_CONFIG.support.adminLabel} qua Facebook, TikTok và Zalo/SĐT. Không gửi mật khẩu hay mã OTP cho bất kỳ ai nhé.`;
  if (detected.intent === 'capabilities') return `Mình có thể hướng dẫn theo trang, mở khung đăng bài, focus tìm kiếm, đưa bạn đến tin nhắn/hồ sơ/cộng đồng, giải thích quyền riêng tư và phản ứng với thao tác trên website. Bạn có thể thử: ${novaIntent.getExamples().join(' · ')}.`;
  if (detected.intent === 'postHelp') return 'Để đăng bài: mở khung đăng bài, nhập nội dung hoặc thêm media, chọn đối tượng xem rồi nhấn Đăng. Bạn cũng có thể bảo mình “Mở khung đăng bài”. 🚀';
  if (detected.intent === 'messageHelp') return 'Mở Trạm liên lạc, chọn một người bạn rồi nhập tin nhắn. Bạn có thể nói “Đi đến tin nhắn” để mình mở trang đó.';
  if (detected.intent === 'profileHelp') return 'Trong Hồ sơ cá nhân, mở phần chỉnh sửa để cập nhật thông tin, ảnh đại diện và ảnh bìa.';
  if (detected.intent === 'privacy') return 'Hãy chọn đúng đối tượng xem khi đăng nội dung và không chia sẻ mật khẩu, mã xác thực hoặc dữ liệu nhạy cảm trong hội thoại.';
  if (detected.intent === 'friends') return 'Bạn có thể mở hồ sơ thành viên để gửi lời mời kết bạn và quản lý danh sách bạn bè trong hồ sơ.';
  if (detected.intent === 'statistics') return 'Bảng điều khiển quản trị hiển thị thống kê tổng quan được đồng bộ từ Firestore.';
  if (detected.intent === 'moderation') return 'Trong Trung tâm quản trị, bạn có thể quản lý người dùng và kiểm duyệt bài viết theo quyền admin.';
  if (detected.intent === 'greeting') return 'Xin chào bạn! ✨ NOVA rất vui được đồng hành cùng bạn.';
  if (detected.intent === 'thanks') return 'Không có gì! 💙 NOVA luôn ở đây khi bạn cần.';
  if (/loi|error|thu loi/.test(query)) throw new Error('NOVA chưa thể kết nối dịch vụ mô phỏng. Hãy thử lại.');
  if (/xin chao|hello|hi\b|chao nova/.test(query)) return 'Xin chào bạn! ✨ NOVA rất vui được đồng hành cùng bạn.';
  if (/nova.*(lam duoc|la ai)|ban la ai|tro ly/.test(query)) return 'Mình là NOVA — linh vật trợ lý của VHHT. Phase 1 giúp mình hướng dẫn theo trang, phản hồi hội thoại và thể hiện trạng thái bằng animation.';
  if (/dang bai|tao bai|viet bai/.test(query)) return 'Vào Không gian cộng đồng, chọn ô tạo bài, nhập nội dung hoặc thêm media, chọn quyền riêng tư rồi nhấn Đăng. 🚀';
  if (/tin nhan|nhan tin|chat|gui anh|hinh anh/.test(query)) return 'Mở Trạm liên lạc, chọn một người bạn rồi nhập tin nhắn. Nút đính kèm trong khung soạn cho phép gửi media.';
  if (/ho so|avatar|anh dai dien|thong tin ca nhan|sua profile/.test(query)) return 'Vào Hồ sơ cá nhân và mở phần chỉnh sửa để cập nhật thông tin, ảnh đại diện và ảnh bìa.';
  if (/quyen rieng tu|bao mat|ai xem/.test(query)) return 'Hãy chọn đúng đối tượng xem khi đăng nội dung và không chia sẻ mật khẩu, mã xác thực hoặc dữ liệu nhạy cảm trong hội thoại.';
  if (/tim.*(bai|kiem)|bai viet/.test(query)) return 'Bạn có thể tìm nội dung trong Không gian cộng đồng bằng từ khóa chủ đề hoặc tên người đăng.';
  if (/ban be|ket ban|tim ban/.test(query)) return 'Mở hồ sơ thành viên để gửi lời mời kết bạn. Gợi ý kết nối xuất hiện trong khu vực hồ sơ khi có dữ liệu phù hợp.';
  if (/dang nhap|login/.test(query)) return 'Nhập email và mật khẩu trên trang Đăng nhập. Nếu chưa có tài khoản, hãy chuyển sang trang Đăng ký.';
  if (/dang ky|tao tai khoan/.test(query)) return 'Mở trang Đăng ký, hoàn thành các trường bắt buộc và sử dụng email bạn đang kiểm soát.';
  if (/quen mat khau|mat khau/.test(query)) return 'Không chia sẻ mật khẩu với NOVA. Khi tính năng khôi phục được bật, hãy dùng email đăng ký tại trang đăng nhập.';
  if (/thong ke|bao cao/.test(query)) return 'Bảng điều khiển quản trị hiển thị thống kê tổng quan được đồng bộ từ Firestore theo thời gian thực.';
  if (/quan ly nguoi dung/.test(query)) return 'Mở mục Người dùng trong Trung tâm quản trị để tìm kiếm và xử lý tài khoản theo quyền admin.';
  if (/kiem duyet|quan ly bai/.test(query)) return 'Mở mục Bài viết trong Trung tâm quản trị để kiểm tra, ẩn hoặc khôi phục nội dung.';
  if (/cam on|thank/.test(query)) return 'Không có gì! 💙 NOVA luôn ở góc màn hình khi bạn cần.';
  return `Mình chưa hiểu chắc câu hỏi đó trong ngữ cảnh “${context.label}”. Hiện NOVA hỗ trợ tốt nhất việc điều hướng, đăng bài, nhắn tin, hồ sơ và quyền riêng tư.`;
}

export class NovaApiService {
  constructor({ endpoint = null, fetchImpl = window.fetch.bind(window) } = {}) {
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
  }

  requiresSearch(message) {
    return /tìm|search|tra cứu|bài viết|thống kê/i.test(message);
  }

  async sendMessage({ message, context, history = [], signal } = {}) {
    if (!String(message || '').trim()) throw new TypeError('Tin nhắn không được để trống.');
    if (this.endpoint) return this.#sendToBackend({ message, context, history, signal });
    const latency = NOVA_CONFIG.chat.mockLatencyMin + Math.random() * (NOVA_CONFIG.chat.mockLatencyMax - NOVA_CONFIG.chat.mockLatencyMin);
    await delay(latency, signal);
    return { text: createMockAnswer(message, context), requiresSearch: this.requiresSearch(message) };
  }

  async #sendToBackend(payload) {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: payload.message, context: payload.context, history: payload.history }),
      signal: payload.signal
    });
    if (!response.ok) throw new Error(`NOVA API trả về lỗi ${response.status}.`);
    const data = await response.json();
    if (!data || typeof data.text !== 'string') throw new Error('Phản hồi NOVA API không hợp lệ.');
    return data;
  }
}

export const novaApi = new NovaApiService();
