import { NovaAnimation } from '../NovaAnimation/NovaAnimation.js?v=8';
import { novaCharacters } from '../../services/novaCharacterManager.js';
import { novaAccountScope } from '../../services/novaAccountScope.js';

const STATE_LABELS = Object.freeze({
  idle: 'Sẵn sàng', hello: 'Đang chào bạn', thinking: 'Đang suy nghĩ', searching: 'Đang tìm kiếm',
  talking: 'Đang trả lời', happy: 'Vui vẻ', confused: 'Chưa hiểu', sleeping: 'Đang ngủ'
});

export class NovaMascot {
  constructor(controller) {
    this.controller = controller;
    this.element = this.#createElement();
    this.animation = new NovaAnimation(this.element.querySelector('.nova-animation'));
    this.button = this.element.querySelector('.nova-mascot-button');
    this.#enableDragging();
    this.unsubscribeCharacter=novaCharacters.subscribe(()=>this.#renderCharacter());this.#renderCharacter();
    this.unsubscribe = controller.subscribe(state => this.render(state));
  }

  #createElement() {
    const wrapper = document.createElement('div');
    wrapper.className = 'nova-mascot';
    wrapper.innerHTML = `
      <div class="nova-speech" role="status" hidden></div>
      <div class="nova-state-badge"><i></i><span>Sẵn sàng</span></div>
      <button class="nova-mascot-button" type="button" aria-controls="nova-chat-dialog" aria-expanded="false" aria-label="Mở trợ lý NOVA">
        <span class="nova-animation" data-nova-state="idle"></span>
        <span class="nova-notification-dot" aria-hidden="true"></span>
      </button>`;
    return wrapper;
  }

  render(state) {
    this.animation.setState(state.state);
    this.element.dataset.state = state.state;
    this.element.hidden = state.isChatOpen;
    this.element.querySelector('.nova-mascot-button').setAttribute('aria-expanded', String(state.isChatOpen));
    this.element.querySelector('.nova-state-badge span').textContent = STATE_LABELS[state.state] || state.state;
    const speech = this.element.querySelector('.nova-speech');
    speech.textContent = state.speech;
    speech.hidden = !state.speech || state.isChatOpen;
  }

  #renderCharacter(){
    const character=novaCharacters.getDefinition();this.element.dataset.character=character.id;
    this.button?.setAttribute('aria-label',`Mở trợ lý ${character.name}`);
  }

  #enableDragging() {
    let drag = null;
    let suppressClick = false;
    const positionKey = () => novaAccountScope.key('vhht_nova_position:global');
    const rootElement = () => this.element.closest('.nova-root');
    const applyPlacement = (left, top, persist = false) => {
      const root = rootElement();
      if (!root) return;
      const width = this.element.offsetWidth || 110;
      const height = this.element.offsetHeight || 116;
      const x = Math.max(8, Math.min(window.innerWidth - width - 8, left));
      const y = Math.max(8, Math.min(window.innerHeight - height - 8, top));
      /* Page-specific mobile themes use !important docking rules. Inline
         declarations without a priority could not override them, so NOVA
         appeared to drag and then snapped back to the corner. */
      root.style.setProperty('left', `${Math.round(x)}px`, 'important');
      root.style.setProperty('top', `${Math.round(y)}px`, 'important');
      root.style.setProperty('right', 'auto', 'important');
      root.style.setProperty('bottom', 'auto', 'important');
      root.dataset.horizontal = x + width / 2 < window.innerWidth / 2 ? 'left' : 'right';
      root.dataset.vertical = y + height / 2 < window.innerHeight / 2 ? 'top' : 'bottom';
      if (persist) {
        try { localStorage.setItem(positionKey(), JSON.stringify({ x: x / window.innerWidth, y: y / window.innerHeight })); } catch (_) {}
      }
    };
    const restorePosition = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(positionKey()));
        if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
          applyPlacement(saved.x * window.innerWidth, saved.y * window.innerHeight);
          return;
        }
      } catch (_) {}
      const position = {
        left: window.innerWidth - (this.element.offsetWidth || 110) - 18,
        top: window.innerHeight - (this.element.offsetHeight || 116) - 18
      };
      applyPlacement(position.left, position.top, true);
    };
    requestAnimationFrame(restorePosition);
    novaAccountScope.subscribe(()=>requestAnimationFrame(restorePosition));
    window.addEventListener('resize', () => {
      const root = rootElement();
      if (root?.style.left) applyPlacement(Number.parseFloat(root.style.left), Number.parseFloat(root.style.top), true);
    }, { passive: true });
    this.button.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      const root = rootElement();
      if (!root) return;
      const rect = root.getBoundingClientRect();
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
      this.button.setPointerCapture?.(event.pointerId);
      root.classList.add('is-dragging');
      event.preventDefault();
      this.controller.setState('searching');
    });
    this.button.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) { event.preventDefault(); applyPlacement(drag.left + dx, drag.top + dy); }
    });
    const finishDrag = event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const root = rootElement();
      suppressClick = drag.moved && event.type === 'pointerup';
      if (drag.moved && root) applyPlacement(Number.parseFloat(root.style.left), Number.parseFloat(root.style.top), true);
      root?.classList.remove('is-dragging');
      this.controller.setState('idle');
      drag = null;
    };
    this.button.addEventListener('pointerup', finishDrag);
    this.button.addEventListener('pointercancel', finishDrag);
    this.button.addEventListener('click', event => {
      if (suppressClick) { event.preventDefault(); suppressClick = false; return; }
      this.controller.openChat();
    });
  }

  destroy() { this.unsubscribe?.();this.unsubscribeCharacter?.(); this.animation.destroy(); this.element.remove(); }
}
