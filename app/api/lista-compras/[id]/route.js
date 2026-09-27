import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Edita un ítem de la lista de compras: cambiar el proveedor asignado, la
// cantidad, o marcarlo como comprado (no se borra, para no perder el
// historial de qué se pidió y cuándo).
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const itemId = Number(id);
    if (!itemId) {
      return NextResponse.json({ ok: false, error: 'Ítem inválido' }, { status: 400 });
    }

    const [item] = await sql`SELECT id, producto_id FROM lista_compras_items WHERE id = ${itemId}`;
    if (!item) {
      return NextResponse.json({ ok: false, error: 'El ítem no existe' }, { status: 404 });
    }

    const body = await request.json();

    if (body.marcarComprado) {
      await sql`UPDATE lista_compras_items SET comprado_en = NOW() WHERE id = ${itemId}`;
      return NextResponse.json({ ok: true });
    }

    if (body.proveedor_id !== undefined) {
      const proveedor_id = body.proveedor_id ? Number(body.proveedor_id) : null;
      if (proveedor_id) {
        const [proveedor] = await sql`SELECT id FROM proveedores WHERE id = ${proveedor_id}`;
        if (!proveedor) {
          return NextResponse.json({ ok: false, error: 'El proveedor ya no existe' }, { status: 404 });
        }
      }

      // Al asignar (o cambiar) el proveedor, se actualiza también el precio
      // de referencia al ÚLTIMO precio que se le pagó a ese proveedor por
      // este producto — así el precio que se ve siempre corresponde al
      // proveedor elegido, no se queda con el de otro.
      let precioReferencia = null;
      if (proveedor_id) {
        const [ultimaCompra] = await sql`
          SELECT m.precio_unitario
          FROM movimientos_stock m
          JOIN facturas_compra f ON f.id = m.factura_compra_id
          WHERE m.tipo = 'factura_compra' AND m.producto_id = ${item.producto_id} AND f.proveedor_id = ${proveedor_id}
          ORDER BY f.fecha_creacion DESC, m.id DESC
          LIMIT 1
        `;
        if (ultimaCompra) precioReferencia = Number(ultimaCompra.precio_unitario);
      }

      if (precioReferencia !== null) {
        await sql`
          UPDATE lista_compras_items SET proveedor_id = ${proveedor_id}, precio_referencia = ${precioReferencia}
          WHERE id = ${itemId}
        `;
      } else {
        await sql`UPDATE lista_compras_items SET proveedor_id = ${proveedor_id} WHERE id = ${itemId}`;
      }
    }

    if (body.cantidad !== undefined) {
      const cantidad = Number(body.cantidad);
      if (!(cantidad > 0)) {
        return NextResponse.json({ ok: false, error: 'La cantidad debe ser mayor a cero' }, { status: 400 });
      }
      await sql`UPDATE lista_compras_items SET cantidad = ${cantidad} WHERE id = ${itemId}`;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Quita un ítem de la lista (por ejemplo si se agregó por error).
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const itemId = Number(id);
    if (!itemId) {
      return NextResponse.json({ ok: false, error: 'Ítem inválido' }, { status: 400 });
    }
    await sql`DELETE FROM lista_compras_items WHERE id = ${itemId}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
