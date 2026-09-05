import '../shared/performance-governor.js?v=1';

let nova = null;
let mountPromise = null;

async function mountNova() {
  if (document.querySelector('[data-nova-root]')) return nova;
  if (mountPromise) return mountPromise;
  mountPromise = Promise.all([
    import('./components/NovaChat/NovaChat.js?v=20'),
    import('./components/NovaMascot/NovaMascot.js?v=15'),
    import('./store/NOVAController.js?v=account-scope-15'),
    import('./services/novaBehaviorBridge.js?v=5')
  ]).then(([chatModule, mascotModule, controllerModule, bridgeModule]) => {
  const { NovaChat } = chatModule;
  const { NovaMascot } = mascotModule;
  const { NovaBehaviorBridge } = bridgeModule;
  nova = controllerModule.nova;
  const root = document.createElement('aside');
  root.className = 'nova-root';
  root.dataset.novaRoot = '';
  root.setAttribute('aria-label', 'Hệ thống trợ lý NOVA');
  const mascot = new NovaMascot(nova);
  const chat = new NovaChat(nova);
  const behaviorBridge = new NovaBehaviorBridge(nova);
  root.append(mascot.element, chat.element);
  document.body.appendChild(root);
  window.nova = nova;
  window.dispatchEvent(new CustomEvent('nova:ready', { detail: { nova, behaviorBridge } }));
  return nova;
  }).catch(error => {
    mountPromise = null;
    console.warn('NOVA chưa thể khởi động', error);
    return null;
  });
  return mountPromise;
}

function scheduleNovaMount() {
  if ('requestIdleCallback' in window) window.requestIdleCallback(() => mountNova(), { timeout: 1800 });
  else window.setTimeout(() => mountNova(), 600);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleNovaMount, { once: true });
else scheduleNovaMount();

export { nova, mountNova };
