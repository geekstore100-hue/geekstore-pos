import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { asegurarVerificacion, requeridosPorProducto, estaCompleta } from '../../../../../lib/verificacionDistribuidor';

export const dynamic = 'force-dynamic';

// Verificación del pedido de un distribuidor (nov 2026, ver
// lib/verificacionDistribuidor.js).
// POST { producto_id, cantidad } → unidades de ese producto que ya están en
//                                  la caja (se guarda el número, no +1, para
//                                  que tocar dos veces no sume doble).
// POST { reiniciar: true }       → empieza la verificación de cero.
// Responde { ok, verificacion, completa }.
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    await asegurarVerificacion();
    const [c] = await sql`SELECT id, verificacion FROM cotizaciones_distribuidor WHERE id = ${id}`;
    if (!c) return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    const items = await sql`SELECT producto_id, cantidad FROM cotizacion_distribuidor_items WHERE cotizacion_id = ${id}`;
    const req = requeridosPorProducto(items);

    let verificacion = c.verificacion && typeof c.verificacion === 'object' ? { ...c.verificacion } : {};
    verificacion.items = { ...(verificacion.items || {}) };

    if (body.reiniciar === true) {
      verificacion = { items: {} };
    } else {
      const pid = String(Number(body.producto_id) || '');
      if (!pid || !(pid in req)) {
        return NextResponse.json({ ok: false, error: 'Ese producto no está en el pedido' }, { status: 400 });
      }
      const n = Math.max(0, Math.min(req[pid], Math.floor(Number(body.cantidad) || 0)));
      verificacion.items[pid] = n;
    }

    const completa = estaCompleta(items, verificacion);
    verificacion.completa_en = completa ? verificacion.completa_en || new Date().toISOString() : null;
    verificacion.actualizada_en = new Date().toISOString();

    await sql`UPDATE cotizaciones_distribuidor SET verificacion = ${JSON.stringify(verificacion)}::jsonb WHERE id = ${id}`;
    return NextResponse.json({ ok: true, verificacion, completa });
  } catch (error) {
    console.error('[verificar pedido distribuidor]', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
