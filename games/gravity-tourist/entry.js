import { GAME_CONFIG } from './config/game-config.js';
import { GameState } from './types/game-state.js';
import { GameEngine } from './core/GameEngine.js';
import { GameLoop } from './core/GameLoop.js';
import { InputManager } from './core/InputManager.js';
import { GameRenderer } from './components/GameRenderer.js';
import { getRecords, saveRun } from './services/RecordService.js';
import { gameAudio } from './services/GameAudio.js?v=2';
import { startSingleSessionGuard } from '../../shared/single-session-guard.js?v=1';

const leaderboardStateStyles = document.createElement('link');
leaderboardStateStyles.rel = 'stylesheet';
leaderboardStateStyles.href = './styles/leaderboard-states.css?v=1';
document.head.appendChild(leaderboardStateStyles);

startSingleSessionGuard({ redirect: '../../authentication/login-page.html' });

const DEFAULT_GAME_SETTINGS = Object.freeze({ status: 'live', announcement: '', leaderboardEnabled: true, difficultyScale: 1 });
let loadLeaderboard = async () => [];
let submitLeaderboardRun = async () => false;
let firebaseAuthentication = { currentUser: null };
let resultShare = null;

const $ = selector => document.querySelector(selector);
const canvas = $('#game-canvas'), engine = new GameEngine(), renderer = new GameRenderer(canvas, engine);
$('#resume-button').insertAdjacentHTML('afterend', `<button class="pause-secondary" id="pause-retry-button"><i>↻</i><span><b>RESTART RUN</b></span></button>`);
$('#game-over-screen h2').insertAdjacentHTML('afterend', `<span class="result-reaction" aria-hidden="true"></span>`);
$('.command-header').style.zIndex = '11';
$('.story-grid').insertAdjacentHTML('afterend', `<section class="mobile-howto" aria-label="Hướng dẫn chơi"><b>HOW TO FLY</b><span><i>01</i> Chờ UFO xoay tới hướng muốn bay.</span><span><i>02</i> Chạm màn hình để phóng sang quỹ đạo phía trước.</span><span><i>03</i> Né vật cản, tiến lên để ghi điểm; bay lùi không được cộng điểm.</span></section>`);
$('#hud').insertAdjacentHTML('beforeend', `<section class="hud-chase" aria-label="Tiến độ thành tích"><div><small>PERSONAL RECORD</small><b id="record-gap">--</b><span id="record-target">Đang tải kỷ lục…</span></div><div><small>NEXT RIVAL</small><b id="rival-gap">--</b><span id="rival-target">Đang tải đối thủ…</span></div></section>`);
$('#game-shell').insertAdjacentHTML('beforeend', `<div class="achievement-toast" id="achievement-toast" role="status" aria-live="polite"><b>FLIGHT ACHIEVEMENT</b><span></span></div>`);
$('#pause-screen h2').insertAdjacentHTML('afterend',`<section class="pause-audio" aria-label="Gravity Tourist audio settings"><header><span>GAME AUDIO</span><button id="pause-audio-master" type="button" aria-pressed="false">SOUND ON</button></header><label><span><b>MUSIC</b><output id="pause-music-value">100%</output></span><input id="pause-music-volume" type="range" min="0" max="100" step="1" value="100"></label><label><span><b>EFFECTS</b><output id="pause-effects-value">100%</output></span><input id="pause-effects-volume" type="range" min="0" max="100" step="1" value="100"></label></section>`);
const leaderboardButton = $('.header-actions button:first-child'); leaderboardButton.disabled = false; leaderboardButton.id = 'leaderboard-button'; leaderboardButton.textContent = '🏆'; leaderboardButton.setAttribute('aria-label', 'Bảng xếp hạng');
$('#game-shell').insertAdjacentHTML('beforeend', `<section class="leaderboard-overlay" id="leaderboard-overlay" hidden><div class="leaderboard-panel"><header><div><small>GRAVITY TOURIST // GLOBAL</small><h2>BẢNG XẾP HẠNG</h2></div><button id="close-leaderboard" aria-label="Đóng">×</button></header><nav><button class="active">TẤT CẢ NGƯỜI CHƠI</button><button id="share-ranking" type="button">↗ SHARE MY RANK</button></nav><div class="leaderboard-list" id="leaderboard-list"><p>Đang tải dữ liệu...</p></div><footer>Điểm được đồng bộ với tài khoản VHHT sau mỗi run.</footer></div></section>`);
$('.results').insertAdjacentHTML('afterend', `<section class="game-over-leaders"><header><span>GLOBAL RANKING</span><button id="open-full-leaderboard">VIEW TOP 50 →</button></header><div id="game-over-leader-list">SYNCING SCORES...</div></section>`);
$('.game-over-leaders').insertAdjacentHTML('afterend', `<button class="result-share-launch" id="result-share-launch" type="button" disabled><span>✦</span> SHARE FLIGHT RECORD</button>`);
$('#game-shell').insertAdjacentHTML('beforeend', `<section class="result-share-overlay" id="result-share-overlay" hidden><div class="result-share-panel" role="dialog" aria-modal="true" aria-labelledby="result-share-title"><header><div><small id="result-share-eyebrow">GRAVITY TOURIST // FLIGHT RECORD</small><h2 id="result-share-title">SHARE YOUR MOMENT</h2></div><button class="result-share-close" id="result-share-close" type="button" aria-label="Đóng">×</button></header><div class="result-share-body"><div class="result-share-card"><span class="result-share-attached">✓ SYSTEM IMAGE ATTACHED</span><img class="result-share-preview" id="result-share-preview" alt="Thẻ thành tích Gravity Tourist"><p class="result-share-copy" id="result-share-copy"></p></div><div class="result-share-workspace"><div class="result-share-actions" id="result-share-actions"><p class="share-step"><b>01</b><span>CHỌN NƠI CHIA SẺ<small>Ảnh và chỉ số đã được chuẩn bị sẵn</small></span></p><button class="result-share-action primary" data-share-action="post"><i>01</i><span><b>COMMUNITY POST</b><small>Viết nội dung rồi đăng lên bảng tin và hồ sơ</small></span><em>›</em></button><button class="result-share-action" data-share-action="message"><i>02</i><span><b>DIRECT MESSAGE</b><small>Gửi lời thách đấu cho một người bạn</small></span><em>›</em></button><button class="result-share-action" data-share-action="note"><i>03</i><span><b>24H NOTE</b><small>Ghim thành tích trong ghi chú Messenger</small></span><em>›</em></button><div class="share-utilities"><button data-share-action="system">↗ <span>MORE APPS</span></button><button data-share-action="download">⇩ <span>SAVE IMAGE</span></button><button data-share-action="copy">⛓ <span>COPY TEXT</span></button></div></div><section class="share-post-composer" id="share-post-composer" hidden><button class="share-back" type="button" data-share-back>← BACK</button><label><span>YOUR POST</span><textarea id="share-post-content" maxlength="500" placeholder="Chia sẻ cảm nghĩ, kể lại khoảnh khắc hoặc gửi lời thách đấu..."></textarea></label><div class="share-attachment"><img id="share-post-thumb" alt=""><span><b>GRAVITY TOURIST RESULT</b><small>Ảnh thành tích do hệ thống đính kèm</small></span><i>LOCKED</i></div><button class="share-confirm" id="share-post-publish" type="button">PUBLISH TO COMMUNITY <span>→</span></button></section><section class="result-share-friends" id="result-share-friends" hidden><header><button class="share-back" type="button" data-share-back>← BACK</button><span><b>CHOOSE A FRIEND</b><small>Chỉ hiển thị bạn bè đã kết nối</small></span></header><div id="result-share-friend-list"></div></section><p class="result-share-status" id="result-share-status" role="status"></p></div></div></div></section>`);
$('#result-share-friends header').insertAdjacentHTML('afterend', `<label class="share-field"><span>MESSAGE</span><textarea id="share-message-content" maxlength="500"></textarea></label><div class="share-attachment"><img id="share-message-thumb" alt=""><span><b>RESULT CARD ATTACHED</b><small>Ảnh sẽ được gửi cùng tin nhắn</small></span><i>LOCKED</i></div><label class="share-friend-search"><span>⌕</span><input id="share-friend-search" type="search" placeholder="Tìm theo tên bạn bè..." autocomplete="off"></label>`);
$('#result-share-friends').insertAdjacentHTML('afterend', `<section class="share-note-composer" id="share-note-composer" hidden><button class="share-back" type="button" data-share-back>← BACK</button><div class="share-note-heading"><span>✦</span><div><b>24-HOUR NOTE</b><small>Hiển thị với bạn bè và tự biến mất sau 24 giờ</small></div></div><label class="share-field"><span>NOTE CONTENT <i id="share-note-count">0/160</i></span><textarea id="share-note-content" maxlength="160"></textarea></label><div class="share-attachment"><img id="share-note-thumb" alt=""><span><b>RESULT CARD ATTACHED</b><small>Chạm vào ghi chú để xem ảnh đầy đủ</small></span><i>24H</i></div><button class="share-confirm" id="share-note-publish" type="button">PUBLISH 24H NOTE <span>→</span></button></section>`);
$('#share-ranking').disabled = true;
let state = GameState.MENU, records = getRecords(), introElapsed = 0, lastAlert = '', defenseAnnounced = false, leaderboardReturnToCenter = new URLSearchParams(location.search).has('leaderboard'), liveGameSettings = { ...DEFAULT_GAME_SETTINGS }, lastHudUpdate = 0, latestLeaderboard = [], lastShareRun = null, lastShareReason = '', lastShareAchievement = {}, previousHudScore = 0, announcedRivals = new Set(), toastTimer = 0;
const reactionSequences={launch:[[0,1],[1,2],[3,1]],perfect:[[0,1],[1,2],[4,2]],capture:[[3,1],[4,2]],backtrack:[[1,1],[3,2],[5,1]],defense:[[2,1],[4,1],[0,2],[5,2]],achievement:[[2,2],[0,1]]};
const reactionCursors={};
function playReaction(context,duration=1.15){const sequence=reactionSequences[context]||reactionSequences.capture,index=reactionCursors[context]||0,[sprite,set]=sequence[index%sequence.length];reactionCursors[context]=index+1;renderer.showReaction(sprite,duration,set);}
const loop = new GameLoop(dt => {
  if (state === GameState.PLAYING) engine.update(dt);
  if (state === GameState.INTRO) { introElapsed += dt; renderer.introProgress = Math.min(1, introElapsed / 2.8); if (introElapsed >= 2.8) { renderer.introProgress = -1; setState(GameState.PLAYING); } }
}, () => { renderer.render(); const now = performance.now(); if (state === GameState.PLAYING && now - lastHudUpdate >= 100) { lastHudUpdate = now; updateHud(); } }, matchMedia('(max-width: 820px), (pointer: coarse)').matches ? 1 / 60 : GAME_CONFIG.fixedStep, GAME_CONFIG.maxFrameTime, { targetFps: matchMedia('(max-width: 820px), (pointer: coarse)').matches ? 45 : 60 });

