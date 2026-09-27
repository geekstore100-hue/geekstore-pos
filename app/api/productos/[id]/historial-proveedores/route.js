import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// Comparativo de precios por proveedor de un producto: a cuánto lo ha
// vendido cada proveedor que se lo ha comprado (mínimo, promedio y última
// vez), ordenado del más barato al más caro. Es la base para saber "dónde
// me sale más barato comprar esto" — se usa en Reabastecimiento (para
// sugerir el proveedor más barato) y se puede consultar directo aquí para
// cualquier producto.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const productoId = Number(id);
    if (!productoId) {
      return NextResponse.json({ ok: false, error: 'Producto inválido' }, { status: 400 });
    }

    const proveedores = await sql`
      SELECT
        p.id AS proveedor_id,
        p.nombre AS proveedor_nombre,
        COUNT(*) AS veces_comprado,
        MIN(m.precio_unitario) AS precio_minimo,
        AVG(m.precio_unitario) AS precio_promedio,
        MAX(f.fecha_creacion) AS ultima_compra
      FROM movimientos_stock m
      JOIN facturas_compra f ON f.id = m.factura_compra_id
      JOIN proveedores p ON p.id = f.proveedor_id
      WHERE m.tipo = 'factura_compra' AND m.producto_id = ${productoId}
      GROUP BY p.id
      ORDER BY precio_minimo ASC
    `;

    return NextResponse.json({ ok: true, proveedores });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
