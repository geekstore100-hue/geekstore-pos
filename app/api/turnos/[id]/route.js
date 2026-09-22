import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Solo cuentan las ventas de ESE turno que no hayan sido anuladas. El
// "dinero esperado en caja" solo suma el efectivo (base inicial + ventas en
// efectivo - devoluciones de dinero): las ventas por tarjeta o transferencia
// no meten billetes a la caja física, así que no se cuentan ahí. Las
// devoluciones son siempre en efectivo (así se maneja el módulo de
// devoluciones) y se cuentan por fecha de la devolución, sin importar en
// qué turno se hizo la venta original.
async function calcularResumen(turno) {
  const ventas = await sql`
    SELECT id, total FROM ventas
    WHERE turno_id = ${turno.id} AND anulada = false
  `;
  const totalVentas = ventas.reduce((acc, v) => acc + Number(v.total), 0);

  // El efectivo/tarjeta/transferencia/otro se suma desde pagos_venta (no
  // desde ventas.medio_pago directo), porque una venta puede estar pagada
  // con más de un medio a la vez (pago combinado) y cada parte tiene que
  // contarse en su propio medio, no el total completo de la venta.
  const pagos = await sql`
    SELECT pv.medio_pago, pv.monto
    FROM pagos_venta pv
    JOIN ventas v ON v.id = pv.venta_id
    WHERE v.turno_id = ${turno.id} AND v.anulada = false
  `;

  const sumaPor = (medio) =>
    pagos.filter((p) => p.medio_pago === medio).reduce((acc, p) => acc + Number(p.monto), 0);

  const ventasEfectivo = sumaPor('Efectivo');
  const ventasTarjeta = sumaPor('Tarjeta');
  const ventasTransferencia = sumaPor('Transferencia');
  const ventasOtro = sumaPor('Otro');

  const [{ total_devuelto }] = await sql`
    SELECT COALESCE(SUM(monto), 0) AS total_devuelto FROM devoluciones WHERE turno_id = ${turno.id}
  `;
  const devolucionDinero = Number(total_devuelto);

  const baseInicial = Number(turno.base_inicial);
  const dineroEsperado = baseInicial + ventasEfectivo - devolucionDinero;

  return {
    baseInicial,
    totalVentas,
    ventasEfectivo,
    ventasTarjeta,
    ventasTransferencia,
    ventasOtro,
    devolucionDinero,
    dineroEsperado,
  };
}

// Resumen del turno (sirve tanto para verlo abierto como ya cerrado).
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const [turno] = await sql`SELECT * FROM turnos WHERE id = ${id}`;
    if (!turno) {
      return NextResponse.json({ ok: false, error: 'Turno no encontrado' }, { status: 404 });
    }
    const resumen = await calcularResumen(turno);
    return NextResponse.json({ ok: true, turno, resumen });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
