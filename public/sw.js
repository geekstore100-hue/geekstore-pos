// Service worker: permite que el sistema siga cargando aunque no haya
// internet (por ejemplo si el PC se apaga y se prende de nuevo sin
// conexión). Estrategia "red primero, caché de respaldo": mientras haya
// internet, SIEMPRE se usa la versión más nueva del servidor (y de paso se
// va guardando en caché); si la petición falla por falta de conexión, se
// usa la última copia guardada. Así nunca se queda pegado mostrando una
// versión vieja cuando sí hay internet.
//
// Esto es aparte de la fila de ventas pendientes (ver /lib/offlineDB.js):
// este archivo solo se encarga de que la PÁGINA cargue sin internet; guardar
// y sincronizar las ventas lo hace el código de /ventas directamente.

const CACHE_NAME = 'geekstore-pos-cache-v1';

// No conviene guardar en caché nada relacionado con iniciar/cerrar sesión.
const RUTAS_EXCLUIDAS = ['/api/login', '/api/logout'];

self.addEventListener('install', (event) => {
  // Activa el service worker nuevo de inmediato, sin esperar a que se
  // cierren todas las pestañas viejas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo nos interesan las lecturas (GET) del propio sitio. Los POST/PUT
  // (registrar una venta, guardar un producto, etc.) nunca se cachean —
  // eso ya lo maneja cada pantalla por su cuenta.
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;
  if (RUTAS_EXCLUIDAS.some((ruta) => request.url.includes(ruta))) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const respuestaRed = await fetch(request);
        if (respuestaRed && respuestaRed.ok) {
          cache.put(request, respuestaRed.clone());
        }
        return respuestaRed;
      } catch (error) {
        const respuestaCache = await cache.match(request);
        if (respuestaCache) return respuestaCache;
        throw error;
      }
    })()
  );
});
