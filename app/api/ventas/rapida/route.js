import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { esErrorDeGuardia } from '../../../../lib/transaccion';
import {
  prepararVentaRapida,
  migracionVentasEvento,
  ErrorVenta,
  MENSAJE_MIGRACION,
} from '../../../../lib/ventaRapida';

// Venta rápida desde el celular (octubre 2026). Ver lib/ventaRapida.js.
//
// A diferencia de /api/ventas (la pantalla Vender del computador):
//   - cada producto sale de la bodega que se elija (Principal o
//     Bodega Distribuidor), no siempre de Principal;
//   - en modo "evento" (ej. SOFA 2026) la venta NO entra al turno de caja
//     de la tienda;
//   - guarda el cliente (opcional) para el comprobante por WhatsApp;
//   - si el celular reenvía la misma venta (se cayó el internet justo al
//     guardar), se reconoce por id_local y no se guarda dos veces.
// Todo en UNA transacción: o se guarda completa, o no se guarda nada.

async function ventaExistente(idLocal) {
  if (!idLocal) return null;
  const [v] = await sql`SELECT id, total FROM ventas WHERE id_local = ${idLocal}`;
  return v || null;
}

export async function POST(request) {
  try {
    if (!(await migracionVentasEvento())) {
      return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    }
    const body = await request.json();

    // ¿Ya llegó antes? (reintento después de un corte de internet)
    const previa = await ventaExistente(String(body.id_local || '').trim().slice(0, 80) || null);
    if (previa) return NextResponse.json({ ok: true, ventaId: previa.id, total: Number(previa.total), repetida: true });

    const v = await prepararVentaRapida(body);

    let turnoId = null;
    if (v.modo === 'tienda') {
      const [turno] = await sql`SELECT id FROM turnos WHERE estado = 'abierto' LIMIT 1`;
      if (!turno) throw new ErrorVenta('No hay un turno de caja abierto en la tienda. Ábrelo en Vender, o usa el modo Evento.', 409);
      turnoId = turno.id;
    }

    const nota = v.evento ? `Evento ${v.evento}` : null;
    const consultas = [
      sql`
        WITH nueva AS (
          INSERT INTO ventas (total, medio_pago, vendedor_id, turno_id, creado_en, evento, cliente_nombre, cliente_telefono, id_local)
          VALUES (${v.total}, ${v.medioPago}, ${v.vendedorId}, ${turnoId}, COALESCE(${v.fecha}::timestamptz, now()),
                  ${v.evento}, ${v.clienteNombre}, ${v.clienteTelefono}, ${v.idLocal})
          RETURNING id
        )
        SELECT id, set_config('pos.id_venta', id::text, true) FROM nueva
      `,
      ...v.pagos.map(
        (p) => sql`
          INSERT INTO pagos_venta (venta_id, medio_pago, monto)
          VALUES (current_setting('pos.id_venta')::int, ${p.medio_pago}, ${p.monto})
        `
      ),
    ];
    for (const l of v.lineas) {
      if (l.inventariable) {
        // Solo descuenta si todavía alcanza; si no, 1/0 cancela TODA la venta.
        consultas.push(sql`
          WITH descontado AS (
            UPDATE stock SET cantidad = cantidad - ${l.cantidad}
            WHERE producto_id = ${l.producto_id} AND bodega_id = ${l.bodega_id} AND cantidad >= ${l.cantidad}
            RETURNING 1
          )
          SELECT 1 / c.n AS ok FROM (SELECT COUNT(*)::int AS n FROM descontado) c
        `);
      }
      consultas.push(sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, venta_id, nota)
        VALUES (${l.producto_id}, ${l.bodega_id}, 'venta', ${l.cantidad}, ${l.precio}, ${l.descuento}, current_setting('pos.id_venta')::int, ${nota})
      `);
    }

    let resultados;
    try {
      resultados = await sql.transaction(consultas);
    } catch (error) {
      if (esErrorDeGuardia(error)) {
        return NextResponse.json(
          { ok: false, error: 'Stock insuficiente: otra venta se llevó unidades mientras se guardaba. No se guardó nada — revisa y vuelve a intentar.' },
          { status: 409 }
        );
      }
      // Dos envíos de la misma venta al mismo tiempo: el índice único de
      // id_local frena el segundo; se responde con la que sí quedó.
      if (/ventas_id_local_unico|duplicate key/i.test(error.message || '')) {
        const ya = await ventaExistente(v.idLocal);
        if (ya) return NextResponse.json({ ok: true, ventaId: ya.id, total: Number(ya.total), repetida: true });
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      ventaId: resultados[0][0].id,
      total: v.total,
      pagos: v.pagos,
      lineas: v.lineas.map((l) => ({ nombre: l.nombre, referencia: l.referencia, cantidad: l.cantidad, precio: l.precio, bodega: l.bodega_nombre })),
    });
  } catch (error) {
    if (error instanceof ErrorVenta) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
