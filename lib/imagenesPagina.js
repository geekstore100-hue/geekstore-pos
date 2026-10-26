// lib/imagenesPagina.js
// Fotos del producto sacadas de la página del fabricante (octubre 2026).
//
// Al crear un producto con el enlace del fabricante, además del texto (que
// lee la IA), se buscan las fotos de la página y se elige la mejor para la
// portada. Dónde se buscan, de más a menos confiable:
//   1. Datos estructurados del producto (JSON-LD "Product" → image): la foto
//      que la página le declara a Google.
//   2. og:image / twitter:image: la que sale al compartir el enlace.
//   3. Fotos de la galería (<img>, srcset, data-zoom-image, enlaces a la
//      foto grande...).
// Se descartan logos, íconos, banners y miniaturas, y se mide cada foto de
// verdad (ancho × alto, leyendo solo el comienzo del archivo) para preferir
// las grandes y cuadradas.
//
// Seguridad: igual que leer la página (lib/leerPaginaFabricante.js): solo
// direcciones públicas de internet, con tiempo y tamaño máximos.

import { descargarHtml, validarDireccion, decodificarEntidades, ErrorPagina } from './leerPaginaFabricante';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MALAS = /(logo|icon|icono|sprite|favicon|banner|placeholder|blank|spacer|pixel|badge|flag|bandera|avatar|payment|pago|visa|mastercard|loader|loading|rating|estrella|star|social|facebook|instagram|whatsapp|twitter|youtube|tiktok|qr)/i;
const BUENAS = /(product|producto|zoom|large|grande|full|original|master|main|principal|hero|gallery|galeria|1200|1500|2000|2048)/i;
const MINIATURA = /([_-](thumb|thumbnail|small|mini|xs|icon)\b|[_-]\d{2,3}x\d{2,3}(?=[._-]))/i;

