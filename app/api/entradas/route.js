import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

async function bodegaKennedyId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Kennedy'`;
  return b?.id;
}

export async function GET() {
  try {
    const entradas = await sql`
      SELECT m.id, m.cantidad, m.nota, m.creado_en, p.referencia, p.nombre
      FROM movimientos_stock m
      JOIN productos p ON p.id = m.producto_id
      WHERE m.tipo = 'entrada' AND m.creado_en >= CURRENT_DATE
      ORDER BY m.creado_en DESC
    `;
    return NextResponse.json({ ok: true, entradas });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { producto_id, cantidad, nota } = await request.json();

    if (!producto_id || !cantidad || cantidad <= 0) {
      return NextResponse.json({ ok: false, error: 'Producto y cantidad son obligatorios' }, { status: 400 });
    }

    const bodegaId = await bodegaKennedyId();
    if (!bodegaId) {
      return NextResponse.json({ ok: false, error: 'No existe la bodega Kennedy' }, { status: 500 });
    }

    const actualizado = await sql`
      INSERT INTO stock (producto_id, bodega_id, cantidad)
      VALUES (${producto_id}, ${bodegaId}, ${cantidad})
      ON CONFLICT (producto_id, bodega_id)
      DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
      RETURNING cantidad
    `;

    await sql`
      INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, nota)
      VALUES (${producto_id}, ${bodegaId}, 'entrada', ${cantidad}, ${nota || null})
    `;

    return NextResponse.json({ ok: true, stock: actualizado[0].cantidad });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
