/*
 * GIC Folks CRM service worker (PWA): installable app, an offline page, fast repeat loads of the
 * built assets, and phone / browser notifications (Web Push). API calls are never cached.
 */
const VERSION = 'gic-crm-v1';
const SHELL = ['/offline.html', '/images/pwa-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/broadcasting')) {
        return;
    }
    // Pages: always the network (fresh login state); the offline page when there is none.
    if (req.mode === 'navigate') {
        event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
        return;
    }
    // Built assets have content hashes: cache them forever.
    if (url.pathname.startsWith('/build/assets/')) {
        event.respondWith(
            caches.match(req).then(
                (hit) =>
                    hit ||
                    fetch(req).then((res) => {
                        if (res.ok) {
                            const copy = res.clone();
                            caches.open(VERSION).then((c) => c.put(req, copy));
                        }
                        return res;
                    }),
            ),
        );
    }
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: 'GIC Folks CRM', body: event.data ? event.data.text() : '' };
    }
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            // The open, focused app already shows it live.
            if (windows.some((w) => w.focused && w.visibilityState === 'visible')) {
                return undefined;
            }
            return self.registration.showNotification(data.title || 'GIC Folks CRM', {
                body: data.body || '',
                icon: '/images/pwa-192.png',
                badge: '/images/pwa-192.png',
                tag: data.tag || undefined,
                renotify: Boolean(data.tag),
                data: { url: data.url || '/' },
            });
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
            if (open) {
                return open.focus().then(() => open.navigate(target));
            }
            return self.clients.openWindow(target);
        }),
    );
});
