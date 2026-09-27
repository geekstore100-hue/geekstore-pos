import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Resumen de ReteICA: todos los proveedores que tuvieron retención
// practicada en un período, con su total — para que /reteica se pueda ver
// de una vez, sin tener que elegir proveedor por proveedor. Al hacer clic en
// uno se usa /api/reteica/certificado para ver el detalle y descargar el
// PDF de ese proveedor puntual.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    if (!desde || !hasta) {
      return NextResponse.json({ ok: false, error: 'Selecciona el período (desde / hasta)' }, { status: 400 });
    }

    const proveedores = await sql`
      SELECT
        p.id,
        p.nombre,
        p.identificacion,
        COUNT(f.id) AS facturas,
        COALESCE(SUM(f.retencion_base), 0) AS total_base,
        COALESCE(SUM(f.retencion_valor), 0) AS total_retenido
      FROM facturas_compra f
      JOIN proveedores p ON p.id = f.proveedor_id
      WHERE f.fecha_creacion >= ${desde}
        AND f.fecha_creacion <= ${hasta}
        AND f.retencion_valor > 0
      GROUP BY p.id
      ORDER BY total_retenido DESC
    `;

    const totalRetenido = proveedores.reduce((acc, p) => acc + Number(p.total_retenido || 0), 0);

    return NextResponse.json({ ok: true, periodo: { desde, hasta }, proveedores, totales: { retenido: totalRetenido } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
