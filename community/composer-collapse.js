const wrapper = document.querySelector('.community-create-post-container-wrapper');
const toggle = document.getElementById('community-composer-toggle');
const input = document.getElementById('main-post-textarea');
const STORAGE_KEY = 'vhht_community_composer_collapsed';

function setCollapsed(collapsed, { persist = true, focus = false } = {}) {
  if (!wrapper || !toggle) return;
  wrapper.classList.toggle('composer-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Mở khung đăng bài' : 'Thu gọn khung đăng bài');
  toggle.title = collapsed ? 'Mở khung đăng bài' : 'Thu gọn khung đăng bài';
  const icon = toggle.querySelector('i');
  const label = toggle.querySelector('span');
  if (icon) icon.className = collapsed ? 'fa-solid fa-pen-to-square' : 'fa-solid fa-chevron-down';
  if (label) label.textContent = collapsed ? 'Đăng bài' : 'Thu gọn';
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch (_) {}
  }
  if (!collapsed && focus) requestAnimationFrame(() => input?.focus());
}

if (wrapper && toggle) {
  let saved = false;
  try { saved = localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) {}
  setCollapsed(saved, { persist: false });
  toggle.addEventListener('click', () => setCollapsed(!wrapper.classList.contains('composer-collapsed'), { focus: true }));
  window.addEventListener('vhht:open-composer', () => setCollapsed(false, { focus: true }));
}

export { setCollapsed };

