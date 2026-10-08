import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  leerCupon,
  reservarCompra,
  usarCompra,
  cuponPublico,
  existeTablaCupones,
  ErrorCupon,
} from '../../../../lib/cupones';

// Cupones para la TIENDA (geekstore.com.co), servidor a servidor. Está
// bajo /api/publico (sin sesión del POS), pero exige la clave compartida
// en el encabezado x-cupones-clave: CUPONES_CLAVE, o si no existe,
// ESTADISTICAS_CLAVE (la misma que ya tienen las dos páginas en Netlify).
//
// POST { accion, codigo, referencia?, total?, descuento? }
//   consultar → reglas y estado del cupón (para mostrarlo en el carrito).
//   reservar  → justo antes de abrir el pago: revisa que se pueda usar.
//   usar      → el webhook de Wompi lo llama cuando el pago se aprueba.

function claveValida(request) {
  const esperada = process.env.CUPONES_CLAVE || process.env.ESTADISTICAS_CLAVE;
  const recibida = request.headers.get('x-cupones-clave') || '';
  if (!esperada || !recibida) return false;
  const a = Buffer.from(String(esperada));
  const b = Buffer.from(String(recibida));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  if (!claveValida(request)) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  try {
    if (!(await existeTablaCupones())) return NextResponse.json({ ok: false, error: 'Cupones no disponibles' }, { status: 503 });
    const { accion, codigo, referencia, total, descuento } = await request.json();

    if (accion === 'consultar') {
      const c = await leerCupon(codigo);
      if (!c) return NextResponse.json({ ok: false, error: 'Ese cupón no existe. Revisa el código.' }, { status: 404 });
      return NextResponse.json({ ok: true, cupon: cuponPublico(c) });
    }
    if (accion === 'reservar') {
      if (!referencia) return NextResponse.json({ ok: false, error: 'Falta la referencia' }, { status: 400 });
      const c = await reservarCompra(codigo, referencia);
      return NextResponse.json({ ok: true, cupon: cuponPublico(c) });
    }
    if (accion === 'usar') {
      const r = await usarCompra(codigo, { donde: 'web', referencia, total, descuento });
      return NextResponse.json({ ok: true, repetido: Boolean(r.repetido) });
    }
    return NextResponse.json({ ok: false, error: 'Acción inválida' }, { status: 400 });
  } catch (error) {
    if (error instanceof ErrorCupon) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
