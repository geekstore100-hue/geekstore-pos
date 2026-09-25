import sql from '../../../../lib/db';

// Endpoint temporal de un solo uso: exporta TODO el catálogo (activos e
// inactivos, mostrados u ocultos en la tienda) a un CSV descargable, para
// que Nelson se lo pase a Claude y pueda revisar categorías/subcategorías
// de los ~3.100 productos sin tener que copiar y pegar nada a mano.
//
// Se visita directo en el navegador: https://<tu-pos>.netlify.app/api/productos/exportar-csv
// y el navegador descarga el archivo solo (Content-Disposition: attachment).
//
// No necesita clave: es de solo lectura y no expone nada que Nelson no
// pueda ya ver entrando a Productos en el POS. Se puede borrar este
// archivo desde GitHub cuando ya no se necesite.
export const dynamic = 'force-dynamic';

function celdaCsv(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  // Si tiene coma, comillas o salto de línea, hay que envolverlo en
  // comillas dobles y escapar las comillas internas duplicándolas.
  if (/[",\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export async function GET() {
  try {
    const productos = await sql`
      SELECT
        p.referencia,
        p.nombre,
        p.descripcion,
        c.nombre AS categoria,
        sc.nombre AS subcategoria,
        p.activo,
        p.es_inventariable,
        p.mostrar_en_tienda
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
      ORDER BY c.nombre ASC NULLS LAST, p.nombre ASC
    `;

    const encabezado = ['referencia', 'nombre', 'descripcion', 'categoria', 'subcategoria', 'activo', 'tipo', 'mostrar_en_tienda'];
    const filas = productos.map((p) =>
      [
        celdaCsv(p.referencia),
        celdaCsv(p.nombre),
        celdaCsv(p.descripcion),
        celdaCsv(p.categoria || 'Sin categoría'),
        celdaCsv(p.subcategoria || ''),
        celdaCsv(p.activo ? 'si' : 'no'),
        celdaCsv(p.es_inventariable === false ? 'servicio' : 'producto'),
        celdaCsv(p.mostrar_en_tienda === false ? 'no' : 'si'),
      ].join(',')
    );

    // BOM al inicio para que Excel abra los tildes/ñ bien si Nelson lo
    // abre ahí en vez de mandármelo directo.
    const csv = '﻿' + [encabezado.join(','), ...filas].join('\r\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="catalogo_geekstore.csv"',
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
