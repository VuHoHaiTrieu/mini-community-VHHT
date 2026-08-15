import { NOVA_CONFIG } from '../../config/nova.config.js';

export function createNovaMessage(message) {
  const row = document.createElement('article');
  row.className = `nova-message nova-message--${message.role}`;
  row.dataset.messageId = message.id;
  if (message.role === 'assistant') {
    const avatar = document.createElement('img');
    avatar.className = 'nova-message-avatar';
    avatar.src = NOVA_CONFIG.mascotImageUrl;
    avatar.alt = 'NOVA';
    row.appendChild(avatar);
  }
  const bubble = document.createElement('div');
  bubble.className = 'nova-message-bubble';
  const content = document.createElement('p');
  content.textContent = message.text;
  const time = document.createElement('time');
  time.dateTime = new Date(message.createdAt).toISOString();
  time.textContent = new Date(message.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  bubble.append(content, time);
  row.appendChild(bubble);
  return row;
}

export function createNovaLoadingMessage() {
  const row = document.createElement('article');
  row.className = 'nova-message nova-message--assistant nova-message--loading';
  row.setAttribute('aria-label', 'NOVA đang xử lý');
  row.innerHTML = `<img class="nova-message-avatar" src="${NOVA_CONFIG.mascotImageUrl}" alt="NOVA"><div class="nova-message-bubble"><span></span><span></span><span></span></div>`;
  return row;
}

