import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

// Antes tenía "force-dynamic", que le decía a Netlify que NUNCA guardara
// estas fotos en su caché — cada vez que alguien pedía una foto (aunque
// fuera la misma que ya había pedido otra persona hace un minuto) tocaba
// ir en vivo hasta Netlify Blobs a traerla. Eso es innecesario: una foto
// con la misma "key" siempre es la misma foto, nunca cambia de contenido
// (si se reemplaza, se sube con una key distinta), así que es segura de
// cachear agresivamente. Sin "force-dynamic" y con el Cache-Control de
// abajo, Netlify sí puede guardar la respuesta en su borde (CDN): la
// primera persona que pide una foto sí espera esa ida a Blobs, pero TODAS
// las demás (incluida esa misma foto cargando 20-30 veces de golpe en la
// página principal de la tienda) la reciben directo de la caché, sin
// volver a invocar la función. Antes, esa ráfaga de fotos simultáneas iba
// siempre en vivo, y si alguna función tardaba un poco de más en arrancar
// (arranque en frío), esa foto en particular podía fallar — lo que
// explica que fallara con varias fotos a la vez y se arreglara solo al
// recargar.
export async function GET(request, { params }) {
  try {
    const { key } = await params;
    const store = getStore('productos-imagenes');
    const resultado = await store.getWithMetadata(key, { type: 'arrayBuffer' });

    if (!resultado) {
      return NextResponse.json({ ok: false, error: 'Imagen no encontrada' }, { status: 404 });
    }

    // Seguridad: esta ruta es pública y vive en el mismo dominio del POS.
    // Si alguna vez se guardó algo que NO es una foto (antes se confiaba en
    // el tipo que decía el navegador al subir), no se le permite al
    // navegador abrirlo como página web:
    // - Solo se sirve con su tipo original si es una imagen normal (SVG
    //   queda por fuera, porque un SVG puede llevar código). Todo lo demás
    //   se entrega como descarga.
    // - nosniff: el navegador no "adivina" el tipo por el contenido.
    // - CSP con sandbox: aunque se abriera como página, no puede ejecutar
    //   código ni usar la sesión. No afecta cómo se ven las fotos en la
    //   tienda ni en el POS.
    const tipoGuardado = String(resultado.metadata?.contentType || '');
    const esImagenSegura = /^image\//i.test(tipoGuardado) && !/svg/i.test(tipoGuardado);

    return new NextResponse(resultado.data, {
      headers: {
        'Content-Type': esImagenSegura ? tipoGuardado : 'application/octet-stream',
        ...(esImagenSegura ? {} : { 'Content-Disposition': 'attachment' }),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        // max-age: cuánto la guarda el navegador de cada persona.
        // s-maxage: cuánto la guarda el CDN de Netlify (lo más importante
        // acá, porque es lo que evita que cada visita dispare la función).
        // stale-while-revalidate: si ya venció, sirve la versión guardada
        // de inmediato mientras trae una fresca de fondo, en vez de fallar
        // o hacer esperar a la persona.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
