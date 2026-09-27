import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { calcularResumen } from '../../../../../lib/resumenTurno';

// Cierra el turno dejando guardado el dinero real contado y las
// observaciones. Devuelve el resumen final del turno (total de ventas, por
// medio de pago, dinero esperado) calculado en el momento exacto del
// cierre, para mostrarlo en pantalla apenas se cierra.
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

    const [cerrado] = await sql`
      UPDATE turnos
      SET estado = 'cerrado',
          cerrado_en = now(),
          dinero_real_caja = ${dinero_real_caja === undefined || dinero_real_caja === '' ? null : Number(dinero_real_caja)},
          observaciones = ${observaciones || null}
      WHERE id = ${id}
      RETURNING *
    `;

    const resumen = await calcularResumen(cerrado);
    return NextResponse.json({ ok: true, turno: cerrado, resumen });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
