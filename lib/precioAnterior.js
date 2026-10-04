// "Precio antes" (oferta) de un producto — ver migracion_precio_anterior.sql.
//
// Solo cuenta como oferta si es MAYOR que el precio de venta; si no, se
// guarda vacío (null). Se guarda con una consulta aparte y a prueba de
// fallos: si la columna todavía no existe (no se ha corrido la migración),
// el producto se guarda igual y solo se avisa que falta la migración.

import sql from './db';

export function normalizarPrecioAnterior(precioAnterior, precioVenta) {
  const antes = Number(precioAnterior);
  const venta = Number(precioVenta);
  if (!Number.isFinite(antes) || antes <= 0) return null;
  if (Number.isFinite(venta) && venta > 0 && antes <= venta) return null;
  return antes;
}

export async function guardarPrecioAnterior(productoId, precioAnterior, precioVenta) {
  const valor = normalizarPrecioAnterior(precioAnterior, precioVenta);
  try {
    await sql`UPDATE productos SET precio_anterior = ${valor} WHERE id = ${productoId}`;
    return { ok: true, valor };
  } catch (error) {
    if (/precio_anterior/.test(String(error?.message))) {
      return { ok: false, aviso: 'El producto se guardó, pero falta correr migracion_precio_anterior.sql en Neon para guardar el "precio antes".' };
    }
    throw error;
  }
}
