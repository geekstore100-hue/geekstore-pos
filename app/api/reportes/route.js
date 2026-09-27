import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Reportes de "Valor de inventario actual" y "Ventas por ítem" — los dos
// que se ven en /reportes al elegir esas pestañas (comparten esta misma
// consulta porque siempre se han pedido juntos: generar uno deja listo el
// otro sin volver a consultar). El valor de inventario se desglosa por
// bodega (Principal / Bodega Distribuidor) además del total global, para
// saber cuánto capital hay guardado en cada una por separado.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    const inventario = await sql`
      SELECT
        p.referencia,
        p.nombre,
        COALESCE(SUM(s.cantidad), 0) AS cantidad,
        COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Principal'), 0) AS cantidad_principal,
        COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Bodega Distribuidor'), 0) AS cantidad_distribuidor,
        COALESCE(SUM(s.cantidad), 0) * p.precio_costo AS valor_costo,
        COALESCE(SUM(s.cantidad), 0) * p.precio_venta AS valor_venta,
        COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Principal'), 0) * p.precio_costo AS valor_costo_principal,
        COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Principal'), 0) * p.precio_venta AS valor_venta_principal,
        COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Bodega Distribuidor'), 0) * p.precio_costo AS valor_costo_distribuidor,
        COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Bodega Distribuidor'), 0) * p.precio_venta AS valor_venta_distribuidor
      FROM productos p
      LEFT JOIN stock s ON s.producto_id = p.id
      LEFT JOIN bodegas b ON b.id = s.bodega_id
      WHERE p.activo = true AND p.es_inventariable = true
      GROUP BY p.id
      ORDER BY p.nombre ASC
    `;

    let ventasPorItem = [];
    if (desde && hasta) {
      ventasPorItem = await sql`
        SELECT
          pr.referencia,
          pr.nombre,
          SUM(m.cantidad) AS unidades,
          SUM(m.cantidad * m.precio_unitario * (1 - COALESCE(m.descuento_porcentaje, 0) / 100)) AS total
        FROM movimientos_stock m
        JOIN ventas v ON v.id = m.venta_id
        JOIN productos pr ON pr.id = m.producto_id
        WHERE m.tipo = 'venta' AND v.anulada = false AND v.creado_en::date BETWEEN ${desde} AND ${hasta}
        GROUP BY pr.id
        ORDER BY total DESC
      `;
    }

    return NextResponse.json({ ok: true, inventario, ventasPorItem });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
