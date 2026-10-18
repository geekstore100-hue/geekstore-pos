// lib/quitarFondoCliente.js
// Quitar el fondo de la foto de un producto, desde la pantalla de Productos
// (octubre 2026). Todo automático:
//   1. Si en Netlify está REMOVEBG_API_KEY (cuenta gratis de remove.bg, 50
//      fotos al mes), se usa remove.bg: es lo más preciso.
//   2. Si no hay clave o ya se gastaron las del mes, la IA gratis que corre
//      en el mismo navegador (@imgly/background-removal, se descarga la
//      primera vez y después queda guardada). Sin límite y sin tarjeta, pero
//      más lenta (de 5 a 40 segundos según el equipo) y un poco menos precisa.
// Al final la foto queda con FONDO BLANCO (como las de la tienda), recortada
// al producto y centrada en un cuadrado con un margen. Devuelve un JPG
// (data URI) listo para subir.

const LIBRERIA = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const LADO_MAX = 1600;

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la foto'));
    img.src = src;
  });
}

// La foto en JPG de máximo 1600 px (lo que se manda a remove.bg).
async function prepararFoto(dataUri) {
  const img = await cargarImagen(dataUri);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * escala);
  c.height = Math.round(img.naturalHeight * escala);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, dataUri: c.toDataURL('image/jpeg', 0.92) };
}

// Aplica la silueta de remove.bg (en blanco y negro, pequeña) sobre la foto
// original en tamaño completo → PNG con fondo transparente.
async function aplicarMascara(fotoCanvas, mascaraDataUri) {
  const mascara = await cargarImagen(mascaraDataUri);
  const { width: w, height: h } = fotoCanvas;
  const m = document.createElement('canvas');
  m.width = w;
  m.height = h;
  const mctx = m.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(mascara, 0, 0, w, h);
  const datosM = mctx.getImageData(0, 0, w, h).data;
  const salida = document.createElement('canvas');
  salida.width = w;
  salida.height = h;
  const sctx = salida.getContext('2d');
  sctx.drawImage(fotoCanvas, 0, 0);
  const img = sctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // La máscara viene en gris (o con alfa): se usa lo que tenga.
    const a = datosM[i + 3] < 255 ? datosM[i + 3] : datosM[i];
    d[i + 3] = a;
  }
  sctx.putImageData(img, 0, 0);
  return salida;
}

async function conRemoveBg(foto) {
  const res = await fetch('/api/productos/quitar-fondo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagen: foto.dataUri }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok || !data.mascara) return null;
  return aplicarMascara(foto.canvas, data.mascara);
}

async function enNavegador(foto, onProgreso) {
  // import desde la web (no hace falta instalar nada en el POS). Se hace con
  // new Function para que Next no intente empaquetar esa dirección.
  const importar = new Function('u', 'return import(u)');
  const { removeBackground } = await importar(LIBRERIA);
  const blobEntrada = await new Promise((r) => foto.canvas.toBlob(r, 'image/jpeg', 0.92));
  const usarGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const opciones = (device) => ({
    model: 'isnet_fp16',
    device,
    output: { format: 'image/png' },
    progress: (clave, actual, total) => {
      if (onProgreso && String(clave).startsWith('fetch') && total) {
        onProgreso(`Descargando la IA (solo la primera vez)… ${Math.round((actual / total) * 100)}%`);
      }
    },
  });
  let blob;
  try {
    blob = await removeBackground(blobEntrada, opciones(usarGpu ? 'gpu' : 'cpu'));
  } catch (e) {
    if (!usarGpu) throw e;
    blob = await removeBackground(blobEntrada, opciones('cpu'));
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await cargarImagen(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// PNG transparente → JPG con fondo blanco, recortado al producto y centrado
// en un cuadrado con 8 % de margen.
function aFondoBlanco(transparente) {
  const { width: w, height: h } = transparente;
  const d = transparente.getContext('2d').getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('La IA no encontró el producto en la foto. Prueba con otra foto donde se vea más claro.');
  const ancho = maxX - minX + 1;
  const alto = maxY - minY + 1;
  const lado = Math.min(LADO_MAX, Math.round(Math.max(ancho, alto) * 1.16));
  const escala = Math.min(1, (lado / 1.16) / Math.max(ancho, alto));
  const c = document.createElement('canvas');
  c.width = lado;
  c.height = lado;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lado, lado);
  ctx.imageSmoothingQuality = 'high';
  const dw = Math.round(ancho * escala);
  const dh = Math.round(alto * escala);
  ctx.drawImage(transparente, minX, minY, ancho, alto, Math.round((lado - dw) / 2), Math.round((lado - dh) / 2), dw, dh);
  return c.toDataURL('image/jpeg', 0.9);
}

// Devuelve { imagen (data URI JPG), metodo: 'removebg' | 'navegador' }.
export async function quitarFondoFoto(dataUri, { onProgreso } = {}) {
  const foto = await prepararFoto(dataUri);
  let transparente = null;
  let metodo = 'removebg';
  try {
    onProgreso?.('Quitando el fondo…');
    transparente = await conRemoveBg(foto);
  } catch {
    transparente = null;
  }
  if (!transparente) {
    metodo = 'navegador';
    onProgreso?.('Quitando el fondo con la IA del navegador (puede tardar unos segundos)…');
    transparente = await enNavegador(foto, onProgreso);
  }
  return { imagen: aFondoBlanco(transparente), metodo };
}
