import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { leerDatosEmpresa } from '../../../../lib/datosEmpresa';

// Datos para armar el certificado de retención de ReteICA de un proveedor
// en un período (Reportes > Certificados ReteICA / módulo /reteica). Junta
// las facturas de compra de ese proveedor en el rango de fechas que sí
// tuvieron retención practicada (retencion_valor > 0) — una factura con
// tarifa "Sin retención" no aparece, porque no hay nada que certificar. El
// PDF en sí se arma en el navegador (lib/certificadoReteicaPdf.js); esta
// ruta solo entrega los números.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const proveedorId = Number(searchParams.get('proveedor_id'));
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    if (!proveedorId) {
      return NextResponse.json({ ok: false, error: 'Selecciona el proveedor' }, { status: 400 });
    }
    if (!desde || !hasta) {
      return NextResponse.json({ ok: false, error: 'Selecciona el período (desde / hasta)' }, { status: 400 });
    }

    const [proveedor] = await sql`
      SELECT id, nombre, identificacion FROM proveedores WHERE id = ${proveedorId}
    `;
    if (!proveedor) {
      return NextResponse.json({ ok: false, error: 'El proveedor no existe' }, { status: 404 });
    }

    const facturas = await sql`
      SELECT id, numero, fecha_creacion, retencion_porcentaje, retencion_base, retencion_valor
      FROM facturas_compra
      WHERE proveedor_id = ${proveedorId}
        AND fecha_creacion >= ${desde}
        AND fecha_creacion <= ${hasta}
        AND retencion_valor > 0
      ORDER BY fecha_creacion ASC
    `;

    const totalBase = facturas.reduce((acc, f) => acc + Number(f.retencion_base || 0), 0);
    const totalRetenido = facturas.reduce((acc, f) => acc + Number(f.retencion_valor || 0), 0);

    const empresa = await leerDatosEmpresa();

    return NextResponse.json({
      ok: true,
      empresa,
      proveedor,
      periodo: { desde, hasta },
      facturas,
      totales: { base: totalBase, retenido: totalRetenido },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
