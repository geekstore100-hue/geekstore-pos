import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET() {
  try {
    const categorias = await sql`
      SELECT id, nombre
      FROM categorias
      ORDER BY nombre ASC
    `;
    return NextResponse.json({ ok: true, categorias });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { nombre } = await request.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre de la categoría es obligatorio' }, { status: 400 });
    }

    const [categoria] = await sql`
      INSERT INTO categorias (nombre)
      VALUES (${nombre.trim()})
      RETURNING id, nombre
    `;

    return NextResponse.json({ ok: true, categoria });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return NextResponse.json({ ok: false, error: 'Ya existe una categoría con ese nombre' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
