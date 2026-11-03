import crypto from 'crypto';
import sql from './db';
import { altoDeFicha, esCategoriaColeccionable } from './figuras';

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

let listo = false;
export async function asegurarSedes() {
  if (listo) return;
  await sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS sede TEXT NOT NULL DEFAULT 'kennedy'`;
  await sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS sede_codigo TEXT`;
  await sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS sede_stock NUMERIC NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS sede_sincronizado_en TIMESTAMPTZ`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS productos_sede_codigo_idx ON productos (sede, sede_codigo) WHERE sede <> 'kennedy'`;
  listo = true;
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

// CORS: el POS de la sede llama desde el navegador (otro dominio).
export function cabecerasCors(request) {
  const origen = request.headers.get('origin') || '';
  const permitidos = Object.keys(DATOS_SEDES)
    .flatMap((s) => env(s, 'ORIGEN').split(','))
    .map((x) => x.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-sede-clave',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origen && permitidos.includes(origen)) h['Access-Control-Allow-Origin'] = origen;
  return h;
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
