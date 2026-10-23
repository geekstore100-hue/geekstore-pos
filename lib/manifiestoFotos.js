// lib/manifiestoFotos.js
// Fotos de manifiestos de importación tomadas con el celular (oct 2026).
//
// Problema: la foto de la cámara del celular pesa 4–10 MB y Netlify no deja
// subir archivos de más de ~6 MB por petición, así que "no pasaba nada".
// Ahora cada foto se achica en el celular antes de subirla (queda legible y
// pesa ~300 KB), y varias fotos (varias hojas del manifiesto) se pueden unir
// en UN solo PDF.

const LADO_MAX = 1800; // px del lado más largo: suficiente para leer un documento
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

// Devuelve { dataUrl, ancho, alto } en JPEG, achicada.
export async function achicarFoto(archivo, calidad = 0.8) {
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
  return { dataUrl: canvas.toDataURL('image/jpeg', calidad), ancho, alto };
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
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = 215.9;
  const H = 279.4;
  const M = 8;
  fotos.forEach((f, i) => {
    if (i > 0) doc.addPage();
    const escala = Math.min((W - 2 * M) / f.ancho, (H - 2 * M) / f.alto);
    const w = f.ancho * escala;
    const h = f.alto * escala;
    doc.addImage(f.dataUrl, 'JPEG', (W - w) / 2, (H - h) / 2, w, h);
  });
  return doc.output('blob');
}

export function cabeEnUnaSubida(blob) {
  return blob.size <= LIMITE_SUBIDA;
}
