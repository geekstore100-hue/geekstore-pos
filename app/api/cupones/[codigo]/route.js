import { NextResponse } from 'next/server';
import {
  leerCupon,
  usarCompra,
  usarServicio,
  descuentoCompra,
  estadoVigencia,
  existeTablaCupones,
  ErrorCupon,
  MENSAJE_MIGRACION,
} from '../../../../lib/cupones';

// Un cupón puntual (pantalla Cupones del POS).
//   GET  → ver el cupón y qué beneficios le quedan.
//   POST → canjear un beneficio en el local:
//          { tipo: 'servicio', total, referencia, nota }  (bono de servicio técnico)
//          { tipo: 'compra', total, referencia }           (descuento de compra en la tienda física)
//          El descuento en sí se hace en Vender / en la cotización; aquí
//          queda registrado que el cupón ya se usó y por cuánto.

export async function GET(request, { params }) {
  try {
    if (!(await existeTablaCupones())) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    const { codigo } = await params;
    const c = await leerCupon(decodeURIComponent(codigo));
    if (!c) return NextResponse.json({ ok: false, error: 'Ese cupón no existe. Revisa el código.' }, { status: 404 });
    return NextResponse.json({ ok: true, cupon: { ...c, vigencia: estadoVigencia(c) } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    if (!(await existeTablaCupones())) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    const { codigo } = await params;
    const body = await request.json();
    if (body.tipo === 'servicio') {
      const r = await usarServicio(decodeURIComponent(codigo), { total: body.total, referencia: body.referencia, nota: body.nota });
      return NextResponse.json({ ok: true, bono: r.bono, cupon: r.cupon });
    }
    if (body.tipo === 'compra') {
      const c = await leerCupon(decodeURIComponent(codigo));
      if (!c) throw new ErrorCupon('Ese cupón no existe', 404);
      const total = Math.round(Number(body.total) || 0);
      if (!(total > 0)) throw new ErrorCupon('Escribe el valor de la compra (sin consolas)');
      const r = await usarCompra(c.codigo, { donde: 'tienda', referencia: body.referencia, total, descuento: descuentoCompra(c, total) });
      return NextResponse.json({ ok: true, descuento: r.descuento, cupon: r.cupon });
    }
    return NextResponse.json({ ok: false, error: 'Tipo de canje inválido' }, { status: 400 });
  } catch (error) {
    if (error instanceof ErrorCupon) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
