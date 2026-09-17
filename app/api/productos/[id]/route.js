import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      referencia,
      nombre,
      descripcion,
      categoria_id,
      subcategoria_id,
      precio_venta,
      precio_costo,
      precio_distribuidor,
      activo,
    } = body;

    if (!referencia || !referencia.trim()) {
      return NextResponse.json({ ok: false, error: 'La referencia es obligatoria' }, { status: 400 });
    }
    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const [producto] = await sql`
      UPDATE productos SET
        referencia = ${referencia.trim()},
        nombre = ${nombre.trim()},
        descripcion = ${descripcion || null},
        categoria_id = ${categoria_id || null},
        subcategoria_id = ${subcategoria_id || null},
        precio_venta = ${precio_venta || null},
        precio_costo = ${precio_costo || null},
        precio_distribuidor = ${precio_distribuidor || null},
        activo = ${activo === undefined ? true : activo},
        actualizado_en = now()
      WHERE id = ${id}
      RETURNING id
    `;

    if (!producto) {
      return NextResponse.json({ ok: false, error: 'Producto no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, producto });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return NextResponse.json({ ok: false, error: 'Ya existe un producto con esa referencia' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
