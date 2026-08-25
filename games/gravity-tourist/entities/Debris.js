export class Debris {
  constructor(x, y, size, rotation, spin, kind = 'debris', vx = 0, vy = 0) { Object.assign(this, { x, y, size, rotation, spin, kind, vx, vy }); }
  update(dt) { this.rotation += this.spin * dt; this.x += this.vx * dt; this.y += this.vy * dt; if (this.vx || this.vy) this.rotation = Math.atan2(this.vy, this.vx); }
}
