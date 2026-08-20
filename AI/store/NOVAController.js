import { NOVA_CONFIG, PAGE_SUGGESTIONS } from '../config/nova.config.js';
import { novaApi } from '../services/novaApi.js?v=9';
import { novaActions } from '../services/novaActions.js?v=10';
import { novaContext } from '../services/novaContext.js?v=5';
import { novaStore } from './novaStore.js';
import { novaCharacters } from '../services/novaCharacterManager.js';

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
    const assistantName = novaCharacters.getDefinition().name;
    const personalize = value => String(value || '').replace(/\bNOVA\b/g, assistantName);
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
        const hasChoices=Array.isArray(localAction.actions)&&localAction.actions.length>0;
        const text = hasChoices?personalize(localAction.text || 'Bạn hãy chọn cách liên hệ phù hợp.'):`${personalize(localAction.text || `${assistantName} đã hiểu yêu cầu của bạn.`)}\nBạn có muốn ${assistantName} mở ngay không?`;
        const actions=hasChoices?localAction.actions:[{ id: localAction.action, label: localAction.confirmLabel, icon: 'arrow-up-right-from-square' }];
        if(hasChoices)this.#pendingAction=null;
        this.#store.addMessage({ id: createId('assistant'), role: 'assistant', text, actions, createdAt: Date.now(), status: 'sent' });
        this.#store.setState({ isLoading: false });
        this.setState('happy', { duration: NOVA_CONFIG.timing.happy });
        return { text, action: localAction.action };
      }
      const normalizedReply = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0111/g,'d').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
      if (this.#pendingAction && /^(ok|okay|duoc|dong y|mo di|lam di|lam luon|tiep tuc|xac nhan|yes|co|uh|u|oke)(\s+(di|nhe|luon|cho toi))?$/.test(normalizedReply)) {
        const pending = this.#pendingAction; this.#store.setState({ isLoading:false }); return this.executeAction(pending);
      }
      if (this.#pendingAction && /^(khong|thoi|huy|bo qua|khong can|de sau)$/.test(normalizedReply)) {
        this.#pendingAction=null;const text=`Được rồi, ${assistantName} đã hủy thao tác đó.`;this.#store.addMessage({id:createId('assistant'),role:'assistant',text,createdAt:Date.now(),status:'sent'});this.#store.setState({isLoading:false});this.setState('idle');return {text,cancelled:true};
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
      const errorMessage = error?.message || `${assistantName} gặp sự cố. Vui lòng thử lại.`;
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
      const text = String(result.text || `${novaCharacters.getDefinition().name} đã thực hiện xong.`).replace(/\bNOVA\b/g,novaCharacters.getDefinition().name);
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
  getCharacter() { return novaCharacters.getCharacter(); }
  setCharacter(id) { novaCharacters.setCharacter(id);this.setState('happy',{duration:NOVA_CONFIG.timing.happy});return this; }
  playAction(name, { duration = 2600, fallback = 'idle' } = {}) { return this.setState(name, { duration, fallback }); }
  playAmbientAction(name, { duration = 1800 } = {}) {
    const current=this.#store.getState();
    if(current.isChatOpen||current.isLoading||current.state==='sleeping')return this;
    window.clearTimeout(this.#stateTimer);this.#store.setState({state:name});
    this.#stateTimer=window.setTimeout(()=>{if(this.#store.getState().state===name)this.#store.setState({state:'idle'})},duration);
    return this;
  }
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
