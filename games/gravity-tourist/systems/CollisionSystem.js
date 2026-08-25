import { GAME_CONFIG } from '../config/game-config.js';

export function findCollision(ufo, bodies, debris) {
  for (const body of bodies) {
    const distance = Math.hypot(ufo.x - body.x, ufo.y - body.y);
    if (body === ufo.ignoredBody) continue;
    if (distance < body.radius + 8) return { type: 'crash', body };
    if (ufo.mode === 'travel' && distance < body.captureRadius && Math.hypot(ufo.vx, ufo.vy) <= GAME_CONFIG.captureSpeed) {
      const ratio = distance / body.captureRadius;
      return { type: 'capture', body, quality: ratio < .48 ? 'bad' : ratio < .74 ? 'perfect' : 'good' };
    }
  }
  for (const item of debris) if (Math.hypot(ufo.x - item.x, ufo.y - item.y) < item.size + 8) return { type: item.kind === 'human' ? 'defense' : 'debris' };
  return null;
}
