import sql from './db';
import { marcarOpciones, limpiarOpcionesSueltas } from './opcionesCotizacion';

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

// Texto que va debajo del TOTAL en el PDF (se puede cambiar en cada cotización).
export const NOTA_TOTAL_POR_DEFECTO = 'Valores en pesos colombianos (COP), IVA incluido.';

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
  // Agregada después (oct 2026): texto debajo del total.
  await sql`ALTER TABLE cotizaciones_cliente ADD COLUMN IF NOT EXISTS nota_total TEXT`;
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

  const lineasBase = items.map((item) => {
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
      grupo: texto(item.grupo, 120),
    };
  });
  const lineas = limpiarOpcionesSueltas(marcarOpciones(lineasBase));

  // Las opciones B, C... no suman: el total va con la opción A de cada grupo.
  const cuentan = lineas.filter((l) => !l.alternativa);
  const subtotal = cuentan.reduce((a, l) => a + l.cantidad * l.precio_unitario, 0);
  const total = cuentan.reduce((a, l) => a + l.total, 0);
  const validez = Number(body?.validez_dias);
  return {
    cliente_nombre: texto(body?.cliente_nombre, 120),
    cliente_documento: texto(body?.cliente_documento, 40),
    cliente_telefono: texto(body?.cliente_telefono, 40),
    cliente_email: texto(body?.cliente_email, 120),
    vendedor: texto(body?.vendedor, 80),
    notas: String(body?.notas ?? '').trim().slice(0, 1200),
    // Vacío = no sale nada debajo del total.
    nota_total: body?.nota_total === undefined ? NOTA_TOTAL_POR_DEFECTO : String(body.nota_total).replace(/\s+/g, ' ').trim().slice(0, 300),
    validez_dias: Number.isInteger(validez) && validez >= 1 && validez <= 365 ? validez : 8,
    items: lineas,
    subtotal,
    descuento: subtotal - total,
    total,
  };
}

// Para el PDF (nov 2026): a cada producto del catálogo se le agrega, con los
// datos de HOY,
//   - "enlace": la página del producto en geekstore.com.co, si está
//     publicado en la tienda y hay inventario (o es un servicio);
//   - si no, "caracteristicas": un resumen de su ficha técnica (o de la
//     descripción), para que el cliente sepa qué es.
// Va en las respuestas de la API, NO se guarda en la cotización.
// La URL usa el mismo id que la tienda (alegra_id o la referencia, ver
// app/api/publico/catalogo).
const TIENDA = 'https://geekstore.com.co';

function resumenFicha(esp, descripcion) {
  const filas = Array.isArray(esp) ? esp : [];
  const texto = filas
    .filter((f) => f && f.nombre && f.valor)
    .slice(0, 6)
    .map((f) => `${String(f.nombre).trim()}: ${String(f.valor).trim()}`)
    .join(' · ');
  if (texto) return texto.slice(0, 260);
  const d = String(descripcion || '')
    .replace(/✓/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!d) return '';
  return d.length > 200 ? `${d.slice(0, 200).replace(/\s+\S*$/, '')}…` : d;
}

export async function enriquecerCotizacion(cot) {
  const items = Array.isArray(cot?.items) ? cot.items : [];
  const ids = [...new Set(items.map((i) => Number(i.producto_id)).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return cot;
  let filas = [];
  try {
    filas = await sql`
      SELECT p.id, p.referencia, p.activo, p.es_inventariable, p.especificaciones, p.descripcion,
             (to_jsonb(p) ->> 'alegra_id') AS alegra_id,
             COALESCE((to_jsonb(p) ->> 'mostrar_en_tienda')::boolean, true) AS mostrar_en_tienda,
             COALESCE((
               SELECT SUM(s.cantidad) FROM stock s JOIN bodegas b ON b.id = s.bodega_id
               WHERE s.producto_id = p.id AND b.nombre <> 'Garantías con Proveedor'
             ), 0) AS stock
      FROM productos p WHERE p.id = ANY(${ids}::int[])
    `;
  } catch {
    return cot; // si algo falla, el PDF sale igual que antes
  }
  const porId = new Map(filas.map((f) => [Number(f.id), f]));
  return {
    ...cot,
    items: items.map((it) => {
      const p = it.producto_id ? porId.get(Number(it.producto_id)) : null;
      if (!p) return it;
      const publicado = p.activo !== false && p.mostrar_en_tienda !== false;
      const disponible = p.es_inventariable === false || Number(p.stock) > 0;
      if (publicado && disponible) return { ...it, enlace: `${TIENDA}/producto/${encodeURIComponent(p.alegra_id || p.referencia)}` };
      const caracteristicas = resumenFicha(p.especificaciones, p.descripcion);
      return caracteristicas ? { ...it, caracteristicas } : it;
    }),
  };
}

