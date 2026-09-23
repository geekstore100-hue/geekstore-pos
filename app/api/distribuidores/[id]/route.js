import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Activar/desactivar o editar un distribuidor, y eliminarlo. Desactivar
// (en vez de eliminar) es lo normal: así no pierde acceso alguien "de
// paso" pero queda el historial de sus cotizaciones viejas intacto.

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { activo, nombre, cedula } = await request.json();
    const [actual] = await sql`SELECT id FROM distribuidores WHERE id = ${id}`;
    if (!actual) {
      return NextResponse.json({ ok: false, error: 'Distribuidor no encontrado' }, { status: 404 });
    }
    const [distribuidor] = await sql`
      UPDATE distribuidores SET
        activo = COALESCE(${activo ?? null}, activo),
        nombre = COALESCE(${nombre?.trim() || null}, nombre),
        cedula = COALESCE(${cedula ? String(cedula).trim() : null}, cedula)
      WHERE id = ${id}
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

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await sql`DELETE FROM distribuidores WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
