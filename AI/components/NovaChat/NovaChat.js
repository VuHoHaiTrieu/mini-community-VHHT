import { NOVA_CONFIG } from '../../config/nova.config.js';
import { createNovaLoadingMessage, createNovaMessage } from '../NovaMessage/NovaMessage.js';
import { NovaAnimation } from '../NovaAnimation/NovaAnimation.js';

export class NovaChat {
  constructor(controller) {
    this.controller = controller;
    this.renderedMessageIds = new Set();
    this.element = this.#createElement();
    this.#bindEvents();
    this.unsubscribe = controller.subscribe(state => this.render(state));
  }

  #createElement() {
    const panel = document.createElement('section');
    panel.className = 'nova-chat';
    panel.id = 'nova-chat-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Trò chuyện với NOVA');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <header class="nova-chat-header">
        <span class="nova-chat-avatar nova-animation" aria-label="Linh vật NOVA"></span>
        <div><h2>${NOVA_CONFIG.name}</h2><p><i></i>${NOVA_CONFIG.statusLabel}</p></div>
        <button class="nova-chat-clear" type="button" title="Xóa hội thoại" aria-label="Xóa hội thoại">↻</button>
        <button class="nova-chat-close" type="button" aria-label="Đóng cửa sổ chat">−</button>
      </header>
      <div class="nova-chat-context"></div>
      <div class="nova-chat-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="nova-chat-error" role="alert" hidden></div>
      <div class="nova-chat-suggestions" aria-label="Câu hỏi gợi ý"></div>
      <form class="nova-chat-compose">
        <input class="nova-chat-input" maxlength="${NOVA_CONFIG.chat.maxInputLength}" autocomplete="off" aria-label="Tin nhắn cho NOVA" placeholder="Nhắn tin cho NOVA...">
        <button class="nova-chat-send" type="submit" aria-label="Gửi tin nhắn"><span>➤</span></button>
      </form>`;
    return panel;
  }

  #bindEvents() {
    this.messages = this.element.querySelector('.nova-chat-messages');
    this.animation = new NovaAnimation(this.element.querySelector('.nova-chat-avatar'));
    this.input = this.element.querySelector('.nova-chat-input');
    this.sendButton = this.element.querySelector('.nova-chat-send');
    this.error = this.element.querySelector('.nova-chat-error');
    this.element.querySelector('.nova-chat-close').addEventListener('click', () => this.controller.closeChat());
    this.element.querySelector('.nova-chat-clear').addEventListener('click', () => this.controller.clearConversation());
    this.element.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this.controller.sendMessage(text);
    });
    this.input.addEventListener('keydown', event => { if (event.key === 'Escape') this.controller.closeChat(); });
    const suggestions = this.element.querySelector('.nova-chat-suggestions');
    this.controller.getSuggestions().forEach(label => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => this.controller.sendMessage(label));
      suggestions.appendChild(button);
    });
  }

  render(state) {
    const wasOpen = this.element.getAttribute('aria-hidden') === 'false';
    this.element.setAttribute('aria-hidden', String(!state.isChatOpen));
    this.animation.setState(state.state);
    this.element.querySelector('.nova-chat-context').innerHTML = `Đang hỗ trợ tại <strong>${this.#escape(state.context.label)}</strong>`;
    this.input.disabled = state.isLoading;
    this.sendButton.disabled = state.isLoading;
    this.sendButton.classList.toggle('is-loading', state.isLoading);
    this.error.hidden = !state.error;
    this.error.textContent = state.error || '';
    this.#renderMessages(state.messages, state.isLoading);
    if (state.isChatOpen && !wasOpen) requestAnimationFrame(() => this.input.focus());
  }

  #renderMessages(messages, isLoading) {
    const activeIds = new Set(messages.map(message => message.id));
    [...this.messages.querySelectorAll('[data-message-id]')].forEach(element => {
      if (!activeIds.has(element.dataset.messageId)) { this.renderedMessageIds.delete(element.dataset.messageId); element.remove(); }
    });
    messages.forEach(message => {
      if (!this.renderedMessageIds.has(message.id)) {
        this.messages.appendChild(createNovaMessage(message));
        this.renderedMessageIds.add(message.id);
      }
    });
    this.messages.querySelector('.nova-message--loading')?.remove();
    if (isLoading) this.messages.appendChild(createNovaLoadingMessage());
    if (!messages.length && !isLoading && !this.messages.querySelector('.nova-chat-empty')) {
      const empty = document.createElement('div'); empty.className = 'nova-chat-empty';
      empty.textContent = 'Xin chào! Mình là NOVA. Bạn cần mình hướng dẫn gì?'; this.messages.appendChild(empty);
    } else this.messages.querySelector('.nova-chat-empty')?.remove();
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  #escape(value) {
    const node = document.createElement('span'); node.textContent = String(value); return node.innerHTML;
  }

  destroy() { this.unsubscribe?.(); this.animation.destroy(); this.element.remove(); }
}
