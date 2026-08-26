export class Debris {
  constructor(x, y, size, rotation, spin, kind = 'debris', vx = 0, vy = 0) { const variants=kind==='human'?[2,3]:kind==='mine'?[0,5,6,7]:[1,4,5,6,7];Object.assign(this, { x, y, size, rotation, spin, kind, vx, vy,variant:variants[Math.floor(Math.random()*variants.length)] }); }
  update(dt) { this.rotation += this.spin * dt; this.x += this.vx * dt; this.y += this.vy * dt; if (this.vx || this.vy) this.rotation = Math.atan2(this.vy, this.vx); }
}
