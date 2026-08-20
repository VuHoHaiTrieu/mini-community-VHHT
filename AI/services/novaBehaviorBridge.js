export class NovaBehaviorBridge {
  constructor(controller) {
    this.controller = controller;
    this.lastReactionAt = 0;
    this.onInput = event => this.#handleInput(event);
    this.onClick = event => this.#handleClick(event);
    this.onSubmit = event => this.#handleSubmit(event);
    this.onError = () => this.#react('confused', 2200);
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('submit', this.onSubmit, true);
    window.addEventListener('error', this.onError);
    window.addEventListener('unhandledrejection', this.onError);
    this.ambientIndex=0;
    this.ambientStartTimer=window.setTimeout(()=>this.#playAmbient(),2200);
    this.ambientTimer=window.setInterval(()=>this.#playAmbient(),8500);
  }

  destroy() {
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('submit', this.onSubmit, true);
    window.removeEventListener('error', this.onError);
    window.removeEventListener('unhandledrejection', this.onError);
    window.clearInterval(this.ambientTimer);
    window.clearTimeout(this.ambientStartTimer);
  }

  #handleInput(event) {
    if (event.target.closest?.('.nova-root')) return;
    if (event.target.matches?.('input[type="search"], #community-user-search')) this.#react('searching', 1200);
  }

  #handleClick(event) {
    if (event.target.closest?.('.nova-root')) return;
    if (event.target.closest?.('#create-community-post-button')) this.#react('thinking', 1600);
    else if (event.target.closest?.('.community-composer-toggle')) this.#react('hello', 900);
  }

  #handleSubmit(event) {
    if (event.target.closest?.('.nova-root')) return;
    if (event.target.matches?.('#message-form, form[data-message-form]')) this.#react('happy', 1300);
  }

  #react(state, duration) {
    const now = performance.now();
    if (now - this.lastReactionAt < 450 || this.controller.getState().isLoading) return;
    this.lastReactionAt = now;
    this.controller.setState(state, { duration });
  }

  #playAmbient(){
    const states=['wave','thinking','searching','happy','dance','reading'];
    this.controller.playAmbientAction(states[this.ambientIndex++%states.length],{duration:1900});
  }
}
