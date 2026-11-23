import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import { TAMANO_PARTE } from '../../../../lib/manifiestosGuardar';

// Sirve el archivo de un manifiesto de importación (mismo patrón que
// /api/imagenes/[key]: solo se confía en el Content-Type que se guardó al
// subirlo, nunca en lo que diga quien lo pide). Requiere sesión — a
// diferencia de las fotos de producto, estos documentos pueden traer datos
// del proveedor/importación que no son para el público.
export async function GET(request, { params }) {
  try {
    const { key } = await params;
    const store = getStore('manifiestos-importacion');
    const resultado = await store.getWithMetadata(key, { type: 'arrayBuffer' });

    if (!resultado) {
      return NextResponse.json({ ok: false, error: 'Manifiesto no encontrado' }, { status: 404 });
    }

    const tipoGuardado = String(resultado.metadata?.contentType || 'application/octet-stream');

    // Nov 2026: archivos grandes (hasta 15 MB). Netlify no deja responder
    // más de ~6 MB de una vez, así que la pantalla los pide por partes
    // (lib/manifiestoPartes.js): ?info=1 dice cuántas son y ?parte=n trae
    // cada pedazo de 4 MB.
    const url = new URL(request.url);
    const tamano = resultado.data.byteLength;
    const partes = Math.max(1, Math.ceil(tamano / TAMANO_PARTE));
    if (url.searchParams.get('info') === '1') {
      return NextResponse.json({ ok: true, tamano, partes, tipo: tipoGuardado }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.searchParams.has('parte')) {
      const n = Number(url.searchParams.get('parte'));
      if (!Number.isInteger(n) || n < 0 || n >= partes) return NextResponse.json({ ok: false, error: 'Parte inválida' }, { status: 400 });
      return new NextResponse(resultado.data.slice(n * TAMANO_PARTE, (n + 1) * TAMANO_PARTE), {
        headers: { 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' },
      });
    }
    // Un PDF se puede abrir inline en el navegador sin riesgo (a diferencia
    // de un SVG o HTML, no puede llevar código); todo lo demás que no sea
    // una imagen normal se entrega como descarga.
    const esVisible = tipoGuardado === 'application/pdf' || (/^image\//i.test(tipoGuardado) && !/svg/i.test(tipoGuardado));

    return new NextResponse(resultado.data, {
      headers: {
        'Content-Type': esVisible ? tipoGuardado : 'application/octet-stream',
        ...(esVisible ? {} : { 'Content-Disposition': 'attachment' }),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
