import sql from './db';

// Cotizaciones para clientes (octubre 2026): se eligen productos del POS,
// se ajustan cantidades, precios y descuentos, y se descarga un PDF con el
// diseño "Poder" de la tienda (ver lib/cotizacionPdf.js).
//
// No mueven inventario ni crean ventas: son solo documentos.
//
// Todo va en UNA tabla (cotizaciones_cliente); los productos de cada
// cotización se guardan en la columna "items" (JSON). La tabla se crea sola
// la primera vez que se usa: no hay que correr nada en Neon.

export const MAX_ITEMS = 120;

export class ErrorCotizacionCliente extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

let tablaLista = false;
export async function asegurarTabla() {
  if (tablaLista) return;
  await sql`
    CREATE TABLE IF NOT EXISTS cotizaciones_cliente (
      id SERIAL PRIMARY KEY,
      cliente_nombre TEXT NOT NULL DEFAULT '',
      cliente_documento TEXT NOT NULL DEFAULT '',
      cliente_telefono TEXT NOT NULL DEFAULT '',
      cliente_email TEXT NOT NULL DEFAULT '',
      vendedor TEXT NOT NULL DEFAULT '',
      notas TEXT NOT NULL DEFAULT '',
      validez_dias INT NOT NULL DEFAULT 8,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      subtotal NUMERIC NOT NULL DEFAULT 0,
      descuento NUMERIC NOT NULL DEFAULT 0,
      total NUMERIC NOT NULL DEFAULT 0,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      editada_en TIMESTAMPTZ
    )
  `;
  tablaLista = true;
}

function texto(v, max) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function redondear(n) {
  return Math.round(Number(n) || 0);
}

// Revisa lo que manda el navegador. La referencia y la foto de los productos
// del catálogo salen de la base de datos; el nombre se puede ajustar (por si
// se quiere aclarar algo en la cotización). También se aceptan líneas
// "libres" (sin producto del catálogo), p. ej. un servicio o un envío.
export async function prepararCotizacion(body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) throw new ErrorCotizacionCliente('Agrega al menos un producto');
  if (items.length > MAX_ITEMS) throw new ErrorCotizacionCliente(`Máximo ${MAX_ITEMS} productos por cotización`);

  const ids = [...new Set(items.map((i) => Number(i.producto_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const filas = ids.length
    ? await sql`SELECT id, referencia, nombre, imagen_key FROM productos WHERE id = ANY(${ids}::int[])`
    : [];
  const porId = new Map(filas.map((f) => [Number(f.id), f]));

  const lineas = items.map((item) => {
    const prod = item.producto_id ? porId.get(Number(item.producto_id)) : null;
    if (item.producto_id && !prod) throw new ErrorCotizacionCliente('Uno de los productos ya no existe en el POS');
    const nombre = texto(item.nombre || prod?.nombre, 200);
    if (!nombre) throw new ErrorCotizacionCliente('Hay una línea sin nombre');
    const cantidad = Number(item.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99999) throw new ErrorCotizacionCliente(`Cantidad inválida en "${nombre}"`);
    const precio = redondear(item.precio_unitario);
    if (!(precio >= 0)) throw new ErrorCotizacionCliente(`Precio inválido en "${nombre}"`);
    const descuentoPct = Math.min(100, Math.max(0, Number(item.descuento_pct) || 0));
    const bruto = cantidad * precio;
    const total = redondear(bruto * (1 - descuentoPct / 100));
    return {
      producto_id: prod ? Number(prod.id) : null,
      referencia: prod ? prod.referencia : texto(item.referencia, 45),
      nombre,
      imagen_key: prod ? prod.imagen_key || null : null,
      cantidad,
      precio_unitario: precio,
      descuento_pct: descuentoPct,
      total,
    };
  });

  const subtotal = lineas.reduce((a, l) => a + l.cantidad * l.precio_unitario, 0);
  const total = lineas.reduce((a, l) => a + l.total, 0);
  const validez = Number(body?.validez_dias);
  return {
    cliente_nombre: texto(body?.cliente_nombre, 120),
    cliente_documento: texto(body?.cliente_documento, 40),
    cliente_telefono: texto(body?.cliente_telefono, 40),
    cliente_email: texto(body?.cliente_email, 120),
    vendedor: texto(body?.vendedor, 80),
    notas: String(body?.notas ?? '').trim().slice(0, 1200),
    validez_dias: Number.isInteger(validez) && validez >= 1 && validez <= 365 ? validez : 8,
    items: lineas,
    subtotal,
    descuento: subtotal - total,
    total,
  };
}
