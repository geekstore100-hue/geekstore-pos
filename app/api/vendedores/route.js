import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET() {
  try {
    const vendedores = await sql`
      SELECT id, nombre, activo
      FROM vendedores
      ORDER BY nombre ASC
    `;
    return NextResponse.json({ ok: true, vendedores });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { nombre } = await request.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre del vendedor es obligatorio' }, { status: 400 });
    }

    const [vendedor] = await sql`
      INSERT INTO vendedores (nombre, activo)
      VALUES (${nombre.trim()}, true)
      RETURNING id, nombre, activo
    `;

    return NextResponse.json({ ok: true, vendedor });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
