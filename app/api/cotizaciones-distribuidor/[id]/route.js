import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Detalle de una cotización puntual (para verla/imprimirla), y marcarla
// como facturada o volverla a dejar pendiente (control manual de
// Nelson — no dispara ninguna factura ni venta real, es solo un estado).

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const [cotizacion] = await sql`
      SELECT id, numero, distribuidor_nombre, distribuidor_cedula, total, estado, creado_en, facturada_en
      FROM cotizaciones_distribuidor
      WHERE id = ${id}
    `;
    if (!cotizacion) {
      return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    }
    const items = await sql`
      SELECT id, referencia, nombre, cantidad, precio_unitario, subtotal
      FROM cotizacion_distribuidor_items
      WHERE cotizacion_id = ${id}
      ORDER BY id ASC
    `;
    return NextResponse.json({ ok: true, cotizacion: { ...cotizacion, items } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { estado } = await request.json();
    if (estado !== 'pendiente' && estado !== 'facturada') {
      return NextResponse.json({ ok: false, error: 'Estado inválido' }, { status: 400 });
    }
    const [cotizacion] = await sql`
      UPDATE cotizaciones_distribuidor SET
        estado = ${estado},
        facturada_en = ${estado === 'facturada' ? new Date() : null}
      WHERE id = ${id}
      RETURNING id, numero, estado, facturada_en
    `;
    if (!cotizacion) {
      return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, cotizacion });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
