import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const hoy = new Date().toISOString().slice(0, 10);
    const primerDiaMes = hoy.slice(0, 8) + '01';
    const desde = searchParams.get('desde') || primerDiaMes;
    const hasta = searchParams.get('hasta') || hoy;

    // Suma el stock de TODAS las bodegas por producto (ya no depende de un nombre de bodega fijo)
    const inventario = await sql`
      SELECT
        p.referencia,
        p.nombre,
        COALESCE(SUM(s.cantidad), 0) AS cantidad,
        p.precio_costo,
        p.precio_venta,
        COALESCE(SUM(s.cantidad), 0) * COALESCE(p.precio_costo, 0) AS valor_costo,
        COALESCE(SUM(s.cantidad), 0) * COALESCE(p.precio_venta, 0) AS valor_venta
      FROM productos p
      LEFT JOIN stock s ON s.producto_id = p.id
      WHERE p.activo = true
      GROUP BY p.id, p.referencia, p.nombre, p.precio_costo, p.precio_venta
      ORDER BY valor_costo DESC
    `;

    const ventasPorItem = await sql`
      SELECT
        p.referencia,
        p.nombre,
        SUM(m.cantidad) AS unidades,
        SUM(m.cantidad * COALESCE(m.precio_unitario, 0)) AS total
      FROM movimientos_stock m
      JOIN productos p ON p.id = m.producto_id
      WHERE m.tipo = 'venta' AND m.creado_en::date BETWEEN ${desde} AND ${hasta}
      GROUP BY p.referencia, p.nombre
      ORDER BY total DESC
    `;

    return NextResponse.json({ ok: true, desde, hasta, inventario, ventasPorItem });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
