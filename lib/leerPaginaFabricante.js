// Lee la página web del fabricante de un producto (el enlace que se pone en
// "Nuevo producto") y saca el TEXTO útil para dárselo a la IA: título,
// descripción, datos estructurados de producto y el texto visible de la
// página (sin menús de código, estilos ni publicidad embebida).
//
// No todas las páginas se dejan leer: algunas bloquean a los programas
// (Amazon, AliExpress, sitios con protección anti-robots) y otras arman el
// contenido con JavaScript después de cargar, así que el HTML que llega
// casi no trae texto. En esos casos se lanza un error con
// codigo = 'pagina_no_legible', y la pantalla le sugiere a la persona pegar
// el texto de la página a mano (eso siempre funciona).
//
// Seguridad: el que abre la página es el servidor del POS, así que solo se
// permiten direcciones públicas de internet (http/https) — nunca
// direcciones internas o privadas — con tiempo máximo y tamaño máximo.

import { lookup } from 'node:dns/promises';
import net from 'node:net';

const TIEMPO_MAXIMO_MS = 12000;
const TAMANO_MAXIMO = 3 * 1024 * 1024; // 3 MB de HTML
const MAX_REDIRECCIONES = 4;
export const MAX_CARACTERES_TEXTO = 15000;

export class ErrorPagina extends Error {
  constructor(mensaje, codigo = 'pagina_no_legible') {
    super(mensaje);
    this.codigo = codigo;
  }
}

function esIpPrivada(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === '::1' ||
    v6 === '::' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe80') ||
    (v6.startsWith('::ffff:') && esIpPrivada(v6.slice(7)))
  );
}

async function validarDireccion(texto) {
  let url;
  try {
    url = new URL(String(texto).trim());
  } catch {
    throw new ErrorPagina('El enlace no es válido. Cópialo completo, empezando por https://', 'enlace_invalido');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ErrorPagina('El enlace tiene que empezar por https:// o http://', 'enlace_invalido');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ErrorPagina('Ese enlace no está permitido', 'enlace_invalido');
  }
  const direcciones = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (direcciones.length === 0) {
    throw new ErrorPagina('No se encontró esa página (revisa que el enlace esté bien escrito)', 'enlace_invalido');
  }
  if (direcciones.some((d) => esIpPrivada(d.address))) {
    throw new ErrorPagina('Ese enlace no está permitido', 'enlace_invalido');
  }
  return url;
}

