import { NOVA_CONFIG, PAGE_SUGGESTIONS } from '../config/nova.config.js';
import { novaApi } from '../services/novaApi.js?v=7';
import { novaActions } from '../services/novaActions.js?v=8';
import { novaContext } from '../services/novaContext.js?v=5';
import { novaStore } from './novaStore.js';

const createId = role => `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export class NOVAController {
  #store;
  #api;
  #stateTimer = null;
  #sleepTimer = null;
  #requestController = null;
  #pendingAction = null;

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
      const localAction = novaActions.match(message);
      if (localAction.handled) {
        this.#pendingAction = localAction.action;
        const text = `${localAction.text || 'NOVA đã hiểu yêu cầu của bạn.'}\nBạn có muốn NOVA mở ngay không?`;
        this.#store.addMessage({ id: createId('assistant'), role: 'assistant', text, actions: [{ id: localAction.action, label: localAction.confirmLabel, icon: 'arrow-up-right-from-square' }], createdAt: Date.now(), status: 'sent' });
        this.#store.setState({ isLoading: false });
        this.setState('happy', { duration: NOVA_CONFIG.timing.happy });
        return { text, action: localAction.action };
      }
      const normalizedReply = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0111/g,'d').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
      if (this.#pendingAction && /^(ok|okay|duoc|dong y|mo di|lam di|lam luon|tiep tuc|xac nhan|yes|co|uh|u|oke)(\s+(di|nhe|luon|cho toi))?$/.test(normalizedReply)) {
        const pending = this.#pendingAction; this.#store.setState({ isLoading:false }); return this.executeAction(pending);
      }
      if (this.#pendingAction && /^(khong|thoi|huy|bo qua|khong can|de sau)$/.test(normalizedReply)) {
        this.#pendingAction=null;const text='Được rồi, NOVA đã hủy thao tác đó.';this.#store.addMessage({id:createId('assistant'),role:'assistant',text,createdAt:Date.now(),status:'sent'});this.#store.setState({isLoading:false});this.setState('idle');return {text,cancelled:true};
      }
      this.#pendingAction = null;
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

  async executeAction(actionName) {
    if (!actionName || this.#store.getState().isLoading) return null;
    this.#pendingAction = null; this.#store.setState({ isLoading: true, error: null }); this.setState('thinking');
    try {
      const result = await novaActions.execute(actionName);
      const text = result.text || 'NOVA đã thực hiện xong.';
      this.#store.addMessage({ id: createId('assistant'), role: 'assistant', text, createdAt: Date.now(), status: 'sent' });
      this.#store.setState({ isLoading: false }); this.setState(result.available===false?'confused':'happy',{duration:2200});
      return result;
    } catch (error) {
      this.#store.setState({ isLoading:false,error:error?.message||'Không thể thực hiện hành động.' }); this.setState('confused',{duration:2400}); return null;
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
