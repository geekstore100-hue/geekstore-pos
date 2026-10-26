import { NextResponse } from 'next/server';
import { fotosDePagina } from '../../../../lib/imagenesPagina';

export const dynamic = 'force-dynamic';

// GET /api/productos/fotos-pagina?url=<enlace del fabricante>
// Las mejores fotos del producto en esa página (ver lib/imagenesPagina.js).
export async function GET(request) {
  const enlace = new URL(request.url).searchParams.get('url') || '';
  if (!enlace.trim()) return NextResponse.json({ ok: false, error: 'Falta el enlace' }, { status: 400 });
  try {
    const fotos = await fotosDePagina(enlace);
    return NextResponse.json({ ok: true, fotos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'No se pudieron leer las fotos de la página' }, { status: 200 });
  }
}
