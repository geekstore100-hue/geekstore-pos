import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Ventas por vendedor, en el mismo rango de fechas que el resto de
// Reportes. Se arma en tres pasos (con CTEs) para no duplicar el total de
// la venta al unirlo con las líneas de movimientos_stock (una venta puede
// tener varias líneas, y sumar v.total directamente en ese cruce lo
// contaría una vez por línea en vez de una vez por venta).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    if (!desde || !hasta) {
      return NextResponse.json({ ok: false, error: 'Faltan las fechas desde/hasta' }, { status: 400 });
    }

    const filas = await sql`
      WITH ventas_filtradas AS (
        SELECT id, vendedor_id, total
        FROM ventas
        WHERE creado_en::date BETWEEN ${desde} AND ${hasta} AND anulada = false
      ),
      por_vendedor AS (
        SELECT vendedor_id, COUNT(*) AS cantidad_ventas, SUM(total) AS total_vendido
        FROM ventas_filtradas
        GROUP BY vendedor_id
      ),
      unidades AS (
        SELECT vf.vendedor_id, SUM(m.cantidad) AS unidades_vendidas
        FROM ventas_filtradas vf
        JOIN movimientos_stock m ON m.venta_id = vf.id AND m.tipo = 'venta'
        GROUP BY vf.vendedor_id
      )
      SELECT
        COALESCE(ve.nombre, 'Sin vendedor asignado') AS vendedor_nombre,
        pv.cantidad_ventas,
        pv.total_vendido,
        COALESCE(u.unidades_vendidas, 0) AS unidades_vendidas
      FROM por_vendedor pv
      LEFT JOIN vendedores ve ON ve.id = pv.vendedor_id
      LEFT JOIN unidades u ON u.vendedor_id IS NOT DISTINCT FROM pv.vendedor_id
      ORDER BY pv.total_vendido DESC
    `;

    return NextResponse.json({ ok: true, ventasPorVendedor: filas });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
