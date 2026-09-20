import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import sql from '../../../../../../lib/db';

export const dynamic = 'force-dynamic';

// Elimina una foto del producto. Si era la portada, la portada pasa a la
// siguiente foto disponible (o queda sin portada si no quedan más).
export async function DELETE(request, { params }) {
  try {
    const { id, imgId } = await params;

    const [fila] = await sql`
      SELECT imagen_key FROM producto_imagenes WHERE id = ${imgId} AND producto_id = ${id}
    `;
    if (!fila) {
      return NextResponse.json({ ok: false, error: 'Imagen no encontrada' }, { status: 404 });
    }

    await sql`DELETE FROM producto_imagenes WHERE id = ${imgId}`;

    try {
      const store = getStore('productos-imagenes');
      await store.delete(fila.imagen_key);
    } catch {
      // Si falla borrar el archivo en Blobs no es grave: la referencia en la
      // base de datos ya quedó eliminada, que es lo que importa para el catálogo.
    }

    const [producto] = await sql`SELECT imagen_key FROM productos WHERE id = ${id}`;
    if (producto && producto.imagen_key === fila.imagen_key) {
      const [siguiente] = await sql`
        SELECT imagen_key FROM producto_imagenes WHERE producto_id = ${id} ORDER BY orden ASC, id ASC LIMIT 1
      `;
      await sql`UPDATE productos SET imagen_key = ${siguiente ? siguiente.imagen_key : null} WHERE id = ${id}`;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Marca esta foto como la portada del producto (la que se ve en Ventas y en
// la tabla de Productos).
export async function PATCH(request, { params }) {
  try {
    const { id, imgId } = await params;

    const [fila] = await sql`
      SELECT imagen_key FROM producto_imagenes WHERE id = ${imgId} AND producto_id = ${id}
    `;
    if (!fila) {
      return NextResponse.json({ ok: false, error: 'Imagen no encontrada' }, { status: 404 });
    }

    await sql`UPDATE productos SET imagen_key = ${fila.imagen_key} WHERE id = ${id}`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
