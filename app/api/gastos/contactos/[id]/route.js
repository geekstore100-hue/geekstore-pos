import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { tablaGastos, limpiarContacto } from '../../../../../lib/gastos';

// Editar o quitar un contacto de "Pagado a" (nov 2026). Los gastos ya
// registrados no cambian: guardan su propia copia del nombre y documento.
//   PUT { nombre, documento, telefono } → edita.   DELETE → lo quita de la lista.

export async function PUT(request, { params }) {
  try {
    await tablaGastos();
    const { id } = await params;
    const c = limpiarContacto(await request.json().catch(() => ({})));
    if (!c.nombre) return NextResponse.json({ ok: false, error: 'Escribe el nombre' }, { status: 400 });
    const [otro] = await sql`SELECT id FROM gastos_contactos WHERE lower(nombre) = lower(${c.nombre}) AND id <> ${Number(id) || 0}`;
    if (otro) return NextResponse.json({ ok: false, error: 'Ya hay otro contacto con ese nombre' }, { status: 409 });
    const [e] = await sql`
      UPDATE gastos_contactos SET nombre = ${c.nombre}, documento = ${c.documento}, telefono = ${c.telefono}
      WHERE id = ${Number(id) || 0} RETURNING id, nombre, documento, telefono
    `;
    if (!e) return NextResponse.json({ ok: false, error: 'Contacto no encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true, contacto: e });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await tablaGastos();
    const { id } = await params;
    await sql`UPDATE gastos_contactos SET activo = false WHERE id = ${Number(id) || 0}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
