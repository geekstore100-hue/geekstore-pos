import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const { nombre, activo } = await request.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre del vendedor es obligatorio' }, { status: 400 });
    }

    const [vendedor] = await sql`
      UPDATE vendedores
      SET nombre = ${nombre.trim()}, activo = ${activo}
      WHERE id = ${id}
      RETURNING id, nombre, activo
    `;

    if (!vendedor) {
      return NextResponse.json({ ok: false, error: 'Vendedor no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, vendedor });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
