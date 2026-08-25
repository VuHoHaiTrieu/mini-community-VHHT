import { GAME_CONFIG } from './config/game-config.js';
import { GameState } from './types/game-state.js';
import { GameEngine } from './core/GameEngine.js';
import { GameLoop } from './core/GameLoop.js';
import { InputManager } from './core/InputManager.js';
import { GameRenderer } from './components/GameRenderer.js';
import { getRecords, saveRun } from './services/RecordService.js';
import { loadLeaderboard, submitLeaderboardRun } from './services/LeaderboardService.js';
import { firebaseAuthentication } from '../../shared/firebase-connection.js';

const cleanStyles = document.createElement('link'); cleanStyles.rel = 'stylesheet'; cleanStyles.href = './styles/game-clean.css?v=1'; document.head.append(cleanStyles);
const leaderboardStyles = document.createElement('link'); leaderboardStyles.rel = 'stylesheet'; leaderboardStyles.href = './styles/leaderboard.css?v=1'; document.head.append(leaderboardStyles);
const pauseStyles = document.createElement('link'); pauseStyles.rel = 'stylesheet'; pauseStyles.href = './styles/pause-screen.css?v=1'; document.head.append(pauseStyles);
const layoutStyles = document.createElement('link'); layoutStyles.rel = 'stylesheet'; layoutStyles.href = './styles/game-layout-v2.css?v=1'; document.head.append(layoutStyles);
const clearEarthStyles = document.createElement('link'); clearEarthStyles.rel = 'stylesheet'; clearEarthStyles.href = './styles/clear-earth-hud.css?v=1'; document.head.append(clearEarthStyles);
const resultTrophyStyles = document.createElement('link'); resultTrophyStyles.rel = 'stylesheet'; resultTrophyStyles.href = './styles/game-over-trophy.css?v=1'; document.head.append(resultTrophyStyles);

const $ = selector => document.querySelector(selector);
const canvas = $('#game-canvas'), engine = new GameEngine(), renderer = new GameRenderer(canvas, engine);
$('#resume-button').insertAdjacentHTML('afterend', `<button class="pause-secondary" id="pause-retry-button"><i>↻</i><span><b>RESTART RUN</b></span></button>`);
$('.command-header').style.zIndex = '11';
const leaderboardButton = $('.header-actions button:first-child'); leaderboardButton.disabled = false; leaderboardButton.id = 'leaderboard-button'; leaderboardButton.textContent = '🏆'; leaderboardButton.setAttribute('aria-label', 'Bảng xếp hạng');
$('#game-shell').insertAdjacentHTML('beforeend', `<section class="leaderboard-overlay" id="leaderboard-overlay" hidden><div class="leaderboard-panel"><header><div><small>GRAVITY TOURIST // GLOBAL</small><h2>BẢNG XẾP HẠNG</h2></div><button id="close-leaderboard" aria-label="Đóng">×</button></header><nav><button class="active">TẤT CẢ NGƯỜI CHƠI</button><span>HIGH SCORE</span></nav><div class="leaderboard-list" id="leaderboard-list"><p>Đang tải dữ liệu...</p></div><footer>Điểm được đồng bộ với tài khoản VHHT sau mỗi run.</footer></div></section>`);
$('.results').insertAdjacentHTML('afterend', `<section class="game-over-leaders"><header><span>GLOBAL RANKING</span><button id="open-full-leaderboard">VIEW TOP 50 →</button></header><div id="game-over-leader-list">SYNCING SCORES...</div></section>`);
let state = GameState.MENU, records = getRecords(), introElapsed = 0, leaderboardReturnToCenter = new URLSearchParams(location.search).has('leaderboard');
const loop = new GameLoop(dt => {
  if (state === GameState.PLAYING) engine.update(dt);
  if (state === GameState.INTRO) { introElapsed += dt; renderer.introProgress = Math.min(1, introElapsed / 2.8); if (introElapsed >= 2.8) { renderer.introProgress = -1; setState(GameState.PLAYING); } }
}, () => { renderer.render(); if (state === GameState.PLAYING) updateHud(); }, GAME_CONFIG.fixedStep, GAME_CONFIG.maxFrameTime);

