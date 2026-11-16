/* VoiceCall service worker: push notifications (calls & messages when the app is closed) + fast cached shell. */
const VERSION = 'v4.0.0';
const SHELL = `shell-${VERSION}`, MEDIA = `media-${VERSION}`;
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, MEDIA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// stale-while-revalidate for the app shell; cache-first for immutable avatars / chat photos; network for everything else
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/^\/(api|admin|ws|health|config)/.test(url.pathname)) return;
  if (/^\/(a|m)\//.test(url.pathname)) {
    e.respondWith(caches.open(MEDIA).then(async (c) => { const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }));
    return;
  }
  e.respondWith(caches.open(SHELL).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data.json(); } catch {}
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible')) return;                  // the app is open and visible — it shows its own UI
    if (d.type === 'call') {
      await self.registration.showNotification('Incoming ' + (d.video ? 'video' : 'voice') + ' call', {
        body: d.name || 'Unknown', tag: 'incoming', renotify: true, requireInteraction: true, vibrate: [500, 250, 500, 250, 500, 250, 500],
        icon: '/icon-192.png', badge: '/icon-192.png', data: d, actions: [{ action: 'answer', title: 'Answer' }, { action: 'decline', title: 'Decline' }],
      });
    } else if (d.type === 'msg') {
      await self.registration.showNotification(d.name || 'New message', { body: d.body || '', tag: d.tag || 'msg', renotify: true, vibrate: [200, 100, 200], icon: '/icon-192.png', badge: '/icon-192.png', data: d });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  const d = e.notification.data || {}; e.notification.close();
  e.waitUntil((async () => {
    if (d.type === 'call' && e.action === 'decline') { try { await fetch('/api/call/decline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: d.callId, key: d.declineKey }) }); } catch {} return; }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const answer = d.type === 'call';
    if (wins.length) { const w = wins[0]; await w.focus(); w.postMessage(answer ? { type: 'answer' } : { type: 'open-chat', num: d.from }); return; }
    await self.clients.openWindow(answer ? '/?answer=1' : '/?chat=' + encodeURIComponent(d.from || ''));
  })());
});
