import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

export async function GET() {
  try {
    const ajustes = await sql`
      SELECT
        a.id,
        a.numeracion,
        a.observaciones,
        a.total,
        a.creado_en,
        b.nombre AS bodega_nombre,
        (SELECT COUNT(*) FROM movimientos_stock m WHERE m.ajuste_id = a.id) AS items
      FROM ajustes_inventario a
      LEFT JOIN bodegas b ON b.id = a.bodega_id
      ORDER BY a.creado_en DESC
      LIMIT 30
    `;
    return NextResponse.json({ ok: true, ajustes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { bodega_id, observaciones, items } = body;

    if (!bodega_id) {
      return NextResponse.json({ ok: false, error: 'Selecciona la bodega' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'Agrega al menos un producto' }, { status: 400 });
    }
    for (const item of items) {
      if (!item.producto_id || !item.objetivo || !item.cantidad || Number(item.cantidad) <= 0) {
        return NextResponse.json({ ok: false, error: 'Revisa las líneas: falta producto, objetivo o cantidad' }, { status: 400 });
      }
      if (item.objetivo !== 'incrementar' && item.objetivo !== 'disminuir') {
        return NextResponse.json({ ok: false, error: 'Objetivo inválido' }, { status: 400 });
      }
    }

    // Fase 1: validar que las disminuciones no dejen stock negativo, y traer el costo
    // actual de cada producto (el ajuste NO recalcula el costo promedio ponderado —
    // eso solo debe cambiar con compras reales — solo corrige la cantidad).
    const itemsConDatos = [];
    for (const item of items) {
      const [row] = await sql`
        SELECT
          COALESCE(s.cantidad, 0) AS cantidad_actual,
          COALESCE(p.precio_costo, 0) AS costo
        FROM productos p
        LEFT JOIN stock s ON s.producto_id = p.id AND s.bodega_id = ${bodega_id}
        WHERE p.id = ${item.producto_id}
      `;
      const cantidadActual = Number(row?.cantidad_actual) || 0;
      const costo = Number(row?.costo) || 0;
      const cantidad = Number(item.cantidad);

      if (item.objetivo === 'disminuir' && cantidadActual < cantidad) {
        return NextResponse.json(
          { ok: false, error: `Stock insuficiente para disminuir uno de los productos (disponible: ${cantidadActual})` },
          { status: 409 }
        );
      }

      itemsConDatos.push({ ...item, cantidad, costo, subtotal: costo * cantidad });
    }

    const total = itemsConDatos.reduce((acc, i) => acc + i.subtotal, 0);

    const [ajuste] = await sql`
      INSERT INTO ajustes_inventario (bodega_id, numeracion, observaciones, total)
      VALUES (${bodega_id}, 'Ajuste de Inventario', ${observaciones || null}, ${total})
      RETURNING id
    `;

    for (const item of itemsConDatos) {
      const delta = item.objetivo === 'incrementar' ? item.cantidad : -item.cantidad;

      await sql`
        INSERT INTO stock (producto_id, bodega_id, cantidad)
        VALUES (${item.producto_id}, ${bodega_id}, ${delta})
        ON CONFLICT (producto_id, bodega_id)
        DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
      `;

      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, ajuste_id)
        VALUES (
          ${item.producto_id}, ${bodega_id},
          ${item.objetivo === 'incrementar' ? 'ajuste_incremento' : 'ajuste_disminucion'},
          ${item.cantidad}, ${item.costo}, ${ajuste.id}
        )
      `;
    }

    return NextResponse.json({ ok: true, ajusteId: ajuste.id, total });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
