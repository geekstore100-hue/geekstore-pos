import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Detalle de una factura de compra: datos del encabezado más cada línea de
// producto (para mostrarlo en la ficha de detalle de la pantalla).
export async function GET(request, { params }) {
  try {
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Factura inválida' }, { status: 400 });
    }

    const [factura] = await sql`
      SELECT
        f.id, f.numero, f.fecha_creacion, f.fecha_vencimiento,
        f.subtotal, f.retencion_porcentaje, f.retencion_base, f.retencion_valor, f.total,
        (f.total - f.retencion_valor) AS por_pagar,
        f.estado_pago, f.pagado_en, f.notas,
        p.nombre AS proveedor_nombre, p.identificacion AS proveedor_identificacion, p.telefono AS proveedor_telefono,
        b.nombre AS bodega_nombre
      FROM facturas_compra f
      JOIN proveedores p ON p.id = f.proveedor_id
      JOIN bodegas b ON b.id = f.bodega_id
      WHERE f.id = ${id}
    `;
    if (!factura) {
      return NextResponse.json({ ok: false, error: 'Factura no encontrada' }, { status: 404 });
    }

    const items = await sql`
      SELECT m.producto_id, m.cantidad, m.precio_unitario, m.descuento_porcentaje, pr.referencia, pr.nombre
      FROM movimientos_stock m
      JOIN productos pr ON pr.id = m.producto_id
      WHERE m.tipo = 'factura_compra' AND m.factura_compra_id = ${id}
      ORDER BY m.id ASC
    `;

    return NextResponse.json({ ok: true, factura, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
