export function findCollision(ufo, bodies, debris) {
  for (const body of bodies) {
    const distance = Math.hypot(ufo.x - body.x, ufo.y - body.y);
    if (body === ufo.ignoredBody) continue;
    if (ufo.mode === 'travel' && distance <= body.captureRadius + 8) {
      const ratio = distance / body.captureRadius;
      return { type: 'capture', body, quality: ratio < .48 ? 'bad' : ratio < .74 ? 'perfect' : 'good' };
    }
  }
  for (const item of debris) if (Math.hypot(ufo.x - item.x, ufo.y - item.y) < item.size + 8) return { type: ['human','energy','laser'].includes(item.kind) ? 'defense' : 'debris' };
  return null;
}
