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
// activada (el inventario real vive en el POS) y la foto de portada.
//
// Claves (Netlify, sitio del POS): ALEGRA2_EMAIL y ALEGRA2_TOKEN — las
// mismas que ya tiene la tienda.

import { getStore } from '@netlify/blobs';
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

async function subirFoto(itemId, imagenKey) {
  if (!imagenKey) return null;
  try {
    const store = getStore('productos-imagenes');
    const r = await store.getWithMetadata(imagenKey, { type: 'arrayBuffer' });
    if (!r?.data) return 'no se encontró la foto de portada';
    const tipo = String(r.metadata?.contentType || 'image/jpeg');
    if (!/^image\/(jpe?g|png|webp)$/i.test(tipo)) return null;
    const form = new FormData();
    form.append('image', new Blob([r.data], { type: tipo }), `producto.${tipo.split('/')[1] || 'jpg'}`);
    const res = await fetch(`${API}/items/${itemId}/attachment`, { method: 'POST', headers: { Authorization: auth() }, body: form });
    if (!res.ok) return `Alegra respondió ${res.status} al subir la foto`;
    return null;
  } catch (e) {
    return e?.message || 'error subiendo la foto';
  }
}

// Crea (o enlaza, si ya existía con esa referencia) el producto del POS en
// Alegra. Devuelve { estado: 'creado'|'ya-existia'|'ya-enlazado', alegraId, fotoError }.
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
    return { estado: 'ya-existia', alegraId: String(existente.id) };
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
  const fotoError = await subirFoto(item.id, p.imagen_key);
  return { estado: 'creado', alegraId: String(item.id), fotoError };
}
