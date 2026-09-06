import { GAME_CONFIG } from '../config/game-config.js';

export class UFO {
  constructor() { this.trail = Array.from({length:GAME_CONFIG.trailLength},()=>({x:0,y:0})); this.trailCount=0; this.trailHead=0; this.reset(); }
  reset() {
    Object.assign(this, { x: 0, y: 0, vx: 0, vy: 0, angle: 0, boostTime: 0, travelTime: 0, mode: 'orbit', orbitBody: null, ignoredBody: null, orbitAngle: Math.PI, orbitDirection: 1, orbitRadius: 58 });
    this.trailCount = 0; this.trailHead = 0;
  }
}
