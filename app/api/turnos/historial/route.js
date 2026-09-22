import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Historial de turnos con su resumen de caja, para la pantalla de
// historial de turnos. ventas y devoluciones se agregan por separado antes
// de unir con turnos para no duplicar sumas (fan-out del join).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    const turnos =
      desde && hasta
        ? await sql`
            SELECT
              t.id,
              t.base_inicial,
              t.abierto_en,
              t.cerrado_en,
              t.dinero_real_caja,
              t.observaciones,
              t.estado,
              COALESCE(vs.ventas_efectivo, 0) AS ventas_efectivo,
              COALESCE(vs.ventas_tarjeta, 0) AS ventas_tarjeta,
              COALESCE(vs.ventas_transferencia, 0) AS ventas_transferencia,
              COALESCE(vs.ventas_otro, 0) AS ventas_otro,
              COALESCE(vt.total_ventas, 0) AS total_ventas,
              COALESCE(ds.total_devuelto, 0) AS devolucion_dinero
            FROM turnos t
            LEFT JOIN (
              -- El efectivo/tarjeta/transferencia/otro se suma desde
              -- pagos_venta (no desde ventas.medio_pago), porque una venta
              -- puede estar pagada con más de un medio a la vez (pago
              -- combinado).
              SELECT
                v.turno_id,
                SUM(pv.monto) FILTER (WHERE pv.medio_pago = 'Efectivo') AS ventas_efectivo,
                SUM(pv.monto) FILTER (WHERE pv.medio_pago = 'Tarjeta') AS ventas_tarjeta,
                SUM(pv.monto) FILTER (WHERE pv.medio_pago = 'Transferencia') AS ventas_transferencia,
                SUM(pv.monto) FILTER (WHERE pv.medio_pago = 'Otro') AS ventas_otro
              FROM pagos_venta pv
              JOIN ventas v ON v.id = pv.venta_id
              WHERE v.anulada = false
              GROUP BY v.turno_id
            ) vs ON vs.turno_id = t.id
            LEFT JOIN (
              SELECT turno_id, SUM(total) AS total_ventas
              FROM ventas
              WHERE anulada = false
              GROUP BY turno_id
            ) vt ON vt.turno_id = t.id
            LEFT JOIN (
              SELECT turno_id, SUM(monto) AS total_devuelto
              FROM devoluciones
              GROUP BY turno_id
            ) ds ON ds.turno_id = t.id
            WHERE t.abierto_en::date BETWEEN ${desde} AND ${hasta}
            ORDER BY t.abierto_en DESC
          `
        : await sql`
            SELECT
              t.id,
              t.base_inicial,
              t.abierto_en,
              t.cerrado_en,
              t.dinero_real_caja,
              t.observaciones,
              t.estado,
              COALESCE(vs.ventas_efectivo, 0) AS ventas_efectivo,
              COALESCE(vs.ventas_tarjeta, 0) AS ventas_tarjeta,
              COALESCE(vs.ventas_transferencia, 0) AS ventas_transferencia,
              COALESCE(vs.ventas_otro, 0) AS ventas_otro,
              COALESCE(vt.total_ventas, 0) AS total_ventas,
              COALESCE(ds.total_devuelto, 0) AS devolucion_dinero
            FROM turnos t
            LEFT JOIN (
              -- El efectivo/tarjeta/transferencia/otro se suma desde
              -- pagos_venta (no desde ventas.medio_pago), porque una venta
              -- puede estar pagada con más de un medio a la vez (pago
              -- combinado).
              SELECT
                v.turno_id,
                SUM(pv.monto) FILTER (WHERE pv.medio_pago = 'Efectivo') AS ventas_efectivo,
                SUM(pv.monto) FILTER (WHERE pv.medio_pago = 'Tarjeta') AS ventas_tarjeta,
                SUM(pv.monto) FILTER (WHERE pv.medio_pago = 'Transferencia') AS ventas_transferencia,
                SUM(pv.monto) FILTER (WHERE pv.medio_pago = 'Otro') AS ventas_otro
              FROM pagos_venta pv
              JOIN ventas v ON v.id = pv.venta_id
              WHERE v.anulada = false
              GROUP BY v.turno_id
            ) vs ON vs.turno_id = t.id
            LEFT JOIN (
              SELECT turno_id, SUM(total) AS total_ventas
              FROM ventas
              WHERE anulada = false
              GROUP BY turno_id
            ) vt ON vt.turno_id = t.id
            LEFT JOIN (
              SELECT turno_id, SUM(monto) AS total_devuelto
              FROM devoluciones
              GROUP BY turno_id
            ) ds ON ds.turno_id = t.id
            ORDER BY t.abierto_en DESC
            LIMIT 60
          `;

    const resultado = turnos.map((t) => {
      const baseInicial = Number(t.base_inicial);
      const ventasEfectivo = Number(t.ventas_efectivo);
      const devolucionDinero = Number(t.devolucion_dinero);
      const dineroEsperado = baseInicial + ventasEfectivo - devolucionDinero;
      const dineroReal = t.dinero_real_caja === null ? null : Number(t.dinero_real_caja);
      const diferencia = dineroReal === null ? null : dineroReal - dineroEsperado;
      return {
        id: t.id,
        base_inicial: baseInicial,
        abierto_en: t.abierto_en,
        cerrado_en: t.cerrado_en,
        estado: t.estado,
        observaciones: t.observaciones,
        ventas_efectivo: ventasEfectivo,
        ventas_tarjeta: Number(t.ventas_tarjeta),
        ventas_transferencia: Number(t.ventas_transferencia),
        ventas_otro: Number(t.ventas_otro),
        total_ventas: Number(t.total_ventas),
        devolucion_dinero: devolucionDinero,
        dinero_esperado: dineroEsperado,
        dinero_real_caja: dineroReal,
        diferencia,
      };
    });

    return NextResponse.json({ ok: true, turnos: resultado });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