function absoluta(src, base) {
  if (!src) return null;
  const limpio = decodificarEntidades(String(src).trim()).replace(/^['"]|['"]$/g, '');
  if (!limpio || limpio.startsWith('data:') || limpio.startsWith('blob:')) return null;
  try {
    const u = new URL(limpio, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (/\.(svg|gif)(\?|$)/i.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// La versión grande de una foto cuando la página enlaza una miniatura:
// Shopify (foto_200x200.jpg), WordPress/WooCommerce (foto-150x150.jpg),
// Magento/otros (?width=200).
function versionGrande(url) {
  const variantes = [];
  const sinShopify = url.replace(/_(\d{2,4}x\d{0,4}|\d{0,4}x\d{2,4}|small|medium|compact|grande|large)(@2x)?(?=\.(jpe?g|png|webp)(\?|$))/i, '');
  if (sinShopify !== url) variantes.push(sinShopify);
  const sinWp = url.replace(/-\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp)(\?|$))/i, '');
  if (sinWp !== url) variantes.push(sinWp);
  try {
    const u = new URL(url);
    let cambio = false;
    for (const k of ['width', 'w', 'height', 'h', 'size', 'resize', 'fit']) {
      if (u.searchParams.has(k)) {
        u.searchParams.delete(k);
        cambio = true;
      }
    }
    if (cambio) variantes.push(u.toString());
  } catch {
    /* nada */
  }
  return variantes;
}

function mayorDeSrcset(srcset) {
  let mejor = null;
  let mejorAncho = -1;
  for (const parte of String(srcset).split(',')) {
    const [u, d] = parte.trim().split(/\s+/);
    if (!u) continue;
    const n = parseFloat(d) || 1;
    if (n > mejorAncho) {
      mejorAncho = n;
      mejor = u;
    }
  }
  return mejor;
}

function atributo(etiqueta, nombre) {
  const m = etiqueta.match(new RegExp(`\\s${nombre}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? m[2] ?? m[3] ?? m[4] ?? '' : '';
}

function metaImagen(html, nombre) {
  const etiquetas = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${nombre}["'][^>]*>`, 'gi')) || [];
  return etiquetas.map((e) => atributo(e, 'content')).filter(Boolean);
}

function imagenesJsonLd(html) {
  const salida = [];
  const bloques = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  function agregar(img) {
    if (!img) return;
    if (Array.isArray(img)) return img.forEach(agregar);
    if (typeof img === 'string') return salida.push(img);
    if (typeof img === 'object') agregar(img.contentUrl || img.url || img['@id']);
  }
  function buscar(nodo) {
    if (!nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) return nodo.forEach(buscar);
    const tipo = [].concat(nodo['@type'] || []).join(',');
    if (/Product/i.test(tipo)) agregar(nodo.image);
    if (nodo['@graph']) buscar(nodo['@graph']);
    if (nodo.mainEntity) buscar(nodo.mainEntity);
  }
  for (const b of bloques) {
    try {
      buscar(JSON.parse(b.trim()));
    } catch {
      /* bloque mal formado */
    }
  }
  return salida;
}

// Lista de candidatas { url, fuente, base } (base = puntaje previo).
export function candidatasDeHtml(html, urlPagina) {
  const mapa = new Map();
  function poner(src, fuente, base) {
    const url = absoluta(src, urlPagina);
    if (!url) return;
    const previa = mapa.get(url);
    if (!previa || previa.base < base) mapa.set(url, { url, fuente, base });
    for (const g of versionGrande(url)) {
      const pg = mapa.get(g);
      if (!pg || pg.base < base + 2) mapa.set(g, { url: g, fuente, base: base + 2 });
    }
  }
  imagenesJsonLd(html).forEach((u) => poner(u, 'datos del producto', 40));
  [...metaImagen(html, 'og:image'), ...metaImagen(html, 'og:image:secure_url'), ...metaImagen(html, 'og:image:url')].forEach((u) =>
    poner(u, 'imagen principal de la página', 32)
  );
  metaImagen(html, 'twitter:image').forEach((u) => poner(u, 'imagen principal de la página', 28));
  for (const m of html.matchAll(/<link[^>]+rel=["']image_src["'][^>]*>/gi)) poner(atributo(m[0], 'href'), 'imagen principal de la página', 26);

  const cuerpo = html.replace(/<(header|nav|footer)[\s\S]*?<\/\1>/gi, ' ');
  let orden = 0;
  for (const m of cuerpo.matchAll(/<(img|source)\b[^>]*>/gi)) {
    if (orden > 120) break;
    orden++;
    const e = m[0];
    const alt = atributo(e, 'alt');
    const clases = `${atributo(e, 'class')} ${atributo(e, 'id')} ${alt}`;
    const penal = MALAS.test(clases) ? -25 : 0;
    const extra = BUENAS.test(clases) ? 6 : 0;
    const grande =
      atributo(e, 'data-zoom-image') ||
      atributo(e, 'data-large_image') ||
      atributo(e, 'data-large-image') ||
      atributo(e, 'data-full') ||
      atributo(e, 'data-full-src') ||
      atributo(e, 'data-old-hires') ||
      atributo(e, 'data-zoom') ||
      atributo(e, 'data-hires');
    if (grande) poner(grande, 'galería de la página', 22 + extra + penal);
    const srcset = atributo(e, 'srcset') || atributo(e, 'data-srcset');
    if (srcset) poner(mayorDeSrcset(srcset), 'galería de la página', 16 + extra + penal);
    const src = atributo(e, 'data-src') || atributo(e, 'data-lazy-src') || atributo(e, 'data-original') || atributo(e, 'src');
    if (src) poner(src, 'galería de la página', 12 + extra + penal - Math.min(8, Math.floor(orden / 10)));
  }
  // Enlaces directos a la foto grande (galerías con "zoom").
  for (const m of cuerpo.matchAll(/<a\b[^>]+href=["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["'][^>]*>/gi)) {
    poner(m[1], 'galería de la página', 18);
  }

  return [...mapa.values()]
    .map((c) => {
      let base = c.base;
      if (MALAS.test(c.url)) base -= 30;
      if (BUENAS.test(c.url)) base += 4;
      if (MINIATURA.test(c.url)) base -= 10;
      return { ...c, base };
    })
    .filter((c) => c.base > -5)
    .sort((a, b) => b.base - a.base);
}

// Ancho y alto leyendo solo los primeros bytes (JPEG, PNG, WEBP, AVIF no).
export function medidas(buf) {
  const b = buf;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), tipo: 'png' };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marca = b[i + 1];
      if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
        i += 2;
        continue;
      }
      const largo = b.readUInt16BE(i + 2);
      if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
        return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7), tipo: 'jpeg' };
      }
      i += 2 + largo;
    }
    return null;
  }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const tipo = b.toString('ascii', 12, 16);
    if (tipo === 'VP8 ') return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff, tipo: 'webp' };
    if (tipo === 'VP8L') {
      const n = b.readUInt32LE(21);
      return { ancho: (n & 0x3fff) + 1, alto: ((n >> 14) & 0x3fff) + 1, tipo: 'webp' };
    }
    if (tipo === 'VP8X') return { ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3), tipo: 'webp' };
  }
  return null;
}

