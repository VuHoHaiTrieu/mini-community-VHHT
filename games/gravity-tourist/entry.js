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
import { DEFAULT_GAME_SETTINGS, subscribeGameSettings } from '../_shared/GameSettingsService.js';
import { ResultShareService } from './services/ResultShareService.js';

const cleanStyles = document.createElement('link'); cleanStyles.rel = 'stylesheet'; cleanStyles.href = './styles/game-clean.css?v=1'; document.head.append(cleanStyles);
const leaderboardStyles = document.createElement('link'); leaderboardStyles.rel = 'stylesheet'; leaderboardStyles.href = './styles/leaderboard.css?v=1'; document.head.append(leaderboardStyles);
const pauseStyles = document.createElement('link'); pauseStyles.rel = 'stylesheet'; pauseStyles.href = './styles/pause-screen.css?v=1'; document.head.append(pauseStyles);
const layoutStyles = document.createElement('link'); layoutStyles.rel = 'stylesheet'; layoutStyles.href = './styles/game-layout-v2.css?v=1'; document.head.append(layoutStyles);
const clearEarthStyles = document.createElement('link'); clearEarthStyles.rel = 'stylesheet'; clearEarthStyles.href = './styles/clear-earth-hud.css?v=1'; document.head.append(clearEarthStyles);
const responsiveStyles = document.createElement('link'); responsiveStyles.rel = 'stylesheet'; responsiveStyles.href = './styles/game-responsive-v2.css?v=2'; document.head.append(responsiveStyles);
const resultTrophyStyles = document.createElement('link'); resultTrophyStyles.rel = 'stylesheet'; resultTrophyStyles.href = './styles/game-over-trophy.css?v=1'; document.head.append(resultTrophyStyles);
const reactionStyles = document.createElement('link'); reactionStyles.rel = 'stylesheet'; reactionStyles.href = './styles/alien-reactions.css?v=1'; document.head.append(reactionStyles);
const sharingStyles = document.createElement('link'); sharingStyles.rel = 'stylesheet'; sharingStyles.href = './styles/result-sharing.css?v=1'; document.head.append(sharingStyles);
const sharingStateStyles = document.createElement('link'); sharingStateStyles.rel = 'stylesheet'; sharingStateStyles.href = './styles/result-sharing-state.css?v=1'; document.head.append(sharingStateStyles);

