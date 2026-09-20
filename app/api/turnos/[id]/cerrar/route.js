import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// Cierra el turno dejando guardado el dinero real contado y las observaciones.
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { dinero_real_caja, observaciones } = body;

    const [turno] = await sql`SELECT id, estado FROM turnos WHERE id = ${id}`;
    if (!turno) {
      return NextResponse.json({ ok: false, error: 'Turno no encontrado' }, { status: 404 });
    }
    if (turno.estado !== 'abierto') {
      return NextResponse.json({ ok: false, error: 'Este turno ya está cerrado' }, { status: 409 });
    }

    await sql`
      UPDATE turnos
      SET estado = 'cerrado',
          cerrado_en = now(),
          dinero_real_caja = ${dinero_real_caja === undefined || dinero_real_caja === '' ? null : Number(dinero_real_caja)},
          observaciones = ${observaciones || null}
      WHERE id = ${id}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
