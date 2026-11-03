import { NextResponse } from 'next/server';
import { existeTablaCupones, listarCampanas, guardarCampana, activarCampana, ErrorCupon, MENSAJE_MIGRACION } from '../../../../lib/cupones';

// Campañas de cupones personalizadas (oct 2026). Ver lib/cupones.js.
//   GET  → todas las campañas (la activa primero) con cuántos cupones tienen.
//   POST { accion: 'guardar', id?, nombreAnterior?, nombre, prefijo, compra_tipo,
//          compra_porcentaje, compra_monto, compra_tope, compra_minimo,
//          compra_excluir, valido_desde, valido_hasta, mensaje,
//          servicio_bono, servicio_minimo, servicio_garantia }
//        { accion: 'activar', id } → la usa "🎟️ Dar cupón" de Venta rápida.

export async function GET() {
  try {
    if (!(await existeTablaCupones())) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    return NextResponse.json({ ok: true, campanas: await listarCampanas() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await existeTablaCupones())) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    const body = await request.json();
    if (body.accion === 'activar') {
      if (!Number(body.id)) throw new ErrorCupon('Falta la campaña');
      await activarCampana(body.id);
      return NextResponse.json({ ok: true, campanas: await listarCampanas() });
    }
    if (body.accion === 'guardar') {
      const campana = await guardarCampana(body);
      return NextResponse.json({ ok: true, campana, campanas: await listarCampanas() });
    }
    return NextResponse.json({ ok: false, error: 'Acción inválida' }, { status: 400 });
  } catch (error) {
    if (error instanceof ErrorCupon) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
