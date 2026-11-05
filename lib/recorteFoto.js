// lib/recorteFoto.js — recorte automático de fotos de producto (nov 2026).
//
// Problema: al quitar el fondo (o al recortar el espacio blanco) quedaban
// restos finitos del fondo — por ejemplo las líneas punteadas de una base
// de corte o una mesa — y el recorte se iba hasta ellas: la figura quedaba
// chiquita en una esquina de una foto casi toda blanca.
//
// Solución: antes de buscar dónde está el producto se "adelgaza" la máscara
// (erosión de 1 píxel): las líneas y puntos de 1–2 píxeles desaparecen y el
// producto (que es grueso) queda. El recorte se calcula sobre eso.
//
// Una máscara es un Uint8Array de ancho*alto con 1 donde hay producto.

// Mínimo (erosión) o máximo (dilatación) en un cuadrado de (2r+1)², hecho
// en dos pasadas (horizontal y vertical) para que sea rápido.
function filtrar(m, w, h, r, esMinimo) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      let v = esMinimo ? 1 : 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        const px = xx < 0 || xx >= w ? (esMinimo ? 0 : 0) : m[base + xx];
        if (esMinimo ? px === 0 : px === 1) { v = esMinimo ? 0 : 1; break; }
      }
      tmp[base + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = esMinimo ? 1 : 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        const px = yy < 0 || yy >= h ? 0 : tmp[yy * w + x];
        if (esMinimo ? px === 0 : px === 1) { v = esMinimo ? 0 : 1; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

export const erosionar = (m, w, h, r = 1) => filtrar(m, w, h, r, true);
export const dilatar = (m, w, h, r = 1) => filtrar(m, w, h, r, false);

// Caja del producto { minX, minY, maxX, maxY } ignorando líneas y puntos
// finitos, o null si no hay nada. Si al adelgazar no queda nada (producto
// muy delgado), usa la máscara tal cual.
export function cajaDelProducto(m, w, h) {
  const caja = (mm) => {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const base = y * w;
      for (let x = 0; x < w; x++) {
        if (mm[base + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return maxX < 0 ? null : { minX, minY, maxX, maxY };
  };
  const fina = caja(erosionar(m, w, h, 1));
  if (!fina) return caja(m);
  // La erosión le quita 1 píxel al borde: se devuelve.
  return {
    minX: Math.max(0, fina.minX - 1),
    minY: Math.max(0, fina.minY - 1),
    maxX: Math.min(w - 1, fina.maxX + 1),
    maxY: Math.min(h - 1, fina.maxY + 1),
  };
}
