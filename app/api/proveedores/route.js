import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET() {
  try {
    const proveedores = await sql`
      SELECT id, nombre, identificacion, telefono
      FROM proveedores
      ORDER BY nombre ASC
    `;
    return NextResponse.json({ ok: true, proveedores });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { nombre, identificacion, telefono } = await request.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre del proveedor es obligatorio' }, { status: 400 });
    }

    const [proveedor] = await sql`
      INSERT INTO proveedores (nombre, identificacion, telefono)
      VALUES (${nombre.trim()}, ${identificacion || null}, ${telefono || null})
      RETURNING id, nombre, identificacion, telefono
    `;

    return NextResponse.json({ ok: true, proveedor });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
