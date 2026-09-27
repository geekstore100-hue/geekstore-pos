import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// De qué proveedor se compró un producto por última vez — para sugerirlo
// solo, sin que el vendedor tenga que saberlo, al armar una garantía a
// proveedor (Garantías a proveedor > Nueva garantía). Es la misma fuente
// que la pestaña "Facturas de compra" de la ficha de Productos, pero solo
// trae la última factura para que la consulta sea liviana.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const productoId = Number(id);
    if (!productoId) {
      return NextResponse.json({ ok: false, error: 'Producto inválido' }, { status: 400 });
    }

    const [ultima] = await sql`
      SELECT p.id AS proveedor_id, p.nombre AS proveedor_nombre, f.fecha_creacion
      FROM movimientos_stock m
      JOIN facturas_compra f ON f.id = m.factura_compra_id
      JOIN proveedores p ON p.id = f.proveedor_id
      WHERE m.tipo = 'factura_compra' AND m.producto_id = ${productoId}
      ORDER BY f.fecha_creacion DESC, f.id DESC
      LIMIT 1
    `;

    return NextResponse.json({ ok: true, proveedor: ultima || null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
