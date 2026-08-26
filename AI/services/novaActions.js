import { NOVA_CONFIG } from '../config/nova.config.js';
import { novaIntent } from './novaIntentEngine.js?v=9';

const projectRoot = new URL('../../', import.meta.url);
const routes = Object.freeze({
  community: new URL('community/community-feed-page.html', projectRoot).href,
  messages: new URL('community/messages/messages-page.html', projectRoot).href,
  profile: new URL('community/profile-user/user-profile.html', projectRoot).href,
  games: new URL('games/', projectRoot).href,
  gravityTourist: new URL('games/gravity-tourist/', projectRoot).href
});

const normalize = value => String(value || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd');

const ACTION_GUIDES = Object.freeze({
  contactSupport: ['Mình hiểu bạn đang có góp ý hoặc cần một việc thuộc quyền quản trị viên. Bạn có thể chọn cách liên hệ thuận tiện ngay bên dưới. Tuyệt đối không gửi mật khẩu hoặc mã OTP.', 'Chọn cách liên hệ'],
  openComposer: ['Khung đăng bài nằm ở đầu trang Cộng đồng. Bạn có thể nhập nội dung, thêm media và chọn quyền riêng tư.', 'Mở khung đăng bài'],
  focusSearch: ['Ô tìm kiếm nằm ở đầu trang Cộng đồng. NOVA sẽ đưa con trỏ tới đó để bạn nhập tên hoặc ID thành viên.', 'Mở tìm kiếm'],
  goMessages: ['Trang Tin nhắn cho phép bạn chọn bạn bè, gửi chữ, hình ảnh, ghi âm và hiệu ứng.', 'Đi đến tin nhắn'],
  goProfile: ['Hồ sơ cá nhân chứa thông tin, ảnh đại diện và các bài viết của bạn.', 'Mở hồ sơ'],
  goCommunity: ['Trang Cộng đồng là nơi xem bảng tin, đăng bài và tương tác với mọi người.', 'Về trang Cộng đồng'],
  openNotifications: ['Thông báo tổng hợp lượt thích, bình luận và hoạt động mới trên tài khoản.', 'Mở thông báo'],
  openSettings: ['Cài đặt tài khoản gồm thông tin, quyền riêng tư và tùy chọn giao diện.', 'Mở cài đặt'],
  openMyPosts: ['Mục bài viết của tôi giúp bạn xem nhanh những nội dung mình đã đăng.', 'Mở bài viết của tôi']
});

export class NovaActionRegistry {
  constructor() {
    this.actions = new Map();
    this.registerDefaults();
    window.queueMicrotask?.(() => this.runPendingAction());
  }

  register(name, action) {
    if (!name || typeof action?.execute !== 'function') throw new TypeError('NOVA action không hợp lệ.');
    this.actions.set(name, action);
    return () => this.actions.delete(name);
  }

  registerDefaults() {
    this.register('contactSupport', {
      match: query => novaIntent.detect(query).intent === 'contactSupport',
      responseActions: [
        { id: 'openAdminMessages', label: 'Nhắn cho admin', icon: 'message' },
        { id: 'openAdminFacebook', label: 'Mở Facebook', icon: 'arrow-up-right-from-square' },
        { id: 'copyAdminTiktok', label: 'Sao chép TikTok', icon: 'copy' },
        { id: 'copyAdminPhone', label: 'Sao chép Zalo/SĐT', icon: 'phone' }
      ],
      execute: () => ({ available: true, text: 'Bạn hãy chọn một kênh liên hệ bên dưới để trao đổi trực tiếp với quản trị viên.' })
    });
    this.register('openAdminMessages', {
      execute: () => this.#navigate(new URL(`${routes.messages}?novaContact=admin`).href, 'Đang mở Trạm liên lạc. Hãy chọn tài khoản ADMIN VHHT để gửi góp ý…')
    });
    this.register('openAdminFacebook', {
      execute: () => {
        const opened=window.open(NOVA_CONFIG.support.facebookUrl,'_blank','noopener,noreferrer');
        return { available: Boolean(opened), text: opened?'Đã mở trang Facebook của VHHT trong thẻ mới.':'Trình duyệt đang chặn cửa sổ mới. Bạn hãy cho phép popup rồi thử lại.' };
      }
    });
    this.register('copyAdminTiktok', { execute: () => this.#copyContact(NOVA_CONFIG.support.tiktokId,'Đã sao chép ID TikTok') });
    this.register('copyAdminPhone', { execute: () => this.#copyContact(NOVA_CONFIG.support.phone,'Đã sao chép Zalo/SĐT') });
    this.register('openComposer', {
      match: query => novaIntent.detect(query).intent === 'openComposer',
      guide: 'Khung đăng bài nằm ở đầu trang Cộng đồng. Bạn có thể nhập nội dung, thêm ảnh hoặc video và chọn quyền riêng tư.',
      confirmLabel: 'Mở khung đăng bài',
      execute: () => {
        if (!document.querySelector('.community-create-post-container-wrapper')) {
          return this.#navigate(this.#withPendingAction(routes.community, 'openComposer'), 'Đang mở khung đăng bài…');
        }
        window.dispatchEvent(new Event('vhht:open-composer'));
        return { available: true, text: 'Mình đã mở khung đăng bài cho bạn. Hãy nhập nội dung rồi chọn quyền riêng tư nhé! ✨' };
      }
    });
    this.register('focusSearch', {
      match: query => novaIntent.detect(query).intent === 'focusSearch',
      guide: 'Ô tìm kiếm nằm ở đầu trang Cộng đồng. NOVA có thể đưa con trỏ tới đó để bạn nhập tên hoặc ID thành viên.',
      confirmLabel: 'Mở tìm kiếm',
      execute: () => {
        const input = document.getElementById('community-user-search') || document.querySelector('input[type="search"]');
        if (!input) return this.#navigate(this.#withPendingAction(routes.community, 'focusSearch'), 'Đang đưa bạn đến tìm kiếm…');
        input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { available: true, text: 'Ô tìm kiếm đã sẵn sàng. Bạn nhập tên thành viên hoặc từ khóa cần tìm nhé!' };
      }
    });
    this.register('goMessages', { match: query => novaIntent.detect(query).intent === 'goMessages', execute: () => this.#navigate(routes.messages, 'Đang đưa bạn đến Trạm liên lạc…') });
    this.register('goProfile', { match: query => novaIntent.detect(query).intent === 'goProfile', execute: () => this.#openProfile() });
    this.register('goGameCenter', { match: query => novaIntent.detect(query).intent === 'goGameCenter', guide: 'Game Center là khu arcade cạnh tranh của VHHT, có kỷ lục cá nhân và bảng xếp hạng toàn cầu.', confirmLabel: 'Mở Game Center', execute: () => this.#navigate(routes.games, 'Đang mở Game Center...') });
    this.register('goGravityTourist', { match: query => novaIntent.detect(query).intent === 'goGravityTourist', guide: 'NOVA chỉ đưa bạn tới sảnh nhiệm vụ Gravity Tourist. Quyết định bắt đầu và toàn bộ thao tác trong trận thuộc về người chơi.', confirmLabel: 'Tới Gravity Tourist', execute: () => this.#navigate(routes.gravityTourist, 'Đang mở sảnh Gravity Tourist...') });
    this.register('goCommunity', { match: query => novaIntent.detect(query).intent === 'goCommunity', execute: () => this.#navigate(routes.community, 'Đang đưa bạn về Không gian cộng đồng…') });
    this.register('openNotifications', { match: query => novaIntent.detect(query).intent === 'openNotifications', execute: () => this.#openCommunityControl('community-notifications-button','openNotifications','Đã mở bảng thông báo cho bạn.') });
    this.register('openSettings', { match: query => novaIntent.detect(query).intent === 'openSettings', execute: () => this.#openAccountControl('community-settings-button','openSettings','Đang mở Cài đặt…') });
    this.register('openMyPosts', { match: query => novaIntent.detect(query).intent === 'openMyPosts', execute: () => this.#openCommunityControl('toggle-my-posts-panel-button','openMyPosts','Đã mở bài viết của bạn.') });
  }

  match(message) {
    const query = normalize(message);
    for (const [name, action] of this.actions) {
      if (!action.match?.(query)) continue;
      const [text, confirmLabel] = ACTION_GUIDES[name] || [action.guide || 'NOVA đã hiểu yêu cầu của bạn.', action.confirmLabel || 'Xác nhận mở'];
      return { handled: true, action: name, text, confirmLabel, actions: action.responseActions || null };
    }
    return { handled: false };
  }

  async execute(name) {
    const action = this.actions.get(name);
    if (!action) return { available: false, text: 'Hành động này hiện không còn khả dụng.' };
    return { action: name, ...(await action.execute({ confirmed: true })) };
  }

  async matchAndExecute(message) {
    const query = normalize(message);
    for (const [name, action] of this.actions) {
      if (!action.match?.(query)) continue;
      const result = await action.execute({ message, query });
      if (result?.available === false) continue;
      return { handled: true, action: name, ...result };
    }
    return { handled: false };
  }

  #openCommunityControl(id, pendingAction, text) {
    const control = document.getElementById(id);
    if (!control) return this.#navigate(this.#withPendingAction(routes.community, pendingAction), 'Đang mở trang Cộng đồng…');
    control.click(); control.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    return { available: true, text };
  }

  #openAccountControl(id, pendingAction, text) {
    const control = document.getElementById(id);
    if (!control) return this.#navigate(this.#withPendingAction(routes.community, pendingAction), 'Đang mở trang Cộng đồng…');
    document.getElementById('community-account-trigger')?.click();
    window.setTimeout(() => control.click(), 80);
    return { available: true, text };
  }

  runPendingAction() {
    let pending = '';
    try { pending = new URL(window.location.href).searchParams.get('novaAction') || ''; } catch (_) { return; }
    if (!pending) return;
    window.setTimeout(() => {
      if (pending === 'openComposer') window.dispatchEvent(new Event('vhht:open-composer'));
      if (pending === 'focusSearch') {
        const input = document.getElementById('community-user-search') || document.querySelector('input[type="search"]');
        input?.focus(); input?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }
      if (pending === 'openNotifications') document.getElementById('community-notifications-button')?.click();
      if (pending === 'openMyPosts') document.getElementById('toggle-my-posts-panel-button')?.click();
      if (pending === 'openSettings') { document.getElementById('community-account-trigger')?.click(); window.setTimeout(() => document.getElementById('community-settings-button')?.click(), 80); }
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('novaAction');
        window.history.replaceState({}, '', cleanUrl.href);
      } catch (_) {}
    }, 180);
  }

  #navigate(url, text) {
    try { window.location.assign(url); }
    catch (_) { window.location.href = url; }
    return { available: true, text };
  }

  #withPendingAction(url, action) {
    const target = new URL(url);
    target.searchParams.set('novaAction', action);
    return target.href;
  }

  async #copyContact(value, successText) {
    try {
      if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(value);
      else {
        const helper=document.createElement('textarea');helper.value=value;helper.style.position='fixed';helper.style.opacity='0';document.body.appendChild(helper);helper.select();document.execCommand('copy');helper.remove();
      }
      return { available:true,text:`${successText}: ${value}` };
    } catch (_) { return { available:false,text:`Không thể tự sao chép. Thông tin liên hệ là: ${value}` }; }
  }

  #openProfile() {
    const appProfileTrigger = document.getElementById('community-profile-button');
    if (appProfileTrigger && typeof appProfileTrigger.onclick === 'function') {
      appProfileTrigger.click();
      return { available: true, text: 'Đang mở Hồ sơ cá nhân của bạn…' };
    }
    const profileLink = document.getElementById('admin-profile-entry')
      || document.querySelector('a[href*="profile-user/user-profile.html"]');
    if (profileLink?.href) return this.#navigate(profileLink.href, 'Đang mở Hồ sơ cá nhân của bạn…');
    return this.#navigate(routes.profile, 'Đang mở Hồ sơ cá nhân của bạn…');
  }
}

export const novaActions = new NovaActionRegistry();
