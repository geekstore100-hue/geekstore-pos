import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Historial de traspasos recientes entre bodegas: ahora cada traspaso es un
// documento que puede traer varios productos, así que se muestra junto con
// cuántos productos y unidades trae, y si ya se pagó.
export async function GET() {
  try {
    const traspasos = await sql`
      SELECT
        t.id,
        t.creado_en,
        t.observaciones,
        t.valor_total,
        t.estado_pago,
        t.pagado_en,
        bo.nombre AS bodega_origen_nombre,
        bd.nombre AS bodega_destino_nombre,
        COALESCE(li.items, 0) AS items,
        COALESCE(li.unidades, 0) AS unidades
      FROM traspasos_inventario t
      JOIN bodegas bo ON bo.id = t.bodega_origen_id
      JOIN bodegas bd ON bd.id = t.bodega_destino_id
      LEFT JOIN (
        SELECT traspaso_id, COUNT(*) AS items, SUM(cantidad) AS unidades
        FROM movimientos_stock
        WHERE tipo = 'traspaso_salida' AND traspaso_id IS NOT NULL
        GROUP BY traspaso_id
      ) li ON li.traspaso_id = t.id
      ORDER BY t.creado_en DESC
      LIMIT 30
    `;
    return NextResponse.json({ ok: true, traspasos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Crea un traspaso como documento (puede traer varios productos de una vez).
// Descuenta stock en la bodega origen, suma en la bodega destino, calcula el
// valor total a precio de costo (para saber cuánto se le debe a la bodega de
// origen por esta mercancía) y deja "fotografiado" cuánto había en la bodega
// destino antes de que llegara cada producto, para el documento impreso de
// verificación.
export async function POST(request) {
  try {
    const body = await request.json();
    const bodega_origen_id = Number(body.bodega_origen_id);
    const bodega_destino_id = Number(body.bodega_destino_id);
    const observaciones = body.observaciones || null;
    const itemsBody = Array.isArray(body.items) ? body.items : [];

    if (!bodega_origen_id || !bodega_destino_id) {
      return NextResponse.json({ ok: false, error: 'Faltan las bodegas de origen y destino' }, { status: 400 });
    }
    if (bodega_origen_id === bodega_destino_id) {
      return NextResponse.json({ ok: false, error: 'La bodega de origen y destino no pueden ser la misma' }, { status: 400 });
    }
    if (itemsBody.length === 0) {
      return NextResponse.json({ ok: false, error: 'Agrega al menos un producto al traspaso' }, { status: 400 });
    }

    // Agrupa por producto por si el mismo producto quedó agregado dos veces.
    const cantidadesPorProducto = new Map();
    for (const it of itemsBody) {
      const productoId = Number(it.producto_id);
      const cantidad = Number(it.cantidad);
      if (!productoId || !cantidad || cantidad <= 0) {
        return NextResponse.json({ ok: false, error: 'Hay un producto con una cantidad inválida' }, { status: 400 });
      }
      cantidadesPorProducto.set(productoId, (cantidadesPorProducto.get(productoId) || 0) + cantidad);
    }
    const productoIds = [...cantidadesPorProducto.keys()];

    const productos = await sql`
      SELECT id, referencia, nombre, es_inventariable, precio_costo
      FROM productos WHERE id = ANY(${productoIds})
    `;
    if (productos.length !== productoIds.length) {
      return NextResponse.json({ ok: false, error: 'Uno de los productos ya no existe' }, { status: 404 });
    }
    const noInventariable = productos.find((p) => p.es_inventariable === false);
    if (noInventariable) {
      return NextResponse.json(
        { ok: false, error: `"${noInventariable.nombre}" es un servicio y no maneja stock` },
        { status: 400 }
      );
    }

    const stockOrigenFilas = await sql`
      SELECT producto_id, COALESCE(cantidad, 0) AS cantidad
      FROM stock WHERE bodega_id = ${bodega_origen_id} AND producto_id = ANY(${productoIds})
    `;
    const stockOrigenPorProducto = new Map(stockOrigenFilas.map((f) => [f.producto_id, Number(f.cantidad)]));

    for (const producto of productos) {
      const necesaria = cantidadesPorProducto.get(producto.id);
      const disponible = stockOrigenPorProducto.get(producto.id) || 0;
      if (disponible < necesaria) {
        return NextResponse.json(
          { ok: false, error: `Stock insuficiente de "${producto.nombre}" en la bodega de origen (disponible: ${disponible})` },
          { status: 409 }
        );
      }
    }

    const stockDestinoFilas = await sql`
      SELECT producto_id, COALESCE(cantidad, 0) AS cantidad
      FROM stock WHERE bodega_id = ${bodega_destino_id} AND producto_id = ANY(${productoIds})
    `;
    const stockDestinoPorProducto = new Map(stockDestinoFilas.map((f) => [f.producto_id, Number(f.cantidad)]));

    const productoPorId = new Map(productos.map((p) => [p.id, p]));
    let valorTotal = 0;
    for (const [productoId, cantidad] of cantidadesPorProducto) {
      const precioCosto = Number(productoPorId.get(productoId).precio_costo) || 0;
      valorTotal += precioCosto * cantidad;
    }

    const [traspaso] = await sql`
      INSERT INTO traspasos_inventario (bodega_origen_id, bodega_destino_id, observaciones, valor_total)
      VALUES (${bodega_origen_id}, ${bodega_destino_id}, ${observaciones}, ${valorTotal})
      RETURNING id
    `;

    for (const [productoId, cantidad] of cantidadesPorProducto) {
      const precioCosto = Number(productoPorId.get(productoId).precio_costo) || 0;
      const stockAntesOrigen = stockOrigenPorProducto.get(productoId) || 0;
      const stockAntesDestino = stockDestinoPorProducto.get(productoId) || 0;

      await sql`
        UPDATE stock SET cantidad = cantidad - ${cantidad}
        WHERE producto_id = ${productoId} AND bodega_id = ${bodega_origen_id}
      `;
      await sql`
        INSERT INTO stock (producto_id, bodega_id, cantidad)
        VALUES (${productoId}, ${bodega_destino_id}, ${cantidad})
        ON CONFLICT (producto_id, bodega_id) DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
      `;

      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, traspaso_id, precio_unitario, stock_antes)
        VALUES (${productoId}, ${bodega_origen_id}, 'traspaso_salida', ${cantidad}, ${traspaso.id}, ${precioCosto}, ${stockAntesOrigen})
      `;
      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, traspaso_id, precio_unitario, stock_antes)
        VALUES (${productoId}, ${bodega_destino_id}, 'traspaso_entrada', ${cantidad}, ${traspaso.id}, ${precioCosto}, ${stockAntesDestino})
      `;
    }

    return NextResponse.json({ ok: true, traspasoId: traspaso.id, valorTotal });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
