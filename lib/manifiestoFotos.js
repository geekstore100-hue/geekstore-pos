// lib/manifiestoFotos.js
// Fotos de manifiestos de importación tomadas con el celular (oct 2026).
//
// Problema: la foto de la cámara del celular pesa 4–10 MB y Netlify no deja
// subir archivos de más de ~6 MB por petición, así que "no pasaba nada".
// Ahora cada foto se prepara en el celular antes de subirla y varias fotos
// (varias hojas del manifiesto) se pueden unir en UN solo PDF.
//
// Calidad (oct 2026, segunda versión): con 1800 px la letra pequeña de los
// manifiestos no se leía. Ahora se guarda a 3200 px y, en "modo documento"
// (por defecto), en blanco y negro con el contraste ajustado: el texto queda
// más nítido y la foto pesa menos que a color, así que caben más hojas por
// PDF. Si todo junto pesa más de lo que deja subir Netlify, se parte en
// varios PDF automáticamente.

const LADO_MAX = 3200; // px del lado más largo
const LIMITE_SUBIDA = 5.5 * 1024 * 1024; // Netlify: ~6 MB por petición

function cargarImagen(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      mal(new Error('No se pudo leer la foto (¿formato HEIC? Prueba tomándola desde el botón de cámara).'));
    };
    img.src = url;
  });
}

// Blanco y negro con "niveles automáticos": el papel queda blanco y la tinta
// negra (estira el contraste entre el 1 % más oscuro y el 1 % más claro).
function modoDocumento(ctx, ancho, alto) {
  const img = ctx.getImageData(0, 0, ancho, alto);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = y;
    hist[y | 0]++;
  }
  const total = ancho * alto;
  let acum = 0;
  let bajo = 0;
  let alto2 = 255;
  for (let v = 0; v < 256; v++) {
    acum += hist[v];
    if (acum >= total * 0.01) {
      bajo = v;
      break;
    }
  }
  acum = 0;
  for (let v = 255; v >= 0; v--) {
    acum += hist[v];
    if (acum >= total * 0.01) {
      alto2 = v;
      break;
    }
  }
  if (alto2 - bajo < 40) {
    bajo = 0;
    alto2 = 255;
  }
  const rango = alto2 - bajo;
  for (let i = 0; i < d.length; i += 4) {
    let v = ((d[i] - bajo) * 255) / rango;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

// Devuelve { dataUrl, ancho, alto } en JPEG.
export async function achicarFoto(archivo, { documento = true, calidad } = {}) {
  const img = await cargarImagen(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const ancho = Math.round(img.naturalWidth * escala);
  const alto = Math.round(img.naturalHeight * escala);
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(img, 0, 0, ancho, alto);
  if (documento) modoDocumento(ctx, ancho, alto);
  // Si una sola hoja quedara muy pesada para subirla, se baja un poco la
  // calidad del JPEG (casi nunca pasa en blanco y negro).
  let q = calidad ?? (documento ? 0.85 : 0.9);
  let dataUrl = canvas.toDataURL('image/jpeg', q);
  while (dataUrl.length * 0.75 > 4.5 * 1024 * 1024 && q > 0.5) {
    q -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', q);
  }
  return { dataUrl, ancho, alto };
}

export function dataUrlABlob(dataUrl) {
  const [cabecera, datos] = dataUrl.split(',');
  const tipo = cabecera.match(/data:(.*?);/)?.[1] || 'application/octet-stream';
  const bin = atob(datos);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

// Une varias fotos (ya achicadas) en un PDF tamaño carta, una por página.
export async function fotosAPdf(fotos) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const W = 215.9;
  const H = 279.4;
  const M = 8;
  fotos.forEach((f, i) => {
    if (i > 0) doc.addPage();
    const escala = Math.min((W - 2 * M) / f.ancho, (H - 2 * M) / f.alto);
    const w = f.ancho * escala;
    const h = f.alto * escala;
    // 'NONE': el JPEG se mete tal cual, sin volver a comprimirlo (no pierde calidad).
    doc.addImage(f.dataUrl, 'JPEG', (W - w) / 2, (H - h) / 2, w, h, undefined, 'NONE');
  });
  return doc.output('blob');
}

export function cabeEnUnaSubida(blob) {
  return blob.size <= LIMITE_SUBIDA;
}
