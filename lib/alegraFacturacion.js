// lib/alegraFacturacion.js
// Crea en ALEGRA (la cuenta con la facturación electrónica DIAN, antes
// "cuenta 2") los productos que se crean en el POS (octubre 2026).
//
// Por qué: los pedidos de la tienda online se facturan en esa cuenta de
// Alegra buscando cada artículo por su REFERENCIA. Si un producto existe en
// el POS pero no en Alegra, ese pedido no se puede facturar. Por eso todo
// producto nuevo del POS se crea también allá, con la MISMA referencia.
//
// Igual que "Nuevo artículo" del admin de la tienda: categoría "Geek",
// unidad, precio (con o sin IVA 19%), stock 0 con "venta en negativo"
// activada (el inventario real vive en el POS). SIN foto (oct 2026: Nelson
// no quiere fotos en los ítems de Alegra).
//
// Claves (Netlify, sitio del POS): ALEGRA2_EMAIL y ALEGRA2_TOKEN — las
// mismas que ya tiene la tienda.

import sql from './db';

const API = 'https://api.alegra.com/api/v1';

function auth() {
  const email = process.env.ALEGRA2_EMAIL;
  const token = process.env.ALEGRA2_TOKEN;
  if (!email || !token) {
    const e = new Error('Falta configurar ALEGRA2_EMAIL y ALEGRA2_TOKEN en Netlify (sitio del POS). Copia las mismas que tiene la tienda.');
    e.sinClaves = true;
    throw e;
  }
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

async function pedir(ruta, opciones = {}) {
  const res = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: { Authorization: auth(), Accept: 'application/json', ...(opciones.headers || {}) },
    signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Alegra respondió ${res.status}: ${detalle.slice(0, 200)}`);
  }
  return res.json();
}

// Columna donde se guarda el id del artículo en Alegra (facturación). Se
// crea sola la primera vez (no hay que correr nada en Neon). OJO: NO es
// "alegra_id" — esa columna es el id de la cuenta vieja y la tienda la usa
// para las URLs de los productos migrados; no se toca.
let columnaLista = false;
export async function asegurarColumna() {
  if (columnaLista) return;
  await sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS alegra2_id TEXT`;
  columnaLista = true;
}

// Datos que casi nunca cambian: se guardan unos minutos en memoria.
let cache = null;
async function datosCuenta() {
  if (cache && Date.now() - cache.en < 10 * 60 * 1000) return cache;
  const [categorias, bodegas, impuestos] = await Promise.all([pedir('/item-categories'), pedir('/warehouses'), pedir('/taxes')]);
  const categoriaGeek = (categorias || []).find((c) => String(c.name || '').trim().toLowerCase() === 'geek');
  if (!categoriaGeek) throw new Error('No se encontró la categoría "Geek" en Alegra.');
  // Solo "Principal" y "Bodega Distribuidor"; si no existen, todas.
  const relevantes = (bodegas || []).filter((b) => {
    const n = String(b.name || '').trim().toLowerCase();
    return n === 'principal' || n.includes('distribuidor');
  });
  const iva = (impuestos || []).find((t) => Number(t.percentage) === 19) || (impuestos || []).find((t) => /iva/i.test(t.name || ''));
  cache = {
    en: Date.now(),
    categoriaId: String(categoriaGeek.id),
    bodegas: (relevantes.length ? relevantes : bodegas || []).map((b) => String(b.id)),
    ivaId: iva ? String(iva.id) : null,
  };
  return cache;
}

// Busca un artículo de Alegra con esa referencia EXACTA (para no duplicar).
export async function buscarPorReferencia(referencia) {
  const ref = String(referencia || '').trim();
  if (!ref) return null;
  const lista = await pedir(`/items?reference=${encodeURIComponent(ref)}`);
  return (Array.isArray(lista) ? lista : []).find((it) => String(it.reference || '').trim() === ref) || null;
}


// ── Venta en negativo (oct 2026) ─────────────────────────────────────────
// Alegra a veces deja el ítem con "Venta en negativo" APAGADA aunque se cree
// con inventory.negativeSale = true. Por eso, después de crearlo (y para
// arreglar los que ya existen) se edita el ítem (PUT /items/{id}) para
// prenderla, y se vuelve a leer para confirmar.
//
// Se manda el ítem completo armado con lo que Alegra ya tiene guardado
// (nombre, referencia, descripción, precios, impuestos, categoría),
// cambiando solo la venta en negativo.

function valorNegativo(item) {
  const inv = item?.inventory || {};
  if (typeof inv.negativeSale === 'boolean') return inv.negativeSale;
  if (typeof item?.negativeSale === 'boolean') return item.negativeSale;
  return null; // Alegra no lo devolvió: no se puede confirmar
}

function cuerpoCompleto(item) {
  const inv = item.inventory || {};
  return {
    name: item.name,
    ...(item.reference ? { reference: typeof item.reference === 'object' ? item.reference.reference : item.reference } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(item.itemCategory?.id ? { itemCategory: { id: String(item.itemCategory.id) } } : {}),
    ...(Array.isArray(item.price) && item.price.length
      ? { price: item.price.map((pr) => ({ ...(pr.idPriceList ? { idPriceList: String(pr.idPriceList) } : {}), price: Number(pr.price) || 0 })) }
      : {}),
    ...(Array.isArray(item.tax) && item.tax.length ? { tax: item.tax.map((t) => ({ id: String(t.id) })) } : {}),
    inventory: { unit: inv.unit || 'unit', unitCost: Number(inv.unitCost) || 0, negativeSale: true },
  };
}

export async function activarVentaNegativa(itemId) {
  const antes = await pedir(`/items/${itemId}`);
  if (antes?.type && antes.type !== 'product') return { estado: 'no-aplica', motivo: 'es un servicio (no maneja inventario)' };
  if (!antes?.inventory) return { estado: 'no-aplica', motivo: 'no maneja inventario en Alegra' };
  if (valorNegativo(antes) === true) return { estado: 'ya-estaba' };

  // Se manda el ítem completo (lo mismo que Alegra ya tiene guardado) con la
  // venta en negativo prendida: así no se borra nada aunque Alegra reemplace
  // el ítem entero al editarlo.
  await pedir(`/items/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpoCompleto(antes)),
  });
  const despues = await pedir(`/items/${itemId}`);
  const v = valorNegativo(despues);
  if (v === true) return { estado: 'activada' };
  if (v === null) return { estado: 'sin-confirmar', motivo: 'Alegra aceptó el cambio pero no devuelve ese dato; revísalo en Alegra' };
  return { estado: 'no-se-pudo', motivo: 'Alegra la sigue mostrando apagada' };
}

// Productos del POS enlazados con Alegra (para arreglar la venta en negativo).
export async function productosEnlazados() {
  await asegurarColumna();
  return sql`
    SELECT id, referencia, nombre, imagen_key, alegra2_id
    FROM productos
    WHERE alegra2_id IS NOT NULL AND es_inventariable IS DISTINCT FROM false
    ORDER BY id DESC
  `;
}

// Crea (o enlaza, si ya existía con esa referencia) el producto del POS en
// Alegra. Devuelve { estado: 'creado'|'ya-existia'|'ya-enlazado', alegraId }.
export async function sincronizarProducto(productoId, { conIva }) {
  await asegurarColumna();
  const [p] = await sql`
    SELECT id, referencia, nombre, precio_venta, imagen_key, es_inventariable, alegra2_id
    FROM productos WHERE id = ${productoId}
  `;
  if (!p) throw new Error('Producto no encontrado');
  if (p.alegra2_id) return { estado: 'ya-enlazado', alegraId: p.alegra2_id };

  const existente = await buscarPorReferencia(p.referencia);
  if (existente) {
    await sql`UPDATE productos SET alegra2_id = ${String(existente.id)} WHERE id = ${p.id}`;
    const negativo = p.es_inventariable === false ? null : await activarVentaNegativa(existente.id).catch((e) => ({ estado: 'error', motivo: e.message }));
    return { estado: 'ya-existia', alegraId: String(existente.id), negativo };
  }

  if (conIva !== true && conIva !== false) throw new Error('Falta indicar si el precio lleva IVA o no');
  const precioFinal = Number(p.precio_venta) || 0;
  if (precioFinal <= 0) throw new Error('El producto no tiene precio de venta');

  const cuenta = await datosCuenta();
  if (conIva && !cuenta.ivaId) throw new Error('No se encontró el impuesto IVA (19%) en Alegra.');
  // Igual que el admin de la tienda: precio sin IVA = final / 1.19 (Alegra le suma el IVA).
  const precioBase = conIva ? precioFinal / 1.19 : precioFinal;

  const cuerpo = {
    name: String(p.nombre).trim().slice(0, 150),
    reference: String(p.referencia).trim().slice(0, 45),
    itemCategory: { id: cuenta.categoriaId },
    price: [{ price: precioBase }],
    ...(conIva ? { tax: [{ id: cuenta.ivaId }] } : {}),
    ...(p.es_inventariable === false
      ? { type: 'service' }
      : {
          type: 'product',
          inventory: {
            unit: 'unit',
            unitCost: 0,
            // Sin stock en Alegra (vive en el POS): sin esto no dejaría facturar.
            negativeSale: true,
            warehouses: cuenta.bodegas.map((id) => ({ id, initialQuantity: 0 })),
          },
        }),
  };

  const item = await pedir('/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  await sql`UPDATE productos SET alegra2_id = ${String(item.id)} WHERE id = ${p.id}`;
  // Asegura la "Venta en negativo" (ver activarVentaNegativa arriba).
  const negativo = p.es_inventariable === false ? null : await activarVentaNegativa(item.id).catch((e) => ({ estado: 'error', motivo: e.message }));
  return { estado: 'creado', alegraId: String(item.id), negativo };
}
