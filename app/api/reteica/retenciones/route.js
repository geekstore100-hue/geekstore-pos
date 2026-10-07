import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import {
  existeTablaRetenciones,
  prepararRetencion,
  ErrorRetencion,
  MENSAJE_MIGRACION,
} from '../../../../lib/retencionesReteica';

// Retenciones de ReteICA SIN factura de compra (Eve Jeans u otras compras
// que no deben entrar al inventario del POS). Ver lib/retencionesReteica.js.
//   GET  ?desde=&hasta=  → las del período.
//   POST                 → registrar una.

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    if (!desde || !hasta) {
      return NextResponse.json({ ok: false, error: 'Selecciona el período (desde / hasta)' }, { status: 400 });
    }
    if (!(await existeTablaRetenciones())) {
      return NextResponse.json({ ok: true, faltaMigracion: true, mensaje: MENSAJE_MIGRACION, retenciones: [] });
    }
    const retenciones = await sql`
      SELECT r.id, r.negocio, r.proveedor_id, p.nombre AS proveedor_nombre, p.identificacion AS proveedor_identificacion,
             to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.numero_factura, r.concepto, r.base, r.porcentaje, r.valor, r.notas
      FROM retenciones_reteica r
      JOIN proveedores p ON p.id = r.proveedor_id
      WHERE r.fecha >= ${desde} AND r.fecha <= ${hasta}
      ORDER BY r.fecha DESC, r.id DESC
    `;
    return NextResponse.json({ ok: true, retenciones });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await existeTablaRetenciones())) {
      return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    }
    const d = await prepararRetencion(await request.json());
    const [retencion] = await sql`
      INSERT INTO retenciones_reteica (negocio, proveedor_id, fecha, numero_factura, concepto, base, porcentaje, valor, notas)
      VALUES (${d.negocio}, ${d.proveedor_id}, ${d.fecha}, ${d.numero_factura}, ${d.concepto}, ${d.base}, ${d.porcentaje}, ${d.valor}, ${d.notas})
      RETURNING id
    `;
    return NextResponse.json({ ok: true, id: retencion.id });
  } catch (error) {
    if (error instanceof ErrorRetencion) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
