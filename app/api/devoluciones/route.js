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
            SELECT d.id, d.cantidad, d.monto, d.motivo, d.creado_en, p.referencia, p.nombre
            FROM devoluciones d
            JOIN productos p ON p.id = d.producto_id
            WHERE d.creado_en::date BETWEEN ${desde} AND ${hasta}
            ORDER BY d.creado_en DESC
          `
        : await sql`
            SELECT d.id, d.cantidad, d.monto, d.motivo, d.creado_en, p.referencia, p.nombre
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

// Registra una devolución de dinero en efectivo por un producto, sin
// necesidad de indicar de qué venta viene. El valor a devolver lo escribe
// libremente quien registra la devolución (no tiene que coincidir con el
// precio de venta). Si el producto maneja inventario, se le repone el
// stock en la bodega Principal. Se descuenta del "dinero esperado en caja"
// del turno abierto en el momento de la devolución.
export async function POST(request) {
  try {
    const body = await request.json();
    const producto_id = Number(body.producto_id);
    const cantidad = Number(body.cantidad) || 0;
    const monto = Number(body.monto);
    const motivo = body.motivo || null;

    if (!producto_id) {
      return NextResponse.json({ ok: false, error: 'Selecciona un producto' }, { status: 400 });
    }
    if (!monto || monto <= 0) {
      return NextResponse.json({ ok: false, error: 'Ingresa un valor a devolver mayor a 0' }, { status: 400 });
    }

    const [turnoAbierto] = await sql`SELECT id FROM turnos WHERE estado = 'abierto' LIMIT 1`;
    if (!turnoAbierto) {
      return NextResponse.json({ ok: false, error: 'Debes abrir un turno antes de procesar una devolución' }, { status: 409 });
    }

    const [producto] = await sql`SELECT id, es_inventariable FROM productos WHERE id = ${producto_id}`;
    if (!producto) {
      return NextResponse.json({ ok: false, error: 'Producto no encontrado' }, { status: 404 });
    }

    if (producto.es_inventariable !== false && cantidad > 0) {
      const [principal] = await sql`SELECT id FROM bodegas WHERE nombre = 'Principal'`;
      if (principal) {
        await sql`
          UPDATE stock SET cantidad = cantidad + ${cantidad}
          WHERE producto_id = ${producto_id} AND bodega_id = ${principal.id}
        `;
      }
    }

    const [devolucion] = await sql`
      INSERT INTO devoluciones (venta_id, producto_id, cantidad, monto, motivo, turno_id)
      VALUES (NULL, ${producto_id}, ${cantidad}, ${monto}, ${motivo}, ${turnoAbierto.id})
      RETURNING id
    `;

    return NextResponse.json({ ok: true, devolucionId: devolucion.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