// Descarga una foto (siguiendo redirecciones, validando cada dirección).
// maxBytes: tope; parcial=true corta al llegar al tope (para medir).
export async function descargarImagen(enlace, { maxBytes = 10 * 1024 * 1024, parcial = false, ms = 10000, referer } = {}) {
  let url = await validarDireccion(enlace);
  for (let salto = 0; salto <= 4; salto++) {
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), ms);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: control.signal,
        headers: {
          'User-Agent': UA,
          Accept: 'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8',
          ...(referer ? { Referer: referer } : {}),
        },
      });
    } catch (e) {
      clearTimeout(t);
      throw new ErrorPagina(e?.name === 'AbortError' ? 'La foto tardó demasiado' : 'No se pudo descargar la foto');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(t);
      url = await validarDireccion(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    if (!res.ok) {
      clearTimeout(t);
      throw new ErrorPagina(`La foto respondió ${res.status}`);
    }
    const tipo = (res.headers.get('content-type') || '').toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp|avif)/.test(tipo)) {
      clearTimeout(t);
      await res.body?.cancel().catch(() => {});
      throw new ErrorPagina('No es una foto (JPG, PNG o WEBP)');
    }
    const lector = res.body.getReader();
    const trozos = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        trozos.push(value);
        total += value.length;
        if (total >= maxBytes) {
          await lector.cancel().catch(() => {});
          if (!parcial) throw new ErrorPagina('La foto pesa demasiado');
          break;
        }
      }
    } finally {
      clearTimeout(t);
    }
    return { buffer: Buffer.concat(trozos.map((x) => Buffer.from(x))), tipo: tipo.split(';')[0], url: url.toString() };
  }
  throw new ErrorPagina('La foto redirige demasiadas veces');
}

// Busca, mide y ordena las fotos de la página. Devuelve las mejores primero:
// [{ url, ancho, alto, fuente, puntaje }].
export async function fotosDePagina(enlace, { maximo = 8 } = {}) {
  const { html, url } = await descargarHtml(enlace, { conUrl: true });
  const candidatas = candidatasDeHtml(html, url).slice(0, 16);
  const medidasDe = new Map();
  let i = 0;
  async function trabajador() {
    while (i < candidatas.length) {
      const c = candidatas[i++];
      try {
        const { buffer } = await descargarImagen(c.url, { maxBytes: 256 * 1024, parcial: true, ms: 6000, referer: url });
        const m = medidas(buffer);
        if (m) medidasDe.set(c.url, m);
      } catch {
        /* esa foto no se pudo leer: se descarta */
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, trabajador));

  const vistas = new Set();
  return candidatas
    .filter((c) => medidasDe.has(c.url))
    .map((c) => {
      const { ancho, alto } = medidasDe.get(c.url);
      const menor = Math.min(ancho, alto);
      const proporcion = Math.max(ancho, alto) / Math.max(1, menor);
      let puntaje = c.base;
      puntaje += Math.min(30, (menor / 1000) * 30); // más grande = mejor (hasta 1000 px)
      if (proporcion <= 1.25) puntaje += 10; // casi cuadrada: típica de producto
      else if (proporcion > 2) puntaje -= 25; // banner
      if (menor < 300) puntaje -= 40; // miniatura
      return { url: c.url, ancho, alto, fuente: c.fuente, puntaje: Math.round(puntaje) };
    })
    .filter((f) => Math.min(f.ancho, f.alto) >= 200 && Math.max(f.ancho, f.alto) / Math.min(f.ancho, f.alto) <= 3)
    .sort((a, b) => b.puntaje - a.puntaje)
    .filter((f) => {
      // Misma foto en otro tamaño (misma dirección sin parámetros): solo una.
      const clave = f.url.replace(/\?.*$/, '').replace(/(_\d+x\d*|-\d+x\d+)(?=\.\w+$)/, '');
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .slice(0, maximo);
}
