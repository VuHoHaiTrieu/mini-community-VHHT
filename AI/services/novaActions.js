import { novaIntent } from './novaIntentEngine.js?v=7';

const projectRoot = new URL('../../', import.meta.url);
const routes = Object.freeze({
  community: new URL('community/community-feed-page.html', projectRoot).href,
  messages: new URL('community/messages/messages-page.html', projectRoot).href,
  profile: new URL('community/profile-user/user-profile.html', projectRoot).href
});

const normalize = value => String(value || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd');

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
    this.register('openComposer', {
      match: query => novaIntent.detect(query).intent === 'openComposer',
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
      execute: () => {
        const input = document.getElementById('community-user-search') || document.querySelector('input[type="search"]');
        if (!input) return this.#navigate(this.#withPendingAction(routes.community, 'focusSearch'), 'Đang đưa bạn đến tìm kiếm…');
        input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { available: true, text: 'Ô tìm kiếm đã sẵn sàng. Bạn nhập tên thành viên hoặc từ khóa cần tìm nhé!' };
      }
    });
    this.register('goMessages', { match: query => novaIntent.detect(query).intent === 'goMessages', execute: () => this.#navigate(routes.messages, 'Đang đưa bạn đến Trạm liên lạc…') });
    this.register('goProfile', { match: query => novaIntent.detect(query).intent === 'goProfile', execute: () => this.#openProfile() });
    this.register('goCommunity', { match: query => novaIntent.detect(query).intent === 'goCommunity', execute: () => this.#navigate(routes.community, 'Đang đưa bạn về Không gian cộng đồng…') });
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
