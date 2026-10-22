import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { asegurarTabla, prepararCotizacion, ErrorCotizacionCliente } from '../../../../lib/cotizacionesCliente';

export const dynamic = 'force-dynamic';

function idValido(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request, { params }) {
  try {
    await asegurarTabla();
    const id = idValido((await params).id);
    if (!id) return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    const [cotizacion] = await sql`SELECT * FROM cotizaciones_cliente WHERE id = ${id}`;
    if (!cotizacion) return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    return NextResponse.json({ ok: true, cotizacion });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await asegurarTabla();
    const id = idValido((await params).id);
    if (!id) return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    const c = await prepararCotizacion(await request.json());
    const [fila] = await sql`
      UPDATE cotizaciones_cliente SET
        cliente_nombre = ${c.cliente_nombre}, cliente_documento = ${c.cliente_documento},
        cliente_telefono = ${c.cliente_telefono}, cliente_email = ${c.cliente_email},
        vendedor = ${c.vendedor}, notas = ${c.notas}, validez_dias = ${c.validez_dias},
        items = ${JSON.stringify(c.items)}::jsonb, subtotal = ${c.subtotal}, descuento = ${c.descuento},
        total = ${c.total}, editada_en = now()
      WHERE id = ${id}
      RETURNING *
    `;
    if (!fila) return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    return NextResponse.json({ ok: true, cotizacion: fila });
  } catch (error) {
    if (error instanceof ErrorCotizacionCliente) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await asegurarTabla();
    const id = idValido((await params).id);
    if (!id) return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    await sql`DELETE FROM cotizaciones_cliente WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
