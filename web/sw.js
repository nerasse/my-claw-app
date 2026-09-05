/*
 * Service worker: the shell, and the notifications a run raises while the tab is closed.
 *
 * No conversation is cached. A session lives on the server and a stale local copy of a thread is
 * a bug factory; what is cached is the shell, so a restart of the agent does not turn a reload
 * into a dead page.
 */

const SHELL = 'claw-shell-v1';
const SHELL_FILES = ['/', '/index.js', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== SHELL).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // A deep link (/t/<thread>) is a navigation to the shell under another name: the server
  // answers it with index.html, and offline the cached shell is the right answer too.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/').then(hit => hit || Response.error())));
    return;
  }
  // Anything that is not the shell is live state: never answered from a cache.
  if (!SHELL_FILES.includes(url.pathname) && url.pathname !== '/index.html') return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // A 401 means the session died; caching it would lock the client out until the cache
        // is cleared by hand.
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(hit => hit || Response.error())),
  );
});

/*
 * FNV-1a folded into a positive 31-bit int. This is a wire contract with notificationIdFor in
 * the server (src/notifications/push.ts) and in the app (src/core/notifications.ts): the three
 * must agree or a second run on a thread stacks a notification instead of replacing it.
 */
/* eslint-disable no-bitwise -- FNV-1a is defined in bitwise terms; the server and the app
   compute the same bits, and writing it any other way would be a different hash. */
function notificationIdFor(url) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return String(hash & 0x7fffffff);
}
/* eslint-enable no-bitwise */

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { message: event.data ? event.data.text() : '' };
  }
  const link = payload.click || payload.url || '/';
  event.waitUntil(
    self.registration.showNotification(payload.title || 'MyClaw', {
      // The server publishes one payload for every endpoint, and it names the line `body`
      // (src/notifications/push.ts). Reading only ntfy's `message` showed every web
      // notification with a title and nothing under it.
      body: payload.body || payload.message || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: notificationIdFor(link),
      renotify: true,
      data: { link },
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  const target = link.startsWith('myclaw://') ? '/?deeplink=' + encodeURIComponent(link) : link;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          client.postMessage({ type: 'notification.click', link: link });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
