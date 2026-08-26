import { GAME_CONFIG } from './config/game-config.js';
import { GameState } from './types/game-state.js';
import { GameEngine } from './core/GameEngine.js';
import { GameLoop } from './core/GameLoop.js';
import { InputManager } from './core/InputManager.js';
import { GameRenderer } from './components/GameRenderer.js';
import { getRecords, saveRun } from './services/RecordService.js';
import { loadLeaderboard, submitLeaderboardRun } from './services/LeaderboardService.js';
import { firebaseAuthentication } from '../../shared/firebase-connection.js';
import { gameAudio } from './services/GameAudio.js';

const cleanStyles = document.createElement('link'); cleanStyles.rel = 'stylesheet'; cleanStyles.href = './styles/game-clean.css?v=1'; document.head.append(cleanStyles);
const leaderboardStyles = document.createElement('link'); leaderboardStyles.rel = 'stylesheet'; leaderboardStyles.href = './styles/leaderboard.css?v=1'; document.head.append(leaderboardStyles);
const pauseStyles = document.createElement('link'); pauseStyles.rel = 'stylesheet'; pauseStyles.href = './styles/pause-screen.css?v=1'; document.head.append(pauseStyles);
const layoutStyles = document.createElement('link'); layoutStyles.rel = 'stylesheet'; layoutStyles.href = './styles/game-layout-v2.css?v=1'; document.head.append(layoutStyles);
const clearEarthStyles = document.createElement('link'); clearEarthStyles.rel = 'stylesheet'; clearEarthStyles.href = './styles/clear-earth-hud.css?v=1'; document.head.append(clearEarthStyles);
const responsiveStyles = document.createElement('link'); responsiveStyles.rel = 'stylesheet'; responsiveStyles.href = './styles/game-responsive-v2.css?v=1'; document.head.append(responsiveStyles);
const resultTrophyStyles = document.createElement('link'); resultTrophyStyles.rel = 'stylesheet'; resultTrophyStyles.href = './styles/game-over-trophy.css?v=1'; document.head.append(resultTrophyStyles);
const reactionStyles = document.createElement('link'); reactionStyles.rel = 'stylesheet'; reactionStyles.href = './styles/alien-reactions.css?v=1'; document.head.append(reactionStyles);

const $ = selector => document.querySelector(selector);
const canvas = $('#game-canvas'), engine = new GameEngine(), renderer = new GameRenderer(canvas, engine);
$('#resume-button').insertAdjacentHTML('afterend', `<button class="pause-secondary" id="pause-retry-button"><i>↻</i><span><b>RESTART RUN</b></span></button>`);
$('#game-over-screen h2').insertAdjacentHTML('afterend', `<span class="result-reaction" aria-hidden="true"></span>`);
$('.command-header').style.zIndex = '11';
$('#pause-button').insertAdjacentHTML('beforebegin','<button id="sound-button" type="button" aria-label="Bật hoặc tắt âm thanh">🔊</button>');
$('#sound-button').textContent=gameAudio.settings.muted?'🔇':'🔊';
const leaderboardButton = $('.header-actions button:first-child'); leaderboardButton.disabled = false; leaderboardButton.id = 'leaderboard-button'; leaderboardButton.textContent = '🏆'; leaderboardButton.setAttribute('aria-label', 'Bảng xếp hạng');
$('#game-shell').insertAdjacentHTML('beforeend', `<section class="leaderboard-overlay" id="leaderboard-overlay" hidden><div class="leaderboard-panel"><header><div><small>GRAVITY TOURIST // GLOBAL</small><h2>BẢNG XẾP HẠNG</h2></div><button id="close-leaderboard" aria-label="Đóng">×</button></header><nav><button class="active">TẤT CẢ NGƯỜI CHƠI</button><span>HIGH SCORE</span></nav><div class="leaderboard-list" id="leaderboard-list"><p>Đang tải dữ liệu...</p></div><footer>Điểm được đồng bộ với tài khoản VHHT sau mỗi run.</footer></div></section>`);
$('.results').insertAdjacentHTML('afterend', `<section class="game-over-leaders"><header><span>GLOBAL RANKING</span><button id="open-full-leaderboard">VIEW TOP 50 →</button></header><div id="game-over-leader-list">SYNCING SCORES...</div></section>`);
let state = GameState.MENU, records = getRecords(), introElapsed = 0, lastAlert = '', defenseAnnounced = false, leaderboardReturnToCenter = new URLSearchParams(location.search).has('leaderboard');
const loop = new GameLoop(dt => {
  if (state === GameState.PLAYING) engine.update(dt);
  if (state === GameState.INTRO) { introElapsed += dt; renderer.introProgress = Math.min(1, introElapsed / 2.8); if (introElapsed >= 2.8) { renderer.introProgress = -1; setState(GameState.PLAYING); } }
}, () => { renderer.render(); if (state === GameState.PLAYING) updateHud(); }, GAME_CONFIG.fixedStep, GAME_CONFIG.maxFrameTime);

