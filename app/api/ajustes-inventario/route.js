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
        (SELECT COUNT(*) FROM movimientos_stock m WHERE m.ajuste_id = a.id) AS items,
        t.id AS traspaso_id,
        t.estado_pago AS traspaso_estado_pago,
        bo.nombre AS traspaso_origen_nombre
      FROM ajustes_inventario a
      LEFT JOIN bodegas b ON b.id = a.bodega_id
      LEFT JOIN traspasos_inventario t ON t.id = a.traspaso_id
      LEFT JOIN bodegas bo ON bo.id = t.bodega_origen_id
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
    // Cuando el ajuste viene de "Confirmar" en Reabastecimiento (un traspaso
    // entre bodegas), body.bodega_origen_id trae la bodega de donde salió la
    // mercancía. Si no viene, es un ajuste normal de siempre y nada de lo de
    // abajo se activa: el comportamiento queda exactamente igual que antes.
    const bodega_origen_id = body.bodega_origen_id || null;

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

    if (bodega_origen_id) {
      if (Number(bodega_origen_id) === Number(bodega_id)) {
        return NextResponse.json({ ok: false, error: 'La bodega de origen del traspaso no puede ser la misma que la bodega del ajuste' }, { status: 400 });
      }
      const objetivoInvalido = items.find((it) => it.objetivo !== 'incrementar');
      if (objetivoInvalido) {
        return NextResponse.json({ ok: false, error: 'Un ajuste que viene de un traspaso solo puede incrementar (recibir mercancía)' }, { status: 400 });
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

    // Si el ajuste viene de un traspaso, además hay que validar que la bodega
    // de origen tenga suficiente stock de cada producto (la mercancía tiene
    // que salir de algún lado).
    let stockOrigenPorProducto = new Map();
    if (bodega_origen_id) {
      const productoIds = itemsConDatos.map((it) => Number(it.producto_id));
      const filasOrigen = await sql`
        SELECT producto_id, COALESCE(cantidad, 0) AS cantidad
        FROM stock WHERE bodega_id = ${bodega_origen_id} AND producto_id = ANY(${productoIds})
      `;
      stockOrigenPorProducto = new Map(filasOrigen.map((f) => [f.producto_id, Number(f.cantidad)]));

      for (const item of itemsConDatos) {
        const disponible = stockOrigenPorProducto.get(Number(item.producto_id)) || 0;
        if (disponible < item.cantidad) {
          return NextResponse.json(
            { ok: false, error: `Stock insuficiente en la bodega de origen para uno de los productos (disponible: ${disponible})` },
            { status: 409 }
          );
        }
      }
    }

    const total = itemsConDatos.reduce((acc, i) => acc + i.subtotal, 0);

    // Si viene de un traspaso, primero se crea el documento del traspaso
    // (para llevar el valor total y si ya se le pagó a la bodega de origen),
    // y el ajuste queda enlazado a él.
    let traspasoId = null;
    if (bodega_origen_id) {
      const [traspaso] = await sql`
        INSERT INTO traspasos_inventario (bodega_origen_id, bodega_destino_id, observaciones, valor_total)
        VALUES (${bodega_origen_id}, ${bodega_id}, ${observaciones || null}, ${total})
        RETURNING id
      `;
      traspasoId = traspaso.id;
    }

    const [ajuste] = await sql`
      INSERT INTO ajustes_inventario (bodega_id, numeracion, observaciones, total, traspaso_id)
      VALUES (${bodega_id}, 'Ajuste de Inventario', ${observaciones || null}, ${total}, ${traspasoId})
      RETURNING id
    `;

    for (const item of itemsConDatos) {
      const delta = item.objetivo === 'incrementar' ? item.cantidad : -item.cantidad;

      // Si es un incremento que viene de un traspaso, se guarda cuánto había
      // en esta bodega ANTES de sumar, para que el documento impreso siempre
      // pueda mostrar "lo que ya había" aunque se reimprima después.
      let stockAntesDestino = null;
      if (bodega_origen_id && item.objetivo === 'incrementar') {
        const [filaActual] = await sql`
          SELECT COALESCE(cantidad, 0) AS cantidad FROM stock WHERE producto_id = ${item.producto_id} AND bodega_id = ${bodega_id}
        `;
        stockAntesDestino = Number(filaActual?.cantidad) || 0;
      }

      await sql`
        INSERT INTO stock (producto_id, bodega_id, cantidad)
        VALUES (${item.producto_id}, ${bodega_id}, ${delta})
        ON CONFLICT (producto_id, bodega_id)
        DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
      `;

      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, ajuste_id, traspaso_id, stock_antes)
        VALUES (
          ${item.producto_id}, ${bodega_id},
          ${item.objetivo === 'incrementar' ? 'ajuste_incremento' : 'ajuste_disminucion'},
          ${item.cantidad}, ${item.costo}, ${ajuste.id}, ${traspasoId}, ${stockAntesDestino}
        )
      `;

      if (bodega_origen_id) {
        const stockAntesOrigen = stockOrigenPorProducto.get(Number(item.producto_id)) || 0;

        await sql`
          UPDATE stock SET cantidad = cantidad - ${item.cantidad}
          WHERE producto_id = ${item.producto_id} AND bodega_id = ${bodega_origen_id}
        `;
        await sql`
          INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, traspaso_id, stock_antes)
          VALUES (${item.producto_id}, ${bodega_origen_id}, 'traspaso_salida', ${item.cantidad}, ${item.costo}, ${traspasoId}, ${stockAntesOrigen})
        `;
      }
    }

    return NextResponse.json({ ok: true, ajusteId: ajuste.id, traspasoId, total });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
