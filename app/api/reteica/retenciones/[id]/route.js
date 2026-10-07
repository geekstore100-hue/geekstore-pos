import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import {
  existeTablaRetenciones,
  prepararRetencion,
  ErrorRetencion,
  MENSAJE_MIGRACION,
} from '../../../../../lib/retencionesReteica';

// Editar (PUT) o borrar (DELETE) una retención registrada sin factura de
// compra. No hay nada más enlazado (ni stock ni pagos), así que se puede
// corregir o borrar sin efectos en otras partes del POS.

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    if (!(await existeTablaRetenciones())) {
      return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    }
    const d = await prepararRetencion(await request.json());
    const [fila] = await sql`
      UPDATE retenciones_reteica SET
        negocio = ${d.negocio}, proveedor_id = ${d.proveedor_id}, fecha = ${d.fecha},
        numero_factura = ${d.numero_factura}, concepto = ${d.concepto},
        base = ${d.base}, porcentaje = ${d.porcentaje}, valor = ${d.valor}, notas = ${d.notas}
      WHERE id = ${Number(id) || 0}
      RETURNING id
    `;
    if (!fila) return NextResponse.json({ ok: false, error: 'La retención no existe' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorRetencion) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (!(await existeTablaRetenciones())) {
      return NextResponse.json({ ok: false, error: MENSAJE_MIGRACION }, { status: 500 });
    }
    const [fila] = await sql`DELETE FROM retenciones_reteica WHERE id = ${Number(id) || 0} RETURNING id`;
    if (!fila) return NextResponse.json({ ok: false, error: 'La retención no existe' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
