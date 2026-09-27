import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { calcularResumen } from '../../../../lib/resumenTurno';

// Resumen del turno (sirve tanto para verlo abierto como ya cerrado). El
// cálculo está en lib/resumenTurno.js porque también lo usa el cierre.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const [turno] = await sql`SELECT * FROM turnos WHERE id = ${id}`;
    if (!turno) {
      return NextResponse.json({ ok: false, error: 'Turno no encontrado' }, { status: 404 });
    }
    const resumen = await calcularResumen(turno);
    return NextResponse.json({ ok: true, turno, resumen });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
