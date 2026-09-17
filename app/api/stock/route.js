import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const bodegaId = searchParams.get('bodega_id');

    if (!bodegaId) {
      return NextResponse.json({ ok: false, error: 'Falta la bodega' }, { status: 400 });
    }

    // LEFT JOIN para que un producto sin fila en "stock" todavía (creado antes de
    // que existiera el auto-registro por bodega) aparezca igual con cantidad 0.
    const stock = await sql`
      SELECT p.id AS producto_id, COALESCE(s.cantidad, 0) AS cantidad
      FROM productos p
      LEFT JOIN stock s ON s.producto_id = p.id AND s.bodega_id = ${bodegaId}
    `;

    return NextResponse.json({ ok: true, stock });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
