import { NextResponse } from 'next/server';
import sql from '../../../lib/db';
import { CAMPANA, crearCupon, existeTablaCupones, ErrorCupon, MENSAJE_MIGRACION } from '../../../lib/cupones';

// Cupones (octubre 2026). Ver lib/cupones.js.
//   GET  ?campana=X → cupones de la campaña con sus números (entregados,
//                     usados en la web / en la tienda / en servicio técnico).
//   POST            → entregar un cupón { telefono?, nombre?, venta_id? }.
//                     Un celular recibe un solo cupón por campaña.

export async function GET(request) {
  try {
    if (!(await existeTablaCupones())) {
      return NextResponse.json({ ok: true, faltaMigracion: true, mensaje: MENSAJE_MIGRACION, cupones: [], campanas: [], campana: CAMPANA.nombre });
    }
    const campana = new URL(request.url).searchParams.get('campana') || CAMPANA.nombre;
    const campanas = await sql`SELECT campana, COUNT(*)::int AS n FROM cupones GROUP BY campana ORDER BY MAX(creado_en) DESC`;
    const cupones = await sql`
      SELECT id, codigo, cliente_nombre, cliente_telefono, venta_id, creado_en,
             compra_usada_en, compra_donde, compra_ref, compra_descuento, compra_total,
             servicio_usado_en, servicio_ref, servicio_total, servicio_bono, servicio_nota
      FROM cupones WHERE campana = ${campana}
      ORDER BY creado_en DESC, id DESC
    `;
    const n = (x) => Number(x || 0);
    const compraWeb = cupones.filter((c) => c.compra_usada_en && c.compra_donde === 'web');
    const compraTienda = cupones.filter((c) => c.compra_usada_en && c.compra_donde !== 'web');
    const servicio = cupones.filter((c) => c.servicio_usado_en);
    return NextResponse.json({
      ok: true,
      campana,
      campanas,
      config: campana === CAMPANA.nombre ? CAMPANA : null,
      resumen: {
        entregados: cupones.length,
        conCelular: cupones.filter((c) => c.cliente_telefono).length,
        conCompraEnStand: cupones.filter((c) => c.venta_id).length,
        compraWeb: { usados: compraWeb.length, ventas: compraWeb.reduce((a, c) => a + n(c.compra_total), 0), descuentos: compraWeb.reduce((a, c) => a + n(c.compra_descuento), 0) },
        compraTienda: { usados: compraTienda.length, ventas: compraTienda.reduce((a, c) => a + n(c.compra_total), 0), descuentos: compraTienda.reduce((a, c) => a + n(c.compra_descuento), 0) },
        servicio: { usados: servicio.length, ventas: servicio.reduce((a, c) => a + n(c.servicio_total), 0), bonos: servicio.reduce((a, c) => a + Math.min(n(c.servicio_bono), n(c.servicio_total)), 0) },
      },
      cupones,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await existeTablaCupones())) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    const body = await request.json();
    const { cupon, existente } = await crearCupon({ telefono: body.telefono, nombre: body.nombre, ventaId: body.venta_id });
    return NextResponse.json({ ok: true, cupon, existente });
  } catch (error) {
    if (error instanceof ErrorCupon) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
