import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

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
//     available, warehouses: [{name, quantity}], image, images, status }
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

export async function GET(request) {
  try {
    const origin = new URL(request.url).origin;

    const productos = await sql`
      SELECT
        p.id, p.referencia, p.alegra_id, p.nombre, p.descripcion, p.precio_venta, p.imagen_key,
        p.es_inventariable, p.es_gamer,
        c.nombre AS categoria_nombre,
        sc.nombre AS subcategoria_nombre,
        COALESCE(st.stock_total, 0) AS stock_total
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
      LEFT JOIN (
        SELECT producto_id, SUM(cantidad) AS stock_total
        FROM stock
        GROUP BY producto_id
      ) st ON st.producto_id = p.id
      -- mostrar_en_tienda: lo desmarca Nelson desde Productos cuando no
      -- quiere que un artículo aparezca en geekstore.com.co (sigue
      -- existiendo normal en el POS y en el portal de distribuidores,
      -- solo se excluye de este catálogo público).
      WHERE p.activo = true AND p.mostrar_en_tienda = true
      ORDER BY p.nombre ASC
    `;

    const stockPorBodega = await sql`
      SELECT s.producto_id, b.nombre AS bodega_nombre, s.cantidad
      FROM stock s
      JOIN bodegas b ON b.id = s.bodega_id
      WHERE s.cantidad > 0
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
      ORDER BY producto_id, orden ASC
    `;
    const imagenesPorProducto = new Map();
    for (const fila of imagenes) {
      const lista = imagenesPorProducto.get(fila.producto_id) || [];
      lista.push(`${origin}/api/imagenes/${fila.imagen_key}`);
      imagenesPorProducto.set(fila.producto_id, lista);
    }

    const resultado = productos
      .filter((p) => p.es_inventariable === false || Number(p.stock_total) > 0)
      .map((p) => {
        const images = imagenesPorProducto.get(p.id) || (p.imagen_key ? [`${origin}/api/imagenes/${p.imagen_key}`] : []);
        return {
          id: p.alegra_id || p.referencia,
          name: p.nombre,
          description: p.descripcion || '',
          reference: p.referencia,
          category: p.categoria_nombre || '',
          subcategory: p.subcategoria_nombre || '',
          gamer: Boolean(p.es_gamer),
          price: Number(p.precio_venta) || 0,
          available: Number(p.stock_total) || 0,
          warehouses: bodegasPorProducto.get(p.id) || [],
          image: images[0] ?? null,
          images,
          status: 'active',
        };
      });

    return NextResponse.json({ productos: resultado });
  } catch (error) {
    return NextResponse.json({ productos: [], error: error.message }, { status: 500 });
  }
}
