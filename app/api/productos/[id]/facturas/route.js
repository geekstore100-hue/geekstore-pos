import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// Facturas de venta y de compra en las que aparece un producto — para la
// pestaña "Facturas de venta / Facturas de compra" en la ficha de detalle
// de Productos (como en Alegra, pero con los datos propios del POS: acá
// no hay "cliente" en las ventas porque son ventas de mostrador, siempre
// a consumidor final).
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const productoId = Number(id);
    if (!productoId) {
      return NextResponse.json({ ok: false, error: 'Producto inválido' }, { status: 400 });
    }

    const ventas = await sql`
      SELECT
        v.id AS venta_id,
        v.creado_en,
        v.medio_pago,
        v.anulada,
        ve.nombre AS vendedor_nombre,
        m.cantidad,
        m.precio_unitario,
        m.descuento_porcentaje,
        (m.precio_unitario * (1 - COALESCE(m.descuento_porcentaje, 0) / 100) * m.cantidad) AS subtotal
      FROM movimientos_stock m
      JOIN ventas v ON v.id = m.venta_id
      LEFT JOIN vendedores ve ON ve.id = v.vendedor_id
      WHERE m.tipo = 'venta' AND m.producto_id = ${productoId}
      ORDER BY v.creado_en DESC
      LIMIT 200
    `;

    const comprasFacturas = await sql`
      SELECT
        f.id AS factura_id,
        f.numero,
        f.fecha_creacion,
        f.fecha_vencimiento,
        f.total AS total_factura,
        (f.total - f.retencion_valor) AS por_pagar,
        f.estado_pago,
        f.pagado_en,
        p.nombre AS proveedor_nombre,
        m.cantidad,
        m.precio_unitario,
        m.descuento_porcentaje,
        (m.precio_unitario * (1 - COALESCE(m.descuento_porcentaje, 0) / 100) * m.cantidad) AS subtotal
      FROM movimientos_stock m
      JOIN facturas_compra f ON f.id = m.factura_compra_id
      JOIN proveedores p ON p.id = f.proveedor_id
      WHERE m.tipo = 'factura_compra' AND m.producto_id = ${productoId}
      ORDER BY f.fecha_creacion DESC, f.id DESC
      LIMIT 200
    `;

    return NextResponse.json({ ok: true, ventas, comprasFacturas });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
