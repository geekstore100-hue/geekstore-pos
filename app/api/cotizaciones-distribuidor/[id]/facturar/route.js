import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { esErrorDeGuardia } from '../../../../../lib/transaccion';
import {
  prepararLineas,
  consultasReemplazarLineas,
  ErrorCotizacion,
  faltaMigracion,
  MENSAJE_MIGRACION,
  esCotizacionYaFacturada,
} from '../../../../../lib/cotizacionDistribuidor';

// Convierte una cotización de distribuidor en VENTA del POS (octubre 2026).
// Antes "facturar" era solo un estado: la factura se hacía aparte.
//
// Recibe las líneas ya revisadas/editadas en pantalla, la bodega de donde
// sale la mercancía (por defecto Bodega Distribuidor), el medio de pago (o
// pago combinado) y el vendedor. En UNA sola transacción:
//   - marca la cotización como facturada (solo si seguía pendiente),
//   - crea la venta con sus pagos (entra al turno abierto, como cualquier venta),
//   - descuenta el stock de la bodega elegida (nunca lo deja en negativo),
//   - registra los movimientos y deja la cotización con las líneas finales
//     y enlazada a la venta.
// Si algo falla, no se guarda nada.

const MEDIOS = new Set(['Efectivo', 'Tarjeta', 'Transferencia', 'Otro']);

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { items, bodega_id, medio_pago, pagos: pagosBody, vendedor_id } = await request.json();

    const [cotizacion] = await sql`SELECT id, numero, estado, distribuidor_nombre FROM cotizaciones_distribuidor WHERE id = ${id}`;
    if (!cotizacion) return NextResponse.json({ ok: false, error: 'Cotización no encontrada' }, { status: 404 });
    if (cotizacion.estado !== 'pendiente') {
      return NextResponse.json({ ok: false, error: 'Esta cotización ya está facturada.' }, { status: 409 });
    }

    const [turnoAbierto] = await sql`SELECT id FROM turnos WHERE estado = 'abierto' LIMIT 1`;
    if (!turnoAbierto) {
      return NextResponse.json({ ok: false, error: 'Debes abrir un turno de caja antes de facturar (Vender → abrir turno).' }, { status: 409 });
    }

    const [bodega] = await sql`SELECT id, nombre FROM bodegas WHERE id = ${Number(bodega_id) || 0}`;
    if (!bodega || bodega.nombre === 'Garantías con Proveedor') {
      return NextResponse.json({ ok: false, error: 'Elige la bodega de donde sale la mercancía' }, { status: 400 });
    }

    const { lineas, total } = await prepararLineas(items, { bodegaId: bodega.id });

    // Stock suficiente en la bodega elegida (sumando líneas del mismo producto).
    const pedido = new Map();
    for (const l of lineas) if (l.inventariable) pedido.set(l.producto_id, (pedido.get(l.producto_id) || 0) + l.cantidad);
    for (const [productoId, cantidad] of pedido) {
      const l = lineas.find((x) => x.producto_id === productoId);
      if (l.disponible < cantidad) {
        return NextResponse.json(
          { ok: false, error: `No alcanza el stock de "${l.nombre}" en ${bodega.nombre}: hay ${l.disponible} y se necesitan ${cantidad}.` },
          { status: 409 }
        );
      }
    }

    // Pagos (igual que en Vender).
    const esPagoCombinado = Array.isArray(pagosBody) && pagosBody.length > 0;
    let pagos;
    if (esPagoCombinado) {
      for (const p of pagosBody) {
        if (!MEDIOS.has(p.medio_pago) || !(Number(p.monto) > 0)) {
          return NextResponse.json({ ok: false, error: 'Revisa los montos del pago combinado' }, { status: 400 });
        }
      }
      pagos = pagosBody.map((p) => ({ medio_pago: p.medio_pago, monto: Number(p.monto) }));
      const suma = pagos.reduce((a, p) => a + p.monto, 0);
      if (Math.abs(suma - total) > 1) {
        return NextResponse.json({ ok: false, error: `Los pagos (${suma}) no suman el total (${total})` }, { status: 400 });
      }
    } else {
      if (!MEDIOS.has(medio_pago)) return NextResponse.json({ ok: false, error: 'Selecciona el medio de pago' }, { status: 400 });
      pagos = [{ medio_pago, monto: total }];
    }
    const medioPagoGuardado = [...new Set(pagos.map((p) => p.medio_pago))].join(' + ');

    const consultas = [
      // 1) Solo si sigue pendiente (si otra pestaña ya la facturó, se cancela todo).
      sql`
        WITH upd AS (
          UPDATE cotizaciones_distribuidor
          SET estado = 'facturada', facturada_en = now(), total_original = COALESCE(total_original, total), total = ${total}
          WHERE id = ${id} AND estado = 'pendiente'
          RETURNING 1
        )
        SELECT CASE WHEN COUNT(*) = 0 THEN ('cotizacion_no_pendiente_' || COUNT(*)::text)::int ELSE 1 END FROM upd
      `,
      // 2) La venta.
      sql`
        WITH nueva AS (
          INSERT INTO ventas (total, medio_pago, vendedor_id, turno_id)
          VALUES (${total}, ${medioPagoGuardado}, ${Number(vendedor_id) || null}, ${turnoAbierto.id})
          RETURNING id
        )
        SELECT id, set_config('pos.id_venta', id::text, true) FROM nueva
      `,
      ...pagos.map(
        (p) => sql`
          INSERT INTO pagos_venta (venta_id, medio_pago, monto)
          VALUES (current_setting('pos.id_venta')::int, ${p.medio_pago}, ${p.monto})
        `
      ),
    ];
    for (const l of lineas) {
      if (l.inventariable) {
        consultas.push(sql`
          WITH descontado AS (
            UPDATE stock SET cantidad = cantidad - ${l.cantidad}
            WHERE producto_id = ${l.producto_id} AND bodega_id = ${bodega.id} AND cantidad >= ${l.cantidad}
            RETURNING 1
          )
          SELECT 1 / c.n AS ok FROM (SELECT COUNT(*)::int AS n FROM descontado) c
        `);
      }
      consultas.push(sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, venta_id, nota)
        VALUES (${l.producto_id}, ${bodega.id}, 'venta', ${l.cantidad}, ${l.precio_unitario}, 0, current_setting('pos.id_venta')::int,
                ${`Cotización distribuidor ${cotizacion.numero} — ${cotizacion.distribuidor_nombre}`})
      `);
    }
    // 3) La cotización queda con las líneas finales y enlazada a la venta.
    consultas.push(...consultasReemplazarLineas(id, lineas));
    consultas.push(sql`UPDATE cotizaciones_distribuidor SET venta_id = current_setting('pos.id_venta')::int WHERE id = ${id}`);

    let resultados;
    try {
      resultados = await sql.transaction(consultas);
    } catch (error) {
      if (esCotizacionYaFacturada(error)) {
        return NextResponse.json({ ok: false, error: 'Esta cotización ya se facturó (quizás desde otra pestaña). No se guardó nada.' }, { status: 409 });
      }
      if (esErrorDeGuardia(error)) {
        return NextResponse.json(
          { ok: false, error: 'Stock insuficiente: otra venta se llevó unidades mientras se guardaba. No se guardó nada — revisa y vuelve a intentar.' },
          { status: 409 }
        );
      }
      throw error;
    }
    const ventaId = resultados[1][0].id;
    return NextResponse.json({ ok: true, ventaId, total, bodega: bodega.nombre });
  } catch (error) {
    if (error instanceof ErrorCotizacion) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (faltaMigracion(error)) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
