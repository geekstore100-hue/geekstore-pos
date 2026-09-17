import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoriaId = searchParams.get('categoria_id');

    const subcategorias = categoriaId
      ? await sql`
          SELECT id, categoria_id, nombre
          FROM subcategorias
          WHERE categoria_id = ${categoriaId}
          ORDER BY nombre ASC
        `
      : await sql`
          SELECT id, categoria_id, nombre
          FROM subcategorias
          ORDER BY nombre ASC
        `;

    return NextResponse.json({ ok: true, subcategorias });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { categoria_id, nombre } = await request.json();

    if (!categoria_id) {
      return NextResponse.json({ ok: false, error: 'Selecciona la categoría' }, { status: 400 });
    }
    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre de la subcategoría es obligatorio' }, { status: 400 });
    }

    const [subcategoria] = await sql`
      INSERT INTO subcategorias (categoria_id, nombre)
      VALUES (${categoria_id}, ${nombre.trim()})
      RETURNING id, categoria_id, nombre
    `;

    return NextResponse.json({ ok: true, subcategoria });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return NextResponse.json({ ok: false, error: 'Ya existe una subcategoría con ese nombre en esta categoría' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
