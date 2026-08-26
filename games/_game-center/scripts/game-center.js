import { games } from '../config/games.js';
import { readJson } from '../utils/storage.js';

const assetStyles = document.createElement('link'); assetStyles.rel = 'stylesheet'; assetStyles.href = './_game-center/styles/gravity-tourist-assets.css?v=1'; document.head.append(assetStyles);
const trophyStyles = document.createElement('link'); trophyStyles.rel = 'stylesheet'; trophyStyles.href = './_game-center/styles/leaderboard-trophy.css?v=1'; document.head.append(trophyStyles);
const compactTrophyStyles = document.createElement('link'); compactTrophyStyles.rel = 'stylesheet'; compactTrophyStyles.href = './_game-center/styles/leaderboard-trophy-compact.css?v=1'; document.head.append(compactTrophyStyles);

const grid = document.querySelector('#game-grid');
const formatTime = seconds => seconds ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '—';
for (const game of games) {
  const records = readJson(game.storageKey, { highScore: 0, longestSurvival: 0 });
  const card = document.createElement('article'); card.className = 'game-card';
  card.innerHTML = `<div class="game-art" aria-hidden="true"><span class="scan-grid"></span><span class="planet-glow"></span><span class="preview-route"></span><span class="preview-planet"><i></i></span><span class="preview-asteroid"></span><span class="earth"><i></i></span><span class="orbit orbit-a"></span><span class="orbit orbit-b"></span><span class="ufo"><i class="dome"></i><i class="ship"></i><i class="beam"></i></span><span class="target target-a"></span><span class="target target-b"></span><span class="signal"><i></i> TOURISM // NOT INVASION</span><span class="mission-id">MISSION 001</span></div><div class="game-copy"><div class="card-top"><span>${game.eyebrow}</span><b><i></i>${game.status}</b></div><div class="title-row"><div><small>FEATURED MISSION</small><h2>${game.title}</h2></div><span class="rating">SKILL<b>∞</b></span></div><p class="story-lead">${game.description}</p><p class="story-detail">${game.story}</p><dl><div><dt>Điểm cao</dt><dd>${Number(records.highScore).toLocaleString('vi-VN')}</dd></div><div><dt>Sống lâu nhất</dt><dd>${formatTime(records.longestSurvival)}</dd></div></dl><section class="center-leaders"><header><span>♛ GLOBAL TOP 3</span><a href="${game.href}?leaderboard=1">XEM ĐẦY ĐỦ →</a></header><div id="center-leader-list">Đang tải bảng xếp hạng...</div></section><a class="play-button" href="${game.href}"><span class="play-icon">▶</span><span class="play-copy"><b>PLAY NOW</b><small>Bắt đầu hành trình tới Trái Đất</small></span><span class="play-arrow">→</span></a></div>`;
  const oldLeaders = card.querySelector('.center-leaders');
  if (oldLeaders) oldLeaders.outerHTML = `<a class="leaderboard-trophy" href="${game.href}?leaderboard=1" aria-label="Open Gravity Tourist leaderboard"><span>🏆</span><b>LEADERBOARD</b><small>PLAYER RANKINGS</small><i>→</i></a>`;
  grid.append(card);
}

const canvas = document.querySelector('#game-center-starfield'), context = canvas?.getContext('2d');
if (canvas && context) {
  const compact = matchMedia('(max-width:700px),(pointer:coarse)').matches, reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let stars = [], meteors = [], lastFrame = 0, meteorTimer = 3200;
  const createStars = () => { const count = Math.min(compact ? 165 : 230, Math.max(compact ? 110 : 150, Math.round(innerWidth * innerHeight / (compact ? 4200 : 5200)))); stars = Array.from({ length: count }, () => { const distance = Math.random(); return { x: Math.random() * innerWidth, y: Math.random() * innerHeight, size: distance < .72 ? .35 + Math.random() * .75 : .9 + Math.random() * 1.35, alpha: .24 + Math.random() * .7, speed: .0015 + Math.random() * .0035, drift: .006 + Math.random() * .022, tint: Math.random() > .84 ? (Math.random() > .5 ? '174, 224, 255' : '205, 190, 255') : '255, 255, 255', diamond: Math.random() > .78 }; }); };
  const resize = () => { const ratio = Math.min(devicePixelRatio || 1, compact ? 1 : 1.5); canvas.width = Math.round(innerWidth * ratio); canvas.height = Math.round(innerHeight * ratio); canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; context.setTransform(ratio, 0, 0, ratio, 0, 0); createStars(); };
  const shootingStar = () => meteors.push({ x: innerWidth * (.25 + Math.random() * .75), y: -35, vx: -(5 + Math.random() * 4), vy: 4 + Math.random() * 3, length: 75 + Math.random() * 70, life: 1 });
  const diamondStar = (cx, cy, outerRadius, innerRadius, fillStyle) => { let rotation = Math.PI * 1.5; const step = Math.PI / 4; context.beginPath(); context.moveTo(cx, cy - outerRadius); for (let i = 0; i < 4; i++) { context.lineTo(cx + Math.cos(rotation) * outerRadius, cy + Math.sin(rotation) * outerRadius); rotation += step; context.lineTo(cx + Math.cos(rotation) * innerRadius, cy + Math.sin(rotation) * innerRadius); rotation += step; } context.closePath(); context.fillStyle = fillStyle; context.fill(); };
  const draw = time => { requestAnimationFrame(draw); if (document.hidden || time - lastFrame < (reducedMotion ? 120 : compact ? 42 : 26)) return; lastFrame = time; context.clearRect(0, 0, innerWidth, innerHeight);
    for (const star of stars) { star.alpha += star.speed; if (star.alpha > 1 || star.alpha < .1) star.speed = -star.speed; star.y += star.drift; if (star.y > innerHeight + 8) star.y = -8; const color = `rgba(${star.tint}, ${star.alpha})`; if (star.diamond) diamondStar(star.x, star.y, star.size * 2, star.size * .4, color); else { context.fillStyle = color; context.beginPath(); context.arc(star.x, star.y, star.size, 0, Math.PI * 2); context.fill(); } }
    if (!reducedMotion && time > meteorTimer) { shootingStar(); meteorTimer = time + 5500 + Math.random() * 6500; }
    for (let i = meteors.length - 1; i >= 0; i--) { const m = meteors[i]; m.x += m.vx; m.y += m.vy; m.life -= .014; const l = Math.hypot(m.vx, m.vy), g = context.createLinearGradient(m.x, m.y, m.x - m.vx / l * m.length, m.y - m.vy / l * m.length); g.addColorStop(0, `rgba(215,250,255,${m.life})`); g.addColorStop(1, 'rgba(80,190,255,0)'); context.strokeStyle = g; context.lineWidth = 1.4; context.beginPath(); context.moveTo(m.x, m.y); context.lineTo(m.x - m.vx / l * m.length, m.y - m.vy / l * m.length); context.stroke(); if (m.life <= 0 || m.y > innerHeight + 100) meteors.splice(i, 1); }
  };
  addEventListener('resize', resize, { passive: true }); resize(); requestAnimationFrame(draw);
}
