import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

async function bodegaPrincipalId() {
  const [b] = await sql`SELECT id FROM bodegas WHERE nombre = 'Principal'`;
  return b?.id;
}

export async function GET() {
  try {
    const compras = await sql`
      SELECT
        c.id,
        c.numero_factura,
        c.fecha_compra,
        c.fecha_vencimiento,
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
    const { items, numero_factura, fecha_compra, fecha_vencimiento, notas, proveedor_id, bodega_id } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'Agrega al menos un producto' }, { status: 400 });
    }

    let bodegaId = bodega_id ? Number(bodega_id) : null;
    if (!bodegaId) {
      bodegaId = await bodegaPrincipalId();
    }
    if (!bodegaId) {
      return NextResponse.json({ ok: false, error: 'Selecciona una bodega' }, { status: 400 });
    }

    // El proveedor ya debe existir (se crea desde el panel de "+ Nuevo proveedor" antes de guardar la compra)
    const proveedorId = proveedor_id || null;
    if (!proveedorId) {
      return NextResponse.json({ ok: false, error: 'Selecciona o crea un proveedor' }, { status: 400 });
    }

    const itemsConTotal = items.map((item) => {
      const descuento = Number(item.descuento_porcentaje) || 0;
      const precioNeto = Number(item.precio_unitario) * (1 - descuento / 100);
      return { ...item, precioNeto, subtotal: precioNeto * Number(item.cantidad) };
    });
    const total = itemsConTotal.reduce((acc, i) => acc + i.subtotal, 0);

    const [compra] = await sql`
      INSERT INTO compras (proveedor_id, numero_factura, fecha_compra, fecha_vencimiento, notas, total)
      VALUES (${proveedorId}, ${numero_factura || null}, ${fecha_compra || null}, ${fecha_vencimiento || null}, ${notas || null}, ${total})
      RETURNING id
    `;

    for (const item of itemsConTotal) {
      // Costo promedio ponderado móvil (cumple NIC 2 / NIIF para pymes):
      // el nuevo costo se calcula con el stock y costo actuales ANTES de sumar esta compra.
      const [actual] = await sql`
        SELECT COALESCE(s.cantidad, 0) AS cantidad, COALESCE(pr.precio_costo, 0) AS precio_costo
        FROM productos pr
        LEFT JOIN stock s ON s.producto_id = pr.id AND s.bodega_id = ${bodegaId}
        WHERE pr.id = ${item.producto_id}
      `;
      const stockActual = Number(actual?.cantidad) || 0;
      const costoActual = Number(actual?.precio_costo) || 0;
      const cantidadComprada = Number(item.cantidad);
      const stockNuevo = stockActual + cantidadComprada;
      const costoPromedioNuevo =
        stockNuevo > 0 ? (stockActual * costoActual + cantidadComprada * item.precioNeto) / stockNuevo : item.precioNeto;

      await sql`
        INSERT INTO stock (producto_id, bodega_id, cantidad)
        VALUES (${item.producto_id}, ${bodegaId}, ${item.cantidad})
        ON CONFLICT (producto_id, bodega_id)
        DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad
      `;
      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, compra_id, nota)
        VALUES (${item.producto_id}, ${bodegaId}, 'entrada', ${item.cantidad}, ${item.precioNeto}, ${item.descuento_porcentaje || 0}, ${compra.id}, ${item.observaciones || null})
      `;
      // Actualiza el costo del producto al promedio ponderado móvil (no al último precio pagado)
      await sql`
        UPDATE productos SET precio_costo = ${costoPromedioNuevo}, actualizado_en = now()
        WHERE id = ${item.producto_id}
      `;
    }

    return NextResponse.json({ ok: true, compraId: compra.id, total });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
