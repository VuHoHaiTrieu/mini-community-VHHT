export class GameLoop {
  constructor(update, render, step, maxFrameTime, options = {}) { Object.assign(this, { update, render, step, maxFrameTime }); this.running = false; this.targetFps = options.targetFps || 60; this.renderInterval = 1000 / this.targetFps; this.lastRender = 0; this.slowFrames = 0; }
  start() { if (this.running) return; this.running = true; this.previous = performance.now(); this.accumulator = 0; this.frame = requestAnimationFrame(this.tick); }
  stop() { this.running = false; cancelAnimationFrame(this.frame); }
  tick = now => {
    if (!this.running) return;
    const elapsed = Math.min((now - this.previous) / 1000, this.maxFrameTime);
    this.previous = now; this.accumulator += elapsed;
    while (this.accumulator >= this.step) { this.update(this.step); this.accumulator -= this.step; }
    if (now - this.lastRender >= this.renderInterval) {
      const renderStarted = performance.now(); this.render(this.accumulator / this.step); this.lastRender = now;
      const renderCost = performance.now() - renderStarted;
      if (renderCost > this.renderInterval * .82) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 1);
      if (this.slowFrames > 24 && this.targetFps > 30) { this.targetFps = 30; this.renderInterval = 1000 / 30; this.slowFrames = 0; document.documentElement.dataset.gamePerformance = 'thermal-safe'; }
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}
