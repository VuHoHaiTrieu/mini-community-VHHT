const shell = document.querySelector('.messenger-shell');
const chatHeader = document.getElementById('chat-header');
const messagesList = document.getElementById('messages-list');
const messageInput = document.getElementById('message-input');
let scrollbarIdleTimer = 0;
let viewportFrame = 0;
let viewportBaseline = Math.max(innerHeight, document.documentElement.clientHeight);
let viewportWidth = innerWidth;

function revealMessageScrollbar() {
    if (!messagesList) return;
    messagesList.classList.add('is-scrolling');
    clearTimeout(scrollbarIdleTimer);
    scrollbarIdleTimer = setTimeout(() => messagesList.classList.remove('is-scrolling'), 850);
}

messagesList?.addEventListener('scroll', revealMessageScrollbar, { passive: true });
messagesList?.addEventListener('pointerdown', revealMessageScrollbar, { passive: true });
messagesList?.addEventListener('touchmove', revealMessageScrollbar, { passive: true });

function isNearConversationEnd() {
    if (!messagesList) return false;
    return messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight < 96;
}

function pinConversationToEnd() {
    if (!messagesList) return;
    messagesList.scrollTop = messagesList.scrollHeight;
}

function syncMessageViewport() {
    const viewport = window.visualViewport;
    const mobile = innerWidth <= 760;
    if (Math.abs(innerWidth - viewportWidth) > 40) {
        viewportWidth = innerWidth;
        viewportBaseline = Math.max(innerHeight, document.documentElement.clientHeight, viewport?.height || 0);
    }
    const wasNearEnd = isNearConversationEnd();
    const inputFocused = document.activeElement === messageInput;
    const visibleHeight = mobile && viewport ? viewport.height : innerHeight;
    const visibleOffset = mobile && viewport ? viewport.offsetTop : 0;
    if (!inputFocused) viewportBaseline = Math.max(viewportBaseline, innerHeight, document.documentElement.clientHeight, visibleHeight);
    const screenHeight = Math.min(screen.availHeight || Infinity, screen.height || Infinity);
    const keyboardOpen = mobile && inputFocused && (
        viewportBaseline - visibleHeight > 80 ||
        (Number.isFinite(screenHeight) && visibleHeight < screenHeight * .76)
    );

    document.documentElement.style.setProperty('--message-viewport-height', `${Math.round(visibleHeight)}px`);
    document.documentElement.style.setProperty('--message-viewport-offset', `${Math.round(visibleOffset)}px`);
    document.body.classList.toggle('message-keyboard-open', keyboardOpen);
    if (keyboardOpen && window.scrollY) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
        if (keyboardOpen || inputFocused || wasNearEnd) pinConversationToEnd();
    });
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
    messageInput?.addEventListener('focus', () => {
        document.body.classList.add('message-input-focused');
        document.getElementById('message-form')?.classList.add('composer-input-expanded');
        syncMessageViewport();
        requestAnimationFrame(pinConversationToEnd);
    });
    messageInput?.addEventListener('blur', () => {
        document.body.classList.remove('message-input-focused');
        requestAnimationFrame(syncMessageViewport);
    });
    window.addEventListener('pagehide', () => {
        document.body.classList.remove('message-keyboard-open', 'message-input-focused');
        cancelAnimationFrame(viewportFrame);
    }, { once: true });
}