function setState(next) {
  state = next;
  $('#start-screen').hidden = next !== GameState.MENU; $('#pause-screen').hidden = next !== GameState.PAUSED; $('#game-over-screen').hidden = next !== GameState.GAME_OVER; $('#hud').hidden = next === GameState.MENU || next === GameState.INTRO;
  $('#pause-button').hidden = next === GameState.MENU || next === GameState.INTRO || next === GameState.GAME_OVER;
}
function start() { engine.reset(); gameAudio.stopEffects(); gameAudio.playIntro(); introElapsed = 0; lastAlert = ''; defenseAnnounced = false; renderer.introProgress = 0; setState(GameState.INTRO); updateHud(); }
function action() {
  if (state === GameState.PLAYING) { if(engine.launch()){renderer.showReaction(0,.9);gameAudio.play('ufo-launch',{level:.82,cooldown:120});gameAudio.setLoop('orbit-loop',false);} }
  else if (state === GameState.MENU) start();
  else if (state === GameState.GAME_OVER) start();
}
function togglePause() { if (state === GameState.PLAYING){gameAudio.play('pause-open',{level:.72});gameAudio.setMusic('pause-ambient',{level:.52,fade:.5});setState(GameState.PAUSED);} else if (state === GameState.PAUSED){gameAudio.play('pause-close',{level:.72});gameAudio.gameplay(engine.snapshot().alert);setState(GameState.PLAYING);} }
function updateHud() {
  const run = engine.snapshot(); $('#score').textContent = run.score.toLocaleString('vi-VN'); $('#approach').textContent = run.approaches; $('#combo').textContent = `×${(1 + run.combo * .25).toFixed(2)}`;
  $('#hud-best').textContent = Number(records.highScore).toLocaleString('vi-VN');
  const progress = Math.min(99, Math.round(engine.difficulty.progress * 100)); $('#progress').textContent = `${progress}%`; $('#distance').textContent = `${Math.max(.1, 48 * (1 - progress / 100)).toFixed(1)} KM`; $('#sector').textContent = 1 + Math.floor(run.approaches / 5);
  $('#event-message').textContent = run.message; $('#event-message').classList.toggle('show', Boolean(run.message));
  if (!engine.newBest && records.highScore > 0 && run.score > records.highScore) { engine.newBest = true; $('#event-message').textContent = 'NEW PERSONAL BEST'; $('#event-message').classList.add('show'); }
  if(state===GameState.PLAYING){if(run.alert!==lastAlert){if(lastAlert&&run.alert==='INVASION ALERT')gameAudio.play('invasion-alert-siren',{level:.72,cooldown:1000});lastAlert=run.alert;gameAudio.gameplay(run.alert);}gameAudio.setLoop('orbit-loop',engine.ufo.mode==='orbit',{level:.2,rate:.88+engine.difficulty.progress*.3});}
}
function finish(event) {
  const run = engine.snapshot(), result = saveRun(run); records = result.records;
  $('#death-reason').textContent = event.detail.reason; $('#final-score').textContent = run.score.toLocaleString('vi-VN'); $('#best-score').textContent = records.highScore.toLocaleString('vi-VN'); $('#final-approach').textContent = run.approaches; $('#final-perfect').textContent = run.perfect; $('#final-combo').textContent = run.bestCombo; $('#final-time').textContent = `${Math.floor(run.elapsed / 60)}:${String(Math.floor(run.elapsed % 60)).padStart(2, '0')}`; $('#new-best').hidden = !result.isNewBest; setState(GameState.GAME_OVER);
  gameAudio.setLoop('orbit-loop',false);gameAudio.stopMusic(.25);gameAudio.play(event.detail.reason==='EARTH DEFENSE INTERCEPTED'?'defense-intercept':event.detail.reason==='SPACE DEBRIS COLLISION'?'hazard-impact':'ufo-lost',{level:.9});gameAudio.play('game-over',{level:.78});gameAudio.play('alien-sad',{level:.3});setTimeout(()=>gameAudio.play('result-reveal',{level:.62}),420);if(result.isNewBest)setTimeout(()=>{gameAudio.play('new-record',{level:.8});gameAudio.play('alien-record',{level:.3});},850);
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
  renderer.showReaction(event.detail.scored ? (event.detail.quality === 'perfect' ? 3 : 0) : 1, 1.1);
  gameAudio.play('gravity-capture',{level:.62});if(event.detail.scored){gameAudio.play(event.detail.quality==='perfect'?'gravity-assist-perfect':'gravity-assist',{level:.72});gameAudio.play('score-gain',{level:.5,rate:1+Math.min(.22,engine.scoreSystem.combo*.025)});if(engine.scoreSystem.combo>1)gameAudio.play('combo-up',{level:.42});gameAudio.play(event.detail.quality==='perfect'?'alien-excited':'alien-happy',{level:.24});}else{gameAudio.play('no-progress',{level:.65});gameAudio.play('alien-confused',{level:.25});}
  const feed = $('#event-feed'), item = document.createElement('li'), run = engine.snapshot();
  item.innerHTML = `<time>${String(Math.floor(run.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(run.elapsed % 60)).padStart(2, '0')}</time><span>${event.detail.scored ? (event.detail.quality === 'perfect' ? 'Perfect forward assist!' : 'New frontier reached') : 'Backtrack — no score'}</span><b>${event.detail.scored ? (event.detail.quality === 'perfect' ? '+250' : '+100') : '+0'}</b>`;
  feed.prepend(item); while (feed.children.length > 4) feed.lastElementChild.remove();
});
engine.addEventListener('defensewarning',event=>{if(!defenseAnnounced){defenseAnnounced=true;gameAudio.play('earth-defense-online',{level:.8});}gameAudio.play('target-lock-warning',{level:.85,cooldown:450});if(event.detail.kind==='laser')gameAudio.play('laser-charge',{level:.58,cooldown:450});renderer.showReaction(2,.9);});
engine.addEventListener('defensefire',event=>{gameAudio.play(event.detail.salvo>1?'defense-salvo':event.detail.kind==='laser'?'laser-fire':event.detail.kind==='energy'?'energy-shot':'missile-launch-distant',{level:.78,cooldown:150});});
new InputManager(canvas, action, togglePause, () => state === GameState.GAME_OVER && start());
$('#play-button').addEventListener('click', start); $('#retry-button').addEventListener('click', start); $('#pause-button').addEventListener('click', togglePause); $('#resume-button').addEventListener('click', togglePause);
$('#pause-retry-button').addEventListener('click', start);
$('#sound-button').addEventListener('click',event=>{event.stopPropagation();const muted=gameAudio.toggleMute();event.currentTarget.textContent=muted?'🔇':'🔊';event.currentTarget.setAttribute('aria-pressed',String(muted));if(!muted)gameAudio.play('setting-toggle',{level:.5});});
leaderboardButton.addEventListener('click', () => { leaderboardReturnToCenter = false; openLeaderboard(); }); $('#close-leaderboard').addEventListener('click', () => { if (leaderboardReturnToCenter) location.href = '../'; else $('#leaderboard-overlay').hidden = true; }); $('#open-full-leaderboard').addEventListener('click', openLeaderboard);
document.addEventListener('visibilitychange', () => document.hidden && state === GameState.PLAYING && setState(GameState.PAUSED));
document.addEventListener('pointerover',event=>{if(event.target.closest('button,a'))gameAudio.play('ui-hover',{level:.24,cooldown:110});});
leaderboardButton.addEventListener('click',()=>gameAudio.play('leaderboard-open',{level:.7}));
$('#close-leaderboard').addEventListener('click',()=>gameAudio.play('ui-click',{level:.45}));
window.addEventListener('pointerdown',()=>{if(state===GameState.MENU)gameAudio.setMusic('title-theme',{level:.7,fade:.5});},{once:true,capture:true});
setState(GameState.MENU); loop.start();
if (new URLSearchParams(location.search).has('leaderboard')) openLeaderboard();
