// app/api/productos/quitar-fondo/route.js
// Quita el fondo de la foto de un producto (octubre 2026) usando remove.bg,
// SOLO si está configurada la variable REMOVEBG_API_KEY en Netlify (cuenta
// gratis en remove.bg, sin tarjeta: 50 fotos al mes).
//
// Truco para no perder calidad con el plan gratis: remove.bg gratis solo
// entrega imágenes pequeñas (~0,25 megapíxeles), así que se le pide SOLO la
// silueta (la "máscara") y la pantalla de Productos la aplica sobre la foto
// original en tamaño completo (ver lib/quitarFondoCliente.js).
//
// Si no hay clave, o se acabaron las 50 del mes, responde
// { usarNavegador: true } y la pantalla quita el fondo con la IA gratis que
// corre en el mismo navegador (más lenta y un poco menos precisa).
//
//   POST { imagen: "data:image/jpeg;base64,..." }
//   → { ok: true, mascara: "data:image/png;base64,..." }
//   → { ok: false, usarNavegador: true, motivo }

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) return Response.json({ ok: false, usarNavegador: true, motivo: 'sin_clave' });
  try {
    const { imagen } = await request.json();
    const base64 = String(imagen || '').split(',')[1] || '';
    if (!base64) return Response.json({ ok: false, error: 'No llegó la foto' }, { status: 400 });

    const cuerpo = new FormData();
    cuerpo.append('image_file_b64', base64);
    cuerpo.append('size', 'preview'); // el tamaño que da el plan gratis
    cuerpo.append('channels', 'alpha'); // solo la silueta
    cuerpo.append('format', 'png');

    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: cuerpo,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const texto = await res.text().catch(() => '');
      console.error('[quitar-fondo] remove.bg respondió', res.status, texto.slice(0, 200));
      // 402: sin créditos del mes; 403: clave mala; 429: demasiadas seguidas.
      return Response.json({ ok: false, usarNavegador: true, motivo: `removebg_${res.status}` });
    }
    const png = Buffer.from(await res.arrayBuffer()).toString('base64');
    return Response.json({ ok: true, mascara: `data:image/png;base64,${png}`, quedan: res.headers.get('x-ratelimit-remaining') });
  } catch (e) {
    console.error('[quitar-fondo] error:', e?.message);
    return Response.json({ ok: false, usarNavegador: true, motivo: 'error' });
  }
}
