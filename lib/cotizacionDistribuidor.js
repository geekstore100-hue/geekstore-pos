import sql from './db';

// Cotizaciones de distribuidor (pedidos del portal de mayoristas): lo que
// comparten la edición y el paso a factura.

export const MAX_LINEAS = 200;

export class ErrorCotizacion extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

export function faltaMigracion(error) {
  return /column .*(venta_id|editada_en|total_original).* does not exist/i.test(String(error?.message || ''));
}

export const MENSAJE_MIGRACION = 'Falta correr migracion_cotizaciones_facturar.sql en Neon (una sola vez).';

// Revisa y completa las líneas que manda el navegador: el producto tiene que
// existir; el nombre y la referencia salen de la base de datos (no del
// navegador); cantidad entera ≥ 1; precio ≥ 0. Si el mismo producto viene
// dos veces con el mismo precio, se suman. Opcional: stock de una bodega.
export async function prepararLineas(items, { bodegaId = null } = {}) {
  if (!Array.isArray(items) || items.length === 0) throw new ErrorCotizacion('Agrega al menos un producto');
  if (items.length > MAX_LINEAS) throw new ErrorCotizacion(`Máximo ${MAX_LINEAS} productos por cotización`);
  const ids = [...new Set(items.map((i) => Number(i.producto_id)).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) throw new ErrorCotizacion('Hay productos sin identificar');
  const filas = bodegaId
    ? await sql`
        SELECT p.id, p.referencia, p.nombre, p.es_inventariable, COALESCE(s.cantidad, 0) AS disponible
        FROM productos p
        LEFT JOIN stock s ON s.producto_id = p.id AND s.bodega_id = ${bodegaId}
        WHERE p.id = ANY(${ids}::int[])
      `
    : await sql`SELECT p.id, p.referencia, p.nombre, p.es_inventariable FROM productos p WHERE p.id = ANY(${ids}::int[])`;
  const porId = new Map(filas.map((f) => [Number(f.id), f]));

  const lineas = [];
  for (const item of items) {
    const prod = porId.get(Number(item.producto_id));
    if (!prod) throw new ErrorCotizacion('Uno de los productos ya no existe');
    const cantidad = Number(item.cantidad);
    const precio = Math.round(Number(item.precio_unitario) * 100) / 100;
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99999) {
      throw new ErrorCotizacion(`Cantidad inválida para ${prod.nombre}`);
    }
    if (!Number.isFinite(precio) || precio < 0) throw new ErrorCotizacion(`Precio inválido para ${prod.nombre}`);
    const igual = lineas.find((l) => l.producto_id === Number(prod.id) && l.precio_unitario === precio);
    if (igual) {
      igual.cantidad += cantidad;
      igual.subtotal = igual.cantidad * precio;
      continue;
    }
    lineas.push({
      producto_id: Number(prod.id),
      referencia: prod.referencia,
      nombre: prod.nombre,
      cantidad,
      precio_unitario: precio,
      subtotal: cantidad * precio,
      inventariable: prod.es_inventariable !== false,
      disponible: prod.disponible === undefined ? null : Number(prod.disponible),
    });
  }
  const total = lineas.reduce((acc, l) => acc + l.subtotal, 0);
  return { lineas, total };
}

// Pasos (para sql.transaction) que reemplazan las líneas de la cotización.
export function consultasReemplazarLineas(cotizacionId, lineas) {
  return [
    sql`DELETE FROM cotizacion_distribuidor_items WHERE cotizacion_id = ${cotizacionId}`,
    ...lineas.map(
      (l) => sql`
        INSERT INTO cotizacion_distribuidor_items (cotizacion_id, producto_id, referencia, nombre, cantidad, precio_unitario, subtotal)
        VALUES (${cotizacionId}, ${l.producto_id}, ${l.referencia}, ${l.nombre}, ${l.cantidad}, ${l.precio_unitario}, ${l.subtotal})
      `
    ),
  ];
}

// Paso que solo pasa si la cotización sigue PENDIENTE (si alguien ya la
// facturó en otra pestaña, falla con un error reconocible y no se guarda nada).
export function esCotizacionYaFacturada(error) {
  return /cotizacion_no_pendiente/.test(String(error?.message || ''));
}
