import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { tablaGastos, limpiarContacto } from '../../../../lib/gastos';

// Contactos de "Pagado a" en Gastos del negocio (nov 2026, lib/gastos.js).
//   GET → todos los activos.   POST { nombre, documento, telefono } → crea uno.

export async function GET() {
  try {
    await tablaGastos();
    const contactos = await sql`SELECT id, nombre, documento, telefono FROM gastos_contactos WHERE activo = true ORDER BY lower(nombre)`;
    return NextResponse.json({ ok: true, contactos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await tablaGastos();
    const c = limpiarContacto(await request.json().catch(() => ({})));
    if (!c.nombre) return NextResponse.json({ ok: false, error: 'Escribe el nombre de la persona o empresa' }, { status: 400 });
    const [ya] = await sql`SELECT id, nombre, documento, telefono, activo FROM gastos_contactos WHERE lower(nombre) = lower(${c.nombre})`;
    if (ya) {
      if (!ya.activo) await sql`UPDATE gastos_contactos SET activo = true WHERE id = ${ya.id}`;
      return NextResponse.json({ ok: true, contacto: { id: ya.id, nombre: ya.nombre, documento: ya.documento, telefono: ya.telefono }, existia: true });
    }
    const [nuevo] = await sql`
      INSERT INTO gastos_contactos (nombre, documento, telefono) VALUES (${c.nombre}, ${c.documento}, ${c.telefono})
      RETURNING id, nombre, documento, telefono
    `;
    return NextResponse.json({ ok: true, contacto: nuevo });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
