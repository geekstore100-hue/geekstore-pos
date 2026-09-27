import { NextResponse } from 'next/server';
import { leerRespaldo } from '../../../../lib/respaldo';

// Descarga el archivo de un respaldo puntual (mismo patrón de seguridad
// que /api/manifiestos/[key]: requiere sesión — ver middleware.js — y solo
// se confía en el Content-Type que se guardó al crearlo).
export async function GET(request, { params }) {
  try {
    const { key } = await params;
    // El nombre del archivo siempre lo genera el propio sistema (ver
    // generarRespaldo en lib/respaldo.js), nunca lo escribe una persona,
    // pero igual se valida la forma para no ir a pedirle a Blobs una clave
    // rara si alguien cambia la URL a mano.
    if (!/^respaldo-[\w.-]+\.json\.gz$/.test(key)) {
      return NextResponse.json({ ok: false, error: 'Respaldo inválido' }, { status: 400 });
    }

    const datos = await leerRespaldo(key);
    if (!datos) {
      return NextResponse.json({ ok: false, error: 'Ese respaldo ya no existe' }, { status: 404 });
    }

    return new NextResponse(datos, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${key}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
