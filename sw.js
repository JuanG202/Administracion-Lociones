// ===== SERVICE WORKER - Perfumes Granja PWA =====
const CACHE_NAME = 'perfumes-granja-v2';
const API_BASE = 'https://administracion-lociones-back.vercel.app/api';

// Archivos del app shell que se cachean al instalar
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/assests/administrador.png',
  '/assests/icon-192.png',
  '/assests/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// ---- INSTALL: precachear el app shell ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_ASSETS).catch(err => {
        console.warn('[SW] Algunos recursos no se pudieron cachear:', err);
      });
    })
  );
  self.skipWaiting();
});

// ---- ACTIVATE: limpiar caches viejos ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ---- FETCH: estrategia según tipo de recurso ----
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1) Peticiones a la API → Network First (con fallback a cache si hay)
  if (event.request.url.startsWith(API_BASE)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 2) Google Fonts y CDN → Stale-While-Revalidate
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // 3) App shell (HTML, CSS, imágenes locales) → Cache First
  if (event.request.method === 'GET') {
    event.respondWith(cacheFirst(event.request));
  }
});

// ===== ESTRATEGIAS DE CACHE =====

// Cache First: sirve del cache, si no hay va a la red y lo guarda
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Si falla y es una navegación, devuelve el index.html cacheado
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Sin conexión', { status: 503 });
  }
}

// Network First: intenta red, si falla usa cache
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Sin conexión', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Stale While Revalidate: sirve cache inmediatamente, actualiza en background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise;
}