async function descargarHtml(enlace) {
  let url = await validarDireccion(enlace);
  for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: control.signal,
        headers: {
          // Como un navegador normal: algunas páginas no responden a
          // programas que no se identifican.
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
        },
      });
    } catch (e) {
      clearTimeout(temporizador);
      throw new ErrorPagina(
        e?.name === 'AbortError' ? 'La página tardó demasiado en responder' : 'No se pudo abrir la página'
      );
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(temporizador);
      url = await validarDireccion(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    if (!res.ok) {
      clearTimeout(temporizador);
      throw new ErrorPagina(
        res.status === 403 || res.status === 429
          ? 'Esa página no deja que la lea un programa (la bloquea)'
          : `La página respondió con un error (${res.status})`
      );
    }
    const tipo = res.headers.get('content-type') || '';
    if (tipo && !/html|xml|text\/plain/i.test(tipo)) {
      clearTimeout(temporizador);
      throw new ErrorPagina('Ese enlace no es una página web (puede ser un PDF o una imagen)');
    }

    // Se lee con tope de tamaño (por si es una página enorme).
    const lector = res.body.getReader();
    const trozos = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.length;
        if (total > TAMANO_MAXIMO) {
          await lector.cancel();
          break;
        }
        trozos.push(value);
      }
    } finally {
      clearTimeout(temporizador);
    }
    // La mayoría de páginas vienen en UTF-8; si la página dice que usa otra
    // codificación (ej. ISO-8859-1 en sitios viejos), se respeta para que las
    // tildes no salgan dañadas.
    const charset = (tipo.match(/charset=([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
    let decodificador;
    try {
      decodificador = new TextDecoder(charset);
    } catch {
      decodificador = new TextDecoder('utf-8');
    }
    return decodificador.decode(Buffer.concat(trozos.map((t) => Buffer.from(t))));
  }
  throw new ErrorPagina('La página redirige demasiadas veces');
}

function decodificarEntidades(texto) {
  const nombradas = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', deg: '°', micro: 'µ', reg: '®', trade: '™', copy: '©', times: '×' };
  return texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => nombradas[n.toLowerCase()] ?? m);
}

function metaContenido(html, nombre) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${nombre}["'][^>]*>`, 'i');
  const etiqueta = html.match(re)?.[0];
  const contenido = etiqueta?.match(/content=["']([^"']*)["']/i)?.[1];
  return contenido ? decodificarEntidades(contenido).trim() : '';
}

// Datos estructurados (JSON-LD) de tipo Product: muchos fabricantes y
// tiendas los traen, y suelen tener nombre, marca, modelo y especificaciones
// ordenadas. Son lo más confiable de la página.
function datosEstructuradosDeProducto(html) {
  const bloques = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const productos = [];
  function buscar(nodo) {
    if (!nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) return nodo.forEach(buscar);
    const tipo = [].concat(nodo['@type'] || []).join(',');
    if (/Product/i.test(tipo)) productos.push(nodo);
    if (nodo['@graph']) buscar(nodo['@graph']);
  }
  for (const b of bloques) {
    try {
      buscar(JSON.parse(b.trim()));
    } catch {
      // bloque mal formado: se ignora
    }
  }
  if (!productos.length) return '';
  return productos
    .map((p) => {
      const copia = { ...p };
      delete copia.offers; // precios/stock de otra tienda: no sirven y confunden
      delete copia.review;
      delete copia.aggregateRating;
      delete copia.image;
      return JSON.stringify(copia);
    })
    .join('\n')
    .slice(0, 5000);
}

export function extraerTextoDeHtml(html) {
  const titulo = decodificarEntidades(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const descripcionMeta = metaContenido(html, 'description') || metaContenido(html, 'og:description');
  const jsonLd = datosEstructuradosDeProducto(html);

  let cuerpo = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/dd|\/dt)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  cuerpo = decodificarEntidades(cuerpo);

  const vistas = new Set();
  const lineas = [];
  for (const linea of cuerpo.split('\n')) {
    const l = linea.replace(/[ \t\f\v ]+/g, ' ').replace(/^[\s|]+|[\s|]+$/g, '').trim();
    if (l.length < 2 || vistas.has(l)) continue;
    vistas.add(l);
    lineas.push(l);
  }
  const textoVisible = lineas.join('\n');

  const partes = [];
  if (titulo) partes.push(`TÍTULO DE LA PÁGINA: ${titulo}`);
  if (descripcionMeta) partes.push(`DESCRIPCIÓN DE LA PÁGINA: ${descripcionMeta}`);
  if (jsonLd) partes.push(`DATOS ESTRUCTURADOS DEL PRODUCTO:\n${jsonLd}`);
  if (textoVisible) partes.push(`TEXTO DE LA PÁGINA:\n${textoVisible}`);
  return { texto: partes.join('\n\n').slice(0, MAX_CARACTERES_TEXTO), caracteresVisibles: textoVisible.length + jsonLd.length };
}

export async function leerPaginaFabricante(enlace) {
  const html = await descargarHtml(enlace);
  const { texto, caracteresVisibles } = extraerTextoDeHtml(html);
  if (caracteresVisibles < 300) {
    throw new ErrorPagina(
      'Esa página casi no trae texto que se pueda leer (seguramente lo carga con JavaScript o bloquea a los programas)'
    );
  }
  return texto;
}
