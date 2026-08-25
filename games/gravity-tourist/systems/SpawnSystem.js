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
      ? ['normal','small','large','ice','volcanic','desert','hub','storm','crystal','toxic','dwarf','station','satellite','defenseNode','aurora','ember','ringMoon','pulsar']
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
    const x = fromBody.x + (nearest.x - fromBody.x) * (.38 + this.rng() * .3);
    const baseY = (fromBody.y + nearest.y) / 2;
    const count = difficulty.progress > .58 ? 2 + Math.floor(this.rng() * 2) : 1;
    return Array.from({ length: count }, (_, index) => {
      const roll = this.rng(), kind = difficulty.progress > .38 && roll > .68 ? 'human' : difficulty.progress > .25 && roll < .18 ? 'mine' : 'debris';
      return new Debris(x + index * (25 + this.rng() * 28), baseY + (this.rng() - .5) * 175, 7 + this.rng() * 9, this.rng() * 6, (this.rng() - .5) * 1.8, kind);
    });
  }
}
