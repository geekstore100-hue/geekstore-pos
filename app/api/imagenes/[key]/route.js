import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { key } = await params;
    const store = getStore('productos-imagenes');
    const resultado = await store.getWithMetadata(key, { type: 'arrayBuffer' });

    if (!resultado) {
      return NextResponse.json({ ok: false, error: 'Imagen no encontrada' }, { status: 404 });
    }

    const contentType = resultado.metadata?.contentType || 'application/octet-stream';

    return new NextResponse(resultado.data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
