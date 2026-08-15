import { NOVA_CONFIG, PAGE_SUGGESTIONS } from '../config/nova.config.js';
import { novaApi } from '../services/novaApi.js?v=7';
import { novaActions } from '../services/novaActions.js?v=7';
import { novaContext } from '../services/novaContext.js?v=5';
import { novaStore } from './novaStore.js';

const createId = role => `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export class NOVAController {
  #store;
  #api;
  #stateTimer = null;
  #sleepTimer = null;
  #requestController = null;

  constructor({ store = novaStore, api = novaApi } = {}) {
    this.#store = store;
    this.#api = api;
    this.#scheduleSleep();
    ['pointerdown', 'keydown', 'scroll'].forEach(event => window.addEventListener(event, () => this.wake(), { passive: true }));
  }

  getState() { return this.#store.getState(); }
  subscribe(listener) { return this.#store.subscribe(listener); }

  setState(state, { duration = 0, fallback = 'idle' } = {}) {
    window.clearTimeout(this.#stateTimer);
    this.#store.setState({ state });
    if (duration > 0) this.#stateTimer = window.setTimeout(() => this.setState(fallback), duration);
    this.#scheduleSleep();
    return this;
  }

  say(text, { duration } = {}) {
    const speech = String(text || '').trim();
    this.#store.setState({ speech });
    if (!speech) return this;
    const talkingDuration = duration ?? Math.min(NOVA_CONFIG.timing.talkingMax, Math.max(NOVA_CONFIG.timing.talkingMin, speech.length * NOVA_CONFIG.timing.talkingPerCharacter));
    this.setState('talking', { duration: talkingDuration });
    window.setTimeout(() => {
      if (this.#store.getState().speech === speech) this.#store.setState({ speech: '' });
    }, talkingDuration);
    return this;
  }

  openChat() {
    this.#store.setState({ isChatOpen: true, error: null });
    this.setState('hello', { duration: NOVA_CONFIG.timing.hello });
    return this;
  }

  closeChat() {
    this.#store.setState({ isChatOpen: false, speech: '' });
    this.setState('idle');
    return this;
  }

  toggleChat() { return this.#store.getState().isChatOpen ? this.closeChat() : this.openChat(); }

  async sendMessage(text) {
    const message = String(text || '').trim().slice(0, NOVA_CONFIG.chat.maxInputLength);
    if (!message || this.#store.getState().isLoading) return null;
    this.#requestController?.abort();
    this.#requestController = new AbortController();
    this.#store.addMessage({ id: createId('user'), role: 'user', text: message, createdAt: Date.now(), status: 'sent' });
    this.#store.setState({ isLoading: true, error: null });
    this.setState('thinking');
    try {
      const localAction = await novaActions.matchAndExecute(message);
      if (localAction.handled) {
        const text = localAction.text || 'NOVA đã hoàn tất thao tác.';
        this.#store.addMessage({ id: createId('assistant'), role: 'assistant', text, createdAt: Date.now(), status: 'sent' });
        this.#store.setState({ isLoading: false });
        this.setState('happy', { duration: NOVA_CONFIG.timing.happy });
        return { text, action: localAction.action };
      }
      if (this.#api.requiresSearch(message)) {
        await new Promise(resolve => window.setTimeout(resolve, 360));
        this.setState('searching');
      }
      const current = this.#store.getState();
      const response = await this.#api.sendMessage({ message, context: novaContext.capture(current.context), history: current.messages, signal: this.#requestController.signal });
      this.#store.addMessage({ id: createId('assistant'), role: 'assistant', text: response.text, createdAt: Date.now(), status: 'sent' });
      this.#store.setState({ isLoading: false });
      this.say(response.text);
      return response;
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      const errorMessage = error?.message || 'NOVA gặp sự cố. Vui lòng thử lại.';
      this.#store.setState({ isLoading: false, error: errorMessage });
      this.setState('confused', { duration: 2600 });
      return null;
    }
  }

  clearConversation() { this.#store.clearMessages(); return this; }
  getSuggestions() { return PAGE_SUGGESTIONS[this.#store.getState().context.key] || PAGE_SUGGESTIONS.home; }
  getContext() { return novaContext.capture(this.#store.getState().context); }
  registerAction(name, action) { return novaActions.register(name, action); }
  wake() { if (this.#store.getState().state === 'sleeping') this.setState('idle'); else this.#scheduleSleep(); }

  #scheduleSleep() {
    window.clearTimeout(this.#sleepTimer);
    this.#sleepTimer = window.setTimeout(() => {
      const state = this.#store.getState();
      if (!state.isChatOpen && !state.isLoading) this.setState('sleeping');
    }, NOVA_CONFIG.timing.inactivityToSleep);
  }
}

export const nova = new NOVAController();
