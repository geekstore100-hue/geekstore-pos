import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

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
