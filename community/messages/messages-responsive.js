const shell = document.querySelector('.messenger-shell');
const chatHeader = document.getElementById('chat-header');
const messagesList = document.getElementById('messages-list');
let scrollbarIdleTimer = 0;

function revealMessageScrollbar() {
    if (!messagesList) return;
    messagesList.classList.add('is-scrolling');
    clearTimeout(scrollbarIdleTimer);
    scrollbarIdleTimer = setTimeout(() => messagesList.classList.remove('is-scrolling'), 850);
}

messagesList?.addEventListener('scroll', revealMessageScrollbar, { passive: true });
messagesList?.addEventListener('pointerdown', revealMessageScrollbar, { passive: true });
messagesList?.addEventListener('touchmove', revealMessageScrollbar, { passive: true });

function syncMessageViewport() {
    const viewport = window.visualViewport;
    const mobile = innerWidth <= 760;
    document.documentElement.style.setProperty('--message-viewport-height', `${mobile && viewport ? viewport.height : innerHeight}px`);
    document.documentElement.style.setProperty('--message-viewport-offset', `${mobile && viewport ? viewport.offsetTop : 0}px`);
}

function ensureMobileChatBackButton() {
    if (!shell || !chatHeader || chatHeader.querySelector('.chat-mobile-back') || !chatHeader.querySelector('.chat-contact')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-mobile-back';
    button.setAttribute('aria-label', 'Quay lại danh sách trò chuyện');
    button.innerHTML = '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>';
    button.addEventListener('click', () => shell.classList.remove('mobile-chat-open'));
    chatHeader.prepend(button);
}

if (shell && chatHeader) {
    new MutationObserver(ensureMobileChatBackButton).observe(chatHeader, { childList: true });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && innerWidth <= 760) shell.classList.remove('mobile-chat-open');
    });
    addEventListener('popstate', () => shell.classList.remove('mobile-chat-open'));
    ensureMobileChatBackButton();
    syncMessageViewport();
    window.visualViewport?.addEventListener('resize', syncMessageViewport, { passive: true });
    window.visualViewport?.addEventListener('scroll', syncMessageViewport, { passive: true });
    addEventListener('resize', syncMessageViewport, { passive: true });
}