function setState(next) {
  state = next;
  $('#start-screen').hidden = next !== GameState.MENU; $('#pause-screen').hidden = next !== GameState.PAUSED; $('#game-over-screen').hidden = next !== GameState.GAME_OVER; $('#hud').hidden = next === GameState.MENU || next === GameState.INTRO;
  $('#pause-button').hidden = next === GameState.MENU || next === GameState.INTRO || next === GameState.GAME_OVER;
}
function start() { engine.reset(); introElapsed = 0; renderer.introProgress = 0; setState(GameState.INTRO); updateHud(); }
function action() {
  if (state === GameState.PLAYING) engine.launch();
  else if (state === GameState.MENU) start();
  else if (state === GameState.GAME_OVER) start();
}
function togglePause() { if (state === GameState.PLAYING) setState(GameState.PAUSED); else if (state === GameState.PAUSED) setState(GameState.PLAYING); }
function updateHud() {
  const run = engine.snapshot(); $('#score').textContent = run.score.toLocaleString('vi-VN'); $('#approach').textContent = run.approaches; $('#combo').textContent = `×${(1 + run.combo * .25).toFixed(2)}`; $('#alert').textContent = run.alert;
  $('#hud-best').textContent = Number(records.highScore).toLocaleString('vi-VN');
  const progress = Math.min(99, Math.round(engine.difficulty.progress * 100)); $('#progress').textContent = `${progress}%`; $('#distance').textContent = `${Math.max(.1, 48 * (1 - progress / 100)).toFixed(1)} KM`; $('#sector').textContent = 1 + Math.floor(run.approaches / 5);
  $('#event-message').textContent = run.message; $('#event-message').classList.toggle('show', Boolean(run.message));
  if (!engine.newBest && records.highScore > 0 && run.score > records.highScore) { engine.newBest = true; $('#event-message').textContent = 'NEW PERSONAL BEST'; $('#event-message').classList.add('show'); }
}
function finish(event) {
  const run = engine.snapshot(), result = saveRun(run); records = result.records;
  $('#death-reason').textContent = event.detail.reason; $('#final-score').textContent = run.score.toLocaleString('vi-VN'); $('#best-score').textContent = records.highScore.toLocaleString('vi-VN'); $('#final-approach').textContent = run.approaches; $('#final-perfect').textContent = run.perfect; $('#final-combo').textContent = run.bestCombo; $('#final-time').textContent = `${Math.floor(run.elapsed / 60)}:${String(Math.floor(run.elapsed % 60)).padStart(2, '0')}`; $('#new-best').hidden = !result.isNewBest; setState(GameState.GAME_OVER);
  leaderboardReturnToCenter = false;
  submitLeaderboardRun(run).catch(console.warn).finally(refreshGameOverLeaders);
}

const leaderboardRows = entries => entries.length ? entries.map(entry => `<article class="leader-row ${entry.id === firebaseUserId() ? 'is-you' : ''}"><b class="rank">${entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank - 1] : `#${entry.rank}`}</b><span class="player">${escapeHtml(entry.displayName || 'VHHT Traveller')} ${entry.id === firebaseUserId() ? '<i>YOU</i>' : ''}</span><strong>${Number(entry.highScore || 0).toLocaleString('vi-VN')}</strong><small>${entry.highestApproach || 0} assists</small></article>`).join('') : '<p class="leader-empty">Chưa có điểm global hoặc bạn chưa đăng nhập.</p>';
const firebaseUserId = () => firebaseAuthentication.currentUser?.uid || '';
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
async function openLeaderboard() { $('#leaderboard-overlay').hidden = false; $('#leaderboard-list').innerHTML = '<p>Đang tải dữ liệu...</p>'; $('#leaderboard-list').innerHTML = leaderboardRows(await loadLeaderboard(50)); }
async function refreshGameOverLeaders() { $('#game-over-leader-list').innerHTML = leaderboardRows(await loadLeaderboard(5)); }

engine.addEventListener('gameover', finish);
engine.addEventListener('capture', event => {
  const feed = $('#event-feed'), item = document.createElement('li'), run = engine.snapshot();
  item.innerHTML = `<time>${String(Math.floor(run.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(run.elapsed % 60)).padStart(2, '0')}</time><span>${event.detail.quality === 'perfect' ? 'Perfect gravity assist!' : 'Gravity body captured'}</span><b>+${event.detail.quality === 'perfect' ? '250' : '100'}</b>`;
  feed.prepend(item); while (feed.children.length > 4) feed.lastElementChild.remove();
});
new InputManager(canvas, action, togglePause, () => state === GameState.GAME_OVER && start());
$('#play-button').addEventListener('click', start); $('#retry-button').addEventListener('click', start); $('#pause-button').addEventListener('click', togglePause); $('#resume-button').addEventListener('click', togglePause);
$('#pause-retry-button').addEventListener('click', start);
leaderboardButton.addEventListener('click', () => { leaderboardReturnToCenter = false; openLeaderboard(); }); $('#close-leaderboard').addEventListener('click', () => { if (leaderboardReturnToCenter) location.href = '../'; else $('#leaderboard-overlay').hidden = true; }); $('#open-full-leaderboard').addEventListener('click', openLeaderboard);
document.addEventListener('visibilitychange', () => document.hidden && state === GameState.PLAYING && setState(GameState.PAUSED));
setState(GameState.MENU); loop.start();
if (new URLSearchParams(location.search).has('leaderboard')) openLeaderboard();
