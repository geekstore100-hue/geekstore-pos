import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET() {
  try {
    const proveedores = await sql`
      SELECT id, nombre, identificacion, tipo_identificacion, telefono, correo, direccion, ciudad
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
    const { nombre, identificacion, tipo_identificacion, telefono, correo, direccion, ciudad } = await request.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre del proveedor es obligatorio' }, { status: 400 });
    }
    if (!identificacion || !String(identificacion).trim()) {
      return NextResponse.json({ ok: false, error: 'La identificación del proveedor es obligatoria' }, { status: 400 });
    }

    const [proveedor] = await sql`
      INSERT INTO proveedores (nombre, identificacion, tipo_identificacion, telefono, correo, direccion, ciudad)
      VALUES (
        ${nombre.trim()},
        ${String(identificacion).trim()},
        ${tipo_identificacion || 'CC'},
        ${telefono || null},
        ${correo || null},
        ${direccion || null},
        ${ciudad || null}
      )
      RETURNING id, nombre, identificacion, tipo_identificacion, telefono, correo, direccion, ciudad
    `;

    return NextResponse.json({ ok: true, proveedor });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
