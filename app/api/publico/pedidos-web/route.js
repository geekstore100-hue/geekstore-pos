import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { claveValida } from '../../../../lib/distribuidores';
import { costoListo, consultaGuardarCosto } from '../../../../lib/costoVenta';
import { esErrorDeGuardia } from '../../../../lib/transaccion';
import { migracionVentasEvento, ErrorVenta, MENSAJE_MIGRACION } from '../../../../lib/ventaRapida';
import { prepararPedidoWeb, idLocalPedido, CANAL_WEB } from '../../../../lib/pedidoWeb';
import { asegurarApartados, consultaLiberar } from '../../../../lib/apartadosWeb';

export const dynamic = 'force-dynamic';

// POST /api/publico/pedidos-web — la tienda online registra un pedido pagado
// como VENTA del POS (ver lib/pedidoWeb.js). Solo la llama el servidor de la
// tienda, con el mismo secreto compartido de los distribuidores
// (DISTRIBUIDOR_CLAVE, encabezado x-distribuidor-clave).
// GET ?referencia=… → si ese pedido ya está registrado, su venta.

async function ventaDelPedido(referencia) {
  const [v] = await sql`SELECT id, total, anulada FROM ventas WHERE id_local = ${idLocalPedido(referencia)}`;
  return v || null;
}

export async function GET(request) {
  if (!claveValida(request)) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  try {
    const referencia = new URL(request.url).searchParams.get('referencia') || '';
    const v = await ventaDelPedido(referencia);
    return NextResponse.json({ ok: true, venta: v ? { id: v.id, total: Number(v.total), anulada: v.anulada === true } : null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!claveValida(request)) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  try {
    if (!(await migracionVentasEvento())) return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    const pedido = await request.json().catch(() => ({}));

    // ¿Ya se registró? No se vuelve a descontar nada.
    const previa = await ventaDelPedido(pedido.referencia);
    if (previa && previa.anulada !== true) {
      return NextResponse.json({ ok: true, ventaId: previa.id, total: Number(previa.total), repetida: true });
    }
    // Venta anulada (p. ej. quedó con productos equivocados): se vuelve a
    // registrar. A la anulada se le cambia el id_local para liberar
    // "web:<referencia>" (es único), en la misma transacción.

    const v = await prepararPedidoWeb(pedido);
    const consultas = [];
    if (previa) {
      consultas.push(sql`UPDATE ventas SET id_local = ${`${v.idLocal}:anulada:${previa.id}`.slice(0, 120)} WHERE id = ${previa.id} AND anulada = true`);
    }
    consultas.push(
      sql`
        WITH nueva AS (
          INSERT INTO ventas (total, medio_pago, vendedor_id, turno_id, creado_en, evento, cliente_nombre, cliente_telefono, id_local)
          VALUES (${v.total}, ${v.medioPago}, NULL, NULL, COALESCE(${v.fecha}::timestamptz, now()),
                  ${CANAL_WEB}, ${v.clienteNombre}, ${v.clienteTelefono}, ${v.idLocal})
          RETURNING id
        )
        SELECT id, set_config('pos.id_venta', id::text, true) FROM nueva
      `,
      sql`
        INSERT INTO pagos_venta (venta_id, medio_pago, monto)
        VALUES (current_setting('pos.id_venta')::int, ${v.medioPago}, ${v.total})
      `
    );
    for (const l of v.lineas) {
      if (l.inventariable) {
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
        VALUES (${l.producto_id}, ${l.bodega_id}, 'venta', ${l.cantidad}, ${l.precio}, ${l.descuento}, current_setting('pos.id_venta')::int, ${v.nota})
      `);
    }
    // Las unidades que estaban apartadas para este pedido ya se descontaron
    // de verdad: el apartado se libera en la misma transacción.
    await asegurarApartados();
    consultas.push(consultaLiberar(v.referencia, 'vendido'));
    if (await costoListo()) consultas.push(consultaGuardarCosto('pos.id_venta'));

    let resultados;
    try {
      resultados = await sql.transaction(consultas);
    } catch (error) {
      if (esErrorDeGuardia(error)) {
        return NextResponse.json({ ok: false, error: 'Mientras se registraba, otra venta se llevó unidades de un producto. No se guardó nada: vuelve a intentar.' }, { status: 409 });
      }
      if (/ventas_id_local_unico|duplicate key/i.test(error.message || '')) {
        const ya = await ventaDelPedido(v.referencia);
        if (ya) return NextResponse.json({ ok: true, ventaId: ya.id, total: Number(ya.total), repetida: true });
      }
      throw error;
    }
    return NextResponse.json({
      ok: true,
      ventaId: resultados[previa ? 1 : 0][0].id,
      total: v.total,
      lineas: v.lineas.map((l) => ({ nombre: l.nombre, referencia: l.referencia, cantidad: l.cantidad, bodega: l.bodega_nombre })),
    });
  } catch (error) {
    if (error instanceof ErrorVenta) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
