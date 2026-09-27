// Valida un archivo subido como "manifiesto de importación" (Gastos >
// Facturas de compra > detalle > Manifiestos). Igual que con las fotos de
// producto (ver lib/validarImagen.js), no se confía en el tipo que diga el
// navegador: se revisan los primeros bytes del archivo. Acepta PDF (lo
// normal) y también foto/escaneo (JPG, PNG, WEBP) para cuando el manifiesto
// llega como una foto del papel en vez de un PDF.

const TAMANO_MAXIMO = 20 * 1024 * 1024; // 20 MB — un PDF de aduana puede traer varias páginas escaneadas

function detectarFormato(bytes) {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return { ext: 'pdf', contentType: 'application/pdf' };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

// Recibe el "File" del formulario. Devuelve { ok: true, buffer, ext,
// contentType } o { ok: false, error }.
export async function leerDocumentoSubido(archivo) {
  if (!archivo || typeof archivo === 'string') {
    return { ok: false, error: 'No se recibió ningún archivo' };
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return { ok: false, error: 'El archivo pesa más de 20 MB' };
  }
  const buffer = await archivo.arrayBuffer();
  const formato = detectarFormato(new Uint8Array(buffer.slice(0, 12)));
  if (!formato) {
    return { ok: false, error: 'Formato no permitido. Sube un PDF o una foto (JPG, PNG, WEBP) del manifiesto.' };
  }
  return { ok: true, buffer, ...formato, nombreOriginal: archivo.name || null };
}
