import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { asegurarColumna } from '../../../../lib/alegraFacturacion';

export const dynamic = 'force-dynamic';

// GET /api/productos/alegra-pendientes
// Productos creados en el POS (no migrados de la cuenta vieja de Alegra)
// que todavía no están enlazados con Alegra (facturación electrónica).
export async function GET() {
  try {
    await asegurarColumna();
    const productos = await sql`
      SELECT p.id, p.referencia, p.nombre, p.precio_venta, p.imagen_key, p.es_inventariable, p.activo,
             c.nombre AS categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.alegra_id IS NULL AND p.alegra2_id IS NULL
      ORDER BY p.creado_en DESC, p.id DESC
      LIMIT 300
    `;
    return NextResponse.json({ ok: true, productos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
