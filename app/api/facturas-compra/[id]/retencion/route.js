import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// Tarifas de ReteICA permitidas. 0 = "Sin retención".
const TARIFAS_RETEICA = [0, 1.1, 0.41];

// Agrega o edita la retención de ReteICA de una factura ya creada, como en
// Alegra ("Más acciones" → "Agregar retenciones"): se puede elegir la
// tarifa, escribir la Base a mano (no siempre es el subtotal completo de la
// factura) y ajustar el Valor calculado si hace falta. Solo cambia lo que
// queda "por pagar" al proveedor, nunca el costo del inventario ni el total
// de la factura.
export async function POST(request, { params }) {
  try {
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Factura inválida' }, { status: 400 });
    }

    const body = await request.json();
    const retencionPorcentaje = Number(body.retencion_porcentaje) || 0;
    const retencionBase = Number(body.retencion_base) || 0;
    const retencionValor = Number(body.retencion_valor) || 0;

    if (!TARIFAS_RETEICA.includes(retencionPorcentaje)) {
      return NextResponse.json({ ok: false, error: 'La tarifa de ReteICA no es válida' }, { status: 400 });
    }
    if (retencionBase < 0 || retencionValor < 0) {
      return NextResponse.json({ ok: false, error: 'La base y el valor de la retención no pueden ser negativos' }, { status: 400 });
    }

    const [factura] = await sql`
      UPDATE facturas_compra
      SET retencion_porcentaje = ${retencionPorcentaje}, retencion_base = ${retencionBase}, retencion_valor = ${retencionValor}
      WHERE id = ${id} AND estado_pago = 'pendiente'
      RETURNING id
    `;
    if (!factura) {
      return NextResponse.json(
        { ok: false, error: 'La factura no existe o ya está marcada como pagada (no se puede editar la retención de una factura pagada)' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
