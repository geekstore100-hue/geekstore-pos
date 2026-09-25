import sql from '../../../../lib/db';

// Endpoint temporal de un solo uso: exporta TODO el catálogo (activos e
// inactivos, mostrados u ocultos en la tienda) a un CSV descargable, para
// que Nelson se lo pase a Claude y pueda revisar categorías/subcategorías
// de los ~3.100 productos sin tener que copiar y pegar nada a mano.
//
// Incluye tiene_imagen y stock_total para poder identificar productos
// "muertos" (sin categoría, sin foto y sin stock) que probablemente ya no
// se venden y no vale la pena gastar tiempo categorizando.
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
        p.mostrar_en_tienda,
        (p.imagen_key IS NOT NULL) AS tiene_imagen,
        COALESCE(st.total, 0) AS stock_total
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
      LEFT JOIN (
        SELECT producto_id, SUM(cantidad) AS total
        FROM stock
        GROUP BY producto_id
      ) st ON st.producto_id = p.id
      ORDER BY c.nombre ASC NULLS LAST, p.nombre ASC
    `;

    const encabezado = [
      'referencia', 'nombre', 'descripcion', 'categoria', 'subcategoria',
      'activo', 'tipo', 'mostrar_en_tienda', 'tiene_imagen', 'stock_total',
    ];
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
        celdaCsv(p.tiene_imagen ? 'si' : 'no'),
        celdaCsv(p.stock_total),
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
