import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { retencionesDelPeriodo, existeTablaRetenciones } from '../../../../lib/retencionesReteica';

// Resumen de ReteICA: todos los proveedores que tuvieron retención
// practicada en un período, con su total — para que /reteica se pueda ver
// de una vez, sin tener que elegir proveedor por proveedor. Al hacer clic en
// uno se usa /api/reteica/certificado para ver el detalle y descargar el
// PDF de ese proveedor puntual.
//
// Desde octubre 2026 suma DOS fuentes (mismo NIT, misma declaración):
// las facturas de compra del POS con retención (Geek Store) y las
// retenciones registradas sin factura de compra (Eve Jeans u otras). Los
// totales salen también separados por negocio.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    if (!desde || !hasta) {
      return NextResponse.json({ ok: false, error: 'Selecciona el período (desde / hasta)' }, { status: 400 });
    }

    const filas = await retencionesDelPeriodo({ desde, hasta });
    const ids = [...new Set(filas.map((f) => f.proveedor_id))];
    const datosProveedores = ids.length
      ? await sql`SELECT id, nombre, identificacion FROM proveedores WHERE id = ANY(${ids})`
      : [];
    const porId = new Map(datosProveedores.map((p) => [p.id, p]));

    const grupos = new Map();
    const porNegocio = {};
    for (const f of filas) {
      const p = porId.get(f.proveedor_id) || { id: f.proveedor_id, nombre: `Proveedor #${f.proveedor_id}`, identificacion: null };
      if (!grupos.has(p.id)) {
        grupos.set(p.id, { id: p.id, nombre: p.nombre, identificacion: p.identificacion, facturas: 0, total_base: 0, total_retenido: 0, negocios: [] });
      }
      const g = grupos.get(p.id);
      g.facturas += 1;
      g.total_base += Number(f.retencion_base || 0);
      g.total_retenido += Number(f.retencion_valor || 0);
      if (!g.negocios.includes(f.negocio)) g.negocios.push(f.negocio);
      porNegocio[f.negocio] = (porNegocio[f.negocio] || 0) + Number(f.retencion_valor || 0);
    }
    const proveedores = [...grupos.values()].sort((a, b) => b.total_retenido - a.total_retenido);
    const totalRetenido = proveedores.reduce((acc, p) => acc + p.total_retenido, 0);

    return NextResponse.json({
      ok: true,
      periodo: { desde, hasta },
      proveedores,
      totales: { retenido: totalRetenido, porNegocio },
      faltaMigracion: !(await existeTablaRetenciones()),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
