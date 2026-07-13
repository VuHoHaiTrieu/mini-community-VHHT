const shell = document.querySelector('.messenger-shell');
const chatHeader = document.getElementById('chat-header');

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
}
