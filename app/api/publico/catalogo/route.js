import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { DATOS_SEDES, faltantesWeb, whatsappSede } from '../../../../lib/sedes';

// Catálogo público del POS, en el MISMO formato que ya espera la tienda
// (geekstore-tienda) desde su función getProducts() en lib/alegra.js —
// concretamente, el modo "CATALOGO_URL" que ya usa hoy para leer el
// catálogo sin tocar la API de Alegra directamente. La idea es que, el día
// que Nelson quiera conectar la tienda a este sistema, solo tenga que
// cambiar la variable CATALOGO_URL en Netlify (de la tienda) para que
// apunte aquí — sin tocar código de la tienda.
//
// Forma exacta que espera la tienda por cada producto:
//   { id, name, description, reference, category, subcategory, gamer, price,
//     available, warehouses: [{name, quantity}], image, images, video, specs, status }
// "video" es el enlace de YouTube que se puso en Productos (opcional, viene
// null si no se configuró) — la tienda lo convierte a un video incrustado.
// "subcategory" y "gamer" se agregaron para que la tienda pueda navegar por
// subcategoría (Accesorios PC > Mouse, etc.) y mostrar/filtrar la etiqueta
// "Zona Gamer" — vienen vacíos/false para productos sin subcategoría o sin
// marcar como gamer, así que la tienda sigue funcionando igual si no los usa.
//
// Notas importantes:
// - El "id" que usa la tienda es clave para Google Merchant Center (el feed
//   de /api/feed usa este mismo id tanto en <g:id> como en el <link> del
//   producto) y para las URLs /producto/[id] ya indexadas. Por eso este
//   catálogo devuelve el id ORIGINAL de Alegra (columna productos.alegra_id,
//   recuperada del mismo export que se usó para migrar el catálogo) cuando
//   existe, y solo usa la referencia del POS como respaldo para productos
//   creados directamente aquí (que nunca existieron en Alegra ni en Google).
//   Así el cambio de fuente de datos es invisible para Google y para los
//   enlaces ya indexados.
// - Solo se incluyen productos activos y con "Mostrar en la tienda"
//   marcado (columna mostrar_en_tienda — se controla desde Productos en
//   el POS; por defecto todos la tienen activada). Los productos físicos
//   (con inventario) además solo se incluyen si tienen stock en alguna
//   bodega; los servicios (es_inventariable = false) se incluyen siempre
//   que tengan la bandera activa, porque no manejan stock.
// - Esta ruta es pública (sin clave), igual que el catálogo que la tienda
//   ya expone hoy al público — no hay ningún dato aquí que no se vea ya en
//   la tienda misma.
export const dynamic = 'force-dynamic';

// URL pública fija del POS (NO se deriva de request.url): en Netlify, las
// funciones que atienden geekstore-pos.netlify.app a veces ven internamente
// el host de la rama (main--geekstore-pos.netlify.app) en vez del dominio
// público. Si se arma la URL de las imágenes con ese origen interno, la
// tienda las bloquea (next.config.mjs de la tienda solo permite imágenes
// desde "geekstore-pos.netlify.app" exactamente) y no cargan. Usando un
// origen fijo, las URLs de imagen siempre quedan iguales sin importar cómo
// llegó la petición.
const SITIO_PUBLICO = 'https://geekstore-pos.netlify.app';

