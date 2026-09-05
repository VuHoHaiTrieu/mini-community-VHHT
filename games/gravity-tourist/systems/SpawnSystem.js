import { WORLD } from '../config/game-config.js';
import { GravityBody } from '../entities/GravityBody.js';
import { Debris } from '../entities/Debris.js';

function random(seed) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let n = value; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

export class SpawnSystem {
  constructor(seed = Date.now()) {
    this.rng = random(seed); this.id = 0; this.familyCursor = 0;
    this.families = [
      ['normal','small','large','ice','volcanic','desert','hub','storm','crystal','toxic','dwarf','ember','ringMoon'],
      ['aurora','roseGiant','abyss','goldRing','crystal','pulsar','canyon','whiteStorm'],
      ['emeraldOcean','lavenderGiant','obsidian','cryoShard','nebulaWorld','forgeWorld','tempestGiant','ivoryMoon'],
      ['station','satellite','defenseNode']
    ];
    // Planet atlases get equal screen time; artificial bodies are inserted often
    // enough to be noticed without replacing the celestial variety.
    this.familySchedule = [0,1,2,0,1,2,3];
    this.bags = this.families.map(items => this.shuffle([...items]));
  }
  shuffle(items) { for (let i=items.length-1;i>0;i--) { const j=Math.floor(this.rng()*(i+1)); [items[i],items[j]]=[items[j],items[i]]; } return items; }
  nextKind(excluded) {
    for (let tries=0;tries<this.familySchedule.length;tries++) {
      const familyIndex=this.familySchedule[this.familyCursor++%this.familySchedule.length];
      if (!this.bags[familyIndex].length) this.bags[familyIndex]=this.shuffle([...this.families[familyIndex]]);
      const bag=this.bags[familyIndex],index=bag.findIndex(kind=>!excluded.has(kind));
      if(index>=0)return bag.splice(index,1)[0];
    }
    const fallback=this.shuffle(this.families.flat().filter(kind=>!excluded.has(kind)));
    return fallback[0]||'normal';
  }
  initial() { return [new GravityBody({ id: this.id++, x: 260, y: 290, kind: 'normal', route: 'start' })]; }
  spawnRoutes(fromBody, difficulty) {
    const gap = (230 + this.rng() * 105) * difficulty.spacing;
    const roll = this.rng();
    const count = roll < .12 ? 2 : roll < .45 ? 3 : roll < .82 ? 4 : 5;
    const candidates = [], selected = new Set();
    for (let index = 0; index < count; index++) {
      const kind = this.nextKind(selected); selected.add(kind);
      const xJitter = (this.rng() - .28) * 125 + index * (22 + this.rng() * 25);
      let y = 82 + this.rng() * (WORLD.height - 164);
      for (let tries = 0; tries < 5 && candidates.some(body => Math.abs(body.y - y) < 76); tries++) y = 82 + this.rng() * (WORLD.height - 164);
      const risk = ['small','volcanic','crystal','toxic','dwarf','satellite','defenseNode','ember','pulsar','obsidian','cryoShard','forgeWorld','ivoryMoon'].includes(kind);
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
      itemY = Math.max(28, Math.min(WORLD.height - 28, itemY));
      return new Debris(itemX, itemY, 9 + this.rng() * 10, this.rng() * 6, (this.rng() - .5) * 1.8, kind);
    }).filter(item=>celestialBodies.every(body=>Math.hypot(item.x-body.x,item.y-body.y)>=body.captureRadius+38));
  }
}
