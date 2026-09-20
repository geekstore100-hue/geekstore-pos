import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Historial de devoluciones (para el listado de la página de Devoluciones).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    const devoluciones =
      desde && hasta
        ? await sql`
            SELECT d.id, d.venta_id, d.cantidad, d.monto, d.motivo, d.creado_en, p.referencia, p.nombre
            FROM devoluciones d
            JOIN productos p ON p.id = d.producto_id
            WHERE d.creado_en::date BETWEEN ${desde} AND ${hasta}
            ORDER BY d.creado_en DESC
          `
        : await sql`
            SELECT d.id, d.venta_id, d.cantidad, d.monto, d.motivo, d.creado_en, p.referencia, p.nombre
            FROM devoluciones d
            JOIN productos p ON p.id = d.producto_id
            WHERE d.creado_en >= CURRENT_DATE
            ORDER BY d.creado_en DESC
          `;

    return NextResponse.json({ ok: true, devoluciones });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Registra la devolución de (parte de) un producto de una venta ya
// facturada, con devolución de dinero en efectivo. Se descuenta del
// "dinero esperado en caja" del turno abierto en el momento de la
// devolución (no necesariamente el mismo turno en el que se hizo la venta).
export async function POST(request) {
  try {
    const body = await request.json();
    const venta_id = Number(body.venta_id);
    const producto_id = Number(body.producto_id);
    const cantidad = Number(body.cantidad);
    const motivo = body.motivo || null;

    if (!venta_id || !producto_id || !cantidad || cantidad <= 0) {
      return NextResponse.json({ ok: false, error: 'Faltan datos para procesar la devolución' }, { status: 400 });
    }

    const [turnoAbierto] = await sql`SELECT id FROM turnos WHERE estado = 'abierto' LIMIT 1`;
    if (!turnoAbierto) {
      return NextResponse.json({ ok: false, error: 'Debes abrir un turno antes de procesar una devolución' }, { status: 409 });
    }

    const [venta] = await sql`SELECT id, anulada FROM ventas WHERE id = ${venta_id}`;
    if (!venta) {
      return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
    }
    if (venta.anulada) {
      return NextResponse.json({ ok: false, error: 'Esta venta ya está anulada, no se puede hacer una devolución sobre ella' }, { status: 409 });
    }

    const [movimiento] = await sql`
      SELECT producto_id, bodega_id, cantidad, precio_unitario, descuento_porcentaje
      FROM movimientos_stock
      WHERE venta_id = ${venta_id} AND producto_id = ${producto_id} AND tipo = 'venta'
    `;
    if (!movimiento) {
      return NextResponse.json({ ok: false, error: 'Ese producto no está en esta venta' }, { status: 400 });
    }

    const [{ total_devuelto }] = await sql`
      SELECT COALESCE(SUM(cantidad), 0) AS total_devuelto
      FROM devoluciones
      WHERE venta_id = ${venta_id} AND producto_id = ${producto_id}
    `;

    const disponible = Number(movimiento.cantidad) - Number(total_devuelto);
    if (cantidad > disponible) {
      return NextResponse.json(
        { ok: false, error: `Solo puedes devolver hasta ${disponible} unidad(es) de este producto` },
        { status: 409 }
      );
    }

    const descuento = Number(movimiento.descuento_porcentaje) || 0;
    const precioNeto = Number(movimiento.precio_unitario) * (1 - descuento / 100);
    const monto = precioNeto * cantidad;

    const [producto] = await sql`SELECT es_inventariable FROM productos WHERE id = ${producto_id}`;
    if (producto?.es_inventariable !== false) {
      await sql`
        UPDATE stock SET cantidad = cantidad + ${cantidad}
        WHERE producto_id = ${producto_id} AND bodega_id = ${movimiento.bodega_id}
      `;
    }

    const [devolucion] = await sql`
      INSERT INTO devoluciones (venta_id, producto_id, cantidad, monto, motivo, turno_id)
      VALUES (${venta_id}, ${producto_id}, ${cantidad}, ${monto}, ${motivo}, ${turnoAbierto.id})
      RETURNING id
    `;

    return NextResponse.json({ ok: true, devolucionId: devolucion.id, monto });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
