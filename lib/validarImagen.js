// Valida que un archivo subido como "foto" sea DE VERDAD una imagen.
//
// Antes se confiaba en el tipo de archivo que decía el navegador (que
// cualquiera puede falsificar): se podía subir una página web con código
// escondido haciéndola pasar por foto, y como las fotos se sirven desde el
// mismo dominio del POS, al abrir ese enlace el código corría con la sesión
// de quien lo abriera. Ahora se revisan los primeros bytes del archivo (la
// "firma" que tiene todo JPG, PNG, GIF o WEBP real) y el tipo se decide acá,
// no en el navegador.

const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB

function detectarFormato(bytes) {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { ext: 'gif', contentType: 'image/gif' };
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
export async function leerImagenSubida(archivo) {
  if (!archivo || typeof archivo === 'string') {
    return { ok: false, error: 'No se recibió ninguna imagen' };
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return { ok: false, error: 'La imagen pesa más de 10 MB' };
  }
  const buffer = await archivo.arrayBuffer();
  const formato = detectarFormato(new Uint8Array(buffer.slice(0, 12)));
  if (!formato) {
    return { ok: false, error: 'Formato no permitido. Usa una foto JPG, PNG, WEBP o GIF.' };
  }
  return { ok: true, buffer, ...formato };
}
