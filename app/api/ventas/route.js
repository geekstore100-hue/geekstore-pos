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
    const { items, medio_pago, vendedor_id, pagos: pagosBody } = await request.json();

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
    for (const item of items) {
      const [producto] = await sql`SELECT es_inventariable FROM productos WHERE id = ${item.producto_id}`;
      if (!producto) {
        return NextResponse.json({ ok: false, error: 'Uno de los productos ya no existe' }, { status: 400 });
      }
      item._inventariable = producto.es_inventariable !== false;
      if (!item._inventariable) continue;

      const [row] = await sql`
        SELECT cantidad FROM stock WHERE producto_id = ${item.producto_id} AND bodega_id = ${bodegaId}
      `;
      const disponible = row?.cantidad ?? 0;
      if (disponible < item.cantidad) {
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

    const [venta] = await sql`
      INSERT INTO ventas (total, medio_pago, vendedor_id, turno_id)
      VALUES (${total}, ${medioPagoGuardado}, ${vendedor_id || null}, ${turnoAbierto.id})
      RETURNING id
    `;

    // El detalle de pago se guarda siempre en pagos_venta (aunque sea un
    // solo medio de pago), para que el cuadre de caja de turnos solo tenga
    // que mirar una sola tabla.
    const pagosAGuardar = esPagoCombinado ? pagos : [{ medio_pago, monto: total }];
    for (const p of pagosAGuardar) {
      await sql`
        INSERT INTO pagos_venta (venta_id, medio_pago, monto)
        VALUES (${venta.id}, ${p.medio_pago}, ${p.monto})
      `;
    }

    for (const item of itemsConTotal) {
      if (item._inventariable) {
        await sql`
          UPDATE stock SET cantidad = cantidad - ${item.cantidad}
          WHERE producto_id = ${item.producto_id} AND bodega_id = ${bodegaId}
        `;
      }
      // Se registra el movimiento igual para los servicios, para que el
      // ítem quede en el detalle de la venta y en el ticket, aunque no
      // toque la tabla stock.
      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, venta_id)
        VALUES (${item.producto_id}, ${bodegaId}, 'venta', ${item.cantidad}, ${item.precioNeto}, ${item.descuento_porcentaje || 0}, ${venta.id})
      `;
    }

    return NextResponse.json({ ok: true, ventaId: venta.id, total, pagos: pagosAGuardar });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
