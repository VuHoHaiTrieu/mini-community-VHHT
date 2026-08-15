import { NovaAnimation } from '../NovaAnimation/NovaAnimation.js';

const STATE_LABELS = Object.freeze({
  idle: 'Sẵn sàng', hello: 'Đang chào bạn', thinking: 'Đang suy nghĩ', searching: 'Đang tìm kiếm',
  talking: 'Đang trả lời', happy: 'Vui vẻ', confused: 'Chưa hiểu', sleeping: 'Đang ngủ'
});

export class NovaMascot {
  constructor(controller) {
    this.controller = controller;
    this.element = this.#createElement();
    this.animation = new NovaAnimation(this.element.querySelector('.nova-animation'));
    this.element.querySelector('.nova-mascot-button').addEventListener('click', () => controller.openChat());
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

  destroy() { this.unsubscribe?.(); this.animation.destroy(); this.element.remove(); }
}
