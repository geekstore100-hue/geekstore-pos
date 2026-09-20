import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Historial de traspasos recientes entre bodegas (para la lista de
// "traspasos recientes" en la pantalla de Reabastecimiento).
export async function GET() {
  try {
    const traspasos = await sql`
      SELECT
        t.id,
        t.cantidad,
        t.observaciones,
        t.creado_en,
        p.referencia,
        p.nombre AS producto_nombre,
        bo.nombre AS bodega_origen_nombre,
        bd.nombre AS bodega_destino_nombre
      FROM traspasos_inventario t
      JOIN productos p ON p.id = t.producto_id
      JOIN bodegas bo ON bo.id = t.bodega_origen_id
      JOIN bodegas bd ON bd.id = t.bodega_destino_id
      ORDER BY t.creado_en DESC
      LIMIT 30
    `;
    return NextResponse.json({ ok: true, traspasos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Mueve stock de una bodega a otra para el mismo producto, en un solo paso:
// descuenta en la bodega origen, suma en la bodega destino, y deja registro
// tanto en traspasos_inventario como en movimientos_stock (para que quede en
// el historial de movimientos del producto).
export async function POST(request) {
  try {
    const body = await request.json();
    const producto_id = Number(body.producto_id);
    const bodega_origen_id = Number(body.bodega_origen_id);
    const bodega_destino_id = Number(body.bodega_destino_id);
    const cantidad = Number(body.cantidad);
    const observaciones = body.observaciones || null;

    if (!producto_id || !bodega_origen_id || !bodega_destino_id) {
      return NextResponse.json({ ok: false, error: 'Faltan datos del traspaso' }, { status: 400 });
    }
    if (bodega_origen_id === bodega_destino_id) {
      return NextResponse.json({ ok: false, error: 'La bodega de origen y destino no pueden ser la misma' }, { status: 400 });
    }
    if (!cantidad || cantidad <= 0) {
      return NextResponse.json({ ok: false, error: 'La cantidad debe ser mayor a 0' }, { status: 400 });
    }

    const [producto] = await sql`SELECT id, es_inventariable FROM productos WHERE id = ${producto_id}`;
    if (!producto) {
      return NextResponse.json({ ok: false, error: 'Producto no encontrado' }, { status: 404 });
    }
    if (producto.es_inventariable === false) {
      return NextResponse.json({ ok: false, error: 'Este producto es un servicio y no maneja stock' }, { status: 400 });
    }

    const [origen] = await sql`
      SELECT COALESCE(cantidad, 0) AS cantidad
      FROM stock WHERE producto_id = ${producto_id} AND bodega_id = ${bodega_origen_id}
    `;
    const disponibleOrigen = Number(origen?.cantidad) || 0;
    if (disponibleOrigen < cantidad) {
      return NextResponse.json(
        { ok: false, error: `Stock insuficiente en la bodega de origen (disponible: ${disponibleOrigen})` },
        { status: 409 }
      );
    }

    await sql`
      UPDATE stock SET cantidad = cantidad - ${cantidad}
      WHERE producto_id = ${producto_id} AND bodega_id = ${bodega_origen_id}
    `;

    await sql`
      INSERT INTO stock (producto_id, bodega_id, cantidad)
      VALUES (${producto_id}, ${bodega_destino_id}, ${cantidad})
      ON CONFLICT (producto_id, bodega_id) DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
    `;

    const [traspaso] = await sql`
      INSERT INTO traspasos_inventario (producto_id, bodega_origen_id, bodega_destino_id, cantidad, observaciones)
      VALUES (${producto_id}, ${bodega_origen_id}, ${bodega_destino_id}, ${cantidad}, ${observaciones})
      RETURNING id
    `;

    await sql`
      INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, traspaso_id)
      VALUES (${producto_id}, ${bodega_origen_id}, 'traspaso_salida', ${cantidad}, ${traspaso.id})
    `;
    await sql`
      INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, traspaso_id)
      VALUES (${producto_id}, ${bodega_destino_id}, 'traspaso_entrada', ${cantidad}, ${traspaso.id})
    `;

    return NextResponse.json({ ok: true, traspasoId: traspaso.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
