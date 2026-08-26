import { WORLD } from '../config/game-config.js';
import { GravityBody } from '../entities/GravityBody.js';
import { Debris } from '../entities/Debris.js';

function random(seed) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let n = value; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

export class SpawnSystem {
  constructor(seed = Date.now()) { this.rng = random(seed); this.id = 0; }
  initial() { return [new GravityBody({ id: this.id++, x: 260, y: 290, kind: 'normal', route: 'start' })]; }
  spawnRoutes(fromBody, difficulty) {
    const gap = (230 + this.rng() * 105) * difficulty.spacing;
    const roll = this.rng();
    const count = roll < .05 ? 1 : roll < .28 ? 2 : roll < .63 ? 3 : roll < .9 ? 4 : 5;
    const unlocked = difficulty.progress > .48
      ? ['normal','small','large','ice','volcanic','desert','hub','storm','crystal','toxic','dwarf','station','satellite','defenseNode','aurora','ember','ringMoon','pulsar','roseGiant','abyss','goldRing','canyon','whiteStorm']
      : difficulty.progress > .18
        ? ['normal','small','large','ice','desert','storm','crystal','aurora','ringMoon','station']
        : ['normal','ice','desert','storm','aurora','ringMoon'];
    const candidates = [], available = [...unlocked];
    for (let index = 0; index < count; index++) {
      if (!available.length) available.push(...unlocked);
      const kind = available.splice(Math.floor(this.rng() * available.length), 1)[0];
      const xJitter = (this.rng() - .28) * 125 + index * (22 + this.rng() * 25);
      let y = 58 + this.rng() * (WORLD.height - 116);
      for (let tries = 0; tries < 5 && candidates.some(body => Math.abs(body.y - y) < 76); tries++) y = 58 + this.rng() * (WORLD.height - 116);
      const risk = ['small','volcanic','crystal','toxic','dwarf','satellite','defenseNode','ember','pulsar'].includes(kind);
      const route = risk ? 'risk' : index === 0 ? 'safe' : 'medium';
      candidates.push(new GravityBody({ id: this.id++, x: fromBody.x + gap + xJitter, y, kind, route, scale: .72 + this.rng() * .62 }));
    }
    return candidates.sort((a, b) => a.x - b.x);
  }
  spawnDebris(fromBody, routes, difficulty) {
    if (this.rng() > difficulty.debrisChance) return [];
    const nearest = routes[0];
    const pathDx=nearest.x-fromBody.x,pathDy=nearest.y-fromBody.y,pathLength=Math.max(1,Math.hypot(pathDx,pathDy)),normalX=-pathDy/pathLength,normalY=pathDx/pathLength;
    const celestialBodies = [fromBody, ...routes];
    const count = difficulty.progress > .58 ? 2 + Math.floor(this.rng() * 2) : 1;
    return Array.from({ length: count }, (_, index) => {
      const roll = this.rng(), kind = difficulty.progress > .25 && roll < .18 ? 'mine' : 'debris';
      const pathT=.3+this.rng()*.42,offset=(this.rng()>.5?1:-1)*(38+this.rng()*58);let itemX=fromBody.x+pathDx*pathT+normalX*offset+index*18,itemY=fromBody.y+pathDy*pathT+normalY*offset;
      for(let attempt=0;attempt<9&&celestialBodies.some(body=>Math.hypot(itemX-body.x,itemY-body.y)<body.captureRadius+38);attempt++){const shiftedOffset=(attempt%2?1:-1)*(62+attempt*13);itemX=fromBody.x+pathDx*pathT+normalX*shiftedOffset;itemY=fromBody.y+pathDy*pathT+normalY*shiftedOffset;}
      return new Debris(itemX, itemY, 9 + this.rng() * 10, this.rng() * 6, (this.rng() - .5) * 1.8, kind);
    }).filter(item=>celestialBodies.every(body=>Math.hypot(item.x-body.x,item.y-body.y)>=body.captureRadius+38));
  }
}
