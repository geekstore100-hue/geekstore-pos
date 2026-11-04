import crypto from 'crypto';
import { NextResponse } from 'next/server';
import sql from './db';
import { altoDeFicha, esCategoriaColeccionable } from './figuras';
import { cabecerasCors } from './corsSedes';

export { cabecerasCors };

// SEDES EXTERNAS (nov 2026) — fase 0: Geek Store Venecia.
//
// Venecia es otro negocio (otro NIT, no responsable de IVA) con su propio
// POS en Firebase. Sus coleccionables se publican en geekstore.com.co así:
//   - Su POS llama a la API de este POS (/api/publico/sedes/...) con su
//     clave: "publicar" crea la ficha web del producto aquí (referencia
//     V-<código de Venecia>) y devuelve un enlace al EDITOR de productos de
//     este POS, en modo limitado (ver lib/sesionSede.js y middleware.js).
//   - Cada vez que cambia el stock o el precio de un producto publicado, su
//     POS lo avisa (/api/publico/sedes/stock).
//   - La ficha (fotos, descripción con IA, ficha técnica con el ALTO
//     obligatorio...) se hace aquí, con las claves de IA de Venecia.
//   - En la fase 0 la página muestra sus productos con un botón de
//     WhatsApp de Venecia (todavía no se pagan en línea).
//
// Los productos de una sede viven en la tabla productos con sede =
// 'venecia'. NO tienen filas en la tabla stock (su stock es sede_stock) y
// se excluyen de todas las pantallas y reportes de Kennedy.
//
// Variables en Netlify (sitio del POS):
//   VENECIA_API_KEY      clave que usa el POS de Venecia (larga y aleatoria)
//   VENECIA_ORIGEN       dirección del POS de Venecia (ej. https://xxx.web.app),
//                        varias separadas por coma
//   VENECIA_WHATSAPP     celular de Venecia para la página (ej. 3001234567)
//   VENECIA_MISTRAL_API_KEY, VENECIA_GEMINI_API_KEY, VENECIA_GROQ_API_KEY,
//   VENECIA_OPENROUTER_API_KEY   las IAs de Venecia (las que tengan)

export const DATOS_SEDES = {
  venecia: { nombre: 'Geek Store Venecia', corto: 'Venecia', prefijo: 'V-' },
};

export const DESCRIPCION_MINIMA_WEB = 400;

const env = (sede, nombre) => process.env[`${sede.toUpperCase()}_${nombre}`] || '';

// Lado SQL para filtrar productos: solo Kennedy (o solo una sede). Se lee
// con to_jsonb para no fallar si todavía no existe la columna.
export const SEDE_DE = (alias = 'p') => `COALESCE(to_jsonb(${alias}) ->> 'sede', 'kennedy')`;

// Columnas de sede en productos. Antes se corría el ALTER TABLE en cada
// arranque de la función; un ALTER TABLE necesita bloquear la tabla
// productos completa y, si en ese momento la tabla estaba ocupada, la
// petición se quedaba esperando hasta que Netlify la cortaba (el POS de
// Venecia recibía un 503 sin explicación). Ahora primero se revisa (lectura
// rápida, sin bloquear) y solo se crea lo que falte, con un límite de espera.
const COLUMNAS_SEDE = ['sede', 'sede_codigo', 'sede_stock', 'sede_sincronizado_en'];
let preparando = null;
export function asegurarSedes() {
  if (!preparando) {
    preparando = crearColumnasSede().catch((e) => {
      preparando = null; // que el siguiente intento lo vuelva a probar
      throw e;
    });
  }
  return preparando;
}

async function crearColumnasSede() {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'productos' AND column_name = ANY(${COLUMNAS_SEDE})
  `;
  const idx = await sql`SELECT 1 AS si FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'productos_sede_codigo_idx'`;
  if (cols.length === COLUMNAS_SEDE.length && idx.length) return;
  console.log('[sedes] creando columnas de sede en productos');
  await sql.transaction([
    sql`SET LOCAL lock_timeout = '4s'`,
    sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS sede TEXT NOT NULL DEFAULT 'kennedy'`,
    sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS sede_codigo TEXT`,
    sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS sede_stock NUMERIC NOT NULL DEFAULT 0`,
    sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS sede_sincronizado_en TIMESTAMPTZ`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS productos_sede_codigo_idx ON productos (sede, sede_codigo) WHERE sede <> 'kennedy'`,
  ]);
}

// Respuesta común de la API de sedes (publicar, stock, productos, estado):
//   - revisa la clave (401 si no sirve),
//   - prepara las columnas,
//   - corta a los LIMITE_SEDE_MS con un error claro (antes de que Netlify
//     corte con un 502/503 mudo),
//   - todas las respuestas llevan CORS, Cache-Control: no-store y el
//     encabezado x-sede-paso (en qué paso iba),
//   - deja registro en los "Function logs" de Netlify: busca "[sedes]".
// fn({ sede, paso, responder }) devuelve la respuesta (usa responder).
export const LIMITE_SEDE_MS = 8000;

function mensajeDeError(error, paso) {
  const m = String(error?.message || error || '');
  if (/lock timeout|lock_timeout|canceling statement due to lock/i.test(m)) {
    return 'La base de datos de Kennedy está ocupada en este momento. Intenta de nuevo en un minuto.';
  }
  if (/duplicate key/i.test(m)) return 'Ya existe un producto con esa referencia';
  if (/fetch failed|Error connecting to database|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket/i.test(m)) {
    return `Kennedy no pudo conectarse a su base de datos (${paso}). Intenta de nuevo en un momento.`;
  }
  return `Error en Kennedy (${paso}): ${m.slice(0, 200)}`;
}

