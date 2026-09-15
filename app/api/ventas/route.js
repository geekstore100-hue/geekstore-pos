import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

async function bodegaKennedyId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Kennedy'`;
  return b?.id;
}

export async function GET() {
  try {
    const ventas = await sql`
      SELECT m.id, m.cantidad, m.nota, m.creado_en, p.referencia, p.nombre
      FROM movimientos_stock m
      JOIN productos p ON p.id = m.producto_id
      WHERE m.tipo = 'venta' AND m.creado_en >= CURRENT_DATE
      ORDER BY m.creado_en DESC
    `;
    return NextResponse.json({ ok: true, ventas });
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

    const [producto] = await sql`SELECT precio_venta FROM productos WHERE id = ${producto_id}`;

    const actualizado = await sql`
      UPDATE stock SET cantidad = cantidad - ${cantidad}
      WHERE producto_id = ${producto_id} AND bodega_id = ${bodegaId} AND cantidad >= ${cantidad}
      RETURNING cantidad
    `;

    if (actualizado.length === 0) {
      return NextResponse.json({ ok: false, error: 'Stock insuficiente para esa cantidad' }, { status: 409 });
    }

    await sql`
      INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, nota, precio_unitario)
      VALUES (${producto_id}, ${bodegaId}, 'venta', ${cantidad}, ${nota || null}, ${producto?.precio_venta ?? null})
    `;

    return NextResponse.json({ ok: true, stock: actualizado[0].cantidad });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
