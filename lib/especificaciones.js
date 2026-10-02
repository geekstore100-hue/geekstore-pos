// Ficha técnica de un producto ("Especificaciones"): lista de filas
// { nombre, valor } — ej. { nombre: 'Potencia', valor: '20 W' }. Se guarda
// en la columna productos.especificaciones (JSONB) — ver
// migracion_especificaciones.sql — y la tienda la muestra como tabla en la
// página de cada producto.
//
// Esta función limpia lo que llegue (del formulario o de la IA): quita
// filas vacías o repetidas, recorta textos demasiado largos y pone un tope
// de filas. Devuelve null si no queda ninguna fila (así la columna queda
// vacía en vez de guardar una lista vacía).

export const MAX_FILAS_ESPECIFICACIONES = 30;

export function normalizarEspecificaciones(entrada) {
  if (!Array.isArray(entrada)) return null;
  const vistos = new Set();
  const filas = [];
  for (const fila of entrada) {
    if (!fila || typeof fila !== 'object') continue;
    const nombre = String(fila.nombre ?? fila.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const valor = String(fila.valor ?? fila.value ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!nombre || !valor) continue;
    const clave = nombre.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    filas.push({ nombre, valor });
    if (filas.length >= MAX_FILAS_ESPECIFICACIONES) break;
  }
  return filas.length ? filas : null;
}
