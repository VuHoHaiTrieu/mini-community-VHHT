export class UFO {
  constructor() { this.trail = []; this.reset(); }
  reset() {
    Object.assign(this, { x: 0, y: 0, vx: 0, vy: 0, angle: 0, boostTime: 0, travelTime: 0, mode: 'orbit', orbitBody: null, ignoredBody: null, orbitAngle: Math.PI, orbitDirection: 1, orbitRadius: 58 });
    this.trail.length = 0;
  }
}
