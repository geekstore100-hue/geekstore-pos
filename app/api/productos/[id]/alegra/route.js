import { NextResponse } from 'next/server';
import { sincronizarProducto } from '../../../../../lib/alegraFacturacion';

// POST /api/productos/[id]/alegra  { conIva: true|false }
// Crea el producto en Alegra (facturación electrónica) con la misma
// referencia. Si ya existía allá con esa referencia, solo lo enlaza (no lo
// duplica). Ver lib/alegraFacturacion.js.
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const r = await sincronizarProducto(id, { conIva: body.conIva });
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