export async function GET(request) {
  try {
    const origin = SITIO_PUBLICO;

    const productos = await sql`
      SELECT
        p.id, p.referencia, p.alegra_id, p.nombre, p.descripcion, p.precio_venta, p.imagen_key,
        p.es_inventariable, p.es_gamer, p.video_youtube, p.especificaciones,
        -- "precio antes" (oferta); así no falla si falta la migración.
        (to_jsonb(p) ->> 'precio_anterior')::numeric AS precio_anterior,
        c.nombre AS categoria_nombre,
        sc.nombre AS subcategoria_nombre,
        COALESCE(st.stock_total, 0) AS stock_total
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
      LEFT JOIN (
        -- Se excluye la bodega "Garantías con Proveedor": esas unidades
        -- están físicamente donde el proveedor (en trámite de garantía), no
        -- se pueden vender ni despachar, así que no deben contar como
        -- disponibles hacia afuera.
        SELECT s.producto_id, SUM(s.cantidad) AS stock_total
        FROM stock s
        JOIN bodegas b ON b.id = s.bodega_id
        WHERE b.nombre <> 'Garantías con Proveedor'
        GROUP BY s.producto_id
      ) st ON st.producto_id = p.id
      -- mostrar_en_tienda: lo desmarca Nelson desde Productos cuando no
      -- quiere que un artículo aparezca en geekstore.com.co (sigue
      -- existiendo normal en el POS y en el portal de distribuidores,
      -- solo se excluye de este catálogo público).
      WHERE p.activo = true AND p.mostrar_en_tienda = true
        -- Sedes (nov 2026): los de Venecia van aparte, ver más abajo.
        AND COALESCE(to_jsonb(p) ->> 'sede', 'kennedy') = 'kennedy'
      ORDER BY p.nombre ASC
    `;

    const stockPorBodega = await sql`
      SELECT s.producto_id, b.nombre AS bodega_nombre, s.cantidad
      FROM stock s
      JOIN bodegas b ON b.id = s.bodega_id
      WHERE s.cantidad > 0 AND b.nombre <> 'Garantías con Proveedor'
    `;
    const bodegasPorProducto = new Map();
    for (const fila of stockPorBodega) {
      const lista = bodegasPorProducto.get(fila.producto_id) || [];
      lista.push({ name: fila.bodega_nombre, quantity: Number(fila.cantidad) });
      bodegasPorProducto.set(fila.producto_id, lista);
    }

    const imagenes = await sql`
      SELECT producto_id, imagen_key
      FROM producto_imagenes
      ORDER BY producto_id, orden ASC, id ASC
    `;
    const imagenesPorProducto = new Map();
    for (const fila of imagenes) {
      const lista = imagenesPorProducto.get(fila.producto_id) || [];
      lista.push(`${origin}/api/imagenes/${fila.imagen_key}`);
      imagenesPorProducto.set(fila.producto_id, lista);
    }

    // AGOTADOS (nov 2026): con ?agotados=1 se devuelven SOLO los productos
    // físicos activos y publicados que hoy no tienen stock. La tienda los usa
    // para que /producto/[id] de un agotado no dé "página no encontrada"
    // (Google los estaba sacando: 166 errores 404 en Search Console) y muestre
    // "Agotado — avísame cuando llegue". El catálogo normal (sin el
    // parámetro) no cambia: sigue trayendo solo lo que tiene stock.
    const soloAgotados = new URL(request.url).searchParams.get('agotados') === '1';
    const resultado = productos
      .filter((p) =>
        soloAgotados
          ? p.es_inventariable !== false && !(Number(p.stock_total) > 0)
          : p.es_inventariable === false || Number(p.stock_total) > 0
      )
      .map((p) => {
        // La portada (la que se marcó como portada en Productos del POS) va
        // SIEMPRE de primera — la tienda usa la primera foto como portada.
        // Antes iban en el orden en que se subieron, así que marcar otra foto
        // como portada en el POS no cambiaba la portada de la tienda.
        const urlPortada = p.imagen_key ? `${origin}/api/imagenes/${p.imagen_key}` : null;
        const todas = imagenesPorProducto.get(p.id) || [];
        const images = urlPortada
          ? [urlPortada, ...todas.filter((u) => u !== urlPortada)]
          : todas;
        return {
          id: p.alegra_id || p.referencia,
          name: p.nombre,
          description: p.descripcion || '',
          reference: p.referencia,
          category: p.categoria_nombre || '',
          subcategory: p.subcategoria_nombre || '',
          gamer: Boolean(p.es_gamer),
          price: Number(p.precio_venta) || 0,
          // Precio "antes" para mostrarlo en oferta (tachado, con % de
          // descuento). null si el producto no está en oferta.
          priceBefore:
            Number(p.precio_anterior) > Number(p.precio_venta) && Number(p.precio_venta) > 0
              ? Number(p.precio_anterior)
              : null,
          available: soloAgotados ? 0 : Number(p.stock_total) || 0,
          warehouses: bodegasPorProducto.get(p.id) || [],
          image: images[0] ?? null,
          images,
          video: p.video_youtube || null,
          // Ficha técnica: [{ name, value }] — la tienda la muestra como tabla
          // "Especificaciones técnicas" (lista vacía si el producto no tiene).
          specs: Array.isArray(p.especificaciones)
            ? p.especificaciones.map((e) => ({ name: e.nombre, value: e.valor }))
            : [],
          status: 'active',
        };
      });

    // SEDES (nov 2026, fase 0, ver lib/sedes.js): con ?sedes=1 se agregan los
    // coleccionables de Geek Store Venecia que tengan la ficha completa, estén
    // publicados y tengan stock en su POS. Llevan "seller" (quién los vende,
    // con su WhatsApp) y whatsappOnly: true — por ahora NO se pagan en la
    // página: el botón es "Pedir por WhatsApp". La tienda vieja no pide
    // ?sedes=1, así que no los ve.
    if (!soloAgotados && new URL(request.url).searchParams.get('sedes') === '1') {
      let deSedes = [];
      try {
        deSedes = await sql`
          SELECT p.*, c.nombre AS categoria_nombre, sc.nombre AS subcategoria_nombre,
                 (to_jsonb(p) ->> 'precio_anterior')::numeric AS precio_anterior
          FROM productos p
          LEFT JOIN categorias c ON c.id = p.categoria_id
          LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
          WHERE COALESCE(to_jsonb(p) ->> 'sede', 'kennedy') <> 'kennedy'
            -- (sin mirar mostrar_en_tienda: los de las sedes siempre se
            -- publican apenas la ficha está completa — nov 2026)
            AND p.activo = true
            AND COALESCE((to_jsonb(p) ->> 'sede_stock')::numeric, 0) > 0
          ORDER BY p.nombre ASC
        `;
      } catch {
        deSedes = []; // sin la migración de sedes todavía: nada que agregar
      }
      for (const p of deSedes.filter((x) => faltantesWeb(x).length === 0)) {
        const datos = DATOS_SEDES[p.sede] || { nombre: p.sede, corto: p.sede };
        const urlPortada = p.imagen_key ? `${origin}/api/imagenes/${p.imagen_key}` : null;
        const todas = imagenesPorProducto.get(p.id) || [];
        const images = urlPortada ? [urlPortada, ...todas.filter((u) => u !== urlPortada)] : todas;
        resultado.push({
          id: p.referencia,
          name: p.nombre,
          description: p.descripcion || '',
          reference: p.referencia,
          category: p.categoria_nombre || '',
          subcategory: p.subcategoria_nombre || '',
          gamer: false, // coleccionables de las sedes: nunca Zona Gamer
          price: Number(p.precio_venta) || 0,
          priceBefore: null,
          available: Number(p.sede_stock) || 0,
          warehouses: [{ name: datos.corto, quantity: Number(p.sede_stock) || 0 }],
          image: images[0] ?? null,
          images,
          video: p.video_youtube || null,
          specs: Array.isArray(p.especificaciones) ? p.especificaciones.map((e) => ({ name: e.nombre, value: e.valor })) : [],
          status: 'active',
          seller: { id: p.sede, name: datos.nombre, short: datos.corto, whatsapp: whatsappSede(p.sede) || null },
          whatsappOnly: true,
        });
      }
    }

    // Ahorro de Neon: este catálogo lo pide la tienda (geekstore.com.co)
    // para armar la página principal, cada página de producto, el mapa del
    // sitio, el feed de Google Shopping, el checkout... y también lo piden
    // los robots de Google y compañía cuando recorren la tienda. Sin caché,
    // CADA una de esas visitas eran 3 consultas grandes a la base de datos
    // (el catálogo completo). Con esto, Netlify guarda la respuesta en su
    // CDN 5 minutos: dentro de esos 5 minutos, todas las visitas reciben la
    // copia guardada sin tocar Neon. La tienda ya estaba pensada para
    // refrescar el inventario cada 5 minutos, así que no cambia nada de lo
    // que ve el cliente.
    // - durable: la copia se comparte entre todos los servidores de Netlify
    //   del mundo (si no, cada servidor tendría que pedir la suya).
    // - stale-while-revalidate=60: si justo venció, entrega la copia
    //   guardada al instante mientras trae una nueva de fondo.
    // - Cache-Control (navegador): sin caché en el navegador, para que la
    //   única copia guardada sea la del CDN, que se controla desde aquí.
    return NextResponse.json(
      { productos: resultado },
      {
        headers: {
          // Los agotados cambian poco y la tienda los pide poco: 30 minutos.
          'Netlify-CDN-Cache-Control': soloAgotados
            ? 'public, durable, s-maxage=1800, stale-while-revalidate=300'
            : 'public, durable, s-maxage=300, stale-while-revalidate=60',
          'Cache-Control': 'public, max-age=0, must-revalidate',
          // Netlify NO separa la caché por parámetros de la URL a menos que
          // se le diga: sin esto, ?agotados=1 recibía la copia guardada del
          // catálogo normal (nov 2026).
          'Netlify-Vary': 'query=agotados|sedes',
        },
      }
    );
  } catch (error) {
    // No se le muestra al público el detalle interno del error (podía
    // incluir datos de la base de datos); queda en el registro de Netlify.
    console.error('Error en ' + request.url, error);
    return NextResponse.json({ productos: [], error: 'Error interno, intenta de nuevo' }, { status: 500 });
  }
}
