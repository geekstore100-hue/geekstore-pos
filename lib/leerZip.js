// lib/leerZip.js
// Lector de archivos ZIP en el navegador, sin librerías (oct 2026).
// Lo usa "Importar borrador" de Facturas de compra para abrir el ZIP que
// prepara Claude (factura.json + carpeta fotos/). Soporta archivos guardados
// sin comprimir (método 0) y comprimidos normales (método 8, "deflate"), que
// son los que crean Windows, Mac y casi cualquier programa.

function u16(v, o) {
  return v.getUint16(o, true);
}
function u32(v, o) {
  return v.getUint32(o, true);
}

async function inflar(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no puede abrir ZIP comprimidos. Actualiza Chrome o Safari.');
  }
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

// Devuelve un Map: ruta → { leer(): Promise<Uint8Array>, tamano }
// (las carpetas no se incluyen; las rutas usan "/").
export async function abrirZip(archivo) {
  const buf = new Uint8Array(await archivo.arrayBuffer());
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Fin del directorio central: firma 0x06054b50, buscada desde el final.
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (u32(v, i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('El archivo no es un ZIP válido.');

  const total = u16(v, fin + 10);
  let p = u32(v, fin + 16);
  const decodificador = new TextDecoder('utf-8');
  const entradas = new Map();

  for (let n = 0; n < total; n++) {
    if (u32(v, p) !== 0x02014b50) throw new Error('El ZIP está dañado (directorio).');
    const metodo = u16(v, p + 10);
    const comprimido = u32(v, p + 20);
    const tamano = u32(v, p + 24);
    const largoNombre = u16(v, p + 28);
    const largoExtra = u16(v, p + 30);
    const largoComentario = u16(v, p + 32);
    const local = u32(v, p + 42);
    const nombre = decodificador.decode(buf.subarray(p + 46, p + 46 + largoNombre)).replace(/\\/g, '/');
    p += 46 + largoNombre + largoExtra + largoComentario;

    if (nombre.endsWith('/')) continue; // carpeta
    if (nombre.startsWith('__MACOSX/') || /(^|\/)\._/.test(nombre)) continue; // basura del Mac

    entradas.set(nombre, {
      tamano,
      async leer() {
        if (u32(v, local) !== 0x04034b50) throw new Error(`El ZIP está dañado (${nombre}).`);
        const inicio = local + 30 + u16(v, local + 26) + u16(v, local + 28);
        const datos = buf.subarray(inicio, inicio + comprimido);
        if (metodo === 0) return datos;
        if (metodo === 8) return inflar(datos);
        throw new Error(`No se puede leer "${nombre}" (compresión ${metodo}).`);
      },
    });
  }
  return entradas;
}

// Busca una entrada sin importar mayúsculas ni si el ZIP trae todo dentro de
// una carpeta (ej. "Factura 123/factura.json").
export function buscarEnZip(entradas, ruta) {
  const objetivo = String(ruta || '').replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
  if (!objetivo) return null;
  for (const [nombre, e] of entradas) {
    const n = nombre.toLowerCase();
    if (n === objetivo || n.endsWith(`/${objetivo}`)) return e;
  }
  return null;
}
