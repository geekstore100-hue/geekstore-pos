import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import {
  prepararLineas,
  consultasReemplazarLineas,
  ErrorCotizacion,
  faltaMigracion,
  MENSAJE_MIGRACION,
  esCotizacionYaFacturada,
} from '../../../../lib/cotizacionDistribuidor';

// Cotización de distribuidor puntual:
//   GET   → verla / imprimirla.
//   PUT   → EDITARLA mientras está pendiente (agregar, quitar, cambiar
//           cantidades y precios). Octubre 2026.
//   PATCH → marcarla facturada a mano (sin crear venta) o volverla a
//           pendiente. Para convertirla en venta del POS está
//           /api/cotizaciones-distribuidor/[id]/facturar.

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    // Las columnas nuevas se leen así para que no falle si todavía no se
    // corrió migracion_cotizaciones_facturar.sql (salen null).
    const [cotizacion] = await sql`
      SELECT c.id, c.numero, c.distribuidor_id, c.distribuidor_nombre, c.distribuidor_cedula, c.total, c.estado,
             c.creado_en, c.facturada_en,
             (to_jsonb(c) ->> 'venta_id')::int AS venta_id,
             (to_jsonb(c) ->> 'editada_en') AS editada_en,
             (to_jsonb(c) ->> 'total_original')::numeric AS total_original
      FROM cotizaciones_distribuidor c
      WHERE c.id = ${id}
    `;
    if (!cotizacion) {
      return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    }
    const items = await sql`
      SELECT id, producto_id, referencia, nombre, cantidad, precio_unitario, subtotal
      FROM cotizacion_distribuidor_items
      WHERE cotizacion_id = ${id}
      ORDER BY id ASC
    `;
    let venta = null;
    if (cotizacion.venta_id) {
      [venta] = await sql`SELECT id, total, medio_pago, anulada, creado_en FROM ventas WHERE id = ${cotizacion.venta_id}`;
    }

    // De qué bodega se ALISTA cada producto (octubre 2026):
    //   - pendiente → plan con el stock de hoy: primero Bodega Distribuidor
    //     y lo que falte, de Principal (igual que "Facturar" en automático);
    //   - facturada con venta → de dónde salió de verdad (movimientos).
    let alistar = null;
    try {
      const ids = [...new Set(items.map((it) => Number(it.producto_id)).filter(Boolean))];
      if (ids.length && venta) {
        const movs = await sql`
          SELECT m.producto_id, b.nombre AS bodega, SUM(m.cantidad) AS cantidad
          FROM movimientos_stock m JOIN bodegas b ON b.id = m.bodega_id
          WHERE m.venta_id = ${venta.id} AND m.tipo = 'venta'
          GROUP BY m.producto_id, b.nombre
        `;
        const quedan = new Map();
        for (const m of movs) quedan.set(`${m.producto_id}:${m.bodega}`, Number(m.cantidad) || 0);
        alistar = { modo: 'real', items: {} };
        for (const it of items) {
          const pid = Number(it.producto_id);
          const c = Number(it.cantidad) || 0;
          const kd = `${pid}:Bodega Distribuidor`;
          const deDist = Math.min(c, quedan.get(kd) || 0);
          quedan.set(kd, (quedan.get(kd) || 0) - deDist);
          const kp = `${pid}:Principal`;
          const dePpal = Math.min(c - deDist, quedan.get(kp) || 0);
          quedan.set(kp, (quedan.get(kp) || 0) - dePpal);
          alistar.items[it.id] = { distribuidor: deDist, principal: dePpal, falta: 0 };
        }
      } else if (ids.length && cotizacion.estado === 'pendiente') {
        const stock = await sql`
          SELECT p.id AS producto_id, p.es_inventariable,
                 COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Bodega Distribuidor'), 0) AS dist,
                 COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Principal'), 0) AS ppal
          FROM productos p
          LEFT JOIN stock s ON s.producto_id = p.id
          LEFT JOIN bodegas b ON b.id = s.bodega_id
          WHERE p.id = ANY(${ids}::int[])
          GROUP BY p.id
        `;
        const porId = new Map(stock.map((f) => [Number(f.producto_id), f]));
        const quedan = new Map();
        for (const f of stock) {
          quedan.set(`${f.producto_id}:d`, Math.max(0, Number(f.dist) || 0));
          quedan.set(`${f.producto_id}:p`, Math.max(0, Number(f.ppal) || 0));
        }
        alistar = { modo: 'plan', items: {} };
        for (const it of items) {
          const pid = Number(it.producto_id);
          const c = Number(it.cantidad) || 0;
          const f = porId.get(pid);
          if (!f || f.es_inventariable === false) {
            alistar.items[it.id] = null;
            continue;
          }
          const deDist = Math.min(c, quedan.get(`${pid}:d`) || 0);
          const dePpal = Math.min(c - deDist, quedan.get(`${pid}:p`) || 0);
          quedan.set(`${pid}:d`, (quedan.get(`${pid}:d`) || 0) - deDist);
          quedan.set(`${pid}:p`, (quedan.get(`${pid}:p`) || 0) - dePpal);
          alistar.items[it.id] = { distribuidor: deDist, principal: dePpal, falta: c - deDist - dePpal };
        }
      }
    } catch (e) {
      console.error('[cotizacion distribuidor] alistar:', e?.message);
    }
    return NextResponse.json({ ok: true, cotizacion: { ...cotizacion, items, venta: venta || null, alistar } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const { items } = await request.json();
    const { lineas, total } = await prepararLineas(items);
    await sql.transaction([
      sql`
        WITH upd AS (
          UPDATE cotizaciones_distribuidor
          SET total = ${total}, total_original = COALESCE(total_original, total), editada_en = now()
          WHERE id = ${id} AND estado = 'pendiente'
          RETURNING 1
        )
        SELECT CASE WHEN COUNT(*) = 0 THEN ('cotizacion_no_pendiente_' || COUNT(*)::text)::int ELSE 1 END FROM upd
      `,
      ...consultasReemplazarLineas(id, lineas),
    ]);
    return NextResponse.json({ ok: true, total });
  } catch (error) {
    if (error instanceof ErrorCotizacion) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (esCotizacionYaFacturada(error)) {
      return NextResponse.json({ ok: false, error: 'Esta cotización ya no está pendiente (ya se facturó): no se puede editar.' }, { status: 409 });
    }
    if (faltaMigracion(error)) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { estado } = await request.json();
    if (estado !== 'pendiente' && estado !== 'facturada') {
      return NextResponse.json({ ok: false, error: 'Estado inválido' }, { status: 400 });
    }
    const [actual] = await sql`
      SELECT c.estado, (to_jsonb(c) ->> 'venta_id')::int AS venta_id, v.anulada
      FROM cotizaciones_distribuidor c
      LEFT JOIN ventas v ON v.id = (to_jsonb(c) ->> 'venta_id')::int
      WHERE c.id = ${id}
    `;
    if (!actual) {
      return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    }
    // Si ya tiene una venta del POS, no se puede volver a pendiente mientras
    // esa venta siga vigente (se facturaría dos veces).
    if (estado === 'pendiente' && actual.venta_id && !actual.anulada) {
      return NextResponse.json(
        { ok: false, error: `Esta cotización ya es la venta #${actual.venta_id}. Para volverla a pendiente, primero anula esa venta (Historial).` },
        { status: 409 }
      );
    }
    const [cotizacion] =
      estado === 'pendiente' && actual.venta_id
        ? await sql`
            UPDATE cotizaciones_distribuidor SET estado = 'pendiente', facturada_en = NULL, venta_id = NULL
            WHERE id = ${id}
            RETURNING id, numero, estado, facturada_en
          `
        : await sql`
            UPDATE cotizaciones_distribuidor SET
              estado = ${estado},
              facturada_en = ${estado === 'facturada' ? new Date() : null}
            WHERE id = ${id}
            RETURNING id, numero, estado, facturada_en
          `;
    return NextResponse.json({ ok: true, cotizacion });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
