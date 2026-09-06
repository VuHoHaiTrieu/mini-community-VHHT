export class GameLoop {
  constructor(update, render, step, maxFrameTime, options = {}) {
    Object.assign(this, { update, render, step, maxFrameTime });
    this.running = false;
    this.preferredFps = options.targetFps || 60;
    this.minimumFps = options.minimumFps || 30;
    this.targetFps = this.preferredFps;
    this.renderInterval = 1000 / this.targetFps;
    this.lastRender = 0;
    this.slowFrames = 0;
    this.goodFrames = 0;
    this.frameAverage = 1000 / this.preferredFps;
    this.lastPresentedAt = 0;
    this.visibilityHandler = () => {
      if (!this.running) return;
      cancelAnimationFrame(this.frame);
      if (!document.hidden) {
        this.previous = performance.now();
        this.accumulator = 0;
        this.frame = requestAnimationFrame(this.tick);
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler, { passive: true });
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.previous = performance.now();
    this.accumulator = 0;
    if (!document.hidden) this.frame = requestAnimationFrame(this.tick);
  }
  stop() { this.running = false; cancelAnimationFrame(this.frame); }
  tick = now => {
    if (!this.running) return;
    const elapsed = Math.min((now - this.previous) / 1000, this.maxFrameTime);
    this.previous = now; this.accumulator += elapsed;
    while (this.accumulator >= this.step) { this.update(this.step); this.accumulator -= this.step; }
    if (now - this.lastRender >= this.renderInterval) {
      const presentedInterval = this.lastPresentedAt ? now - this.lastPresentedAt : this.renderInterval;
      this.lastPresentedAt = now;
      const renderStarted = performance.now(); this.render(this.accumulator / this.step);
      // Preserve an even cadence instead of accumulating timer drift on mobile.
      this.lastRender = now - ((now - this.lastRender) % this.renderInterval);
      const renderCost = performance.now() - renderStarted;
      this.frameAverage = this.frameAverage * .92 + presentedInterval * .08;
      if (renderCost > this.renderInterval * .82 || presentedInterval > this.renderInterval * 1.42) { this.slowFrames++; this.goodFrames = 0; }
      else { this.slowFrames = Math.max(0, this.slowFrames - 1); this.goodFrames++; }
      if (this.slowFrames > 24 && this.targetFps > this.minimumFps) {
        this.targetFps = this.targetFps > 45 ? 45 : this.minimumFps;
        this.renderInterval = 1000 / this.targetFps; this.slowFrames = 0; this.goodFrames = 0;
        document.documentElement.dataset.gamePerformance = this.targetFps <= 30 ? 'low' : 'balanced';
        this.dispatchQuality();
      } else if (this.targetFps < this.preferredFps && this.goodFrames > 480 && this.frameAverage < this.renderInterval * 1.12) {
        this.targetFps = this.targetFps < 45 ? 45 : this.preferredFps;
        this.renderInterval = 1000 / this.targetFps; this.goodFrames = 0;
        if(this.targetFps===this.preferredFps)delete document.documentElement.dataset.gamePerformance;else document.documentElement.dataset.gamePerformance='balanced';
        this.dispatchQuality();
      }
    }
    if (this.running && !document.hidden) this.frame = requestAnimationFrame(this.tick);
  };
  dispatchQuality(){document.dispatchEvent(new CustomEvent('gravity-quality-change',{detail:{fps:this.targetFps,tier:this.targetFps<=30?'low':this.targetFps<60?'balanced':'high'}}));}
}
