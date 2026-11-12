import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { tablaGastos } from '../../../../lib/gastos';

// Un gasto (nov 2026) — ver lib/gastos.js.
//   GET → el gasto (para el comprobante de egreso).
//   POST { accion: 'anular', motivo } → lo anula (no se borra).

export async function GET(request, { params }) {
  try {
    await tablaGastos();
    const { id } = await params;
    const [gasto] = await sql`
      SELECT g.id, g.fecha::text AS fecha, g.categoria, g.concepto, g.beneficiario, g.beneficiario_doc, g.valor, g.medio_pago,
             g.de_caja, g.turno_id, g.notas, g.creado_en, g.anulado, g.anulado_en, g.motivo_anulacion
      FROM gastos g WHERE g.id = ${Number(id) || 0}
    `;
    if (!gasto) return NextResponse.json({ ok: false, error: 'Gasto no encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true, gasto });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    await tablaGastos();
    const { id } = await params;
    const b = await request.json().catch(() => ({}));
    if (b.accion !== 'anular') return NextResponse.json({ ok: false, error: 'Acción no válida' }, { status: 400 });
    const motivo = String(b.motivo || '').trim().slice(0, 200);
    if (!motivo) return NextResponse.json({ ok: false, error: 'Escribe por qué se anula' }, { status: 400 });

    const [g] = await sql`
      SELECT g.id, g.anulado, g.de_caja, t.estado AS turno_estado
      FROM gastos g LEFT JOIN turnos t ON t.id = g.turno_id
      WHERE g.id = ${Number(id) || 0}
    `;
    if (!g) return NextResponse.json({ ok: false, error: 'Gasto no encontrado' }, { status: 404 });
    if (g.anulado) return NextResponse.json({ ok: false, error: 'Este gasto ya está anulado' }, { status: 409 });
    // Si salió de la caja y ese turno ya se cerró, anularlo cambiaría un
    // cuadre que ya se entregó: no se deja.
    if (g.de_caja && g.turno_estado && g.turno_estado !== 'abierto') {
      return NextResponse.json(
        { ok: false, error: 'Este gasto salió de la caja de un turno que ya se cerró: no se puede anular sin descuadrar ese cierre.' },
        { status: 409 }
      );
    }
    const r = await sql`
      UPDATE gastos SET anulado = true, anulado_en = now(), motivo_anulacion = ${motivo}
      WHERE id = ${g.id} AND anulado = false RETURNING id
    `;
    if (!r.length) return NextResponse.json({ ok: false, error: 'Este gasto ya está anulado' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
