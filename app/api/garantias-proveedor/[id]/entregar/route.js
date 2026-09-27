import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';

// Marca una garantía "por entregar" como ya entregada al proveedor. Desde
// este momento empieza a contar el tiempo que el proveedor lleva con los
// productos (enviado_en), y ya se puede registrar cómo se resolvió cada
// uno. El stock no se mueve acá: salió de Principal cuando se creó la
// garantía (los productos ya estaban separados, no se podían vender).
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const [garantia] = await sql`
      UPDATE garantias_proveedor
      SET estado = 'enviada', enviado_en = now()
      WHERE id = ${Number(id)} AND estado = 'por_entregar'
      RETURNING id, enviado_en
    `;
    if (!garantia) {
      return NextResponse.json({ ok: false, error: 'Esta garantía no está pendiente por entregar' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, garantia });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
