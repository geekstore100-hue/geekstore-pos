import { NextResponse } from 'next/server';
import { existeTablaCupones, crearLote, ErrorCupon, MENSAJE_MIGRACION } from '../../../../lib/cupones';

// Varios cupones de una campaña de una sola vez (oct 2026).
//   POST { campana, cantidad } → { cupones: [...] } (máximo 500 por vez).
// Cada uno tiene su propio código y se usa una sola vez.

export async function POST(request) {
  try {
    if (!(await existeTablaCupones())) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    const body = await request.json();
    if (!body.campana) throw new ErrorCupon('Elige la campaña');
    const cupones = await crearLote({ campana: body.campana, cantidad: body.cantidad });
    return NextResponse.json({ ok: true, cupones });
  } catch (error) {
    if (error instanceof ErrorCupon) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
