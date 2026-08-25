import { GAME_CONFIG } from '../config/game-config.js';

export function launch(ufo, difficulty, bodies = []) {
  if (ufo.mode !== 'orbit') return false;
  const speed = GAME_CONFIG.launchSpeed * difficulty.launchSpeed;
  const tangent = ufo.orbitAngle + (ufo.orbitDirection > 0 ? Math.PI / 2 : -Math.PI / 2);
  let launchAngle = tangent;
  const candidates = bodies.filter(body => body !== ufo.orbitBody && body.x > ufo.x - 20).map(body => {
    const angle = Math.atan2(body.y - ufo.y, body.x - ufo.x);
    return { angle, difference: Math.abs(Math.atan2(Math.sin(angle - tangent), Math.cos(angle - tangent))) };
  }).sort((a, b) => a.difference - b.difference);
  if (candidates[0]?.difference < .34) launchAngle += Math.atan2(Math.sin(candidates[0].angle - tangent), Math.cos(candidates[0].angle - tangent)) * .22;
  ufo.vx = Math.cos(launchAngle) * speed;
  ufo.vy = Math.sin(launchAngle) * speed;
  ufo.angle = launchAngle; ufo.boostTime = .48; ufo.mode = 'travel'; ufo.ignoredBody = ufo.orbitBody; ufo.orbitBody = null;
  return true;
}
