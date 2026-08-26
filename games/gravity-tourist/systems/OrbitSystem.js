export function enterOrbit(ufo, body, quality = 'good') {
  const angle = Math.atan2(ufo.y - body.y, ufo.x - body.x);
  const cross = (ufo.x - body.x) * ufo.vy - (ufo.y - body.y) * ufo.vx;
  ufo.mode = 'orbit'; ufo.orbitBody = body; ufo.orbitAngle = angle;
  ufo.travelTime = 0;
  ufo.orbitDirection = cross >= 0 ? 1 : -1;
  const qualityOffset = quality === 'bad' ? 14 : quality === 'perfect' ? -4 : 4;
  ufo.orbitRadius = body.orbitRadius + qualityOffset;
  ufo.vx = 0; ufo.vy = 0;
}

export function updateOrbit(ufo, dt, difficulty) {
  const body = ufo.orbitBody;
  const speed = body.orbitSpeed * difficulty.orbitSpeed * ufo.orbitDirection;
  ufo.orbitAngle += speed * dt;
  ufo.x = body.x + Math.cos(ufo.orbitAngle) * ufo.orbitRadius;
  ufo.y = body.y + Math.sin(ufo.orbitAngle) * ufo.orbitRadius;
  ufo.angle = ufo.orbitAngle + (ufo.orbitDirection > 0 ? Math.PI / 2 : -Math.PI / 2);
}
