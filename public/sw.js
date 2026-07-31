// This service worker makes ROVAH installable on Android.
// It deliberately keeps no content cache: every visit asks the network for the
// current ROVAH site so a phone cannot get stuck on an older app version.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response('ROVAH needs an internet connection to load the latest version.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  );
});
