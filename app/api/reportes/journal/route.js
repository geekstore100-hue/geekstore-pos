import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// Reporte "Journal de ventas" (octubre 2026): TODAS las ventas de un rango
// de fechas, línea por línea (cada producto vendido), más las devoluciones
// como líneas en negativo. Es lo que se exporta a Excel desde Reportes.
//
// Notas:
// - movimientos_stock.precio_unitario YA es el precio con el descuento
//   aplicado (ver app/api/ventas/route.js); el "precio de lista" se calcula
//   de vuelta con el % de descuento.
// - El costo es el del DÍA de la venta (movimientos_stock.costo_unitario,
//   ver lib/costoVenta.js). Si una línea no lo tiene, se usa el actual.
// - Las columnas opcionales de "ventas" (evento, cliente) se leen con
//   to_jsonb para que no falle si alguna migración no se corrió.
//
// GET /api/reportes/journal?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&anuladas=1
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    const conAnuladas = searchParams.get('anuladas') === '1';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) {
      return NextResponse.json({ ok: false, error: 'Faltan las fechas desde/hasta' }, { status: 400 });
    }
    if (desde > hasta) {
      return NextResponse.json({ ok: false, error: 'La fecha "desde" es mayor que "hasta"' }, { status: 400 });
    }

    const [lineas, pagos, devoluciones] = await Promise.all([
      sql`
        SELECT
          v.id AS venta_id,
          to_char(v.creado_en::timestamptz AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS fecha,
          to_char(v.creado_en::timestamptz AT TIME ZONE 'America/Bogota', 'HH24:MI') AS hora,
          v.anulada,
          v.medio_pago,
          v.total AS total_venta,
          COALESCE(ve.nombre, '') AS vendedor,
          COALESCE(to_jsonb(v) ->> 'evento', '') AS evento,
          COALESCE(to_jsonb(v) ->> 'cliente_nombre', '') AS cliente,
          COALESCE(to_jsonb(v) ->> 'cliente_telefono', '') AS cliente_telefono,
          COALESCE(m.nota, '') AS nota,
          p.referencia,
          p.nombre AS producto,
          COALESCE(c.nombre, '') AS categoria,
          COALESCE(sc.nombre, '') AS subcategoria,
          COALESCE(b.nombre, '') AS bodega,
          p.es_inventariable,
          m.cantidad,
          m.precio_unitario AS precio_neto,
          COALESCE(m.descuento_porcentaje, 0) AS descuento_pct,
          -- Costo del DÍA de la venta (lib/costoVenta.js); si no está guardado, el actual.
          CASE WHEN p.es_inventariable = false THEN 0
               ELSE COALESCE((to_jsonb(m) ->> 'costo_unitario')::numeric, p.precio_costo, 0) END AS costo_unitario
        FROM movimientos_stock m
        JOIN ventas v ON v.id = m.venta_id
        JOIN productos p ON p.id = m.producto_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
        LEFT JOIN bodegas b ON b.id = m.bodega_id
        LEFT JOIN vendedores ve ON ve.id = v.vendedor_id
        WHERE m.tipo = 'venta'
          AND (v.creado_en::timestamptz AT TIME ZONE 'America/Bogota')::date BETWEEN ${desde} AND ${hasta}
          AND (${conAnuladas ? 1 : 0} = 1 OR v.anulada = false)
        ORDER BY v.creado_en ASC, v.id ASC, m.id ASC
      `,
      sql`
        SELECT pv.venta_id, pv.medio_pago, SUM(pv.monto) AS monto
        FROM pagos_venta pv
        JOIN ventas v ON v.id = pv.venta_id
        WHERE (v.creado_en::timestamptz AT TIME ZONE 'America/Bogota')::date BETWEEN ${desde} AND ${hasta}
          AND (${conAnuladas ? 1 : 0} = 1 OR v.anulada = false)
        GROUP BY pv.venta_id, pv.medio_pago
      `,
      sql`
        SELECT
          d.id,
          to_char(d.creado_en::timestamptz AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS fecha,
          to_char(d.creado_en::timestamptz AT TIME ZONE 'America/Bogota', 'HH24:MI') AS hora,
          d.venta_id, d.cantidad, d.monto, COALESCE(d.motivo, '') AS motivo,
          p.referencia, p.nombre AS producto, COALESCE(c.nombre, '') AS categoria,
          CASE WHEN p.es_inventariable = false THEN 0 ELSE COALESCE(p.precio_costo, 0) END AS costo_unitario
        FROM devoluciones d
        JOIN productos p ON p.id = d.producto_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE (d.creado_en::timestamptz AT TIME ZONE 'America/Bogota')::date BETWEEN ${desde} AND ${hasta}
        ORDER BY d.creado_en ASC
      `,
    ]);

    // Ventas de distribuidor (las que salieron de una cotización del portal).
    let distribuidorPorVenta = new Map();
    try {
      // venta_principal_id: la parte que salió de Principal como venta aparte.
      const filas = await sql`
        SELECT (to_jsonb(cd) ->> 'venta_id')::int AS venta_id,
               (to_jsonb(cd) ->> 'venta_principal_id')::int AS venta_principal_id,
               cd.numero, cd.distribuidor_nombre
        FROM cotizaciones_distribuidor cd
        WHERE (to_jsonb(cd) ->> 'venta_id') IS NOT NULL
      `;
      for (const f of filas) {
        distribuidorPorVenta.set(Number(f.venta_id), f);
        if (f.venta_principal_id) distribuidorPorVenta.set(Number(f.venta_principal_id), f);
      }
    } catch {
      // Si la tabla o la columna no existen, simplemente no se marca.
    }

    return NextResponse.json({
      ok: true,
      desde,
      hasta,
      lineas: lineas.map((l) => {
        const d = distribuidorPorVenta.get(Number(l.venta_id));
        const canal = d ? 'Distribuidor' : l.evento ? `Evento: ${l.evento}` : 'Mostrador';
        return { ...l, canal, cliente: l.cliente || (d ? d.distribuidor_nombre : '') };
      }),
      pagos,
      devoluciones,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
