// CORS de la API de sedes (/api/publico/sedes/...), nov 2026.
//
// Archivo aparte (sin crypto ni base de datos) porque también lo usa
// middleware.js, que corre en el Edge de Netlify: así el middleware pone
// estos encabezados en TODAS las respuestas de esa API, incluso cuando la
// función falla o Netlify corta por tiempo (502/503/504). Sin ellos el
// navegador del POS de Venecia esconde la respuesta y solo dice "sin
// conexión".
//
// Orígenes permitidos: variable VENECIA_ORIGEN (varias separadas por coma).

export const SEDES_API = ['venecia'];

export function origenesPermitidos() {
  return SEDES_API.flatMap((s) => String(process.env[`${s.toUpperCase()}_ORIGEN`] || '').split(','))
    .map((x) => x.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function cabecerasCors(request) {
  const origen = request.headers.get('origin') || '';
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-sede-clave',
    // Para que el POS de la sede pueda leer en qué paso falló.
    'Access-Control-Expose-Headers': 'x-sede-paso',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origen && origenesPermitidos().includes(origen)) h['Access-Control-Allow-Origin'] = origen;
  return h;
}
