import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// Marca una factura de compra como pagada (ya se le pagó al proveedor lo
// que quedó "por pagar" después de la retención de ReteICA, si aplicó).
export async function POST(request, { params }) {
  try {
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Factura inválida' }, { status: 400 });
    }

    const [factura] = await sql`
      UPDATE facturas_compra
      SET estado_pago = 'pagada', pagado_en = now()
      WHERE id = ${id} AND estado_pago = 'pendiente'
      RETURNING id
    `;
    if (!factura) {
      return NextResponse.json({ ok: false, error: 'La factura no existe o ya estaba marcada como pagada' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
