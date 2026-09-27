import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

async function bodegaPrincipalId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Principal'`;
  return b?.id;
}

// La bodega "Garantías con Proveedor" la crea la migración de este módulo;
// si por algún motivo no existe todavía (por ejemplo no se corrió la
// migración), se crea sola acá para que el sistema no se quede sin poder
// funcionar.
async function bodegaGarantiasId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Garantías con Proveedor'`;
  if (b) return b.id;
  const [nuevo] = await sql`INSERT INTO bodegas (nombre) VALUES ('Garantías con Proveedor') RETURNING id`;
  return nuevo.id;
}

// Historial de casos de garantía con proveedores: cada caso puede traer
// varios productos, así que se muestra junto con cuántos hay en total y
// cuántos quedan pendientes de resolver.
export async function GET() {
  try {
    const garantias = await sql`
      SELECT
        g.id,
        g.motivo,
        g.observaciones,
        g.estado,
        g.total_costo,
        g.enviado_en,
        g.resuelto_en,
        p.nombre AS proveedor_nombre,
        COUNT(i.id) AS items,
        COUNT(i.id) FILTER (WHERE i.resolucion IS NULL) AS items_pendientes,
        COALESCE(SUM(i.cantidad), 0) AS unidades
      FROM garantias_proveedor g
      JOIN proveedores p ON p.id = g.proveedor_id
      LEFT JOIN garantia_proveedor_items i ON i.garantia_id = g.id
      GROUP BY g.id, p.nombre
      ORDER BY (g.estado = 'enviada') DESC, g.enviado_en DESC
      LIMIT 200
    `;
    return NextResponse.json({ ok: true, garantias });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Crea un caso nuevo (documento que puede traer varios productos de un solo
// proveedor). Descuenta el stock de la bodega Principal y lo suma en la
// bodega virtual "Garantías con Proveedor", dejando "fotografiado" el costo
// de cada producto en el momento del envío (por si el costo cambia después
// en el catálogo, el valor de este caso no se altera).
export async function POST(request) {
  try {
    const body = await request.json();
    const proveedor_id = Number(body.proveedor_id);
    const motivo = body.motivo || null;
    const observaciones = body.observaciones || null;
    const itemsBody = Array.isArray(body.items) ? body.items : [];

    if (!proveedor_id) {
      return NextResponse.json({ ok: false, error: 'Selecciona el proveedor' }, { status: 400 });
    }
    if (itemsBody.length === 0) {
      return NextResponse.json({ ok: false, error: 'Agrega al menos un producto' }, { status: 400 });
    }

    const [proveedor] = await sql`SELECT id FROM proveedores WHERE id = ${proveedor_id}`;
    if (!proveedor) {
      return NextResponse.json({ ok: false, error: 'El proveedor ya no existe' }, { status: 404 });
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

    const bodegaPrincipal = await bodegaPrincipalId();
    if (!bodegaPrincipal) {
      return NextResponse.json({ ok: false, error: 'No existe la bodega Principal' }, { status: 500 });
    }

    const stockPrincipalFilas = await sql`
      SELECT producto_id, COALESCE(cantidad, 0) AS cantidad
      FROM stock WHERE bodega_id = ${bodegaPrincipal} AND producto_id = ANY(${productoIds})
    `;
    const stockPrincipalPorProducto = new Map(stockPrincipalFilas.map((f) => [f.producto_id, Number(f.cantidad)]));

    const productoPorId = new Map(productos.map((p) => [p.id, p]));
    for (const [productoId, cantidad] of cantidadesPorProducto) {
      const disponible = stockPrincipalPorProducto.get(productoId) || 0;
      if (disponible < cantidad) {
        return NextResponse.json(
          {
            ok: false,
            error: `Stock insuficiente de "${productoPorId.get(productoId).nombre}" en la bodega Principal (disponible: ${disponible})`,
          },
          { status: 409 }
        );
      }
    }

    const bodegaGarantias = await bodegaGarantiasId();

    let totalCosto = 0;
    for (const [productoId, cantidad] of cantidadesPorProducto) {
      totalCosto += (Number(productoPorId.get(productoId).precio_costo) || 0) * cantidad;
    }

    const [garantia] = await sql`
      INSERT INTO garantias_proveedor (proveedor_id, motivo, observaciones, total_costo)
      VALUES (${proveedor_id}, ${motivo}, ${observaciones}, ${totalCosto})
      RETURNING id
    `;

    for (const [productoId, cantidad] of cantidadesPorProducto) {
      const producto = productoPorId.get(productoId);
      const costo = Number(producto.precio_costo) || 0;
      const stockAntesPrincipal = stockPrincipalPorProducto.get(productoId) || 0;

      await sql`
        UPDATE stock SET cantidad = cantidad - ${cantidad}
        WHERE producto_id = ${productoId} AND bodega_id = ${bodegaPrincipal}
      `;
      await sql`
        INSERT INTO stock (producto_id, bodega_id, cantidad)
        VALUES (${productoId}, ${bodegaGarantias}, ${cantidad})
        ON CONFLICT (producto_id, bodega_id) DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
      `;

      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, garantia_id, stock_antes)
        VALUES (${productoId}, ${bodegaPrincipal}, 'garantia_salida', ${cantidad}, ${costo}, ${garantia.id}, ${stockAntesPrincipal})
      `;
      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, garantia_id)
        VALUES (${productoId}, ${bodegaGarantias}, 'garantia_entrada', ${cantidad}, ${costo}, ${garantia.id})
      `;

      await sql`
        INSERT INTO garantia_proveedor_items (garantia_id, producto_id, referencia, nombre, cantidad, precio_costo)
        VALUES (${garantia.id}, ${productoId}, ${producto.referencia}, ${producto.nombre}, ${cantidad}, ${costo})
      `;
    }

    return NextResponse.json({ ok: true, garantiaId: garantia.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
