import { NOVA_CONFIG } from '../../config/nova.config.js';

const RIVE_STATE_VALUES = Object.freeze({ idle: 0, hello: 1, thinking: 2, searching: 3, talking: 4, happy: 5, confused: 6, sleeping: 7 });

class ImageAnimationAdapter {
  constructor(container) {
    this.element = document.createElement('img');
    this.element.className = 'nova-animation-image';
    this.element.src = NOVA_CONFIG.mascotImageUrl;
    this.element.alt = '';
    this.element.draggable = false;
    container.appendChild(this.element);
  }
  setState(state) { this.element.dataset.state = state; }
  destroy() { this.element.remove(); }
}

class RiveAnimationAdapter {
  constructor(container) {
    if (!window.rive?.Rive) throw new Error('Rive runtime chưa được nạp.');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'nova-animation-canvas';
    this.canvas.setAttribute('aria-label', NOVA_CONFIG.rive.canvasName);
    container.appendChild(this.canvas);
    this.instance = new window.rive.Rive({
      src: NOVA_CONFIG.rive.assetUrl,
      canvas: this.canvas,
      autoplay: true,
      stateMachines: NOVA_CONFIG.rive.stateMachineName,
      onLoad: () => {
        this.instance.resizeDrawingSurfaceToCanvas();
        const inputs = this.instance.stateMachineInputs(NOVA_CONFIG.rive.stateMachineName) || [];
        this.stateInput = inputs.find(input => input.name === NOVA_CONFIG.rive.stateInputName) || null;
        this.setState(this.pendingState || 'idle');
      }
    });
  }
  setState(state) {
    this.pendingState = state;
    if (this.stateInput && typeof this.stateInput.value !== 'undefined') this.stateInput.value = RIVE_STATE_VALUES[state] ?? 0;
  }
  destroy() { this.instance?.cleanup?.(); this.canvas.remove(); }
}

export class NovaAnimation {
  constructor(container) {
    this.container = container;
    this.adapter = this.#createAdapter();
  }
  setState(state) {
    this.container.dataset.novaState = state;
    this.container.setAttribute('aria-label', `NOVA đang ở trạng thái ${state}`);
    this.adapter.setState(state);
  }
  destroy() { this.adapter.destroy(); }
  #createAdapter() {
    if (NOVA_CONFIG.rive.enabled) {
      try { return new RiveAnimationAdapter(this.container); }
      catch (error) { console.warn('[NOVA] Không thể khởi tạo Rive, dùng ảnh tĩnh fallback.', error); }
    }
    return new ImageAnimationAdapter(this.container);
  }
}

