import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const [venta] = await sql`
      SELECT v.id, v.total, v.medio_pago, ve.nombre AS vendedor_nombre, v.creado_en, v.anulada, v.anulada_en
      FROM ventas v
      LEFT JOIN vendedores ve ON ve.id = v.vendedor_id
      WHERE v.id = ${id}
    `;
    if (!venta) {
      return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
    }

    const items = await sql`
      SELECT
        m.producto_id,
        p.referencia,
        p.nombre,
        p.es_inventariable,
        m.bodega_id,
        m.cantidad,
        m.precio_unitario,
        m.descuento_porcentaje,
        COALESCE(d.total_devuelto, 0) AS ya_devuelta
      FROM movimientos_stock m
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN (
        SELECT producto_id, SUM(cantidad) AS total_devuelto
        FROM devoluciones
        WHERE venta_id = ${id}
        GROUP BY producto_id
      ) d ON d.producto_id = m.producto_id
      WHERE m.venta_id = ${id}
      ORDER BY m.id ASC
    `;

    return NextResponse.json({ ok: true, venta, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Anula una venta del día actual: devuelve el stock descontado a la bodega
// donde se hizo el movimiento y marca la venta como anulada (no se borra,
// para dejar el historial completo).
export async function POST(request, { params }) {
  try {
    const { id } = await params;

    const [venta] = await sql`
      SELECT id, anulada, (creado_en::date = CURRENT_DATE) AS es_hoy
      FROM ventas
      WHERE id = ${id}
    `;
    if (!venta) {
      return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
    }
    if (venta.anulada) {
      return NextResponse.json({ ok: false, error: 'Esta venta ya está anulada' }, { status: 409 });
    }
    if (!venta.es_hoy) {
      return NextResponse.json({ ok: false, error: 'Solo se pueden anular ventas del día actual' }, { status: 409 });
    }

    const movimientos = await sql`
      SELECT producto_id, bodega_id, cantidad
      FROM movimientos_stock
      WHERE venta_id = ${id} AND tipo = 'venta'
    `;

    for (const m of movimientos) {
      await sql`
        UPDATE stock SET cantidad = cantidad + ${m.cantidad}
        WHERE producto_id = ${m.producto_id} AND bodega_id = ${m.bodega_id}
      `;
    }

    await sql`
      UPDATE ventas SET anulada = true, anulada_en = now()
      WHERE id = ${id}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
