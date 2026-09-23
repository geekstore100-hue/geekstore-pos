import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Administración de distribuidores (quién puede entrar al portal de
// mayoristas de la tienda). Protegida por el middleware normal del POS
// (sesión de administrador) — nada que ver con /api/publico/distribuidores.

export async function GET() {
  try {
    const distribuidores = await sql`
      SELECT id, cedula, nombre, activo, creado_en
      FROM distribuidores
      ORDER BY nombre ASC
    `;
    return NextResponse.json({ ok: true, distribuidores });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { cedula, nombre } = await request.json();
    if (!cedula || !String(cedula).trim()) {
      return NextResponse.json({ ok: false, error: 'La cédula es obligatoria' }, { status: 400 });
    }
    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre es obligatorio' }, { status: 400 });
    }
    const [distribuidor] = await sql`
      INSERT INTO distribuidores (cedula, nombre)
      VALUES (${String(cedula).trim()}, ${nombre.trim()})
      RETURNING id, cedula, nombre, activo, creado_en
    `;
    return NextResponse.json({ ok: true, distribuidor });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return NextResponse.json({ ok: false, error: 'Ya existe un distribuidor con esa cédula' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
