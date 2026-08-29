const CACHE_NAME = 'my-fit-mini-v31';
const APP_VERSION = '31';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css?v=31',
  './data.js?v=31',
  './images.js?v=31',
  './rest-audio.js?v=31',
  './app.js?v=31',
  './styles.css',
  './data.js',
  './images.js',
  './rest-audio.js',
  './app.js',
  './sw.js',
  './assets/audio/count-1.mp3',
  './assets/audio/count-2.mp3',
  './assets/audio/count-3.mp3',
  './assets/audio/count-4.mp3',
  './assets/audio/count-5.mp3',
  './assets/logo-header.png',
  './assets/logo-mau-6.png',
  './assets/leg-curl-machine.jpg',
  './assets/welcome-background.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/exercises/banded-abduction.jpg',
  './assets/exercises/bulgarian-split-squat.jpg',
  './assets/exercises/cable-kickback.jpg',
  './assets/exercises/dumbbell-shoulder-press.jpg',
  './assets/exercises/frog-pump.jpg',
  './assets/exercises/glute-bridge-band-abduction.jpg',
  './assets/exercises/hip-thrust.jpg',
  './assets/exercises/lat-pulldown.jpg',
  './assets/exercises/lateral-raise.jpg',
  './assets/exercises/seated-cable-row.jpg',
  './assets/exercises/seated-leg-curl.jpg',
  './assets/exercises/side-lying-hip-abduction.jpg',
  './assets/exercises/single-leg-glute-bridge.jpg',
  './assets/exercises/step-up.jpg',
  './assets/exercises/sumo-squat.jpg',
  './assets/exercises/face-pull.jpg',
  './assets/exercises/calf-raise.jpg',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isHtmlRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (isHtmlRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const networked = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networked;
    })
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'GET_VERSION') {
    event.ports && event.ports[0] && event.ports[0].postMessage({ version: APP_VERSION });
  }
});
