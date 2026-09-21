import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Detalle de un traspaso (documento) para el documento imprimible: cabecera
// con las bodegas y el valor total, y las líneas de productos que llegaron a
// la bodega destino (con lo que ya había antes, para poder verificar).
export async function GET(request, { params }) {
  try {
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Traspaso inválido' }, { status: 400 });
    }

    const [traspaso] = await sql`
      SELECT
        t.id,
        t.creado_en,
        t.observaciones,
        t.valor_total,
        t.estado_pago,
        t.pagado_en,
        t.bodega_destino_id,
        bo.nombre AS bodega_origen_nombre,
        bd.nombre AS bodega_destino_nombre
      FROM traspasos_inventario t
      JOIN bodegas bo ON bo.id = t.bodega_origen_id
      JOIN bodegas bd ON bd.id = t.bodega_destino_id
      WHERE t.id = ${id}
    `;
    if (!traspaso) {
      return NextResponse.json({ ok: false, error: 'Traspaso no encontrado' }, { status: 404 });
    }

    // Las líneas que llegaron a la bodega destino pueden venir de dos formas:
    // 'traspaso_entrada' (traspaso creado directamente) o 'ajuste_incremento'
    // (traspaso confirmado a través de la pantalla de Ajustes de Inventario).
    // Filtrar por la bodega destino en vez del tipo cubre ambos casos.
    const items = await sql`
      SELECT
        p.referencia,
        p.nombre,
        me.cantidad,
        me.precio_unitario,
        me.stock_antes
      FROM movimientos_stock me
      JOIN productos p ON p.id = me.producto_id
      WHERE me.traspaso_id = ${id}
        AND me.bodega_id = ${traspaso.bodega_destino_id}
        AND me.tipo IN ('traspaso_entrada', 'ajuste_incremento')
      ORDER BY p.nombre ASC
    `;

    return NextResponse.json({ ok: true, traspaso, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
