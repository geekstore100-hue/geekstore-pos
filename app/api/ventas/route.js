import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

async function bodegaPrincipalId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Principal'`;
  return b?.id;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    const ventas =
      desde && hasta
        ? await sql`
            SELECT
              v.id,
              v.total,
              v.medio_pago,
              ve.nombre AS vendedor_nombre,
              v.creado_en,
              v.anulada,
              v.anulada_en,
              (SELECT COUNT(*) FROM movimientos_stock m WHERE m.venta_id = v.id) AS items
            FROM ventas v
            LEFT JOIN vendedores ve ON ve.id = v.vendedor_id
            WHERE v.creado_en::date BETWEEN ${desde} AND ${hasta}
            ORDER BY v.creado_en DESC
          `
        : await sql`
            SELECT
              v.id,
              v.total,
              v.medio_pago,
              ve.nombre AS vendedor_nombre,
              v.creado_en,
              v.anulada,
              v.anulada_en,
              (SELECT COUNT(*) FROM movimientos_stock m WHERE m.venta_id = v.id) AS items
            FROM ventas v
            LEFT JOIN vendedores ve ON ve.id = v.vendedor_id
            WHERE v.creado_en >= CURRENT_DATE
            ORDER BY v.creado_en DESC
          `;
    return NextResponse.json({ ok: true, ventas });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { items, medio_pago, vendedor_id, pagos: pagosBody, fecha_offline } = await request.json();

    // fecha_offline: cuando una venta se hizo sin conexión (ver /ventas y
    // lib/offlineVentas.js) y se está sincronizando después, este es el
    // momento REAL en que se hizo la venta en la caja, no el momento en que
    // por fin se pudo enviar al servidor (que puede ser horas o hasta un día
    // después). Se usa para creado_en si viene y es una fecha válida; si no
    // viene (venta normal, hecha con internet), se usa el momento actual
    // como siempre.
    let fechaVenta = null;
    if (fecha_offline) {
      const f = new Date(fecha_offline);
      if (!Number.isNaN(f.getTime())) fechaVenta = f.toISOString();
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'Agrega al menos un producto' }, { status: 400 });
    }

    // Pago combinado: viene un arreglo "pagos" con varios medios de pago en
    // vez de un solo "medio_pago" (ej. una parte en efectivo y otra con
    // tarjeta). Si no viene, se sigue comportando exactamente igual que
    // antes (un solo medio de pago para toda la venta).
    const esPagoCombinado = Array.isArray(pagosBody) && pagosBody.length > 0;

    if (!esPagoCombinado && !medio_pago) {
      return NextResponse.json({ ok: false, error: 'Selecciona el medio de pago' }, { status: 400 });
    }

    let pagos = [];
    if (esPagoCombinado) {
      for (const p of pagosBody) {
        if (!p.medio_pago || !(Number(p.monto) > 0)) {
          return NextResponse.json({ ok: false, error: 'Revisa los montos del pago combinado' }, { status: 400 });
        }
      }
      pagos = pagosBody.map((p) => ({ medio_pago: p.medio_pago, monto: Number(p.monto) }));
    }

    // No se puede vender sin un turno de caja abierto. El turno se determina
    // del lado del servidor (no se confía en lo que mande el navegador).
    const [turnoAbierto] = await sql`SELECT id FROM turnos WHERE estado = 'abierto' LIMIT 1`;
    if (!turnoAbierto) {
      return NextResponse.json({ ok: false, error: 'Debes abrir un turno antes de vender' }, { status: 409 });
    }

    const bodegaId = await bodegaPrincipalId();
    if (!bodegaId) {
      return NextResponse.json({ ok: false, error: 'No existe la bodega Principal' }, { status: 500 });
    }

    // Fase 1: validar que haya stock suficiente para cada ítem antes de escribir nada.
    // Los servicios (es_inventariable = false, ej. servicio técnico o de envío) no
    // manejan stock, así que no se validan ni se descuentan.
    // Antes esto eran 2 consultas por producto (una tras otra); ahora es UNA
    // sola consulta para todos los productos de la venta.
    const ids = [...new Set(items.map((i) => Number(i.producto_id)))];
    const filas = await sql`
      SELECT p.id, p.es_inventariable, COALESCE(s.cantidad, 0) AS disponible
      FROM productos p
      LEFT JOIN stock s ON s.producto_id = p.id AND s.bodega_id = ${bodegaId}
      WHERE p.id = ANY(${ids}::int[])
    `;
    const infoPorId = new Map(filas.map((f) => [Number(f.id), f]));
    const pedidoPorId = new Map();
    for (const item of items) {
      const info = infoPorId.get(Number(item.producto_id));
      if (!info) {
        return NextResponse.json({ ok: false, error: 'Uno de los productos ya no existe' }, { status: 400 });
      }
      item._inventariable = info.es_inventariable !== false;
      if (item._inventariable) {
        const id = Number(item.producto_id);
        pedidoPorId.set(id, (pedidoPorId.get(id) || 0) + Number(item.cantidad));
      }
    }
    for (const [id, pedido] of pedidoPorId) {
      const disponible = Number(infoPorId.get(id).disponible);
      if (disponible < pedido) {
        return NextResponse.json(
          { ok: false, error: `Stock insuficiente para uno de los productos (disponible: ${disponible})` },
          { status: 409 }
        );
      }
    }

    const itemsConTotal = items.map((item) => {
      const descuento = Number(item.descuento_porcentaje) || 0;
      const precioNeto = Number(item.precio_unitario) * (1 - descuento / 100);
      return { ...item, precioNeto, subtotal: precioNeto * Number(item.cantidad) };
    });
    const total = itemsConTotal.reduce((acc, i) => acc + i.subtotal, 0);

    if (esPagoCombinado) {
      const sumaPagos = pagos.reduce((acc, p) => acc + p.monto, 0);
      // Se permite una diferencia mínima (redondeo de centavos), no una
      // diferencia real de dinero.
      if (Math.abs(sumaPagos - total) > 1) {
        return NextResponse.json(
          { ok: false, error: `Los montos del pago combinado (${sumaPagos}) no suman el total de la venta (${total})` },
          { status: 400 }
        );
      }
    }

    // Para el texto que se ve en el historial y en el ticket: si es un solo
    // medio de pago, se deja tal cual ("Efectivo"); si es combinado, se arma
    // un texto tipo "Efectivo + Tarjeta" a partir de los medios usados.
    const medioPagoGuardado = esPagoCombinado
      ? [...new Set(pagos.map((p) => p.medio_pago))].join(' + ')
      : medio_pago;

    // Fase 2: guardar TODO en una sola transacción — la venta, sus pagos, el
    // descuento de stock y los movimientos. Antes eran muchos pasos sueltos
    // (unos 4 por producto): si la conexión se caía en medio, podía quedar
    // la venta registrada sin descontar el inventario, o descontado a
    // medias. Ahora es todo o nada: si cualquier paso falla, no se guarda
    // ningún pedazo. Además va en UN solo viaje a la base de datos, así que
    // es bastante más rápido y gasta menos Neon.
    //
    // Como todo se manda de una vez, los pasos no pueden "ver" el id de la
    // venta que acaba de crearse desde aquí. Por eso el primer paso, al
    // crear la venta, deja su id anotado en una variable que solo existe
    // dentro de esta transacción (set_config(..., true)), y los demás pasos
    // la leen con current_setting('pos.id_venta'). Si por algo no estuviera
    // anotada, la lectura da error y se cancela todo (nunca queda un pago o
    // un movimiento sin enlazar a su venta).
    const pagosAGuardar = esPagoCombinado ? pagos : [{ medio_pago, monto: total }];

    const consultas = [
      sql`
        WITH nueva AS (
          INSERT INTO ventas (total, medio_pago, vendedor_id, turno_id, creado_en)
          VALUES (${total}, ${medioPagoGuardado}, ${vendedor_id || null}, ${turnoAbierto.id}, COALESCE(${fechaVenta}, now()))
          RETURNING id
        )
        SELECT id, set_config('pos.id_venta', id::text, true) FROM nueva
      `,
    ];

    // El detalle de pago se guarda siempre en pagos_venta (aunque sea un
    // solo medio de pago), para que el cuadre de caja de turnos solo tenga
    // que mirar una sola tabla.
    for (const p of pagosAGuardar) {
      consultas.push(sql`
        INSERT INTO pagos_venta (venta_id, medio_pago, monto)
        VALUES (current_setting('pos.id_venta')::int, ${p.medio_pago}, ${p.monto})
      `);
    }

    for (const item of itemsConTotal) {
      if (item._inventariable) {
        // Descuenta el stock SOLO si todavía alcanza (cantidad >= lo
        // vendido). Si en el último segundo otra caja se llevó esas
        // unidades, la actualización no toca ninguna fila, el conteo da 0 y
        // la división entre 0 hace fallar la transacción a propósito: así
        // se cancela TODA la venta en vez de dejar el stock en negativo.
        // (El conteo se calcula al momento de ejecutar, no antes, por eso
        // solo falla cuando de verdad no alcanzó.)
        consultas.push(sql`
          WITH descontado AS (
            UPDATE stock SET cantidad = cantidad - ${item.cantidad}
            WHERE producto_id = ${item.producto_id} AND bodega_id = ${bodegaId} AND cantidad >= ${item.cantidad}
            RETURNING 1
          )
          SELECT 1 / c.n AS ok FROM (SELECT COUNT(*)::int AS n FROM descontado) c
        `);
      }
      // Se registra el movimiento igual para los servicios, para que el
      // ítem quede en el detalle de la venta y en el ticket, aunque no
      // toque la tabla stock.
      consultas.push(sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, venta_id)
        VALUES (${item.producto_id}, ${bodegaId}, 'venta', ${item.cantidad}, ${item.precioNeto}, ${item.descuento_porcentaje || 0}, current_setting('pos.id_venta')::int)
      `);
    }

    let resultados;
    try {
      resultados = await sql.transaction(consultas);
    } catch (error) {
      if (/division by zero/i.test(error.message || '')) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Stock insuficiente: otra venta se llevó las últimas unidades de uno de los productos mientras se registraba esta. No se guardó nada — revisa el stock y vuelve a intentar.',
          },
          { status: 409 }
        );
      }
      throw error;
    }
    const venta = resultados[0][0];

    return NextResponse.json({ ok: true, ventaId: venta.id, total, pagos: pagosAGuardar });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