const $ = selector => document.querySelector(selector);
const canvas = $('#game-canvas'), engine = new GameEngine(), renderer = new GameRenderer(canvas, engine), resultShare = new ResultShareService(canvas);
$('#resume-button').insertAdjacentHTML('afterend', `<button class="pause-secondary" id="pause-retry-button"><i>↻</i><span><b>RESTART RUN</b></span></button>`);
$('#game-over-screen h2').insertAdjacentHTML('afterend', `<span class="result-reaction" aria-hidden="true"></span>`);
$('.command-header').style.zIndex = '11';
$('#pause-screen h2').insertAdjacentHTML('afterend',`<section class="pause-audio" aria-label="Gravity Tourist audio settings"><header><span>GAME AUDIO</span><button id="pause-audio-master" type="button" aria-pressed="false">SOUND ON</button></header><label><span><b>MUSIC</b><output id="pause-music-value">100%</output></span><input id="pause-music-volume" type="range" min="0" max="100" step="1" value="100"></label><label><span><b>EFFECTS</b><output id="pause-effects-value">100%</output></span><input id="pause-effects-volume" type="range" min="0" max="100" step="1" value="100"></label></section>`);
const leaderboardButton = $('.header-actions button:first-child'); leaderboardButton.disabled = false; leaderboardButton.id = 'leaderboard-button'; leaderboardButton.textContent = '🏆'; leaderboardButton.setAttribute('aria-label', 'Bảng xếp hạng');
$('#game-shell').insertAdjacentHTML('beforeend', `<section class="leaderboard-overlay" id="leaderboard-overlay" hidden><div class="leaderboard-panel"><header><div><small>GRAVITY TOURIST // GLOBAL</small><h2>BẢNG XẾP HẠNG</h2></div><button id="close-leaderboard" aria-label="Đóng">×</button></header><nav><button class="active">TẤT CẢ NGƯỜI CHƠI</button><span>HIGH SCORE</span></nav><div class="leaderboard-list" id="leaderboard-list"><p>Đang tải dữ liệu...</p></div><footer>Điểm được đồng bộ với tài khoản VHHT sau mỗi run.</footer></div></section>`);
$('.results').insertAdjacentHTML('afterend', `<section class="game-over-leaders"><header><span>GLOBAL RANKING</span><button id="open-full-leaderboard">VIEW TOP 50 →</button></header><div id="game-over-leader-list">SYNCING SCORES...</div></section>`);
$('.game-over-leaders').insertAdjacentHTML('afterend', `<button class="result-share-launch" id="result-share-launch" type="button" disabled><span>✦</span> SHARE FLIGHT RECORD</button>`);
$('#game-shell').insertAdjacentHTML('beforeend', `<section class="result-share-overlay" id="result-share-overlay" hidden><div class="result-share-panel" role="dialog" aria-modal="true" aria-labelledby="result-share-title"><header><div><small>GRAVITY TOURIST // POST-RUN</small><h2 id="result-share-title">SHARE YOUR FLIGHT</h2></div><button class="result-share-close" id="result-share-close" type="button" aria-label="Đóng">×</button></header><div class="result-share-body"><div><img class="result-share-preview" id="result-share-preview" alt="Thẻ thành tích Gravity Tourist"><p class="result-share-copy" id="result-share-copy"></p></div><div class="result-share-actions"><button class="result-share-action primary" data-share-action="post"><i>◈</i><b>COMMUNITY POST</b><small>Đăng ảnh và thành tích lên bảng tin</small></button><button class="result-share-action" data-share-action="message"><i>✉</i><b>MESSAGE</b><small>Thách đấu một người bạn</small></button><button class="result-share-action" data-share-action="note"><i>✦</i><b>24H NOTE</b><small>Đặt thành tích làm ghi chú</small></button><button class="result-share-action" data-share-action="system"><i>↗</i><b>MORE APPS</b><small>Chia sẻ bằng điện thoại</small></button><button class="result-share-action" data-share-action="download"><i>⇩</i><b>SAVE CARD</b><small>Tải ảnh thành tích</small></button><button class="result-share-action" data-share-action="copy"><i>⛓</i><b>COPY CHALLENGE</b><small>Sao chép lời thách đấu</small></button><p class="result-share-status" id="result-share-status" role="status"></p><div class="result-share-friends" id="result-share-friends" hidden></div></div></div></div></section>`);
let state = GameState.MENU, records = getRecords(), introElapsed = 0, lastAlert = '', defenseAnnounced = false, leaderboardReturnToCenter = new URLSearchParams(location.search).has('leaderboard'), liveGameSettings = { ...DEFAULT_GAME_SETTINGS }, lastHudUpdate = 0;
const loop = new GameLoop(dt => {
  if (state === GameState.PLAYING) engine.update(dt);
  if (state === GameState.INTRO) { introElapsed += dt; renderer.introProgress = Math.min(1, introElapsed / 2.8); if (introElapsed >= 2.8) { renderer.introProgress = -1; setState(GameState.PLAYING); } }
}, () => { renderer.render(); const now = performance.now(); if (state === GameState.PLAYING && now - lastHudUpdate >= 100) { lastHudUpdate = now; updateHud(); } }, matchMedia('(max-width: 820px), (pointer: coarse)').matches ? 1 / 60 : GAME_CONFIG.fixedStep, GAME_CONFIG.maxFrameTime, { targetFps: matchMedia('(max-width: 820px), (pointer: coarse)').matches ? 45 : 60 });

