import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Activar/desactivar o editar un distribuidor, y eliminarlo. Desactivar
// (en vez de eliminar) es lo normal: así no pierde acceso alguien "de
// paso" pero queda el historial de sus cotizaciones viejas intacto.

// Actualiza un distribuidor. Se puede mandar solo un campo (ej. { activo })
// para el botón de activar/desactivar, o el formulario completo de edición
// (nombre, cédula, teléfono, dirección, email). A diferencia de antes, un
// campo de contacto que se manda vacío ("") SÍ se guarda vacío (se puede
// borrar un teléfono mal escrito) — solo se conserva el valor anterior
// cuando la clave ni siquiera viene en la petición.
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const [actual] = await sql`SELECT * FROM distribuidores WHERE id = ${id}`;
    if (!actual) {
      return NextResponse.json({ ok: false, error: 'Distribuidor no encontrado' }, { status: 404 });
    }

    if ('nombre' in body && !String(body.nombre || '').trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre es obligatorio' }, { status: 400 });
    }
    if ('cedula' in body && !String(body.cedula || '').trim()) {
      return NextResponse.json({ ok: false, error: 'La cédula es obligatoria' }, { status: 400 });
    }

    const activo = 'activo' in body ? Boolean(body.activo) : actual.activo;
    const nombre = 'nombre' in body ? body.nombre.trim() : actual.nombre;
    const cedula = 'cedula' in body ? String(body.cedula).trim() : actual.cedula;
    const telefono = 'telefono' in body ? (String(body.telefono || '').trim() || null) : actual.telefono;
    const direccion = 'direccion' in body ? (String(body.direccion || '').trim() || null) : actual.direccion;
    const email = 'email' in body ? (String(body.email || '').trim() || null) : actual.email;

    const [distribuidor] = await sql`
      UPDATE distribuidores SET
        activo = ${activo},
        nombre = ${nombre},
        cedula = ${cedula},
        telefono = ${telefono},
        direccion = ${direccion},
        email = ${email}
      WHERE id = ${id}
      RETURNING id, cedula, nombre, telefono, direccion, email, activo, creado_en
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