export async function atenderSede(request, ruta, fn) {
  const cors = cabecerasCors(request);
  const inicio = Date.now();
  let paso = 'revisando la clave';
  const responder = (status, cuerpo) =>
    NextResponse.json(cuerpo, { status, headers: { ...cors, 'Cache-Control': 'no-store', 'x-sede-paso': encodeURIComponent(paso) } });

  const sede = sedeDeClave(request);
  if (!sede) return responder(401, { ok: false, codigo: 'clave', error: 'Clave inválida' });

  let reloj;
  const limite = new Promise((resolve) => {
    reloj = setTimeout(() => resolve('__limite__'), LIMITE_SEDE_MS);
  });
  const trabajo = (async () => {
    paso = 'preparando la base de datos';
    await asegurarSedes();
    paso = 'consultando';
    return fn({ sede, paso: (p) => { paso = p; }, responder });
  })();
  try {
    const r = await Promise.race([trabajo, limite]);
    if (r === '__limite__') {
      trabajo.catch((e) => console.error(`[sedes] ${ruta} ${sede}: falló después del límite (${paso})`, e));
      console.error(`[sedes] ${ruta} ${sede}: sin respuesta en ${LIMITE_SEDE_MS} ms (paso: ${paso})`);
      return responder(504, {
        ok: false,
        codigo: 'lento',
        paso,
        error: `Kennedy tardó demasiado en responder (${paso}). Intenta de nuevo en un momento.`,
      });
    }
    return r;
  } catch (error) {
    console.error(`[sedes] ${ruta} ${sede}: error (${paso})`, error);
    return responder(500, { ok: false, codigo: 'error', paso, error: mensajeDeError(error, paso) });
  } finally {
    clearTimeout(reloj);
    console.log(`[sedes] ${ruta} ${sede} ${Date.now() - inicio} ms`);
  }
}

// Lee el JSON del cuerpo; null si no viene o está mal formado.
export async function cuerpoJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Sede de la clave que llega en x-sede-clave (o null).
export function sedeDeClave(request) {
  const recibida = String(request.headers.get('x-sede-clave') || '');
  if (!recibida) return null;
  for (const sede of Object.keys(DATOS_SEDES)) {
    const esperada = env(sede, 'API_KEY');
    if (!esperada || esperada.length < 16) continue;
    const a = crypto.createHash('sha256').update(recibida).digest();
    const b = crypto.createHash('sha256').update(esperada).digest();
    if (crypto.timingSafeEqual(a, b)) return sede;
  }
  return null;
}

export function whatsappSede(sede) {
  let d = env(sede, 'WHATSAPP').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) d = `57${d}`;
  return d;
}

// Claves de IA de la sede (para "Analizar con IA" en el editor). Solo las de
// la sede: nunca se usan las de Kennedy para sus productos.
export function clavesIADeSede(sede) {
  return {
    mistral: env(sede, 'MISTRAL_API_KEY'),
    gemini: env(sede, 'GEMINI_API_KEY'),
    groq: env(sede, 'GROQ_API_KEY'),
    openrouter: env(sede, 'OPENROUTER_API_KEY'),
  };
}

export function limpiarCodigo(c) {
  return String(c ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 40);
}

// Categoría "Coleccionables" (la crea si no existe).
export async function categoriaColeccionables() {
  const cats = await sql`SELECT id, nombre FROM categorias`;
  const c = cats.find((x) => esCategoriaColeccionable(x.nombre));
  if (c) return c;
  const [nueva] = await sql`INSERT INTO categorias (nombre) VALUES ('Coleccionables') RETURNING id, nombre`;
  return nueva;
}

// Qué le falta a la ficha web de un producto de sede para salir en la página.
export function faltantesWeb(p) {
  const f = [];
  if (!p.imagen_key) f.push('Foto');
  if (String(p.descripcion || '').trim().length < DESCRIPCION_MINIMA_WEB) f.push(`Descripción (mínimo ${DESCRIPCION_MINIMA_WEB} letras)`);
  if (!altoDeFicha(p.especificaciones)) f.push('Alto de la figura');
  if (!(Number(p.precio_venta) > 0)) f.push('Precio');
  return f;
}

// Fila pública para el POS de la sede.
export function filaParaSede(p, origen) {
  const faltan = faltantesWeb(p);
  const stock = Number(p.sede_stock) || 0;
  return {
    id: Number(p.id),
    codigo: p.sede_codigo,
    referencia: p.referencia,
    nombre: p.nombre,
    precio: Number(p.precio_venta) || 0,
    stock,
    publicado: Boolean(p.mostrar_en_tienda) && p.activo !== false,
    completo: faltan.length === 0,
    faltan,
    enLaPagina: Boolean(p.mostrar_en_tienda) && p.activo !== false && faltan.length === 0 && stock > 0,
    foto: p.imagen_key ? `${origen}/api/imagenes/${p.imagen_key}` : null,
    url: `https://geekstore.com.co/producto/${encodeURIComponent(p.referencia)}`,
    sincronizado: p.sede_sincronizado_en,
  };
}

// Para las rutas que reciben un id de producto: si quien llama es una sede,
// el producto tiene que ser de esa sede. Devuelve true si NO puede tocarlo.
export async function bloqueadoParaSede(request, productoId) {
  const sede = request.headers.get('x-pos-sede');
  if (!sede) return false;
  const [p] = await sql`SELECT to_jsonb(productos) ->> 'sede' AS sede FROM productos WHERE id = ${Number(productoId) || 0}`;
  return !p || p.sede !== sede;
}
