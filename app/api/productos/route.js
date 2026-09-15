import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET() {
  try {
    const productos = await sql`
      SELECT
        p.id,
        p.referencia,
        p.nombre,
        p.descripcion,
        p.categoria,
        p.precio_venta,
        p.precio_costo,
        p.activo,
        COALESCE(s.cantidad, 0) AS stock
      FROM productos p
      LEFT JOIN bodegas b ON b.nombre = 'Kennedy'
      LEFT JOIN stock s ON s.producto_id = p.id AND s.bodega_id = b.id
      ORDER BY p.nombre ASC
    `;
    return NextResponse.json({ ok: true, productos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { referencia, nombre, descripcion, categoria, precio_venta, precio_costo, activo } = data;

    if (!referencia || !nombre) {
      return NextResponse.json({ ok: false, error: 'Referencia y nombre son obligatorios' }, { status: 400 });
    }

    const [producto] = await sql`
      INSERT INTO productos (referencia, nombre, descripcion, categoria, precio_venta, precio_costo, activo)
      VALUES (${referencia}, ${nombre}, ${descripcion || null}, ${categoria || null}, ${precio_venta || null}, ${precio_costo || null}, ${activo !== false})
      RETURNING id
    `;

    const [kennedy] = await sql`SELECT id FROM bodegas WHERE nombre = 'Kennedy'`;
    if (kennedy) {
      await sql`
        INSERT INTO stock (producto_id, bodega_id, cantidad)
        VALUES (${producto.id}, ${kennedy.id}, 0)
        ON CONFLICT (producto_id, bodega_id) DO NOTHING
      `;
    }

    return NextResponse.json({ ok: true, id: producto.id });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return NextResponse.json({ ok: false, error: 'Ya existe un producto con esa referencia' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
