import { DEFAULT_GAME_SETTINGS, subscribeGameSettings, saveGameSettings } from '../games/_shared/GameSettingsService.js';

const GAME_ID = 'gravity-tourist';

function navigationButton(mobile = false) {
  const button = document.createElement('button');
  button.className = 'admin-navigation-button';
  button.type = 'button';
  button.dataset.page = 'games-page-section';
  button.dataset.title = 'Trò chơi';
  button.dataset.subtitle = 'Phát hành, độ khó và bảng xếp hạng';
  if (!mobile) button.dataset.tooltip = 'Trò chơi';
  button.innerHTML = '<i class="fa-solid fa-gamepad" aria-hidden="true"></i><span>Trò chơi</span>';
  return button;
}

function installInterface() {
  const desktopNav = document.querySelector('.admin-navigation-menu');
  const auditNav = desktopNav?.querySelector('[data-page="audit-page-section"]');
  if (desktopNav && !desktopNav.querySelector('[data-page="games-page-section"]')) {
    const button = navigationButton();
    if (auditNav) auditNav.before(button); else desktopNav.append(button);
  }
  const mobileDock = document.querySelector('.admin-mobile-dock');
  if (mobileDock && !mobileDock.querySelector('[data-page="games-page-section"]')) mobileDock.append(navigationButton(true));

  const section = document.createElement('section');
  section.id = 'games-page-section';
  section.className = 'admin-page-section';
  section.setAttribute('aria-labelledby', 'games-heading');
  section.innerHTML = `
    <div class="admin-section-intro admin-management-intro"><div><p class="admin-eyebrow">VHHT Arcade Operations</p><h2 id="games-heading">Quản lý trò chơi</h2><p>Cấu hình này được đồng bộ trực tiếp tới Game Center và người chơi.</p></div></div>
    <div class="admin-game-console"><article class="admin-game-card">
      <div class="admin-game-card__head"><div><h3>Gravity Tourist</h3><p>Endless gravity arcade · games/gravity-tourist</p></div><span id="admin-game-status-badge" class="admin-game-status">LIVE</span></div>
      <form id="admin-game-form" class="admin-game-form">
        <div class="admin-game-field"><label for="admin-game-status">Trạng thái phát hành</label><select id="admin-game-status"><option value="live">Đang hoạt động</option><option value="maintenance">Bảo trì</option><option value="offline">Tạm đóng</option></select></div>
        <div class="admin-game-field"><label for="admin-game-difficulty">Hệ số độ khó <output id="admin-game-difficulty-output">1.00×</output></label><input id="admin-game-difficulty" type="range" min="0.75" max="1.5" step="0.05" value="1"></div>
        <div class="admin-game-field admin-game-field--wide"><label for="admin-game-announcement">Thông báo trong Game Center</label><textarea id="admin-game-announcement" maxlength="180" placeholder="Để trống nếu không có thông báo"></textarea></div>
        <div class="admin-game-field admin-game-field--wide"><label class="admin-game-switch"><input id="admin-game-leaderboard" type="checkbox" checked> Cho phép ghi và hiển thị bảng xếp hạng</label></div>
        <div class="admin-game-actions"><button class="admin-game-save" type="submit">Lưu và phát hành</button><span id="admin-game-feedback" class="admin-game-feedback" role="status"></span></div>
      </form>
    </article></div>`;
  const auditSection = document.querySelector('#audit-page-section');
  if (auditSection) auditSection.before(section);
  else document.querySelector('.admin-page-sections-container, .admin-main-content-container')?.append(section);
  return section;
}

function initialise() {
  const section = installInterface();
  const form = section.querySelector('#admin-game-form');
  const status = section.querySelector('#admin-game-status');
  const announcement = section.querySelector('#admin-game-announcement');
  const leaderboard = section.querySelector('#admin-game-leaderboard');
  const difficulty = section.querySelector('#admin-game-difficulty');
  const output = section.querySelector('#admin-game-difficulty-output');
  const badge = section.querySelector('#admin-game-status-badge');
  const feedback = section.querySelector('#admin-game-feedback');
  const renderDifficulty = () => { output.value = `${Number(difficulty.value).toFixed(2)}×`; output.textContent = output.value; };
  difficulty.addEventListener('input', renderDifficulty);
  subscribeGameSettings(GAME_ID, settings => {
    status.value = settings.status || DEFAULT_GAME_SETTINGS.status;
    announcement.value = settings.announcement || '';
    leaderboard.checked = settings.leaderboardEnabled !== false;
    difficulty.value = String(Number(settings.difficultyScale) || 1);
    badge.textContent = status.value.toUpperCase();
    renderDifficulty();
  });
  status.addEventListener('change', () => { badge.textContent = status.value.toUpperCase(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; feedback.textContent = 'Đang đồng bộ…';
    try {
      await saveGameSettings(GAME_ID, { status: status.value, announcement: announcement.value.trim(), leaderboardEnabled: leaderboard.checked, difficultyScale: Number(difficulty.value) });
      feedback.textContent = 'Đã phát hành cấu hình mới.';
    } catch (error) {
      console.error(error); feedback.textContent = 'Không thể lưu. Hãy kiểm tra quyền quản trị Firestore.';
    } finally { button.disabled = false; }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
else initialise();