function setState(next) {
  state = next;
  $('#start-screen').hidden = next !== GameState.MENU; $('#pause-screen').hidden = next !== GameState.PAUSED; $('#game-over-screen').hidden = next !== GameState.GAME_OVER; $('#hud').hidden = next === GameState.MENU || next === GameState.INTRO;
  $('#pause-button').hidden = next === GameState.MENU || next === GameState.INTRO || next === GameState.GAME_OVER;
  if(next!==GameState.PLAYING)$('#event-message').classList.remove('show');
  if(next===GameState.PLAYING||next===GameState.INTRO)loop.start();else{loop.stop();renderer.render();}
}
function start() { if (liveGameSettings.status !== 'live') { $('#event-message').textContent = liveGameSettings.announcement || 'GAME TEMPORARILY UNAVAILABLE'; $('#event-message').classList.add('show'); return; } closeResultShare(); $('#result-share-launch').disabled=true; $('#result-share-launch').innerHTML='<span>✦</span> SHARE FLIGHT RECORD'; engine.reset(); engine.difficultyScale = liveGameSettings.difficultyScale; gameAudio.stopEffects(); gameAudio.playIntro(); introElapsed = 0; lastAlert = ''; defenseAnnounced = false; previousHudScore = 0; announcedRivals = new Set(); renderer.introProgress = 0; if(liveGameSettings.leaderboardEnabled)loadLeaderboard(500).then(entries=>{latestLeaderboard=entries;updateHud();}).catch(error=>console.warn('Không thể đồng bộ đối thủ.',error)); setState(GameState.INTRO); updateHud(); }
function action() {
  if (state === GameState.PLAYING) { if(engine.launch()){playReaction('launch',.95);gameAudio.play('ufo-launch',{level:.82,cooldown:120});gameAudio.setLoop('orbit-loop',false);} }
  else if (state === GameState.MENU) start();
  else if (state === GameState.GAME_OVER) start();
}
function togglePause() { if (state === GameState.PLAYING){gameAudio.play('pause-open',{level:.72});gameAudio.setMusic('pause-ambient',{level:.52,fade:.5});setState(GameState.PAUSED);} else if (state === GameState.PAUSED){gameAudio.play('pause-close',{level:.72});gameAudio.gameplay(engine.snapshot().alert);setState(GameState.PLAYING);} }
function showAchievement(message, label='FLIGHT ACHIEVEMENT') { const toast=$('#achievement-toast'); toast.querySelector('b').textContent=label; toast.querySelector('span').textContent=message; toast.classList.add('show'); playReaction('achievement',1.8); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),2600); }
function personalBestScore(){const cloud=latestLeaderboard.find(entry=>entry.id===firebaseUserId());return Math.max(Number(records.highScore)||0,Number(cloud?.highScore)||0);}
function updateChaseHud(score) {
  const personal=personalBestScore(), recordGap=Math.max(0,personal-score);
  $('#record-gap').textContent=personal>0?(recordGap?`-${recordGap.toLocaleString('vi-VN')}`:'BROKEN'):'FIRST RUN';
  $('#record-target').textContent=personal>0?`Kỷ lục: ${personal.toLocaleString('vi-VN')} điểm`:'Hãy thiết lập kỷ lục đầu tiên';
  const rivals=latestLeaderboard.filter(entry=>entry.id!==firebaseUserId()&&Number(entry.highScore)>score).sort((a,b)=>Number(a.highScore)-Number(b.highScore));
  const rival=rivals[0];
  $('#rival-gap').textContent=rival?`-${(Number(rival.highScore)-score).toLocaleString('vi-VN')}`:'LEADING';
  $('#rival-target').textContent=rival?`${rival.displayName||'VHHT Traveller'} · ${Number(rival.highScore).toLocaleString('vi-VN')}`:'Không còn đối thủ phía trước';
  if(score>previousHudScore){latestLeaderboard.filter(entry=>entry.id!==firebaseUserId()&&!announcedRivals.has(entry.id)&&previousHudScore<Number(entry.highScore)&&score>=Number(entry.highScore)).forEach(entry=>{announcedRivals.add(entry.id);showAchievement(`Đã vượt ${entry.displayName||'một đối thủ'}!`,'RANKING OVERTAKE');gameAudio.play('new-record',{level:.62,cooldown:500});});}
  previousHudScore=score;
}
function updateHud() {
  const run = engine.snapshot(); $('#score').textContent = run.score.toLocaleString('vi-VN'); $('#approach').textContent = run.approaches; $('#combo').textContent = `×${(1 + run.combo * .25).toFixed(2)}`;
  $('#hud-best').textContent = Number(records.highScore).toLocaleString('vi-VN');
  const progress = Math.min(99, Math.round(engine.difficulty.progress * 100)); $('#progress').textContent = `${progress}%`; $('#distance').textContent = `${Math.max(.1, 48 * (1 - progress / 100)).toFixed(1)} KM`; $('#sector').textContent = 1 + Math.floor(run.approaches / 5);
  updateChaseHud(run.score); $('#event-message').textContent = run.message; $('#event-message').classList.toggle('show', state===GameState.PLAYING&&Boolean(run.message));
  const personalBest=personalBestScore(); if (!engine.newBest && personalBest > 0 && run.score > personalBest) { engine.newBest = true; showAchievement('Bạn vừa phá kỷ lục cá nhân!','NEW PERSONAL BEST'); gameAudio.play('new-record',{level:.75,cooldown:500}); }
  if(state===GameState.PLAYING){if(run.alert!==lastAlert){if(lastAlert&&run.alert==='INVASION ALERT')gameAudio.play('invasion-alert-siren',{level:.72,cooldown:1000});lastAlert=run.alert;gameAudio.gameplay(run.alert);}gameAudio.setLoop('orbit-loop',engine.ufo.mode==='orbit',{level:.2,rate:.88+engine.difficulty.progress*.3});}
}
function finish(event) {
  const run = engine.snapshot(), previousBest = personalBestScore(), result = saveRun(run), qualifiedNewBest = run.score > previousBest; records = result.records;
  $('#death-reason').textContent = event.detail.reason; $('#final-score').textContent = run.score.toLocaleString('vi-VN'); $('#best-score').textContent = Math.max(records.highScore,previousBest).toLocaleString('vi-VN'); $('#final-approach').textContent = run.approaches; $('#final-perfect').textContent = run.perfect; $('#final-combo').textContent = run.bestCombo; $('#final-time').textContent = `${Math.floor(run.elapsed / 60)}:${String(Math.floor(run.elapsed % 60)).padStart(2, '0')}`; $('#new-best').hidden = !qualifiedNewBest; setState(GameState.GAME_OVER);
  const resultReaction=$('.result-reaction'),reactionIndex=qualifiedNewBest?2:event.detail.reason==='EARTH DEFENSE INTERCEPTED'?0:event.detail.reason==='NO GRAVITY PATH'?3:5;resultReaction.style.backgroundImage="url('./assets/images/alien-reactions-v2.png')";resultReaction.style.backgroundSize='300% 200%';resultReaction.style.backgroundPosition=`${reactionIndex%3*50}% ${Math.floor(reactionIndex/3)*100}%`;
  gameAudio.setLoop('orbit-loop',false);gameAudio.stopMusic(.25);gameAudio.play(event.detail.reason==='EARTH DEFENSE INTERCEPTED'?'defense-intercept':event.detail.reason==='SPACE DEBRIS COLLISION'?'hazard-impact':'ufo-lost',{level:.9});gameAudio.play('game-over',{level:.78});gameAudio.play('alien-sad',{level:.3});setTimeout(()=>gameAudio.play('result-reveal',{level:.62}),420);if(qualifiedNewBest)setTimeout(()=>{gameAudio.play('new-record',{level:.8});gameAudio.play('alien-record',{level:.3});},850);
  leaderboardReturnToCenter = false;
  const rankingTask = liveGameSettings.leaderboardEnabled ? submitLeaderboardRun(run).catch(console.warn).then(()=>loadLeaderboard(500)) : Promise.resolve([]);
  if (!liveGameSettings.leaderboardEnabled) $('#game-over-leader-list').innerHTML = '<p class="leader-empty">Bảng xếp hạng đang tạm đóng.</p>';
  const shareButton = $('#result-share-launch');
  shareButton.disabled = true; shareButton.innerHTML = '<span>✦</span> PREPARING FLIGHT CARD…';
  rankingTask.then(entries=>{latestLeaderboard=entries;$('#game-over-leader-list').innerHTML=leaderboardRows(entries.slice(0,5));const rank=entries.find(item=>item.id===firebaseUserId())?.rank||0;lastShareRun=run;lastShareReason=event.detail.reason;lastShareAchievement={isNewBest:qualifiedNewBest,rank};return resultShare.prepare(run,event.detail.reason,lastShareAchievement);}).then(({ url }) => {
    $('#result-share-eyebrow').textContent='GRAVITY TOURIST // FLIGHT RECORD';$('#result-share-title').textContent='SHARE YOUR MOMENT';
    $('#result-share-preview').src = url;
    $('#result-share-copy').textContent = resultShare.text();
    shareButton.disabled = false; shareButton.innerHTML = '<span>✦</span> SHARE FLIGHT RECORD';
  }).catch(error => {
    console.warn(error); shareButton.innerHTML = '<span>!</span> FLIGHT CARD UNAVAILABLE';
  });
}

