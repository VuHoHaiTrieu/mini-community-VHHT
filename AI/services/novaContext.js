export class NovaContextService {
  capture(baseContext = {}) {
    const active = document.activeElement;
    const visibleDialog = [...document.querySelectorAll('[role="dialog"], dialog, .open, .show')]
      .find(element => this.#visible(element));
    return {
      ...baseContext,
      focusedElement: active?.id || active?.getAttribute?.('aria-label') || active?.tagName?.toLowerCase() || '',
      visibleDialog: visibleDialog?.id || visibleDialog?.getAttribute?.('aria-label') || '',
      composerCollapsed: document.querySelector('.community-create-post-container-wrapper')?.classList.contains('composer-collapsed') ?? null,
      hasSelectedMedia: document.querySelector('.community-create-post-container-wrapper')?.classList.contains('has-selected-media') ?? false,
      selectedConversation: document.querySelector('[data-conversation-id].active, .conversation-item.active')?.getAttribute('data-conversation-id') || '',
      viewport: { width: window.innerWidth, height: window.innerHeight, mobile: window.innerWidth <= 700 }
    };
  }

  #visible(element) {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getAttribute('aria-hidden') !== 'true';
  }
}

export const novaContext = new NovaContextService();

