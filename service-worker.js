const VERSION = "vhht-shell-2026-09-06-25";
const SHELL_CACHE = `${VERSION}-static`;
const appUrl = path => new URL(path, self.registration.scope).href;
const OFFLINE_URL = appUrl("offline.html");
const SHELL_FILES = [
  "pwa-start.html",
  "offline.html",
  "shared/assets/brand/vhht-logo-mark.png",
  "shared/assets/brand/vhht-logo-horizontal.png",
  "shared/assets/brand/vhht-favicon.png",
  "shared/brand-system.css",
  "shared/ui-selection-policy.css",
  "authentication/login-page.html",
  "community/community-feed-page.html",
  "community/community-mobile-stability.css?v=11",
  "community/community-space-depth.css?v=5",
  "community/realtime-feed-handler.js?v=inline-more-90",
  "community/messages/messages-page.html",
  "community/messages/messages.css",
  "community/messages/messages-keyboard-pro.css?v=2",
  "community/messages/messages-responsive.js",
  "shared/performance-governor.js?v=4"
].map(appUrl);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)));
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("vhht-shell-") && key !== SHELL_CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

const isPrivateRemoteRequest = url =>
  url.origin !== self.location.origin ||
  /(?:googleapis|firebaseio|firestore|cloudinary|script\.google)/i.test(url.href);

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isPrivateRemoteRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(caches.match(request).then(cached => {
      const fresh = fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
          caches.open(SHELL_CACHE).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => cached || caches.match(OFFLINE_URL));
      return cached || fresh;
    }));
    return;
  }

  if (!["style", "script", "image", "font", "audio"].includes(request.destination)) return;

  // Render cached UI immediately and refresh it in the background. Versioned
  // assets plus the in-app updater activate a release without blocking launch.
  if (request.destination === "style" || request.destination === "script") {
    event.respondWith(caches.match(request).then(cached => {
      const fresh = fetch(request).then(response => {
        if (response.ok && response.type === "basic") caches.open(SHELL_CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || fresh;
    }));
    return;
  }

  event.respondWith(caches.match(request).then(cached => {
    const fresh = fetch(request).then(response => {
      if (response.ok && response.type === "basic") caches.open(SHELL_CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || fresh;
  }));
});

self.addEventListener("message", event => {
  if (event.data?.type === "VHHT_SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || "Bạn có thông báo mới." }; }
  const title = String(payload.title || "VHHT Community").slice(0, 120);
  const options = {
    body: String(payload.body || "Bạn có thông báo mới.").slice(0, 500),
    icon: appUrl("shared/assets/brand/vhht-logo-mark.png"),
    badge: appUrl("shared/assets/brand/vhht-favicon.png"),
    data: { url: appUrl(payload.url || "community/community-feed-page.html") },
    tag: payload.tag ? String(payload.tag).slice(0, 120) : undefined
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || appUrl("community/community-feed-page.html");
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    return existing ? existing.focus().then(() => existing.navigate(targetUrl)) : clients.openWindow(targetUrl);
  }));
});