const leaderboardRows = entries => entries.length ? entries.map(entry => `<article class="leader-row ${entry.id === firebaseUserId() ? 'is-you' : ''}"><b class="rank">${entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank - 1] : `#${entry.rank}`}</b><span class="player">${escapeHtml(entry.displayName || 'VHHT Traveller')} ${entry.id === firebaseUserId() ? '<i>YOU</i>' : ''}</span><strong>${Number(entry.highScore || 0).toLocaleString('vi-VN')}</strong><small>${entry.highestApproach || 0} assists</small></article>`).join('') : `<div class="leader-state leader-state-empty"><span aria-hidden="true">🏆</span><strong>Chưa có thành tích toàn cầu</strong><p>${firebaseUserId() ? 'Hãy hoàn thành một lượt chơi để ghi tên bạn lên bảng xếp hạng.' : 'Hãy đăng nhập tài khoản VHHT để xem và đồng bộ thành tích.'}</p></div>`;
const firebaseUserId = () => firebaseAuthentication.currentUser?.uid || '';
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
async function openLeaderboard() {
  const overlay = $('#leaderboard-overlay'), list = $('#leaderboard-list');
  overlay.hidden = false;
  overlay.setAttribute('aria-busy', 'true');
  list.innerHTML = '<div class="leader-state leader-state-loading"><span aria-hidden="true"></span><strong>Đang đồng bộ bảng xếp hạng</strong><p>Đang kết nối với tài khoản VHHT…</p></div>';
  try {
    await cloudFeaturesReady;
    latestLeaderboard = await loadLeaderboard(500);
    list.innerHTML = leaderboardRows(latestLeaderboard);
  } catch (error) {
    console.warn('Không thể mở bảng xếp hạng.', error);
    list.innerHTML = '<div class="leader-state leader-state-error"><span aria-hidden="true">!</span><strong>Không thể tải bảng xếp hạng</strong><p>Kiểm tra kết nối mạng hoặc quyền truy cập Firebase rồi thử lại.</p><button type="button" data-retry-leaderboard>Thử lại</button></div>';
    list.querySelector('[data-retry-leaderboard]')?.addEventListener('click', openLeaderboard, { once: true });
  } finally {
    overlay.removeAttribute('aria-busy');
  }
}
async function refreshGameOverLeaders() { latestLeaderboard=await loadLeaderboard(500);$('#game-over-leader-list').innerHTML = leaderboardRows(latestLeaderboard.slice(0,5)); }

engine.addEventListener('gameover', finish);
engine.addEventListener('capture', event => {
  playReaction(event.detail.scored ? (event.detail.quality === 'perfect' ? 'perfect' : 'capture') : 'backtrack',1.15);
  gameAudio.play('gravity-capture',{level:.62});if(event.detail.scored){gameAudio.play(event.detail.quality==='perfect'?'gravity-assist-perfect':'gravity-assist',{level:.72});gameAudio.play('score-gain',{level:.5,rate:1+Math.min(.22,engine.scoreSystem.combo*.025)});if(engine.scoreSystem.combo>1)gameAudio.play('combo-up',{level:.42});gameAudio.play(event.detail.quality==='perfect'?'alien-excited':'alien-happy',{level:.24});}else{gameAudio.play('no-progress',{level:.65});gameAudio.play('alien-confused',{level:.25});}
  const feed = $('#event-feed'), item = document.createElement('li'), run = engine.snapshot();
  item.innerHTML = `<time>${String(Math.floor(run.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(run.elapsed % 60)).padStart(2, '0')}</time><span>${event.detail.scored ? (event.detail.quality === 'perfect' ? 'Perfect forward assist!' : 'New frontier reached') : 'Backtrack — no score'}</span><b>${event.detail.scored ? (event.detail.quality === 'perfect' ? '+250' : '+100') : '+0'}</b>`;
  feed.prepend(item); while (feed.children.length > 4) feed.lastElementChild.remove();
});
engine.addEventListener('defensewarning',event=>{if(!defenseAnnounced){defenseAnnounced=true;gameAudio.play('earth-defense-online',{level:.8});}gameAudio.play('target-lock-warning',{level:.85,cooldown:450});if(event.detail.kind==='laser')gameAudio.play('laser-charge',{level:.58,cooldown:450});playReaction('defense',1.05);});
engine.addEventListener('defensefire',event=>{gameAudio.play(event.detail.salvo>1?'defense-salvo':event.detail.kind==='laser'?'laser-fire':event.detail.kind==='energy'?'energy-shot':'missile-launch-distant',{level:.78,cooldown:150});if(Math.random()<.34)playReaction('defense',1.2);});
new InputManager(canvas, action, togglePause, () => state === GameState.GAME_OVER && start());
$('#play-button').addEventListener('click', start); $('#retry-button').addEventListener('click', start); $('#pause-button').addEventListener('click', togglePause); $('#resume-button').addEventListener('click', togglePause);
$('#pause-retry-button').addEventListener('click', start);
const shareOverlay=$('#result-share-overlay'),shareStatus=$('#result-share-status'),shareFriends=$('#result-share-friends'),shareActions=$('#result-share-actions'),shareComposer=$('#share-post-composer'),shareNote=$('#share-note-composer'),shareFriendList=$('#result-share-friend-list');
function showShareStep(step='actions'){shareActions.hidden=step!=='actions';shareComposer.hidden=step!=='post';shareFriends.hidden=step!=='message';shareNote.hidden=step!=='note';shareStatus.textContent='';shareStatus.classList.remove('is-error');}
function resetShareWorkspace(){showShareStep();shareFriendList.replaceChildren();$('#share-friend-search').value='';}
function closeResultShare(){shareOverlay.hidden=true;resetShareWorkspace();}
function showShareOverlay(){resetShareWorkspace();shareOverlay.hidden=false;const text=resultShare.text(),image=resultShare.objectUrl;$('#share-post-content').value=text;$('#share-message-content').value=text;$('#share-note-content').value=`Gravity Tourist · ${Number(resultShare.result?.score||resultShare.result?.highScore||0).toLocaleString('vi-VN')} điểm`;$('#share-post-thumb').src=image;$('#share-message-thumb').src=image;$('#share-note-thumb').src=image;$('#result-share-preview').src=image;$('#result-share-copy').textContent=text;updateNoteCount();requestAnimationFrame(()=>$('#result-share-close').focus());}
function shareFeedback(message,isError=false){shareStatus.textContent=message;shareStatus.classList.toggle('is-error',isError);}
async function runShareAction(button,task){
  const oldDisabled=button.disabled;button.disabled=true;button.classList.add('is-busy');shareFeedback('Đang chuẩn bị…');
  try{await task();}catch(error){if(error?.name!=='AbortError')shareFeedback(error?.message||'Không thể hoàn tất chia sẻ.',true);}
  finally{button.disabled=oldDisabled;button.classList.remove('is-busy');}
}
$('#result-share-launch').addEventListener('click',async()=>{gameAudio.play('ui-click',{level:.45});if(resultShare.result?.shareKind==='ranking'&&lastShareRun){const prepared=await resultShare.prepare(lastShareRun,lastShareReason,lastShareAchievement);$('#result-share-preview').src=prepared.url;}showShareOverlay();});
$('#result-share-close').addEventListener('click',closeResultShare);
shareOverlay.addEventListener('pointerdown',event=>{event.stopPropagation();if(event.target===shareOverlay)closeResultShare();});
shareOverlay.addEventListener('click',event=>event.stopPropagation());
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!shareOverlay.hidden)closeResultShare();});
shareOverlay.querySelectorAll('[data-share-back]').forEach(button=>button.addEventListener('click',()=>{resetShareWorkspace();gameAudio.play('ui-click',{level:.35});}));
$('#share-post-publish').addEventListener('click',event=>runShareAction(event.currentTarget,async()=>{const content=$('#share-post-content').value.trim();if(!content)throw new Error('Hãy nhập nội dung cho bài viết.');const id=await resultShare.post(content);shareFeedback('Đã đăng bài lên cộng đồng và hồ sơ cá nhân của bạn.');const link=document.createElement('a');link.href=`../../community/community-feed-page.html?post=${encodeURIComponent(id)}`;link.textContent=' Xem bài đăng →';shareStatus.appendChild(link);}));
function updateNoteCount(){$('#share-note-count').textContent=`${$('#share-note-content').value.length}/160`;}
$('#share-note-content').addEventListener('input',updateNoteCount);
$('#share-note-publish').addEventListener('click',event=>runShareAction(event.currentTarget,async()=>{const content=$('#share-note-content').value.trim();if(!content)throw new Error('Ghi chú cần có nội dung.');await resultShare.note(content);shareFeedback('Đã đăng ghi chú kèm ảnh thành tích trong 24 giờ.');}));
$('#share-friend-search').addEventListener('input',event=>{const query=event.target.value.trim().toLocaleLowerCase('vi-VN');shareFriendList.querySelectorAll('.result-share-friend').forEach(row=>row.hidden=Boolean(query)&&!row.dataset.search.includes(query));});
shareOverlay.querySelectorAll('[data-share-action]').forEach(button=>button.addEventListener('click',()=>{
  gameAudio.play('ui-click',{level:.4});const action=button.dataset.shareAction;
  if(action==='post'){showShareStep('post');$('#share-post-content').focus();}
  else if(action==='note'){showShareStep('note');$('#share-note-content').focus();}
  else if(action==='system')runShareAction(button,async()=>{await resultShare.nativeShare();shareFeedback('Đã mở bảng chia sẻ của thiết bị.');});
  else if(action==='download')runShareAction(button,async()=>{resultShare.download();shareFeedback('Đã tải thẻ thành tích.');});
  else if(action==='copy')runShareAction(button,async()=>{const value=`${resultShare.text()} ${location.href}`;if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove();}shareFeedback('Đã sao chép lời thách đấu.');});
  else if(action==='message')runShareAction(button,async()=>{
    showShareStep('message');shareFeedback('Đang tải danh sách bạn bè…');const friends=await resultShare.friends();shareFriendList.replaceChildren();
    if(!friends.length){shareFeedback('Bạn chưa có người bạn nào để gửi thử thách.',true);return;}
    shareFeedback(`Đã tìm thấy ${friends.length} người bạn. Chọn SEND để gửi riêng.`);
    friends.forEach(friend=>{const row=document.createElement('article');row.className='result-share-friend';row.dataset.search=(friend.name||'VHHT Friend').toLocaleLowerCase('vi-VN');const avatar=document.createElement('span');if(friend.photoURL||friend.profileImage){const image=document.createElement('img');image.src=friend.photoURL||friend.profileImage;image.alt='';avatar.append(image);}else avatar.textContent=(friend.name||'V').trim().charAt(0).toUpperCase();const name=document.createElement('strong');name.textContent=friend.name||'VHHT Friend';const send=document.createElement('button');send.type='button';send.textContent='SEND';send.onclick=()=>runShareAction(send,async()=>{const content=$('#share-message-content').value.trim();if(!content)throw new Error('Hãy nhập nội dung tin nhắn.');await resultShare.message(friend.id,content);send.textContent='SENT';send.disabled=true;shareFeedback(`Đã gửi ảnh và tin nhắn tới ${friend.name||'người bạn này'}.`);});row.append(avatar,name,send);shareFriendList.append(row);});
  });
}));
const musicVolume=$('#pause-music-volume'),effectsVolume=$('#pause-effects-volume'),audioMaster=$('#pause-audio-master');
function renderPauseAudio(){musicVolume.value=Math.round(gameAudio.settings.musicVolume*100);effectsVolume.value=Math.round(gameAudio.settings.effectsVolume*100);$('#pause-music-value').value=`${musicVolume.value}%`;$('#pause-effects-value').value=`${effectsVolume.value}%`;const enabled=gameAudio.settings.musicEnabled||gameAudio.settings.effectsEnabled;audioMaster.textContent=enabled?'SOUND ON':'SOUND OFF';audioMaster.setAttribute('aria-pressed',String(!enabled));}
musicVolume.addEventListener('input',()=>{gameAudio.updateGameSettings({musicVolume:Number(musicVolume.value)/100,musicEnabled:Number(musicVolume.value)>0});$('#pause-music-value').value=`${musicVolume.value}%`;});
effectsVolume.addEventListener('input',()=>{gameAudio.updateGameSettings({effectsVolume:Number(effectsVolume.value)/100,effectsEnabled:Number(effectsVolume.value)>0});$('#pause-effects-value').value=`${effectsVolume.value}%`;});
audioMaster.addEventListener('click',()=>{const enabled=gameAudio.settings.musicEnabled||gameAudio.settings.effectsEnabled;gameAudio.updateGameSettings({musicEnabled:!enabled,effectsEnabled:!enabled});renderPauseAudio();if(!enabled)gameAudio.play('setting-toggle',{level:.5});});renderPauseAudio();
leaderboardButton.addEventListener('click', () => { leaderboardReturnToCenter = false; openLeaderboard(); }); $('#close-leaderboard').addEventListener('click', () => { if (leaderboardReturnToCenter) location.href = '../'; else $('#leaderboard-overlay').hidden = true; }); $('#open-full-leaderboard').addEventListener('click', openLeaderboard);
$('#share-ranking').addEventListener('click',event=>runShareAction(event.currentTarget,async()=>{if(!latestLeaderboard.length)latestLeaderboard=await loadLeaderboard(50);const entry=latestLeaderboard.find(item=>item.id===firebaseUserId())||{rank:0,highScore:records.highScore,highestApproach:records.highestApproach,longestSurvival:records.longestSurvival};const prepared=await resultShare.prepareLeaderboard(entry,latestLeaderboard.length);$('#result-share-eyebrow').textContent='GRAVITY TOURIST // GLOBAL RANKING';$('#result-share-title').textContent='SHARE YOUR POSITION';$('#result-share-preview').src=prepared.url;showShareOverlay();}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)return;if(state===GameState.PLAYING){gameAudio.pauseAll();setState(GameState.PAUSED);}else if(state===GameState.INTRO){gameAudio.pauseAll();renderer.introProgress=-1;setState(GameState.MENU);}});
window.addEventListener('blur',()=>{if(state===GameState.PLAYING){gameAudio.pauseAll();setState(GameState.PAUSED);}});
leaderboardButton.addEventListener('click',()=>gameAudio.play('leaderboard-open',{level:.7}));
$('#close-leaderboard').addEventListener('click',()=>gameAudio.play('ui-click',{level:.45}));
window.addEventListener('pointerdown',()=>{if(state===GameState.MENU)gameAudio.setMusic('title-theme',{level:.7,fade:.5});},{once:true,capture:true});
function applyGameSettings(settings) {
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
}

import('../_shared/GameSettingsService.js')
  .then(({ subscribeGameSettings }) => subscribeGameSettings('gravity-tourist', applyGameSettings))
  .catch(error => console.warn('Không thể đồng bộ cấu hình game; đang dùng cấu hình mặc định.', error));

const cloudFeaturesReady = Promise.all([
  import('./services/LeaderboardService.js'),
  import('../../shared/firebase-connection.js'),
  import('./services/ResultShareService.js?v=3')
]).then(([leaderboardModule, firebaseModule, shareModule]) => {
  loadLeaderboard = leaderboardModule.loadLeaderboard;
  submitLeaderboardRun = leaderboardModule.submitLeaderboardRun;
  firebaseAuthentication = firebaseModule.firebaseAuthentication;
  resultShare = new shareModule.ResultShareService(canvas);
  $('#share-ranking').disabled = false;
}).catch(error => console.warn('Các tính năng cloud của game chưa khả dụng; gameplay cục bộ vẫn hoạt động.', error));

setState(GameState.MENU);
if (new URLSearchParams(location.search).has('leaderboard')) cloudFeaturesReady.then(openLeaderboard).catch(openLeaderboard);
