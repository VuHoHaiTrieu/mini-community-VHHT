export class InputManager {
  constructor(canvas, onLaunch, onPause, onRetry) {
    this.canvas = canvas; this.onLaunch = onLaunch; this.onPause = onPause; this.onRetry = onRetry;
    canvas.addEventListener('pointerdown', this.pointer, { passive: false });
    window.addEventListener('keydown', this.keydown);
  }
  pointer = event => { event.preventDefault(); this.onLaunch(); };
  keydown = event => {
    if (event.code === 'Space') { event.preventDefault(); this.onLaunch(); }
    if (event.code === 'Escape') this.onPause();
    if (event.code === 'KeyR') this.onRetry();
  };
  destroy() { this.canvas.removeEventListener('pointerdown', this.pointer); window.removeEventListener('keydown', this.keydown); }
}
