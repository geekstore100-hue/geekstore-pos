import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const [venta] = await sql`
      SELECT v.id, v.total, v.medio_pago, ve.nombre AS vendedor_nombre, v.creado_en
      FROM ventas v
      LEFT JOIN vendedores ve ON ve.id = v.vendedor_id
      WHERE v.id = ${id}
    `;
    if (!venta) {
      return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
    }

    const items = await sql`
      SELECT p.referencia, p.nombre, m.cantidad, m.precio_unitario, m.descuento_porcentaje
      FROM movimientos_stock m
      JOIN productos p ON p.id = m.producto_id
      WHERE m.venta_id = ${id}
      ORDER BY m.id ASC
    `;

    return NextResponse.json({ ok: true, venta, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
