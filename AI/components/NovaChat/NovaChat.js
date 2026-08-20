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
      <header class="nova-chat-header" title="Kéo để di chuyển cửa sổ NOVA">
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
    this.header = this.element.querySelector('.nova-chat-header');
    this.positionKey = `vhht_nova_chat_position:${this.controller.getState().context.key}`;
    this.messages.addEventListener('click', async event => {
      const button=event.target.closest('[data-nova-action]');if(!button)return;
      button.disabled=true;button.classList.add('is-running');
      await this.controller.executeAction(button.dataset.novaAction);
      if(button.isConnected){button.disabled=false;button.classList.remove('is-running')}
    });
    this.#enableDragging();
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
    if (!state.isChatOpen && wasOpen) this.#dockMascotToPanel();
    if (state.isChatOpen && !wasOpen) this.#placePanelInViewport();
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

  #enableDragging() {
    let drag = null;
    this.header.addEventListener('pointerdown', event => {
      if (event.target.closest('button') || (event.button !== 0 && event.pointerType === 'mouse')) return;
      const rect = this.element.getBoundingClientRect();
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      this.header.setPointerCapture?.(event.pointerId);
      this.element.classList.add('is-dragging');
      event.preventDefault();
    });
    this.header.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      this.#setPanelPosition(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
    });
    const finish = event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      this.element.classList.remove('is-dragging');
      drag = null;
      this.#savePanelPosition();
    };
    this.header.addEventListener('pointerup', finish);
    this.header.addEventListener('pointercancel', finish);
    window.addEventListener('resize', () => {
      if (this.element.getAttribute('aria-hidden') === 'false') this.#placePanelInViewport({ keepCurrent: true });
    }, { passive: true });
  }

  #placePanelInViewport({ keepCurrent = false } = {}) {
    let left;
    let top;
    if (keepCurrent) {
      const rect = this.element.getBoundingClientRect();
      left = rect.left; top = rect.top;
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(this.positionKey));
        if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
          left = saved.x * window.innerWidth;
          top = saved.y * window.innerHeight;
        }
      } catch (_) {}
      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        const root = this.element.closest('.nova-root');
        const mascotLeft = Number.parseFloat(root?.style.left) || Math.max(8, window.innerWidth - 128);
        const mascotTop = Number.parseFloat(root?.style.top) || Math.max(8, window.innerHeight - 134);
        const width = this.element.offsetWidth || 380;
        const height = this.element.offsetHeight || 610;
        left = mascotLeft + 55 < window.innerWidth / 2 ? mascotLeft : mascotLeft + 110 - width;
        top = mascotTop + 58 < window.innerHeight / 2 ? mascotTop : mascotTop + 116 - height;
      }
    }
    this.#setPanelPosition(left, top);
  }

  #setPanelPosition(left, top) {
    const width = this.element.offsetWidth || Math.min(380, window.innerWidth - 16);
    const height = this.element.offsetHeight || Math.min(610, window.innerHeight - 16);
    const safeLeft = Math.max(8, Math.min(window.innerWidth - width - 8, left));
    const safeTop = Math.max(8, Math.min(window.innerHeight - height - 8, top));
    this.element.style.position = 'fixed';
    this.element.style.left = `${Math.round(safeLeft)}px`;
    this.element.style.top = `${Math.round(safeTop)}px`;
    this.element.style.right = 'auto';
    this.element.style.bottom = 'auto';
  }

  #savePanelPosition() {
    const rect = this.element.getBoundingClientRect();
    try { localStorage.setItem(this.positionKey, JSON.stringify({ x: rect.left / window.innerWidth, y: rect.top / window.innerHeight })); } catch (_) {}
  }

  #dockMascotToPanel() {
    const rect = this.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const root = this.element.closest('.nova-root');
    if (!root) return;
    const mascotWidth = 110;
    const mascotHeight = 116;
    const left = Math.max(8, Math.min(window.innerWidth - mascotWidth - 8, rect.right - mascotWidth));
    const top = Math.max(8, Math.min(window.innerHeight - mascotHeight - 8, rect.bottom - mascotHeight));
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.dataset.horizontal = left + mascotWidth / 2 < window.innerWidth / 2 ? 'left' : 'right';
    root.dataset.vertical = top + mascotHeight / 2 < window.innerHeight / 2 ? 'top' : 'bottom';
    const mascotKey = `vhht_nova_position:${this.controller.getState().context.key}`;
    try { localStorage.setItem(mascotKey, JSON.stringify({ x: left / window.innerWidth, y: top / window.innerHeight })); } catch (_) {}
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
