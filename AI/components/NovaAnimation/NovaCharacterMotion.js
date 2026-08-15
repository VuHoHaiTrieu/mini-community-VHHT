import { NOVA_CONFIG } from '../../config/nova.config.js';

export class NovaCharacterMotion {
  constructor(container) {
    this.container = container;
    this.state = 'idle';
    this.element = document.createElement('span');
    this.element.className = 'nova-character-motion';
    this.element.innerHTML = `
      <span class="nova-character-look">
        <img class="nova-character-skin" src="${NOVA_CONFIG.characterSkinUrl}" alt="" draggable="false">
      </span>
      <span class="nova-character-effect nova-character-effect--orbit" aria-hidden="true"></span>
      <span class="nova-character-effect nova-character-effect--sparkles" aria-hidden="true">✦ ✧ ✦</span>
      <span class="nova-character-effect nova-character-effect--thinking" aria-hidden="true">● ● ●</span>
      <span class="nova-character-effect nova-character-effect--sleep" aria-hidden="true">Z z</span>`;
    container.appendChild(this.element);
    this.look = this.element.querySelector('.nova-character-look');
    this.onPointerMove = event => this.#followPointer(event);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
  }

  setState(state) {
    this.state = state;
    this.element.dataset.state = state;
  }

  destroy() {
    window.removeEventListener('pointermove', this.onPointerMove);
    this.element.remove();
  }

  #followPointer(event) {
    if (this.state !== 'idle' && this.state !== 'hello') {
      this.look.style.transform = '';
      return;
    }
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2)));
    const y = Math.max(-1, Math.min(1, (event.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2)));
    this.look.style.transform = `translate(${x * 3}px, ${y * 2}px) rotate(${x * 1.2}deg)`;
  }
}

