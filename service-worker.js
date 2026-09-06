const VERSION = "vhht-shell-2026-09-06-30";
const SHELL_CACHE = `${VERSION}-static`;
const IMAGE_CACHE = `${VERSION}-images`;
const AUDIO_CACHE = `${VERSION}-audio`;
const GAME_CACHE = `${VERSION}-game`;
const CACHE_LIMITS = {
  [SHELL_CACHE]: { entries: 90, age: 14 * 24 * 60 * 60 * 1000 },
  [IMAGE_CACHE]: { entries: 100, age: 14 * 24 * 60 * 60 * 1000 },
  [AUDIO_CACHE]: { entries: 32, age: 7 * 24 * 60 * 60 * 1000 },
  [GAME_CACHE]: { entries: 48, age: 14 * 24 * 60 * 60 * 1000 }
};
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
  "community/realtime-feed-handler.js?v=multi-media-post-92",
  "community/messages/messages-page.html",
  "community/messages/messages.css",
  "community/messages/messages-keyboard-pro.css?v=2",
  "community/messages/messages-responsive.js",
  "shared/dynamic-virtual-window.js?v=1",
  "shared/performance-governor.js?v=4"
].map(appUrl);

self.addEventListener("install", event => {
  // One stale optional URL must never abort the whole PWA installation after a
  // hashed production build. Navigation assets are refreshed at runtime.
  event.waitUntil(caches.open(SHELL_CACHE).then(cache =>
    Promise.allSettled(SHELL_FILES.map(url => cache.add(url)))
  ));
});

self.addEventListener("activate", event => {
  const currentCaches = new Set(Object.keys(CACHE_LIMITS));
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("vhht-shell-") && !currentCaches.has(key)).map(key => caches.delete(key)))),
    self.clients.claim(),
    ...Object.keys(CACHE_LIMITS).map(cacheName => trimCache(cacheName))
  ]));
});

const cacheForRequest = request => {
  const url = new URL(request.url);
  if (url.pathname.includes("/games/")) return GAME_CACHE;
  if (request.destination === "audio") return AUDIO_CACHE;
  if (request.destination === "image" || request.destination === "font") return IMAGE_CACHE;
  return SHELL_CACHE;
};

async function trimCache(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const policy = CACHE_LIMITS[cacheName] || CACHE_LIMITS[SHELL_CACHE];
  const now = Date.now();
  await Promise.all(keys.map(async request => {
    const response = await cache.match(request);
    const cachedAt = Number(response?.headers.get("x-vhht-cached-at") || 0);
    if (cachedAt && now - cachedAt > policy.age) await cache.delete(request);
  }));
  const remaining = await cache.keys();
  if (remaining.length > policy.entries) await Promise.all(remaining.slice(0, remaining.length - policy.entries).map(key => cache.delete(key)));
}

async function putBounded(cacheName, request, response) {
  try {
    const headers = new Headers(response.headers);
    headers.set("x-vhht-cached-at", String(Date.now()));
    const stored = new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers });
    const cache = await caches.open(cacheName);
    await cache.put(request, stored);
    await trimCache(cacheName);
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      await trimCache(cacheName).catch(() => {});
      return;
    }
    console.warn("VHHT cache write skipped", error);
  }
}

const isPrivateRemoteRequest = url =>
  url.origin !== self.location.origin ||
  /(?:googleapis|firebaseio|firestore|cloudinary|script\.google)/i.test(url.href);

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  // A cached full response cannot safely satisfy byte ranges used by iOS audio/video.
  if (request.headers.has("range")) return;
  const url = new URL(request.url);
  if (isPrivateRemoteRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(caches.match(request).then(cached => {
      const network = fetch(request);
      event.waitUntil(network.then(response => response.ok && response.type === "basic" ? putBounded(SHELL_CACHE, request, response.clone()) : undefined).catch(() => {}));
      const fresh = network.catch(() => cached || caches.match(OFFLINE_URL));
      return cached || fresh;
    }));
    return;
  }

  if (!["style", "script", "image", "font", "audio"].includes(request.destination)) return;

  // Render cached UI immediately and refresh it in the background. Versioned
  // assets plus the in-app updater activate a release without blocking launch.
  if (request.destination === "style" || request.destination === "script") {
    event.respondWith(caches.match(request).then(cached => {
      const network = fetch(request);
      event.waitUntil(network.then(response => response.ok && response.type === "basic" ? putBounded(SHELL_CACHE, request, response.clone()) : undefined).catch(() => {}));
      const fresh = network.catch(() => cached);
      return cached || fresh;
    }));
    return;
  }

  const runtimeCache = cacheForRequest(request);
  event.respondWith(caches.open(runtimeCache).then(cache => cache.match(request)).then(cached => {
    const network = fetch(request);
    event.waitUntil(network.then(response => response.ok && response.type === "basic" ? putBounded(runtimeCache, request, response.clone()) : undefined).catch(() => {}));
    const fresh = network.catch(() => cached);
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
