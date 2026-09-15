import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const { referencia, nombre, descripcion, categoria, precio_venta, precio_costo, activo } = data;

    await sql`
      UPDATE productos SET
        referencia = ${referencia},
        nombre = ${nombre},
        descripcion = ${descripcion || null},
        categoria = ${categoria || null},
        precio_venta = ${precio_venta || null},
        precio_costo = ${precio_costo || null},
        activo = ${activo !== false},
        actualizado_en = now()
      WHERE id = ${id}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
