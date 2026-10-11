// Service worker: nhận thông báo đẩy (Web Push) và mở app khi bấm vào thông báo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data && event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Mummii Checklist', {
      body: d.body || '',
      icon: 'assets/logo-mark.png',
      badge: 'assets/favicon.png',
      tag: d.tag,
      data: { url: d.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(self.registration.scope)) return c.focus().then((w) => w && w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
