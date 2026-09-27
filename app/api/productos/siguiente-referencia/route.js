import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Calcula la siguiente referencia disponible, para sugerirla al crear un
// producto nuevo (el vendedor puede cambiarla). Se calcula directamente
// sobre el catálogo del POS (la referencia siempre viva de qué números ya
// están en uso), tomando la referencia numérica más alta y sumando 1.
// Si una referencia tiene letras (ej. "PROMO-12"), se ignoran las letras y
// se usa solo la parte numérica para la comparación.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const productos = await sql`SELECT referencia FROM productos`;
    let max = 0;
    for (const p of productos) {
      const limpio = String(p.referencia ?? '').replace(/\D/g, '');
      const n = Number(limpio);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return NextResponse.json({ ok: true, siguiente: String(max + 1) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
