// lib/etiquetasOpenLabel.js
// Excel (.xlsx) para importar en OpenLabel e imprimir los stickers de precio
// (el mismo formato de siempre, el de Entradas y Traspasos):
//   - columnas: Referencia, Artículo, Precio
//   - una fila POR CADA UNIDAD (si llegaron 5, se repiten 5 filas)
//   - precio como texto con punto de miles ("90.000"), para que OpenLabel lo
//     tome tal cual
//   - 3 filas de PRUEBA al comienzo (para probar la impresora)
// Se usa en Facturas de compra (octubre 2026): se descarga solo al guardar la
// factura, y también con el botón 🏷️ de cada factura.

export const FILAS_PRUEBA = [
  ['PRUEBA', 'Etiqueta de prueba (impresora)', '0'],
  ['PRUEBA', 'Etiqueta de prueba (impresora)', '0'],
  ['PRUEBA', 'Etiqueta de prueba (impresora)', '0'],
];

// Nombre cortado para que quepa en el sticker (oct 2026). En la plantilla
// de OpenLabel (32 × 15 mm, letra 16) el nombre se parte en renglones solo:
// en el 1.º caben ~26 letras y en el 2.º ~21 (más allá se monta sobre el
// logo); un 3.er renglón ya pisa el código de barras. Se acomodan palabras
// completas en esos 2 renglones y el resto se corta. Si cambias la plantilla
// (otra letra u otro tamaño), ajusta estos dos números.
export const LETRAS_RENGLON_1 = 26;
export const LETRAS_RENGLON_2 = 21;
const CONECTORES = new Set(['y', 'e', 'o', 'con', 'de', 'del', 'para', 'en', 'a', 'la', 'el', 'por', 'sin', '+', '-', '/', '|', '–']);

export function nombreSticker(nombre) {
  const palabras = String(nombre || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const renglones = [[], []];
  const limite = [LETRAS_RENGLON_1, LETRAS_RENGLON_2];
  let r = 0;
  for (const palabra of palabras) {
    while (r < 2) {
      const actual = renglones[r].join(' ');
      const largo = actual ? actual.length + 1 + palabra.length : palabra.length;
      if (largo <= limite[r]) {
        renglones[r].push(palabra);
        break;
      }
      // Una sola palabra más larga que el renglón: se corta.
      if (!renglones[r].length) {
        renglones[r].push(palabra.slice(0, limite[r]));
        r = 2;
        break;
      }
      r++;
    }
    if (r >= 2) break;
  }
  const usadas = [...renglones[0], ...renglones[1]];
  // Que no termine en "con", "y", "de"…
  while (usadas.length > 1 && CONECTORES.has(usadas[usadas.length - 1].toLowerCase())) usadas.pop();
  return usadas.join(' ').replace(/[,;:]+$/, '');
}

// lineas: [{ referencia, nombre, cantidad, precio_venta }]
// Devuelve { filas, sinPrecio: [referencias sin precio de venta] }.
export async function descargarExcelEtiquetas(lineas, nombreArchivo) {
  const filas = [];
  const sinPrecio = new Set();
  for (const l of lineas) {
    const precio = Number(l.precio_venta) || 0;
    if (!precio) sinPrecio.add(l.referencia);
    const precioFormateado = precio.toLocaleString('es-CO', { maximumFractionDigits: 0 });
    const cantidad = Math.max(1, Math.round(Number(l.cantidad) || 0));
    const nombre = nombreSticker(l.nombre);
    for (let i = 0; i < cantidad; i++) filas.push([l.referencia, nombre, precioFormateado]);
  }
  if (!filas.length) return { filas: 0, sinPrecio: [] };
  const XLSX = await import('xlsx');
  const hoja = XLSX.utils.aoa_to_sheet([['Referencia', 'Artículo', 'Precio'], ...FILAS_PRUEBA, ...filas]);
  hoja['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 12 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Etiquetas');
  XLSX.writeFile(libro, nombreArchivo);
  return { filas: filas.length, sinPrecio: [...sinPrecio] };
}
