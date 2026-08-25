export class GameLoop {
  constructor(update, render, step, maxFrameTime) { Object.assign(this, { update, render, step, maxFrameTime }); this.running = false; }
  start() { if (this.running) return; this.running = true; this.previous = performance.now(); this.accumulator = 0; this.frame = requestAnimationFrame(this.tick); }
  stop() { this.running = false; cancelAnimationFrame(this.frame); }
  tick = now => {
    if (!this.running) return;
    const elapsed = Math.min((now - this.previous) / 1000, this.maxFrameTime);
    this.previous = now; this.accumulator += elapsed;
    while (this.accumulator >= this.step) { this.update(this.step); this.accumulator -= this.step; }
    this.render(this.accumulator / this.step);
    this.frame = requestAnimationFrame(this.tick);
  };
}
