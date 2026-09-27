import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// Comparativo de precios por proveedor de un producto: a cuánto lo ha
// vendido cada proveedor que se lo ha comprado (último precio pagado,
// mínimo, promedio y fecha de la última compra), ordenado del más barato
// al más caro según el ÚLTIMO precio (no el mínimo histórico — ese pudo
// haber sido una promoción de hace tiempo que ya no aplica). Es la base
// para saber "dónde me sale más barato comprar esto ahora" — se usa en
// Reabastecimiento (para sugerir el proveedor más barato) y se puede
// consultar directo aquí para cualquier producto.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const productoId = Number(id);
    if (!productoId) {
      return NextResponse.json({ ok: false, error: 'Producto inválido' }, { status: 400 });
    }

    const proveedores = await sql`
      WITH compras AS (
        SELECT m.id, f.proveedor_id, p.nombre AS proveedor_nombre, m.precio_unitario, f.fecha_creacion
        FROM movimientos_stock m
        JOIN facturas_compra f ON f.id = m.factura_compra_id
        JOIN proveedores p ON p.id = f.proveedor_id
        WHERE m.tipo = 'factura_compra' AND m.producto_id = ${productoId}
      ),
      resumen AS (
        SELECT proveedor_id, proveedor_nombre,
               COUNT(*) AS veces_comprado,
               MIN(precio_unitario) AS precio_minimo,
               AVG(precio_unitario) AS precio_promedio,
               MAX(fecha_creacion) AS ultima_compra
        FROM compras
        GROUP BY proveedor_id, proveedor_nombre
      ),
      ultimo AS (
        SELECT DISTINCT ON (proveedor_id) proveedor_id, precio_unitario AS ultimo_precio
        FROM compras
        ORDER BY proveedor_id, fecha_creacion DESC, id DESC
      )
      SELECT r.proveedor_id, r.proveedor_nombre, r.veces_comprado, r.precio_minimo, r.precio_promedio,
             r.ultima_compra, u.ultimo_precio
      FROM resumen r
      JOIN ultimo u ON u.proveedor_id = r.proveedor_id
      ORDER BY u.ultimo_precio ASC
    `;

    return NextResponse.json({ ok: true, proveedores });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
