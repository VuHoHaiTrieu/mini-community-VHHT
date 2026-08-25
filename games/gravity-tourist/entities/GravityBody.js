import { BODY_TYPES } from '../config/game-config.js';

export class GravityBody {
  constructor({ id, x, y, kind = 'normal', route = 'safe', scale = 1 }) {
    Object.assign(this, { id, x, y, kind, route });
    Object.assign(this, BODY_TYPES[kind]);
    this.radius *= scale;
    this.captureRadius *= .88 + scale * .12;
    this.orbitRadius *= .9 + scale * .1;
    this.orbitSpeed *= .7 + Math.random() * .75;
    this.pulse = Math.random() * Math.PI * 2;
  }
}
