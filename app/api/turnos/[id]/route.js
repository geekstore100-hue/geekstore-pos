import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Solo cuentan las ventas de ESE turno que no hayan sido anuladas. El
// "dinero esperado en caja" solo suma el efectivo (base inicial + ventas en
// efectivo): las ventas por tarjeta o transferencia no meten billetes a la
// caja física, así que no se cuentan ahí. Todavía no existe un registro de
// movimientos manuales de caja (retiros/ingresos aparte de una venta), así
// que "Devolución de dinero" queda siempre en $0 por ahora.
async function calcularResumen(turno) {
  const ventas = await sql`
    SELECT medio_pago, total FROM ventas
    WHERE turno_id = ${turno.id} AND anulada = false
  `;

  const sumaPor = (medio) =>
    ventas.filter((v) => v.medio_pago === medio).reduce((acc, v) => acc + Number(v.total), 0);

  const ventasEfectivo = sumaPor('Efectivo');
  const ventasTarjeta = sumaPor('Tarjeta');
  const ventasTransferencia = sumaPor('Transferencia');
  const ventasOtro = sumaPor('Otro');
  const totalVentas = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  const devolucionDinero = 0;
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
