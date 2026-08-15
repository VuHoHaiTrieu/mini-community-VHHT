import { NOVA_CONFIG, detectNovaPageContext } from '../config/nova.config.js';
import { isNovaState } from '../types/nova.types.js';

function readMessages() {
  try {
    const value = JSON.parse(localStorage.getItem(NOVA_CONFIG.chat.storageKey));
    return Array.isArray(value) ? value.slice(-NOVA_CONFIG.chat.maxStoredMessages) : [];
  } catch (_) {
    return [];
  }
}

function createInitialState() {
  return {
    state: 'idle',
    isChatOpen: false,
    isLoading: false,
    error: null,
    speech: '',
    messages: readMessages(),
    context: detectNovaPageContext()
  };
}

export class NovaStore {
  #state = createInitialState();
  #listeners = new Set();

  getState() {
    return { ...this.#state, messages: [...this.#state.messages], context: { ...this.#state.context } };
  }

  setState(patch) {
    const nextPatch = typeof patch === 'function' ? patch(this.getState()) : patch;
    if (!nextPatch || typeof nextPatch !== 'object') return;
    if (nextPatch.state && !isNovaState(nextPatch.state)) {
      throw new TypeError(`NOVA state không hợp lệ: ${nextPatch.state}`);
    }
    this.#state = { ...this.#state, ...nextPatch };
    if (Object.prototype.hasOwnProperty.call(nextPatch, 'messages')) this.#persistMessages();
    this.#listeners.forEach(listener => listener(this.getState()));
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('NOVA subscriber phải là function.');
    this.#listeners.add(listener);
    listener(this.getState());
    return () => this.#listeners.delete(listener);
  }

  addMessage(message) {
    const messages = [...this.#state.messages, message].slice(-NOVA_CONFIG.chat.maxStoredMessages);
    this.setState({ messages });
  }

  clearMessages() {
    this.setState({ messages: [] });
  }

  #persistMessages() {
    try { localStorage.setItem(NOVA_CONFIG.chat.storageKey, JSON.stringify(this.#state.messages)); } catch (_) {}
  }
}

export const novaStore = new NovaStore();

