import { NextResponse } from 'next/server';
import sql from '../../../lib/db';
import { migracionVentasEvento, MENSAJE_MIGRACION } from '../../../lib/ventaRapida';

// Ventas de EVENTOS (ej. SOFA 2026), octubre 2026.
//   GET            → lista de eventos con su total.
//   GET ?evento=X  → el resumen de ese evento: total, por medio de pago,
//                    por día, por bodega (para saber qué salió de Bodega
//                    Distribuidor y cuadrar las cuentas internas), los
//                    productos vendidos y cada venta.
// Las ventas anuladas no suman (se listan aparte).

export async function GET(request) {
  try {
    if (!(await migracionVentasEvento())) {
      return NextResponse.json({ ok: true, faltaMigracion: true, mensaje: MENSAJE_MIGRACION, eventos: [] });
    }
    const evento = new URL(request.url).searchParams.get('evento');

    if (!evento) {
      const eventos = await sql`
        SELECT evento,
               COUNT(*) FILTER (WHERE NOT anulada)::int AS ventas,
               COALESCE(SUM(total) FILTER (WHERE NOT anulada), 0) AS total,
               MIN(creado_en) AS desde, MAX(creado_en) AS hasta
        FROM ventas WHERE evento IS NOT NULL
        GROUP BY evento ORDER BY MAX(creado_en) DESC
      `;
      return NextResponse.json({ ok: true, eventos });
    }

    const ventas = await sql`
      SELECT v.id, v.total, v.medio_pago, v.creado_en, v.anulada, v.cliente_nombre, v.cliente_telefono,
             ve.nombre AS vendedor_nombre
      FROM ventas v LEFT JOIN vendedores ve ON ve.id = v.vendedor_id
      WHERE v.evento = ${evento}
      ORDER BY v.creado_en DESC, v.id DESC
    `;
    const lineas = await sql`
      SELECT m.venta_id, m.producto_id, p.referencia, p.nombre, b.nombre AS bodega,
             m.cantidad, m.precio_unitario, COALESCE(m.descuento_porcentaje, 0) AS descuento_porcentaje,
             p.precio_costo, p.precio_distribuidor
      FROM movimientos_stock m
      JOIN ventas v ON v.id = m.venta_id
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN bodegas b ON b.id = m.bodega_id
      WHERE v.evento = ${evento} AND m.tipo = 'venta'
      ORDER BY m.id ASC
    `;
    const pagos = await sql`
      SELECT pv.medio_pago, SUM(pv.monto) AS total, COUNT(DISTINCT pv.venta_id)::int AS ventas
      FROM pagos_venta pv JOIN ventas v ON v.id = pv.venta_id
      WHERE v.evento = ${evento} AND NOT v.anulada
      GROUP BY pv.medio_pago ORDER BY SUM(pv.monto) DESC
    `;
    const dias = await sql`
      SELECT to_char((v.creado_en::timestamptz AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS dia,
             COUNT(*)::int AS ventas, SUM(v.total) AS total
      FROM ventas v WHERE v.evento = ${evento} AND NOT v.anulada
      GROUP BY 1 ORDER BY 1
    `;

    const anuladas = new Set(ventas.filter((v) => v.anulada).map((v) => v.id));
    const n = (x) => Number(x || 0);

    // Por bodega y por producto (solo ventas vigentes).
    const porBodega = new Map();
    for (const l of lineas) {
      if (anuladas.has(l.venta_id)) continue;
      const nombreBodega = l.bodega || 'Sin bodega';
      if (!porBodega.has(nombreBodega)) porBodega.set(nombreBodega, { bodega: nombreBodega, unidades: 0, vendido: 0, costo: 0, precioDistribuidor: 0, productos: new Map() });
      const g = porBodega.get(nombreBodega);
      const cant = n(l.cantidad);
      g.unidades += cant;
      g.vendido += cant * n(l.precio_unitario);
      g.costo += cant * n(l.precio_costo);
      g.precioDistribuidor += cant * n(l.precio_distribuidor);
      if (!g.productos.has(l.producto_id)) {
        g.productos.set(l.producto_id, { producto_id: l.producto_id, referencia: l.referencia, nombre: l.nombre, unidades: 0, vendido: 0, costoUnitario: n(l.precio_costo), precioDistribuidor: n(l.precio_distribuidor) });
      }
      const pr = g.productos.get(l.producto_id);
      pr.unidades += cant;
      pr.vendido += cant * n(l.precio_unitario);
    }
    const bodegas = [...porBodega.values()]
      .map((g) => ({ ...g, productos: [...g.productos.values()].sort((a, b) => b.vendido - a.vendido) }))
      .sort((a, b) => b.vendido - a.vendido);

    const lineasPorVenta = new Map();
    for (const l of lineas) {
      if (!lineasPorVenta.has(l.venta_id)) lineasPorVenta.set(l.venta_id, []);
      lineasPorVenta.get(l.venta_id).push({ nombre: l.nombre, referencia: l.referencia, cantidad: n(l.cantidad), precio: n(l.precio_unitario), bodega: l.bodega });
    }

    const vigentes = ventas.filter((v) => !v.anulada);
    return NextResponse.json({
      ok: true,
      evento,
      resumen: {
        ventas: vigentes.length,
        total: vigentes.reduce((a, v) => a + n(v.total), 0),
        unidades: bodegas.reduce((a, b) => a + b.unidades, 0),
        anuladas: ventas.length - vigentes.length,
      },
      pagos: pagos.map((p) => ({ medio_pago: p.medio_pago, total: n(p.total), ventas: p.ventas })),
      dias: dias.map((d) => ({ dia: d.dia, ventas: d.ventas, total: n(d.total) })),
      bodegas,
      ventas: ventas.map((v) => ({ ...v, total: n(v.total), lineas: lineasPorVenta.get(v.id) || [] })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