function setState(next) {
  state = next;
  $('#start-screen').hidden = next !== GameState.MENU; $('#pause-screen').hidden = next !== GameState.PAUSED; $('#game-over-screen').hidden = next !== GameState.GAME_OVER; $('#hud').hidden = next === GameState.MENU || next === GameState.INTRO;
  $('#pause-button').hidden = next === GameState.MENU || next === GameState.INTRO || next === GameState.GAME_OVER;
  if(next===GameState.PLAYING||next===GameState.INTRO)loop.start();else{loop.stop();renderer.render();}
}
function start() { if (liveGameSettings.status !== 'live') { $('#event-message').textContent = liveGameSettings.announcement || 'GAME TEMPORARILY UNAVAILABLE'; $('#event-message').classList.add('show'); return; } closeResultShare(); $('#result-share-launch').disabled=true; $('#result-share-launch').innerHTML='<span>✦</span> SHARE FLIGHT RECORD'; engine.reset(); engine.difficultyScale = liveGameSettings.difficultyScale; gameAudio.stopEffects(); gameAudio.playIntro(); introElapsed = 0; lastAlert = ''; defenseAnnounced = false; renderer.introProgress = 0; setState(GameState.INTRO); updateHud(); }
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
  if (liveGameSettings.leaderboardEnabled) submitLeaderboardRun(run).catch(console.warn).finally(refreshGameOverLeaders);
  else $('#game-over-leader-list').innerHTML = '<p class="leader-empty">Bảng xếp hạng đang tạm đóng.</p>';
  const shareButton = $('#result-share-launch');
  shareButton.disabled = true; shareButton.innerHTML = '<span>✦</span> PREPARING FLIGHT CARD…';
  resultShare.prepare(run, event.detail.reason).then(({ url }) => {
    $('#result-share-preview').src = url;
    $('#result-share-copy').textContent = resultShare.text();
    shareButton.disabled = false; shareButton.innerHTML = '<span>✦</span> SHARE FLIGHT RECORD';
  }).catch(error => {
    console.warn(error); shareButton.innerHTML = '<span>!</span> FLIGHT CARD UNAVAILABLE';
  });
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
const shareOverlay=$('#result-share-overlay'),shareStatus=$('#result-share-status'),shareFriends=$('#result-share-friends');
function closeResultShare(){shareOverlay.hidden=true;shareFriends.hidden=true;shareFriends.replaceChildren();shareStatus.textContent='';}
function shareFeedback(message,isError=false){shareStatus.textContent=message;shareStatus.classList.toggle('is-error',isError);}
async function runShareAction(button,task){
  const oldDisabled=button.disabled;button.disabled=true;button.classList.add('is-busy');shareFeedback('Đang chuẩn bị…');
  try{await task();}catch(error){if(error?.name!=='AbortError')shareFeedback(error?.message||'Không thể hoàn tất chia sẻ.',true);}
  finally{button.disabled=oldDisabled;button.classList.remove('is-busy');}
}
$('#result-share-launch').addEventListener('click',()=>{shareOverlay.hidden=false;shareFeedback('Chọn nơi bạn muốn khoe thành tích.');gameAudio.play('ui-click',{level:.45});});
$('#result-share-close').addEventListener('click',closeResultShare);
shareOverlay.addEventListener('pointerdown',event=>{event.stopPropagation();if(event.target===shareOverlay)closeResultShare();});
shareOverlay.addEventListener('click',event=>event.stopPropagation());
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!shareOverlay.hidden)closeResultShare();});
shareOverlay.querySelectorAll('[data-share-action]').forEach(button=>button.addEventListener('click',()=>{
  gameAudio.play('ui-click',{level:.4});const action=button.dataset.shareAction;
  if(action==='post')runShareAction(button,async()=>{const id=await resultShare.post();shareFeedback('Đã đăng ảnh thành tích lên bảng tin VHHT.');const link=document.createElement('a');link.href=`../../community/community-feed-page.html?post=${encodeURIComponent(id)}`;link.textContent=' Xem bài đăng →';shareStatus.appendChild(link);});
  else if(action==='note')runShareAction(button,async()=>{await resultShare.note();shareFeedback('Đã đặt thành tích làm ghi chú trong 24 giờ.');});
  else if(action==='system')runShareAction(button,async()=>{await resultShare.nativeShare();shareFeedback('Đã mở bảng chia sẻ của thiết bị.');});
  else if(action==='download')runShareAction(button,async()=>{resultShare.download();shareFeedback('Đã tải thẻ thành tích.');});
  else if(action==='copy')runShareAction(button,async()=>{const value=`${resultShare.text()} ${location.href}`;if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove();}shareFeedback('Đã sao chép lời thách đấu.');});
  else if(action==='message')runShareAction(button,async()=>{
    const friends=await resultShare.friends();shareFriends.replaceChildren();shareFriends.hidden=false;
    if(!friends.length){shareFeedback('Bạn chưa có người bạn nào để gửi thử thách.',true);return;}
    shareFeedback('Chọn một người bạn:');
    friends.forEach(friend=>{const row=document.createElement('article');row.className='result-share-friend';const avatar=document.createElement('span');if(friend.photoURL||friend.profileImage){const image=document.createElement('img');image.src=friend.photoURL||friend.profileImage;image.alt='';avatar.append(image);}else avatar.textContent=(friend.name||'V').trim().charAt(0).toUpperCase();const name=document.createElement('strong');name.textContent=friend.name||'VHHT Friend';const send=document.createElement('button');send.type='button';send.textContent='SEND';send.onclick=()=>runShareAction(send,async()=>{await resultShare.message(friend.id);send.textContent='SENT';send.disabled=true;shareFeedback(`Đã gửi thử thách tới ${friend.name||'người bạn này'}.`);});row.append(avatar,name,send);shareFriends.append(row);});
  });
}));
const musicVolume=$('#pause-music-volume'),effectsVolume=$('#pause-effects-volume'),audioMaster=$('#pause-audio-master');
function renderPauseAudio(){musicVolume.value=Math.round(gameAudio.settings.musicVolume*100);effectsVolume.value=Math.round(gameAudio.settings.effectsVolume*100);$('#pause-music-value').value=`${musicVolume.value}%`;$('#pause-effects-value').value=`${effectsVolume.value}%`;const enabled=gameAudio.settings.musicEnabled||gameAudio.settings.effectsEnabled;audioMaster.textContent=enabled?'SOUND ON':'SOUND OFF';audioMaster.setAttribute('aria-pressed',String(!enabled));}
musicVolume.addEventListener('input',()=>{gameAudio.updateGameSettings({musicVolume:Number(musicVolume.value)/100,musicEnabled:Number(musicVolume.value)>0});$('#pause-music-value').value=`${musicVolume.value}%`;});
effectsVolume.addEventListener('input',()=>{gameAudio.updateGameSettings({effectsVolume:Number(effectsVolume.value)/100,effectsEnabled:Number(effectsVolume.value)>0});$('#pause-effects-value').value=`${effectsVolume.value}%`;});
audioMaster.addEventListener('click',()=>{const enabled=gameAudio.settings.musicEnabled||gameAudio.settings.effectsEnabled;gameAudio.updateGameSettings({musicEnabled:!enabled,effectsEnabled:!enabled});renderPauseAudio();if(!enabled)gameAudio.play('setting-toggle',{level:.5});});renderPauseAudio();
leaderboardButton.addEventListener('click', () => { leaderboardReturnToCenter = false; openLeaderboard(); }); $('#close-leaderboard').addEventListener('click', () => { if (leaderboardReturnToCenter) location.href = '../'; else $('#leaderboard-overlay').hidden = true; }); $('#open-full-leaderboard').addEventListener('click', openLeaderboard);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)return;if(state===GameState.PLAYING){gameAudio.pauseAll();setState(GameState.PAUSED);}else if(state===GameState.INTRO){gameAudio.pauseAll();renderer.introProgress=-1;setState(GameState.MENU);}});
window.addEventListener('blur',()=>{if(state===GameState.PLAYING){gameAudio.pauseAll();setState(GameState.PAUSED);}});
document.addEventListener('pointerover',event=>{if(event.target.closest('button'))gameAudio.play('ui-hover',{level:.24,cooldown:110});});
leaderboardButton.addEventListener('click',()=>gameAudio.play('leaderboard-open',{level:.7}));
$('#close-leaderboard').addEventListener('click',()=>gameAudio.play('ui-click',{level:.45}));
window.addEventListener('pointerdown',()=>{if(state===GameState.MENU)gameAudio.setMusic('title-theme',{level:.7,fade:.5});},{once:true,capture:true});
subscribeGameSettings('gravity-tourist', settings => {
  liveGameSettings = settings;
  engine.difficultyScale = settings.difficultyScale;
  leaderboardButton.hidden = !settings.leaderboardEnabled;
  $('#open-full-leaderboard').hidden = !settings.leaderboardEnabled;
  const playButton = $('#play-button');
  playButton.disabled = settings.status !== 'live';
  playButton.querySelector('b').textContent = settings.status === 'live' ? 'BEGIN APPROACH' : settings.status === 'maintenance' ? 'MAINTENANCE' : 'MISSION OFFLINE';
  if (settings.announcement && state === GameState.MENU) {
    $('#event-message').textContent = settings.announcement;
    $('#event-message').classList.add('show');
  }
});
setState(GameState.MENU);
if (new URLSearchParams(location.search).has('leaderboard')) openLeaderboard();
