// Validación del campo "Video de YouTube" de Productos. Se guarda la URL
// completa tal cual la pega Nelson (no un ID recortado a mano) — esta
// función solo revisa que de verdad sea un enlace de YouTube antes de
// guardarlo. Convertirlo a un video incrustado es trabajo de quien lo
// muestra (la tienda online), no de acá.
const PATRON_YOUTUBE = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]+/i;

export function esUrlYoutubeValida(url) {
  if (!url) return true; // vacío es válido: el campo es opcional
  return PATRON_YOUTUBE.test(String(url).trim());
}
