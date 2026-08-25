import { GAME_CONFIG } from '../config/game-config.js';

export function updateTravel(ufo, bodies, dt) {
  let ax = 0, ay = 0;
  for (const body of bodies) {
    if (body === ufo.ignoredBody) continue;
    const dx = body.x - ufo.x, dy = body.y - ufo.y;
    const d2 = Math.max(dx * dx + dy * dy, 1500), distance = Math.sqrt(d2);
    if (distance < body.captureRadius * 3.1) {
      const strength = GAME_CONFIG.travelGravity * (body.kind === 'large' ? 1.35 : body.kind === 'small' ? .72 : 1) / d2;
      ax += dx / distance * strength; ay += dy / distance * strength;
    }
  }
  ufo.vx += ax * dt; ufo.vy += ay * dt;
  const speed = Math.hypot(ufo.vx, ufo.vy);
  if (speed > GAME_CONFIG.maxTravelSpeed) { ufo.vx *= GAME_CONFIG.maxTravelSpeed / speed; ufo.vy *= GAME_CONFIG.maxTravelSpeed / speed; }
  ufo.x += ufo.vx * dt; ufo.y += ufo.vy * dt; ufo.angle = Math.atan2(ufo.vy, ufo.vx);
}
