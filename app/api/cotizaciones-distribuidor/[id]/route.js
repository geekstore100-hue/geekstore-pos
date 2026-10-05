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
    return NextResponse.json({ ok: true, cotizacion: { ...cotizacion, items, venta: venta || null } });
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
