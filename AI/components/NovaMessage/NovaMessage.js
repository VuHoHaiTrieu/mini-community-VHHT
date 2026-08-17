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
  if (message.role === 'assistant' && Array.isArray(message.actions) && message.actions.length) {
    const actions = document.createElement('div'); actions.className = 'nova-message-actions';
    message.actions.forEach(action => { const button=document.createElement('button'),label=document.createElement('span'),icon=document.createElement('i');button.type='button';button.dataset.novaAction=String(action.id||'');label.textContent=String(action.label||'Mở ngay');icon.className=`fa-solid fa-${/^[a-z0-9-]+$/.test(action.icon||'')?action.icon:'arrow-right'}`;icon.setAttribute('aria-hidden','true');button.append(label,icon);actions.appendChild(button); });
    bubble.appendChild(actions);
  }
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
