import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { claveValida, buscarDistribuidor } from '../../../../../lib/distribuidores';

// Catálogo de mayorista para el portal de distribuidores de la tienda:
// mismo catálogo público, pero con el precio distribuidor (en vez del
// precio de venta al público) y solo los productos que sí tienen un
// precio distribuidor configurado. Antes esto salía de un archivo
// aparte en un repo privado de GitHub (distribuidores.json); ahora usa
// el precio distribuidor que ya se guarda por producto en el POS.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (!claveValida(request)) {
      return NextResponse.json({ productos: [], error: 'No autorizado' }, { status: 401 });
    }
    const { searchParams, origin } = new URL(request.url);
    const cedula = searchParams.get('cedula');
    const distribuidor = await buscarDistribuidor(cedula);
    if (!distribuidor) {
      return NextResponse.json({ productos: [], error: 'Distribuidor no encontrado' }, { status: 404 });
    }

    const productos = await sql`
      SELECT
        p.id, p.referencia, p.alegra_id, p.nombre, p.descripcion, p.imagen_key,
        p.precio_distribuidor, p.es_inventariable,
        c.nombre AS categoria_nombre,
        COALESCE(st.stock_total, 0) AS stock_total
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN (
        SELECT producto_id, SUM(cantidad) AS stock_total
        FROM stock
        GROUP BY producto_id
      ) st ON st.producto_id = p.id
      WHERE p.activo = true AND p.precio_distribuidor IS NOT NULL AND p.precio_distribuidor > 0
      ORDER BY p.nombre ASC
    `;

    const imagenes = await sql`
      SELECT producto_id, imagen_key FROM producto_imagenes ORDER BY producto_id, orden ASC
    `;
    const imagenesPorProducto = new Map();
    for (const fila of imagenes) {
      const lista = imagenesPorProducto.get(fila.producto_id) || [];
      lista.push(`${origin}/api/imagenes/${fila.imagen_key}`);
      imagenesPorProducto.set(fila.producto_id, lista);
    }

    const resultado = productos
      .filter((p) => p.es_inventariable === false || Number(p.stock_total) > 0)
      .map((p) => {
        const images = imagenesPorProducto.get(p.id) || (p.imagen_key ? [`${origin}/api/imagenes/${p.imagen_key}`] : []);
        return {
          id: p.alegra_id || p.referencia,
          name: p.nombre,
          description: p.descripcion || '',
          reference: p.referencia,
          category: p.categoria_nombre || '',
          price: Number(p.precio_distribuidor) || 0,
          available: Number(p.stock_total) || 0,
          image: images[0] ?? null,
          images,
          status: 'active',
        };
      });

    return NextResponse.json({ productos: resultado });
  } catch (error) {
    return NextResponse.json({ productos: [], error: error.message }, { status: 500 });
  }
}
