import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

async function bodegaKennedyId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Kennedy'`;
  return b?.id;
}

export async function GET() {
  try {
    const compras = await sql`
      SELECT
        c.id,
        c.numero_factura,
        c.fecha_compra,
        c.notas,
        c.total,
        c.creado_en,
        p.nombre AS proveedor_nombre,
        (SELECT COUNT(*) FROM movimientos_stock m WHERE m.compra_id = c.id) AS items
      FROM compras c
      LEFT JOIN proveedores p ON p.id = c.proveedor_id
      ORDER BY c.creado_en DESC
      LIMIT 30
    `;
    return NextResponse.json({ ok: true, compras });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { items, numero_factura, fecha_compra, notas, proveedor_id, proveedor_nuevo } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'Agrega al menos un producto' }, { status: 400 });
    }

    const bodegaId = await bodegaKennedyId();
    if (!bodegaId) {
      return NextResponse.json({ ok: false, error: 'No existe la bodega Kennedy' }, { status: 500 });
    }

    // Resolver proveedor: uno existente, o crear uno nuevo al vuelo
    let proveedorId = proveedor_id || null;
    if (!proveedorId && proveedor_nuevo && proveedor_nuevo.nombre && proveedor_nuevo.nombre.trim()) {
      const [nuevo] = await sql`
        INSERT INTO proveedores (nombre, identificacion, telefono)
        VALUES (${proveedor_nuevo.nombre.trim()}, ${proveedor_nuevo.identificacion || null}, ${proveedor_nuevo.telefono || null})
        RETURNING id
      `;
      proveedorId = nuevo.id;
    }

    const itemsConTotal = items.map((item) => {
      const descuento = Number(item.descuento_porcentaje) || 0;
      const precioNeto = Number(item.precio_unitario) * (1 - descuento / 100);
      return { ...item, precioNeto, subtotal: precioNeto * Number(item.cantidad) };
    });
    const total = itemsConTotal.reduce((acc, i) => acc + i.subtotal, 0);

    const [compra] = await sql`
      INSERT INTO compras (proveedor_id, numero_factura, fecha_compra, notas, total)
      VALUES (${proveedorId}, ${numero_factura || null}, ${fecha_compra || null}, ${notas || null}, ${total})
      RETURNING id
    `;

    for (const item of itemsConTotal) {
      await sql`
        INSERT INTO stock (producto_id, bodega_id, cantidad)
        VALUES (${item.producto_id}, ${bodegaId}, ${item.cantidad})
        ON CONFLICT (producto_id, bodega_id)
        DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
      `;
      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, compra_id)
        VALUES (${item.producto_id}, ${bodegaId}, 'entrada', ${item.cantidad}, ${item.precioNeto}, ${item.descuento_porcentaje || 0}, ${compra.id})
      `;
      // Actualiza el precio de costo del producto al último precio de compra
      await sql`
        UPDATE productos SET precio_costo = ${item.precioNeto}, actualizado_en = now()
        WHERE id = ${item.producto_id}
      `;
    }

    return NextResponse.json({ ok: true, compraId: compra.id, total });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
