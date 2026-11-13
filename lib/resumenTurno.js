import sql from './db';
import { hayTablaGastos } from './gastos';
import { asegurarTurnoSinBase, dineroEsperadoTurno } from './turnoSinBase';

// Resumen de un turno de caja. Lo usan la pantalla de cierre (antes de
// cerrar, para mostrar lo esperado) y el propio cierre (para devolver los
// totales finales en el momento exacto de cerrar).
//
// Solo cuentan las ventas de ESE turno que no hayan sido anuladas. El
// "dinero esperado en caja" solo suma el efectivo (ventas en efectivo -
// devoluciones de dinero - gastos pagados de la caja; SIN la base desde nov
// 2026, ver lib/turnoSinBase.js — dineroEnCaja sí la incluye, para los
// arqueos, donde se cuenta todo lo que hay en la caja): las ventas por tarjeta o transferencia
// no meten billetes a la caja física, así que no se cuentan ahí. Las
// devoluciones son siempre en efectivo (así se maneja el módulo de
// devoluciones) y se cuentan por fecha de la devolución, sin importar en
// qué turno se hizo la venta original.
export async function calcularResumen(turno) {
  await asegurarTurnoSinBase().catch(() => {});
  let sinBase = turno.esperado_sin_base;
  if (sinBase === undefined) {
    const [t] = await sql`SELECT (to_jsonb(t) ->> 'esperado_sin_base')::boolean AS sin_base FROM turnos t WHERE id = ${turno.id}`;
    sinBase = t?.sin_base;
  }
  sinBase = sinBase === true;
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

  // Nov 2026: gastos pagados con plata de la caja en este turno (lib/gastos.js).
  let gastosCaja = 0;
  if (await hayTablaGastos().catch(() => false)) {
    const [{ total_gastos }] = await sql`
      SELECT COALESCE(SUM(valor), 0) AS total_gastos FROM gastos
      WHERE turno_id = ${turno.id} AND de_caja = true AND anulado = false
    `;
    gastosCaja = Number(total_gastos);
  }

  const baseInicial = Number(turno.base_inicial);
  const dineroEsperado = dineroEsperadoTurno({ sinBase, baseInicial, ventasEfectivo, devolucionDinero, gastosCaja });
  // Todo el efectivo que debería haber físicamente en la caja (con la base).
  const dineroEnCaja = baseInicial + ventasEfectivo - devolucionDinero - gastosCaja;

  return {
    baseInicial,
    cantidadVentas: ventas.length,
    totalVentas,
    ventasEfectivo,
    ventasTarjeta,
    ventasTransferencia,
    ventasOtro,
    devolucionDinero,
    gastosCaja,
    dineroEsperado,
    dineroEnCaja,
    sinBase,
  };
}
