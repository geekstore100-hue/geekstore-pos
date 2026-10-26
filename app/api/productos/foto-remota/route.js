import { descargarImagen } from '../../../../lib/imagenesPagina';

export const dynamic = 'force-dynamic';

// GET /api/productos/foto-remota?url=<foto>&ref=<página>
// Trae una foto de otra página a través del POS, para poder recortarla,
// achicarla o quitarle el fondo en el navegador (las páginas de otros no
// dejan hacerlo directo). Solo fotos (JPG, PNG, WEBP), máx. 10 MB, y solo
// direcciones públicas de internet. Requiere sesión del POS (middleware).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const enlace = searchParams.get('url') || '';
  const ref = searchParams.get('ref') || '';
  const referer = /^https?:\/\//i.test(ref) ? ref.slice(0, 500) : undefined;
  try {
    const { buffer, tipo } = await descargarImagen(enlace, { referer });
    return new Response(buffer, {
      headers: {
        'Content-Type': tipo,
        'Cache-Control': 'private, max-age=600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || 'No se pudo traer la foto' }, { status: 502 });
  }
}
