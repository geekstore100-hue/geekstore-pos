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
              v.vendedor,
              v.creado_en,
              (SELECT COUNT(*) FROM movimientos_stock m WHERE m.venta_id = v.id) AS items
            FROM ventas v
            WHERE v.creado_en::date BETWEEN ${desde} AND ${hasta}
            ORDER BY v.creado_en DESC
          `
        : await sql`
            SELECT
              v.id,
              v.total,
              v.medio_pago,
              v.vendedor,
              v.creado_en,
              (SELECT COUNT(*) FROM movimientos_stock m WHERE m.venta_id = v.id) AS items
            FROM ventas v
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
    const { items, medio_pago, vendedor } = await request.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'Agrega al menos un producto' }, { status: 400 });
    }
    if (!medio_pago) {
      return NextResponse.json({ ok: false, error: 'Selecciona el medio de pago' }, { status: 400 });
    }

    const bodegaId = await bodegaPrincipalId();
    if (!bodegaId) {
      return NextResponse.json({ ok: false, error: 'No existe la bodega Principal' }, { status: 500 });
    }

    // Fase 1: validar que haya stock suficiente para cada ítem antes de escribir nada
    for (const item of items) {
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

    const [venta] = await sql`
      INSERT INTO ventas (total, medio_pago, vendedor)
      VALUES (${total}, ${medio_pago}, ${vendedor || null})
      RETURNING id
    `;

    for (const item of itemsConTotal) {
      await sql`
        UPDATE stock SET cantidad = cantidad - ${item.cantidad}
        WHERE producto_id = ${item.producto_id} AND bodega_id = ${bodegaId}
      `;
      await sql`
        INSERT INTO movimientos_stock (producto_id, bodega_id, tipo, cantidad, precio_unitario, descuento_porcentaje, venta_id)
        VALUES (${item.producto_id}, ${bodegaId}, 'venta', ${item.cantidad}, ${item.precioNeto}, ${item.descuento_porcentaje || 0}, ${venta.id})
      `;
    }

    return NextResponse.json({ ok: true, ventaId: venta.id, total });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
