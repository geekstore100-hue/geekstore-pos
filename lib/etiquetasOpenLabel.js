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
    for (let i = 0; i < cantidad; i++) filas.push([l.referencia, l.nombre, precioFormateado]);
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
