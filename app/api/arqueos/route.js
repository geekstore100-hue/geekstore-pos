import { NextResponse } from 'next/server';
import sql from '../../../lib/db';
import { calcularResumen } from '../../../lib/resumenTurno';

// Arqueos de caja (conteo del efectivo a mitad de turno).

// GET ?turno_id=X: los arqueos de un turno (para el historial de turnos).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const turnoId = Number(searchParams.get('turno_id'));
    if (!turnoId) {
      return NextResponse.json({ ok: false, error: 'Falta el turno' }, { status: 400 });
    }
    const arqueos = await sql`
      SELECT a.id, a.dinero_esperado, a.dinero_contado, a.diferencia, a.observaciones, a.programado, a.creado_en,
             ve.nombre AS vendedor_nombre
      FROM arqueos_caja a
      LEFT JOIN vendedores ve ON ve.id = a.vendedor_id
      WHERE a.turno_id = ${turnoId}
      ORDER BY a.creado_en ASC
    `;
    return NextResponse.json({ ok: true, arqueos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// POST: registra un arqueo del turno abierto. body: { dinero_contado,
// vendedor_id, observaciones, programado }. El dinero esperado lo calcula
// el servidor en este momento (base + ventas en efectivo - devoluciones),
// nunca se confía en un valor que mande el navegador.
export async function POST(request) {
  try {
    const body = await request.json();
    const contadoTexto = body.dinero_contado;
    const dineroContado = Number(contadoTexto);
    if (contadoTexto === '' || contadoTexto === null || contadoTexto === undefined || !Number.isFinite(dineroContado) || dineroContado < 0) {
      return NextResponse.json({ ok: false, error: 'Escribe cuánto efectivo contaste en la caja' }, { status: 400 });
    }
    const vendedorId = body.vendedor_id ? Number(body.vendedor_id) : null;
    const observaciones = String(body.observaciones || '').trim() || null;
    const programado = Boolean(body.programado);

    const [turno] = await sql`SELECT * FROM turnos WHERE estado = 'abierto' LIMIT 1`;
    if (!turno) {
      return NextResponse.json({ ok: false, error: 'No hay un turno abierto' }, { status: 409 });
    }

    const resumen = await calcularResumen(turno);
    const dineroEsperado = resumen.dineroEsperado;
    const diferencia = dineroContado - dineroEsperado;

    const [arqueo] = await sql`
      INSERT INTO arqueos_caja (turno_id, vendedor_id, dinero_esperado, dinero_contado, diferencia, observaciones, programado)
      VALUES (${turno.id}, ${vendedorId}, ${dineroEsperado}, ${dineroContado}, ${diferencia}, ${observaciones}, ${programado})
      RETURNING id, creado_en
    `;

    return NextResponse.json({
      ok: true,
      arqueo: { id: arqueo.id, creado_en: arqueo.creado_en, dinero_esperado: dineroEsperado, dinero_contado: dineroContado, diferencia },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
