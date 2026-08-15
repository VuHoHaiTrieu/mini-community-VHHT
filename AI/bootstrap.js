import { NovaChat } from './components/NovaChat/NovaChat.js';
import { NovaMascot } from './components/NovaMascot/NovaMascot.js';
import { nova } from './store/NOVAController.js';

function mountNova() {
  if (document.querySelector('[data-nova-root]')) return;
  const root = document.createElement('aside');
  root.className = 'nova-root';
  root.dataset.novaRoot = '';
  root.setAttribute('aria-label', 'Hệ thống trợ lý NOVA');
  const mascot = new NovaMascot(nova);
  const chat = new NovaChat(nova);
  root.append(mascot.element, chat.element);
  document.body.appendChild(root);
  window.nova = nova;
  window.dispatchEvent(new CustomEvent('nova:ready', { detail: { nova } }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountNova, { once: true });
else mountNova();

export { nova, mountNova };

